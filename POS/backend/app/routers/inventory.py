from decimal import Decimal

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, lazyload

from app.core.database import for_update, get_db
from app.dependencies.auth import enforce_branch_access, require_permission
from app.models import Branch, BranchInventory, Product, ProductVariant, StockMovement, User
from app.schemas.inventory import (
    AdjustmentIn,
    InventoryRow,
    PaginatedInventory,
    PaginatedMovements,
    StockMovementOut,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


@router.get("", response_model=PaginatedInventory)
def list_inventory(
    branch_id: int = Query(),
    search: str | None = Query(default=None, max_length=100),
    low_stock_only: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.view")),
):
    enforce_branch_access(user, branch_id)
    query = (
        select(
            ProductVariant.id,
            ProductVariant.product_id,
            Product.name.label("product_name"),
            ProductVariant.variant_name,
            ProductVariant.sku,
            ProductVariant.barcode,
            ProductVariant.unit,
            ProductVariant.reorder_level,
            ProductVariant.selling_price,
            Product.image_url.label("image_url"),
            func.coalesce(BranchInventory.quantity, 0).label("quantity"),
        )
        .join(Product, ProductVariant.product_id == Product.id)
        .outerjoin(
            BranchInventory,
            (BranchInventory.variant_id == ProductVariant.id)
            & (BranchInventory.branch_id == branch_id),
        )
        .where(ProductVariant.is_active, Product.is_active)
    )
    if search:
        term = f"%{search}%"
        query = query.where(
            or_(
                Product.name.ilike(term),
                ProductVariant.variant_name.ilike(term),
                ProductVariant.sku.ilike(term),
                ProductVariant.barcode.ilike(term),
            )
        )
    if low_stock_only:
        query = query.where(
            func.coalesce(BranchInventory.quantity, 0) <= ProductVariant.reorder_level
        )
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    rows = db.execute(
        query.order_by(Product.name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = [
        InventoryRow(
            variant_id=r.id,
            product_name=r.product_name,
            variant_name=r.variant_name,
            sku=r.sku,
            barcode=r.barcode,
            unit=r.unit,
            quantity=r.quantity,
            reorder_level=r.reorder_level,
            selling_price=r.selling_price,
            low_stock=r.quantity <= r.reorder_level,
            image_url=r.image_url,
        )
        for r in rows
    ]
    return PaginatedInventory(items=items, total=total, page=page, page_size=page_size)


@router.post("/adjust", response_model=StockMovementOut, status_code=201)
def adjust_inventory(
    payload: AdjustmentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.adjust")),
):
    enforce_branch_access(user, payload.branch_id)
    if payload.quantity_change == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Quantity change cannot be zero")

    # Lock the inventory row first. An existing row implies the variant exists,
    # so only validate the variant when a row must be created (saves a query).
    inv = db.execute(
        for_update(
            select(BranchInventory)
            .options(lazyload("*"))  # plain row lock; eager joins are not allowed with FOR UPDATE
            .where(
                BranchInventory.branch_id == payload.branch_id,
                BranchInventory.variant_id == payload.variant_id,
            )
        )
    ).scalar_one_or_none()
    if inv is None:
        variant = db.get(ProductVariant, payload.variant_id)
        if variant is None or not variant.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid product variant")
        inv = BranchInventory(
            branch_id=payload.branch_id, variant_id=payload.variant_id, quantity=Decimal("0")
        )
        db.add(inv)
        db.flush()

    new_qty = inv.quantity + payload.quantity_change
    if new_qty < 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Adjustment would make stock negative (current: {inv.quantity})",
        )
    old_qty = inv.quantity
    inv.quantity = new_qty

    movement = StockMovement(
        branch_id=payload.branch_id,
        variant_id=payload.variant_id,
        movement_type=payload.movement_type,
        quantity_change=payload.quantity_change,
        quantity_after=new_qty,
        reason=payload.reason,
        user_id=user.id,
    )
    db.add(movement)
    log_action(
        db, user_id=user.id, action="inventory.adjusted", entity_type="branch_inventory",
        entity_id=str(inv.id), branch_id=payload.branch_id,
        old_value={"quantity": str(old_qty)},
        new_value={"quantity": str(new_qty), "reason": payload.reason},
    )
    db.flush()
    # Serialize before commit: expire_on_commit would otherwise force a refresh
    # round-trip just to read back values we already hold in memory.
    out = StockMovementOut.model_validate(movement)
    db.commit()
    return out


class BulkSetIn(BaseModel):
    quantity: Decimal = Field(ge=0, le=1000000)
    branch_ids: list[int] | None = None  # every active branch when omitted
    reason: str = Field(default="Stock set for all products", max_length=255)


@router.post("/bulk-set")
def bulk_set_stock(
    payload: BulkSetIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.adjust")),
):
    """Set every active product option to the same stock level at the chosen branches."""
    if user.branch_id is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only head office users can change stock for all products")
    branches = [b.id for b in db.execute(select(Branch).where(Branch.is_active)).scalars()]
    if payload.branch_ids:
        branches = [b for b in branches if b in payload.branch_ids]
    variants = [v.id for v in db.execute(select(ProductVariant).where(ProductVariant.is_active)).scalars()]
    existing = {(r.branch_id, r.variant_id): r for r in db.execute(select(BranchInventory)).scalars()}
    changed = 0
    for b in branches:
        for vid in variants:
            row = existing.get((b, vid))
            old = row.quantity if row is not None else Decimal("0")
            if row is not None and old == payload.quantity:
                continue
            if row is None:
                row = BranchInventory(branch_id=b, variant_id=vid, quantity=payload.quantity)
                db.add(row)
            else:
                row.quantity = payload.quantity
            db.add(StockMovement(
                branch_id=b, variant_id=vid, movement_type="ADJUSTMENT",
                quantity_change=payload.quantity - old, quantity_after=payload.quantity,
                reason=payload.reason, user_id=user.id,
            ))
            changed += 1
    log_action(
        db, user_id=user.id, action="inventory.bulk_set", entity_type="branch_inventory", entity_id="all",
        new_value={"quantity": str(payload.quantity), "branches": branches, "rows_changed": changed},
    )
    db.commit()
    return {"branches": branches, "variants": len(variants), "rows_changed": changed}


@router.get("/movements", response_model=PaginatedMovements)
def list_movements(
    branch_id: int = Query(),
    variant_id: int | None = None,
    movement_type: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.view")),
):
    enforce_branch_access(user, branch_id)
    query = select(StockMovement).where(StockMovement.branch_id == branch_id)
    if variant_id:
        query = query.where(StockMovement.variant_id == variant_id)
    if movement_type:
        query = query.where(StockMovement.movement_type == movement_type)
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    movements = (
        db.execute(
            query.order_by(StockMovement.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return PaginatedMovements(
        items=[StockMovementOut.model_validate(m) for m in movements],
        total=total,
        page=page,
        page_size=page_size,
    )
