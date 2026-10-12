"""Public catalog router. Exposes published products to website visitors."""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.cache import cached
from app.core.config import settings
from app.core.database import get_db
from app.models import WebsiteSettings
from app.schemas import BranchOut, CatalogProductOut, PaginatedCatalogOut, SiteSettingsPublic
from app.services import catalog as svc

router = APIRouter(prefix="/api/v1/catalog", tags=["catalog"])

# Browsers and the Next.js server may reuse these responses briefly.
_PUBLIC = "no-cache"  # the API already caches server-side; browsers must not add staleness
_STATIC = "no-cache"


@router.get("/version")
def data_version(response: Response, db: Session = Depends(get_db)):
    """A short fingerprint of everything the storefront shows (products, prices,
    stock, categories, settings). The website polls this every few seconds and
    refreshes itself the moment it changes, no manual reload needed. When the
    fingerprint moves, the server-side catalog cache is dropped immediately."""
    def build():
        row = db.execute(text("""
            SELECT md5(concat_ws('|',
              (SELECT COALESCE(max(updated_at)::text, '') || count(*) FROM products),
              (SELECT COALESCE(sum(selling_price)::text, '') || count(*) FROM product_variants),
              (SELECT COALESCE(max(updated_at)::text, '') || COALESCE(sum(quantity)::text, '') FROM branch_inventory),
              (SELECT COALESCE(md5(string_agg(s::text, ',')), '') FROM website_settings s),
              (SELECT COALESCE(max(created_at)::text, '') FROM website_reviews),
              (SELECT count(*) FROM branches WHERE is_active)
            ))
        """)).scalar_one()
        return row

    v = cached("data_version", 3, build)
    global _last_version
    if _last_version is not None and v != _last_version:
        from app.core.cache import invalidate
        invalidate()
    _last_version = v
    response.headers["Cache-Control"] = "no-store"
    return {"v": v}


_last_version: str | None = None


@router.get("/site-settings", response_model=SiteSettingsPublic)
def get_site_settings(response: Response, db: Session = Depends(get_db)):
    """Public site settings, hero, contact info, announcement, maintenance
    flag. Safe to expose without an admin key."""
    def build():
        s = db.execute(select(WebsiteSettings).where(WebsiteSettings.id == 1)).scalar_one_or_none()
        if not s:
            s = WebsiteSettings(id=1)
            db.add(s)
            db.commit()
            db.refresh(s)
        return SiteSettingsPublic.model_validate(s)

    response.headers["Cache-Control"] = _PUBLIC
    return cached("site_settings", settings.CACHE_STATIC_TTL, build)


@router.get("/branches", response_model=list[BranchOut])
def get_branches(response: Response, db: Session = Depends(get_db)):
    """Active POS branches for pickup selection and the 'Find a Branch' page."""
    def build():
        rows = db.execute(text("""
            SELECT id, name, code, address, phone FROM branches
            WHERE is_active = true ORDER BY name
        """)).mappings().all()
        return [dict(r) for r in rows]

    response.headers["Cache-Control"] = _STATIC
    return cached("branches", settings.CACHE_STATIC_TTL, build)


@router.get("/products", response_model=PaginatedCatalogOut)
def get_products(
    response: Response,
    category: str | None = Query(default=None, max_length=100),
    q: str | None = Query(default=None, max_length=100),
    brand: str | None = Query(default=None, max_length=100),
    sort: str = Query(default="featured", pattern="^(featured|newest|price_asc|price_desc|name)$"),
    in_stock: bool = False,
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=40, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Published products, paginated, with optional search / filters / sort."""
    items, total = svc.list_published_products(
        db, category=category, q=(q or "").strip() or None, page=page, page_size=page_size,
        sort=sort, brand=brand, in_stock=in_stock, min_price=min_price, max_price=max_price,
    )
    response.headers["Cache-Control"] = _PUBLIC
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/products/{product_id}", response_model=CatalogProductOut)
def get_product(product_id: int, response: Response, db: Session = Depends(get_db)):
    p = svc.get_published_product(db, product_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Product not found")
    response.headers["Cache-Control"] = _PUBLIC
    return p


@router.get("/products/{product_id}/related", response_model=list[CatalogProductOut])
def get_related(
    product_id: int, response: Response,
    limit: int = Query(default=8, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """Similar products (same category / brand / price band), best match first."""
    response.headers["Cache-Control"] = _PUBLIC
    return svc.related_products(db, product_id, limit)


@router.get("/categories", response_model=list[str])
def get_categories(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = _STATIC
    return svc.list_categories(db)


@router.get("/brands", response_model=list[str])
def get_brands(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = _STATIC
    return svc.list_brands(db)


@router.get("/sitemap")
def sitemap_data(db: Session = Depends(get_db)):
    """Product ids + last-modified for the frontend sitemap."""
    return {
        "products": [{"id": r["id"], "updated_at": r["updated_at"]} for r in svc.all_published_ids(db)],
        "categories": svc.list_categories(db),
    }
