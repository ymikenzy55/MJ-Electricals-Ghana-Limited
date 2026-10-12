from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import enforce_branch_access, require_permission
from app.models import Branch, StockTransfer, User
from app.schemas.returns import TransferCreate, TransferOut
from app.services.transfers import (
    approve_transfer, cancel_transfer, create_transfer, dispatch_transfer, receive_transfer,
)

router = APIRouter(prefix="/api/v1/transfers", tags=["transfers"])


def _load_transfer(db: Session, transfer_id: int) -> StockTransfer:
    transfer = db.get(StockTransfer, transfer_id)
    if transfer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transfer not found")
    return transfer


@router.get("", response_model=list[TransferOut])
def list_transfers(
    branch_id: int | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.view")),
):
    # Branch-scoped users only see transfers involving their own branch.
    # Branchless users (admins) can see all transfers or filter by branch.
    if user.branch_id is not None:
        branch_id = user.branch_id
    elif branch_id is not None:
        enforce_branch_access(user, branch_id)

    query = select(StockTransfer)
    if branch_id is not None:
        query = query.where(
            or_(StockTransfer.from_branch_id == branch_id, StockTransfer.to_branch_id == branch_id)
        )
    if status_filter:
        query = query.where(StockTransfer.status == status_filter)
    query = query.order_by(StockTransfer.created_at.desc())
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    transfers = db.execute(query.offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return transfers


@router.post("", response_model=TransferOut, status_code=201)
def new_transfer(
    payload: TransferCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("transfers.create")),
):
    enforce_branch_access(user, payload.from_branch_id)
    return create_transfer(db, payload, user)


@router.post("/{transfer_id}/approve", response_model=TransferOut)
def approve(transfer_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("transfers.approve"))):
    transfer = _load_transfer(db, transfer_id)
    enforce_branch_access(user, transfer.from_branch_id)
    return approve_transfer(db, transfer_id, user)


@router.post("/{transfer_id}/dispatch", response_model=TransferOut)
def dispatch(transfer_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("transfers.create"))):
    transfer = _load_transfer(db, transfer_id)
    enforce_branch_access(user, transfer.from_branch_id)
    return dispatch_transfer(db, transfer_id, user)


@router.post("/{transfer_id}/receive", response_model=TransferOut)
def receive(transfer_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("transfers.create"))):
    transfer = _load_transfer(db, transfer_id)
    enforce_branch_access(user, transfer.to_branch_id)
    return receive_transfer(db, transfer_id, user)


@router.post("/{transfer_id}/cancel", response_model=TransferOut)
def cancel(transfer_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("transfers.approve"))):
    transfer = _load_transfer(db, transfer_id)
    enforce_branch_access(user, transfer.from_branch_id)
    return cancel_transfer(db, transfer_id, user)
