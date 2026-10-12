from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.dependencies.auth import enforce_branch_access, get_current_user, require_permission
from app.models import Brand, BranchInventory, Category, Product, ProductVariant, PurchaseItem, SaleItem, StockMovement, StockTransferItem, User
from app.schemas.product import (
    BrandCreate,
    BrandOut,
    CategoryCreate,
    CategoryOut,
    PaginatedProducts,
    PaginatedVariants,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    VariantCreate,
    VariantLookupOut,
    VariantOut,
    VariantUpdate,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1", tags=["products"])


def _product_out(p: Product) -> ProductOut:
    out = ProductOut.model_validate(p)
    out.category_name = p.category.name if p.category else None
    out.brand_name = p.brand.name if p.brand else None
    return out


# ---------- Categories / Brands ----------

@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db), _: User = Depends(require_permission("products.view"))):
    return db.execute(select(Category).where(Category.is_active).order_by(Category.name)).scalars().all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.create")),
):
    category = Category(name=payload.name, parent_id=payload.parent_id)
    db.add(category)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Category already exists")
    return category


@router.get("/brands", response_model=list[BrandOut])
def list_brands(db: Session = Depends(get_db), _: User = Depends(require_permission("products.view"))):
    return db.execute(select(Brand).where(Brand.is_active).order_by(Brand.name)).scalars().all()


@router.post("/brands", response_model=BrandOut, status_code=201)
def create_brand(
    payload: BrandCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.create")),
):
    brand = Brand(name=payload.name)
    db.add(brand)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Brand already exists")
    return brand


# ---------- Products ----------

@router.get("/products", response_model=PaginatedProducts)
def list_products(
    search: str | None = Query(default=None, max_length=100),
    category_id: int | None = None,
    brand_id: int | None = None,
    include_inactive: bool = False,
    branch_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.view")),
):
    if branch_id is not None:
        enforce_branch_access(user, branch_id)
    query = select(Product).options(selectinload(Product.variants))
    if not include_inactive:
        query = query.where(Product.is_active)
    if category_id:
        query = query.where(Product.category_id == category_id)
    if brand_id:
        query = query.where(Product.brand_id == brand_id)
    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                Product.name.ilike(term),
                Product.id.in_(
                    select(ProductVariant.product_id).where(
                        or_(
                            ProductVariant.sku.ilike(term),
                            ProductVariant.barcode.ilike(term),
                            ProductVariant.variant_name.ilike(term),
                        )
                    )
                ),
            )
        )
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    products = (
        db.execute(query.order_by(Product.id.desc()).offset((page - 1) * page_size).limit(page_size))
        .scalars()
        .all()
    )
    items = [_product_out(p) for p in products]
    if branch_id is not None:
        variant_ids = [v.id for p in items for v in p.variants]
        if variant_ids:
            rows = db.execute(
                select(BranchInventory.variant_id, BranchInventory.quantity).where(
                    BranchInventory.branch_id == branch_id,
                    BranchInventory.variant_id.in_(variant_ids),
                )
            ).all()
            stock = {vid: qty for vid, qty in rows}
            for p in items:
                for v in p.variants:
                    v.stock_quantity = stock.get(v.id, 0)
    return PaginatedProducts(
        items=items, total=total, page=page, page_size=page_size
    )


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.create")),
):
    product = Product(
        name=payload.name,
        category_id=payload.category_id,
        brand_id=payload.brand_id,
        description=payload.description,
        image_url=payload.image_url,
        extra_images=[e.model_dump() for e in payload.extra_images],
        is_published_to_website=payload.is_published_to_website,
    )
    for v in payload.variants:
        product.variants.append(ProductVariant(**v.model_dump()))
    db.add(product)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Duplicate SKU or barcode")

    # Optional opening stock, applied to the caller's (or selected) branch.
    stock_branch_id = payload.stock_branch_id or user.branch_id
    if payload.initial_stock and payload.initial_stock > 0 and stock_branch_id is not None:
        enforce_branch_access(user, stock_branch_id)
        for variant in product.variants:
            db.add(BranchInventory(
                branch_id=stock_branch_id, variant_id=variant.id,
                quantity=payload.initial_stock,
            ))
            db.add(StockMovement(
                branch_id=stock_branch_id, variant_id=variant.id,
                movement_type="OPENING", quantity_change=payload.initial_stock,
                quantity_after=payload.initial_stock,
                reference_type="product", reference_id=str(product.id),
                reason="Opening stock on product creation", user_id=user.id,
            ))

    log_action(
        db, user_id=user.id, action="product.created", entity_type="product",
        entity_id=str(product.id), new_value={"name": product.name},
    )
    db.commit()
    return _product_out(product)


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("products.view")),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return _product_out(product)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.update")),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    changes = payload.model_dump(exclude_unset=True)
    old = {k: getattr(product, k) for k in changes}
    for k, v in changes.items():
        setattr(product, k, v)
    log_action(
        db, user_id=user.id, action="product.updated", entity_type="product",
        entity_id=str(product.id), old_value={k: str(v) for k, v in old.items()},
        new_value={k: str(v) for k, v in changes.items()},
    )
    db.commit()
    return _product_out(product)


class BulkDeleteIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=2000)


@router.post("/products/bulk-delete")
def bulk_delete_products(
    payload: BulkDeleteIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.update")),
):
    """Delete products that were never sold, bought or transferred.

    Anything with history is archived instead (hidden from the register and
    the website) so past sales and reports stay correct."""
    deleted = archived = missing = 0
    for pid in dict.fromkeys(payload.ids):
        product = db.get(Product, pid)
        if product is None:
            missing += 1
            continue
        vids = [v.id for v in product.variants]
        used = bool(vids) and any(
            db.execute(select(func.count()).select_from(model).where(model.variant_id.in_(vids))).scalar()
            for model in (SaleItem, PurchaseItem, StockTransferItem)
        )
        if used:
            product.is_active = False
            product.is_published_to_website = False
            for v in product.variants:
                v.is_active = False
            archived += 1
        else:
            if vids:
                for row in db.execute(select(BranchInventory).where(BranchInventory.variant_id.in_(vids))).scalars():
                    db.delete(row)
                for row in db.execute(select(StockMovement).where(StockMovement.variant_id.in_(vids))).scalars():
                    db.delete(row)
                db.flush()
            for v in list(product.variants):
                db.delete(v)
            db.flush()
            db.delete(product)
            deleted += 1
    log_action(
        db, user_id=user.id, action="product.bulk_deleted", entity_type="product",
        entity_id="bulk",
        new_value={"deleted": deleted, "archived": archived, "requested": len(payload.ids)},
    )
    db.commit()
    return {"deleted": deleted, "archived": archived, "missing": missing}


