"""Stock transfers between branches with state machine.

States: REQUESTED → APPROVED → DISPATCHED → RECEIVED (or CANCELLED at any pre-dispatch stage).
Stock only moves on DISPATCH (deduct from source) and RECEIVE (add to destination).
"""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, lazyload
from app.core.database import for_update

from app.models import (
    BranchInventory,
    StockMovement,
    StockTransfer,
    StockTransferItem,
    User,
)
from app.schemas.returns import TransferCreate
from app.services.audit import log_action


def _next_transfer_number(db: Session) -> str:
    count = db.execute(select(func.count()).select_from(StockTransfer)).scalar_one()
    return f"TRF-{count + 1:06d}"


def create_transfer(db: Session, payload: TransferCreate, user: User) -> StockTransfer:
    if payload.from_branch_id == payload.to_branch_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Source and destination must differ")

    # Validate and lock source inventory
    variant_ids = sorted({i.variant_id for i in payload.items})
    inv_rows = {
        row.variant_id: row
        for row in db.execute(
            for_update(
                select(BranchInventory)
                .options(lazyload("*"))  # plain row lock; eager joins are not allowed with FOR UPDATE
                .where(
                    BranchInventory.branch_id == payload.from_branch_id,
                    BranchInventory.variant_id.in_(variant_ids),
                )
                .order_by(BranchInventory.variant_id)
            )
        ).scalars()
    }

    for item in payload.items:
        inv = inv_rows.get(item.variant_id)
        available = inv.quantity if inv else Decimal("0")
        if available < item.quantity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Insufficient stock at source for variant {item.variant_id} "
                f"(available: {available}, requested: {item.quantity})",
            )

    transfer = StockTransfer(
        transfer_number=_next_transfer_number(db),
        from_branch_id=payload.from_branch_id,
        to_branch_id=payload.to_branch_id,
        status="REQUESTED",
        requested_by=user.id,
        notes=payload.notes,
    )
    for item in payload.items:
        transfer.items.append(StockTransferItem(variant_id=item.variant_id, quantity=item.quantity))

    db.add(transfer)
    log_action(
        db, user_id=user.id, action="transfer.created", entity_type="transfer",
        entity_id=None, branch_id=payload.from_branch_id,
        new_value={"to_branch": payload.to_branch_id, "items": len(payload.items)},
    )
    db.commit()
    db.refresh(transfer)
    return transfer


def _get_transfer(db: Session, transfer_id: int) -> StockTransfer:
    transfer = db.get(StockTransfer, transfer_id)
    if transfer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transfer not found")
    return transfer


def approve_transfer(db: Session, transfer_id: int, user: User) -> StockTransfer:
    transfer = _get_transfer(db, transfer_id)
    if transfer.status != "REQUESTED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot approve transfer in {transfer.status} state")
    transfer.status = "APPROVED"
    transfer.approved_by = user.id
    log_action(db, user_id=user.id, action="transfer.approved", entity_type="transfer",
               entity_id=str(transfer.id), branch_id=transfer.from_branch_id)
    db.commit()
    db.refresh(transfer)
    return transfer


def dispatch_transfer(db: Session, transfer_id: int, user: User) -> StockTransfer:
    transfer = _get_transfer(db, transfer_id)
    if transfer.status != "APPROVED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot dispatch transfer in {transfer.status} state")

    # Lock and deduct source inventory
    variant_ids = sorted({i.variant_id for i in transfer.items})
    inv_rows = {
        row.variant_id: row
        for row in db.execute(
            for_update(select(BranchInventory)
            .options(lazyload("*"))  # plain row lock; eager joins are not allowed with FOR UPDATE
            .where(
                BranchInventory.branch_id == transfer.from_branch_id,
                BranchInventory.variant_id.in_(variant_ids),
            )
            .order_by(BranchInventory.variant_id))
        ).scalars()
    }

    for item in transfer.items:
        inv = inv_rows.get(item.variant_id)
        if inv is None or inv.quantity < item.quantity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Insufficient stock at source for variant {item.variant_id}",
            )
        inv.quantity -= item.quantity
        db.add(StockMovement(
            branch_id=transfer.from_branch_id,
            variant_id=item.variant_id,
            movement_type="TRANSFER_OUT",
            quantity_change=-item.quantity,
            quantity_after=inv.quantity,
            reference_type="TRANSFER",
            reference_id=str(transfer.id),
            user_id=user.id,
        ))

    transfer.status = "DISPATCHED"
    log_action(db, user_id=user.id, action="transfer.dispatched", entity_type="transfer",
               entity_id=str(transfer.id), branch_id=transfer.from_branch_id)
    db.commit()
    db.refresh(transfer)
    return transfer


def receive_transfer(db: Session, transfer_id: int, user: User) -> StockTransfer:
    transfer = _get_transfer(db, transfer_id)
    if transfer.status != "DISPATCHED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot receive transfer in {transfer.status} state")

    variant_ids = sorted({i.variant_id for i in transfer.items})
    inv_rows = {
        row.variant_id: row
        for row in db.execute(
            for_update(select(BranchInventory)
            .options(lazyload("*"))  # plain row lock; eager joins are not allowed with FOR UPDATE
            .where(
                BranchInventory.branch_id == transfer.to_branch_id,
                BranchInventory.variant_id.in_(variant_ids),
            )
            .order_by(BranchInventory.variant_id))
        ).scalars()
    }

    for item in transfer.items:
        inv = inv_rows.get(item.variant_id)
        if inv is None:
            inv = BranchInventory(
                branch_id=transfer.to_branch_id, variant_id=item.variant_id, quantity=Decimal("0")
            )
            db.add(inv)
            db.flush()
        inv.quantity += item.quantity
        db.add(StockMovement(
            branch_id=transfer.to_branch_id,
            variant_id=item.variant_id,
            movement_type="TRANSFER_IN",
            quantity_change=item.quantity,
            quantity_after=inv.quantity,
            reference_type="TRANSFER",
            reference_id=str(transfer.id),
            user_id=user.id,
        ))

    transfer.status = "RECEIVED"
    log_action(db, user_id=user.id, action="transfer.received", entity_type="transfer",
               entity_id=str(transfer.id), branch_id=transfer.to_branch_id)
    db.commit()
    db.refresh(transfer)
    return transfer


def cancel_transfer(db: Session, transfer_id: int, user: User) -> StockTransfer:
    transfer = _get_transfer(db, transfer_id)
    if transfer.status not in ("REQUESTED", "APPROVED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot cancel transfer in {transfer.status} state")
    transfer.status = "CANCELLED"
    log_action(db, user_id=user.id, action="transfer.cancelled", entity_type="transfer",
               entity_id=str(transfer.id), branch_id=transfer.from_branch_id)
    db.commit()
    db.refresh(transfer)
    return transfer
