"""Return processing — atomic, audited, with optional restocking."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, lazyload
from app.core.database import for_update

from app.models import (
    BranchInventory,
    Return,
    ReturnItem,
    Sale,
    SaleItem,
    StockMovement,
    User,
)
from app.schemas.returns import ReturnCreate
from app.services.audit import log_action

TWO_PLACES = Decimal("0.01")


def _next_return_number(db: Session, branch_id: int) -> str:
    max_num = db.execute(
        select(func.count()).select_from(Return).where(Return.branch_id == branch_id)
    ).scalar_one()
    return f"RET-{branch_id:02d}-{max_num + 1:06d}"


def process_return(db: Session, payload: ReturnCreate, user: User) -> Return:
    # Lock the sale row to prevent concurrent returns from over-returning.
    sale = db.execute(
        for_update(
            select(Sale)
            .options(lazyload("*"))  # plain row lock; eager joins are not allowed with FOR UPDATE
            .where(Sale.id == payload.sale_id)
        )
    ).scalar_one_or_none()
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    if sale.status == "VOIDED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot return a voided sale")

    # Lock sale items as well so returned_quantity updates are race-safe.
    sale_items = {
        si.id: si
        for si in db.execute(
            for_update(select(SaleItem).where(SaleItem.sale_id == sale.id))
        ).scalars()
    }
    return_items: list[tuple[SaleItem, Decimal, bool]] = []
    total_refund = Decimal("0")

    for ri in payload.items:
        si = sale_items.get(ri.sale_item_id)
        if si is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Sale item {ri.sale_item_id} not in this sale")
        already_returned = si.returned_quantity
        available = si.quantity - already_returned
        if ri.quantity > available:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Cannot return {ri.quantity} of '{si.product_name}'; only {available} available",
            )
        if ri.quantity <= 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Return quantity must be positive")
        # Refund accounts for line discount: refund = (unit_price - line_discount_per_unit) * qty
        per_unit_discount = si.line_discount / si.quantity if si.quantity > 0 else Decimal("0")
        refund = ((si.unit_price - per_unit_discount) * ri.quantity).quantize(TWO_PLACES)
        if refund < 0:
            refund = Decimal("0")
        return_items.append((si, ri.quantity, ri.restock))
        total_refund += refund

    # Lock inventory rows for restocked items
    restock_variants = sorted({si.variant_id for si, qty, restock in return_items if restock})
    inv_rows: dict[int, BranchInventory] = {}
    if restock_variants:
        inv_rows = {
            row.variant_id: row
            for row in db.execute(
                for_update(select(BranchInventory)
                .options(lazyload("*"))  # plain row lock; eager joins are not allowed with FOR UPDATE
                .where(
                    BranchInventory.branch_id == sale.branch_id,
                    BranchInventory.variant_id.in_(restock_variants),
                )
                .order_by(BranchInventory.variant_id))
            ).scalars()
        }

    ret = Return(
        return_number=_next_return_number(db, sale.branch_id),
        sale_id=sale.id,
        branch_id=sale.branch_id,
        processed_by=user.id,
        reason=payload.reason,
        total_refund=total_refund,
    )
    db.add(ret)
    db.flush()

    movements: list[StockMovement] = []
    for si, qty, restock in return_items:
        si.returned_quantity += qty
        per_unit_discount = si.line_discount / si.quantity if si.quantity > 0 else Decimal("0")
        item_refund = ((si.unit_price - per_unit_discount) * qty).quantize(TWO_PLACES)
        if item_refund < 0:
            item_refund = Decimal("0")
        db.add(ReturnItem(
            return_id=ret.id,
            sale_item_id=si.id,
            quantity=qty,
            refund_amount=item_refund,
            restock=restock,
        ))
        if restock:
            inv = inv_rows.get(si.variant_id)
            if inv is None:
                inv = BranchInventory(
                    branch_id=sale.branch_id, variant_id=si.variant_id, quantity=Decimal("0")
                )
                db.add(inv)
                db.flush()
                inv_rows[si.variant_id] = inv
            inv.quantity += qty
            movements.append(StockMovement(
                branch_id=sale.branch_id,
                variant_id=si.variant_id,
                movement_type="RETURN",
                quantity_change=qty,
                quantity_after=inv.quantity,
                reference_type="RETURN",
                reference_id=str(ret.id),
                user_id=user.id,
            ))

    # Update sale status
    all_returned = all(si.returned_quantity >= si.quantity for si in sale_items.values())
    some_returned = any(si.returned_quantity > 0 for si in sale_items.values())
    sale.status = "RETURNED" if all_returned else ("PARTIALLY_RETURNED" if some_returned else sale.status)

    for m in movements:
        db.add(m)

    log_action(
        db, user_id=user.id, action="return.processed", entity_type="return",
        entity_id=str(ret.id), branch_id=sale.branch_id,
        new_value={"return_number": ret.return_number, "total_refund": str(total_refund)},
    )
    db.commit()
    db.refresh(ret)
    return ret