@router.post("/products/{product_id}/variants", response_model=VariantOut, status_code=201)
def add_variant(
    product_id: int,
    payload: VariantCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.update")),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    variant = ProductVariant(product_id=product_id, **payload.model_dump())
    db.add(variant)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Duplicate SKU or barcode")
    log_action(
        db, user_id=user.id, action="variant.created", entity_type="variant",
        entity_id=str(variant.id), new_value={"sku": variant.sku},
    )
    db.commit()
    return variant


@router.patch("/variants/{variant_id}", response_model=VariantOut)
def update_variant(
    variant_id: int,
    payload: VariantUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.update")),
):
    variant = db.get(ProductVariant, variant_id)
    if variant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variant not found")
    changes = payload.model_dump(exclude_unset=True)
    old = {k: str(getattr(variant, k)) for k in changes}
    for k, v in changes.items():
        setattr(variant, k, v)
    action = "variant.price_changed" if "selling_price" in changes else "variant.updated"
    log_action(
        db, user_id=user.id, action=action, entity_type="variant", entity_id=str(variant.id),
        old_value=old, new_value={k: str(v) for k, v in changes.items()},
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Duplicate barcode")
    return variant


# ---------- POS lookup (barcode/SKU scan) ----------

@router.get("/pos/lookup", response_model=VariantLookupOut)
def pos_lookup(
    code: str = Query(min_length=1, max_length=64),
    branch_id: int = Query(),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.create")),
):
    """Exact-match barcode or SKU lookup, optimized with unique indexes."""
    enforce_branch_access(user, branch_id)
    variant = db.execute(
        select(ProductVariant)
        .join(Product, ProductVariant.product_id == Product.id)
        .where(
            ProductVariant.is_active,
            Product.is_active,
            or_(ProductVariant.barcode == code, ProductVariant.sku == code),
        )
    ).scalar_one_or_none()
    if variant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No product matches this barcode/SKU")
    qty = db.execute(
        select(BranchInventory.quantity).where(
            BranchInventory.branch_id == branch_id,
            BranchInventory.variant_id == variant.id,
        )
    ).scalar_one_or_none()
    return VariantLookupOut(
        variant_id=variant.id,
        product_id=variant.product_id,
        product_name=variant.product.name,
        variant_name=variant.variant_name,
        sku=variant.sku,
        barcode=variant.barcode,
        unit=variant.unit,
        selling_price=variant.selling_price,
        available_quantity=qty if qty is not None else 0,
        image_url=variant.product.image_url,
    )


@router.get("/pos/search", response_model=list[VariantLookupOut])
def pos_search(
    q: str = Query(default="", max_length=100),
    branch_id: int = Query(),
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.create")),
):
    """Name/SKU search for the POS screen, joined with branch stock.

    Uses GIN trigram indexes for fast ILIKE matching and eager-loads the
    product relationship to avoid N+1 queries when serializing results.
    An empty query returns the most recently active products for browsing.
    """
    enforce_branch_access(user, branch_id)
    base_q = (
        select(
            ProductVariant.id,
            ProductVariant.product_id,
            Product.name.label("product_name"),
            ProductVariant.variant_name,
            ProductVariant.sku,
            ProductVariant.barcode,
            ProductVariant.unit,
            ProductVariant.selling_price,
            Product.image_url.label("image_url"),
            func.coalesce(BranchInventory.quantity, 0).label("available_quantity"),
        )
        .join(Product, ProductVariant.product_id == Product.id)
        .outerjoin(
            BranchInventory,
            (BranchInventory.variant_id == ProductVariant.id)
            & (BranchInventory.branch_id == branch_id),
        )
        .where(ProductVariant.is_active, Product.is_active)
    )
    if q.strip():
        term = f"%{q}%"
        base_q = base_q.where(
            or_(
                Product.name.ilike(term),
                ProductVariant.variant_name.ilike(term),
                ProductVariant.sku.ilike(term),
                ProductVariant.barcode.ilike(term),
            )
        )
        base_q = base_q.order_by(Product.name)
    else:
        # Browse mode: show available products first, then by name
        base_q = base_q.order_by(func.coalesce(BranchInventory.quantity, 0).desc(), Product.name)
    rows = db.execute(base_q.limit(limit)).all()
    return [
        VariantLookupOut(
            variant_id=r.id,
            product_id=r.product_id,
            product_name=r.product_name,
            variant_name=r.variant_name,
            sku=r.sku,
            barcode=r.barcode,
            unit=r.unit,
            selling_price=r.selling_price,
            available_quantity=r.available_quantity,
            image_url=r.image_url,
        )
        for r in rows
    ]


@router.get("/pos/browse", response_model=PaginatedVariants)
def pos_browse(
    branch_id: int = Query(),
    q: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.create")),
):
    """Paginated product browser for the POS screen.

    Returns all active variants with branch stock, supports search and pagination.
    Each row is indexed by variant_id for fast client-side lookup.
    """
    enforce_branch_access(user, branch_id)
    base_q = (
        select(
            ProductVariant.id,
            ProductVariant.product_id,
            Product.name.label("product_name"),
            ProductVariant.variant_name,
            ProductVariant.sku,
            ProductVariant.barcode,
            ProductVariant.unit,
            ProductVariant.selling_price,
            Product.image_url.label("image_url"),
            func.coalesce(BranchInventory.quantity, 0).label("available_quantity"),
        )
        .join(Product, ProductVariant.product_id == Product.id)
        .outerjoin(
            BranchInventory,
            (BranchInventory.variant_id == ProductVariant.id)
            & (BranchInventory.branch_id == branch_id),
        )
        .where(ProductVariant.is_active, Product.is_active)
    )
    if q.strip():
        term = f"%{q}%"
        base_q = base_q.where(
            or_(
                Product.name.ilike(term),
                ProductVariant.variant_name.ilike(term),
                ProductVariant.sku.ilike(term),
                ProductVariant.barcode.ilike(term),
            )
        )
    base_q = base_q.order_by(Product.name, ProductVariant.variant_name)

    total = db.execute(select(func.count()).select_from(base_q.subquery())).scalar_one()
    rows = db.execute(base_q.offset((page - 1) * page_size).limit(page_size)).all()

    items = [
        VariantLookupOut(
            variant_id=r.id,
            product_id=r.product_id,
            product_name=r.product_name,
            variant_name=r.variant_name,
            sku=r.sku,
            barcode=r.barcode,
            unit=r.unit,
            selling_price=r.selling_price,
            available_quantity=r.available_quantity,
            image_url=r.image_url,
        )
        for r in rows
    ]
    return PaginatedVariants(items=items, total=total, page=page, page_size=page_size)
