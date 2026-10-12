"""Catalog service.

Reads the POS product/variant tables directly so that products published
from the POS appear on the website immediately. Only products where
``is_published_to_website = true`` are exposed. Results are cached for a few
seconds (see app.core.cache) because the database is remote.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.cache import cached
from app.core.config import settings

SORTS = {
    "featured": "p.id DESC",
    "newest": "p.id DESC",
    "price_asc": "min_price ASC, p.id",
    "price_desc": "min_price DESC, p.id",
    "name": "lower(p.name) ASC, p.id",
}

_PUBLISHED = """
    p.is_published_to_website = true AND p.is_active = true AND pv.is_active = true
"""


def _filters(category, q, brand, in_stock, min_price, max_price) -> tuple[str, dict]:
    sql, params = "", {}
    if category:
        sql += " AND c.name = :category"
        params["category"] = category
    if brand:
        sql += " AND b.name = :brand"
        params["brand"] = brand
    if q:
        sql += " AND (p.name ILIKE :q OR p.description ILIKE :q OR b.name ILIKE :q OR pv.sku ILIKE :q)"
        params["q"] = f"%{q.replace('%', '').replace('_', ' ')}%"
    if min_price is not None:
        sql += " AND pv.selling_price >= :min_price"
        params["min_price"] = min_price
    if max_price is not None:
        sql += " AND pv.selling_price <= :max_price"
        params["max_price"] = max_price
    if in_stock:
        sql += (" AND EXISTS (SELECT 1 FROM branch_inventory bi JOIN branches br ON br.id = bi.branch_id"
                " WHERE bi.variant_id = pv.id AND bi.quantity > 0 AND br.is_active = true)")
    return sql, params


def _hydrate(db: Session, ids: list[int]) -> list[dict]:
    """Load products + variants + live stock for the given ids, in that order."""
    if not ids:
        return []
    rows = db.execute(text("""
        SELECT p.id, p.name, p.description, p.image_url, p.extra_images,
               c.name AS category, b.name AS brand,
               pv.id AS variant_id, pv.variant_name, pv.sku, pv.unit,
               pv.attributes, pv.selling_price,
               COALESCE((SELECT SUM(bi.quantity) FROM branch_inventory bi
                         JOIN branches br ON br.id = bi.branch_id
                         WHERE bi.variant_id = pv.id AND br.is_active = true), 0) AS available_quantity,
               (SELECT ROUND(AVG(rating)::numeric, 1) FROM website_reviews r WHERE r.product_id = p.id AND r.is_visible) AS rating_avg,
               (SELECT COUNT(*) FROM website_reviews r WHERE r.product_id = p.id AND r.is_visible) AS rating_count
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = true
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE p.id = ANY(:ids)
        ORDER BY pv.selling_price, pv.id
    """), {"ids": ids}).mappings().all()
    products: dict[int, dict] = {}
    for r in rows:
        prod = products.get(r["id"])
        if prod is None:
            prod = products[r["id"]] = {
                "id": r["id"], "name": r["name"], "description": r["description"],
                "image_url": r["image_url"], "extra_images": r["extra_images"] or [],
                "category": r["category"], "brand": r["brand"], "variants": [],
                "rating_avg": float(r["rating_avg"]) if r["rating_avg"] is not None else None,
                "rating_count": int(r["rating_count"] or 0),
            }
        prod["variants"].append({
            "id": r["variant_id"], "variant_name": r["variant_name"], "sku": r["sku"],
            "unit": r["unit"], "attributes": r["attributes"] or {},
            "selling_price": r["selling_price"], "available_quantity": r["available_quantity"],
        })
    return [products[i] for i in ids if i in products]


def list_published_products(
    db: Session,
    category: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 40,
    sort: str = "featured",
    brand: str | None = None,
    in_stock: bool = False,
    min_price=None,
    max_price=None,
):
    """Return one page of published products (with variants) and the total."""
    key = f"cat:{category}|{q}|{page}|{page_size}|{sort}|{brand}|{in_stock}|{min_price}|{max_price}"

    def build():
        where, params = _filters(category, q, brand, in_stock, min_price, max_price)
        base = f"""
            FROM products p
            JOIN product_variants pv ON pv.product_id = p.id
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN brands b ON b.id = p.brand_id
            WHERE {_PUBLISHED} {where}
        """
        total = db.execute(text(f"SELECT COUNT(DISTINCT p.id) {base}"), params).scalar_one()
        order = SORTS.get(sort, SORTS["featured"])
        id_rows = db.execute(
            text(f"SELECT p.id, MIN(pv.selling_price) AS min_price {base} GROUP BY p.id, p.name "
                 f"ORDER BY {order} LIMIT :limit OFFSET :offset"),
            {**params, "limit": page_size, "offset": (page - 1) * page_size},
        ).all()
        return _hydrate(db, [r[0] for r in id_rows]), total

    return cached(key, settings.CACHE_CATALOG_TTL, build)


def get_published_product(db: Session, product_id: int) -> dict | None:
    def build():
        ok = db.execute(text("""
            SELECT 1 FROM products p WHERE p.id = :id
              AND p.is_published_to_website = true AND p.is_active = true
        """), {"id": product_id}).first()
        if not ok:
            return None
        found = _hydrate(db, [product_id])
        return found[0] if found and found[0]["variants"] else None

    return cached(f"prod:{product_id}", settings.CACHE_CATALOG_TTL, build)


def related_products(db: Session, product_id: int, limit: int | None = None) -> list[dict]:
    """Similar products, best match first.

    Score = same category (4) + same brand (2) + price within +/-50% (1);
    ties broken by how close the price is, then newest. Other categories only
    appear when the product's own category has too few matches, so a sparse
    catalog still shows something useful.
    """
    limit = limit or settings.SIMILAR_PRODUCTS_LIMIT

    def build():
        ids = [r[0] for r in db.execute(text("""
            WITH me AS (
                SELECT p.id, p.category_id, p.brand_id, COALESCE(MIN(pv.selling_price), 0) AS price
                FROM products p LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active
                WHERE p.id = :id GROUP BY p.id
            ), cand AS (
                SELECT p.id, MIN(pv.selling_price) AS price, p.category_id, p.brand_id
                FROM products p JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active
                WHERE p.id <> :id AND p.is_published_to_website = true AND p.is_active = true
                GROUP BY p.id
            )
            SELECT cand.id FROM cand, me
            ORDER BY
              (CASE WHEN cand.category_id IS NOT DISTINCT FROM me.category_id THEN 4 ELSE 0 END
               + CASE WHEN me.brand_id IS NOT NULL AND cand.brand_id = me.brand_id THEN 2 ELSE 0 END
               + CASE WHEN me.price > 0 AND cand.price BETWEEN me.price * 0.5 AND me.price * 1.5 THEN 1 ELSE 0 END) DESC,
              ABS(cand.price - me.price) ASC, cand.id DESC
            LIMIT :limit
        """), {"id": product_id, "limit": limit}).all()]
        return _hydrate(db, ids)

    return cached(f"rel:{product_id}:{limit}", settings.CACHE_CATALOG_TTL, build)


def all_published_ids(db: Session) -> list[dict]:
    """Lightweight id + updated marker list for the sitemap."""
    def build():
        rows = db.execute(text("""
            SELECT p.id, p.updated_at FROM products p
            WHERE p.is_published_to_website = true AND p.is_active = true
              AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = true)
            ORDER BY p.id
        """)).mappings().all()
        return [dict(r) for r in rows]

    return cached("sitemap", settings.CACHE_STATIC_TTL, build)


def list_categories(db: Session) -> list[str]:
    def build():
        rows = db.execute(text("""
            SELECT DISTINCT c.name
            FROM products p
            JOIN categories c ON c.id = p.category_id
            WHERE p.is_published_to_website = true AND p.is_active = true AND c.name IS NOT NULL
            ORDER BY c.name
        """)).mappings().all()
        return [r["name"] for r in rows]

    return cached("categories", settings.CACHE_STATIC_TTL, build)


def list_brands(db: Session) -> list[str]:
    def build():
        rows = db.execute(text("""
            SELECT DISTINCT b.name
            FROM products p JOIN brands b ON b.id = p.brand_id
            WHERE p.is_published_to_website = true AND p.is_active = true
            ORDER BY b.name
        """)).mappings().all()
        return [r["name"] for r in rows]

    return cached("brands", settings.CACHE_STATIC_TTL, build)


def count_published(db: Session) -> int:
    return cached("count_published", settings.CACHE_CATALOG_TTL, lambda: db.execute(text("""
        SELECT COUNT(*) FROM products p WHERE p.is_published_to_website = true AND p.is_active = true
    """)).scalar_one())


def get_variant_for_order(db: Session, variant_id: int):
    """Fetch a variant + product info for order creation (never cached).
    Returns None if the variant is not published/active."""
    sql = text("""
        SELECT
            p.id AS product_id, p.name AS product_name, p.image_url, p.extra_images,
            p.is_published_to_website, p.is_active AS product_active,
            pv.id AS variant_id, pv.variant_name, pv.sku, pv.unit,
            pv.selling_price, pv.is_active AS variant_active
        FROM products p
        JOIN product_variants pv ON pv.product_id = p.id
        WHERE pv.id = :vid
    """)
    row = db.execute(sql, {"vid": variant_id}).mappings().first()
    if not row:
        return None
    if not row["is_published_to_website"] or not row["product_active"] or not row["variant_active"]:
        return None
    return row
