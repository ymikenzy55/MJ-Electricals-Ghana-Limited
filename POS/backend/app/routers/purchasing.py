from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, lazyload

from app.core.database import for_update, get_db
from app.dependencies.auth import enforce_branch_access, require_permission
from app.models import (
    BranchInventory,
    ProductVariant,
    Purchase,
    PurchaseItem,
    StockMovement,
    Supplier,
    User,
)
from app.schemas.returns import PurchaseCreate, PurchaseItemOut, PurchaseOut, SupplierCreate, SupplierOut
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1", tags=["purchasing"])


def _next_purchase_number(db: Session, branch_id: int) -> str:
    count = db.execute(
        select(func.count()).select_from(Purchase).where(Purchase.branch_id == branch_id)
    ).scalar_one()
    return f"PO-{branch_id:02d}-{count + 1:06d}"


# ---------- Suppliers ----------

@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("purchases.view")),
):
    query = select(Supplier).where(Supplier.is_active)
    if q:
        query = query.where(Supplier.name.ilike(f"%{q}%"))
    return db.execute(query.order_by(Supplier.name)).scalars().all()


@router.post("/suppliers", response_model=SupplierOut, status_code=201)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("suppliers.manage")),
):
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: int,
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("suppliers.manage")),
):
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Supplier not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, k, v)
    db.commit()
    db.refresh(supplier)
    return supplier


# ---------- Purchases ----------

@router.post("/purchases", response_model=PurchaseOut, status_code=201)
def create_purchase(
    payload: PurchaseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("purchases.create")),
):
    enforce_branch_access(user, payload.branch_id)

    variant_ids = sorted({i.variant_id for i in payload.items})
    variants = {
        v.id: v
        for v in db.execute(
            select(ProductVariant).where(ProductVariant.id.in_(variant_ids))
        ).scalars()
    }
    for vid in variant_ids:
        if vid not in variants:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Variant {vid} not found")

    # Lock inventory rows
    inv_rows = {
        row.variant_id: row
        for row in db.execute(
            for_update(
                select(BranchInventory)
                .options(lazyload("*"))  # plain row lock; eager joins are not allowed with FOR UPDATE
                .where(
                    BranchInventory.branch_id == payload.branch_id,
                    BranchInventory.variant_id.in_(variant_ids),
                )
                .order_by(BranchInventory.variant_id)
            )
        ).scalars()
    }

    total_cost = Decimal("0")
    purchase = Purchase(
        purchase_number=_next_purchase_number(db, payload.branch_id),
        supplier_id=payload.supplier_id,
        branch_id=payload.branch_id,
        received_by=user.id,
        notes=payload.notes,
    )
    db.add(purchase)
    db.flush()

    for item in payload.items:
        variant = variants[item.variant_id]
        line_cost = (item.unit_cost * item.quantity).quantize(Decimal("0.01"))
        total_cost += line_cost
        db.add(PurchaseItem(
            purchase_id=purchase.id,
            variant_id=item.variant_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
        ))
        # Update cost price if provided and higher accuracy
        if variant.cost_price is None or item.unit_cost > variant.cost_price:
            variant.cost_price = item.unit_cost

        inv = inv_rows.get(item.variant_id)
        if inv is None:
            inv = BranchInventory(
                branch_id=payload.branch_id, variant_id=item.variant_id, quantity=Decimal("0")
            )
            db.add(inv)
            db.flush()
        inv.quantity += item.quantity
        db.add(StockMovement(
            branch_id=payload.branch_id,
            variant_id=item.variant_id,
            movement_type="PURCHASE",
            quantity_change=item.quantity,
            quantity_after=inv.quantity,
            reference_type="PURCHASE",
            reference_id=str(purchase.id),
            user_id=user.id,
        ))

    purchase.total_cost = total_cost
    log_action(
        db, user_id=user.id, action="purchase.created", entity_type="purchase",
        entity_id=str(purchase.id), branch_id=payload.branch_id,
        new_value={"purchase_number": purchase.purchase_number, "total_cost": str(total_cost)},
    )
    db.commit()
    db.refresh(purchase)
    return purchase


@router.get("/purchases", response_model=list[PurchaseOut])
def list_purchases(
    branch_id: int = Query(),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("purchases.view")),
):
    enforce_branch_access(user, branch_id)
    query = select(Purchase).where(Purchase.branch_id == branch_id).order_by(Purchase.created_at.desc())
    return db.execute(query.offset((page - 1) * page_size).limit(page_size)).scalars().all()
