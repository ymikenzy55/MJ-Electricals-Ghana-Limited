"""Cashier shift / cash drawer endpoints.

A cashier opens a shift with a cash float, sells during the session, then
closes it by counting the physical cash. Expected cash is the float plus all
CASH tender taken during the shift, minus cash expenses paid from the drawer;
the variance is the control figure.
"""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, lazyload

from app.core.database import for_update, get_db
from app.dependencies.auth import enforce_branch_access, require_permission, user_permissions
from app.models import Expense, Sale, SalePayment, Shift, User
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/shifts", tags=["shifts"])

TWO_PLACES = Decimal("0.01")


class ShiftOpenIn(BaseModel):
    branch_id: int
    opening_float: Decimal = Field(default=Decimal("0"), ge=0)
    notes: str | None = Field(default=None, max_length=500)


class ShiftCloseIn(BaseModel):
    counted_cash: Decimal = Field(ge=0)
    notes: str | None = Field(default=None, max_length=500)


class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    branch_id: int
    user_id: int
    user_name: str | None = None
    status: str
    opening_float: Decimal
    counted_cash: Decimal | None
    expected_cash: Decimal | None
    variance: Decimal | None
    opened_at: datetime
    closed_at: datetime | None
    notes: str | None
    # Live figures for the session
    sales_count: int = 0
    sales_total: Decimal = Decimal("0")
    cash_taken: Decimal = Decimal("0")
    cash_expenses: Decimal = Decimal("0")


def _cash_expenses(db: Session, shift_id: int) -> Decimal:
    """Cash paid out of the drawer (petty cash) during the shift."""
    return Decimal(str(db.execute(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.shift_id == shift_id, Expense.status == "ACTIVE", Expense.paid_via == "CASH",
        )
    ).scalar_one()))


def _shift_totals(db: Session, shift_id: int) -> tuple[int, Decimal, Decimal]:
    """Return (sales_count, sales_total, cash_taken) for a shift."""
    count, total = db.execute(
        select(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0)).where(
            Sale.shift_id == shift_id, Sale.status != "VOIDED"
        )
    ).one()
    cash = db.execute(
        select(func.coalesce(func.sum(SalePayment.amount), 0))
        .join(Sale, SalePayment.sale_id == Sale.id)
        .where(
            Sale.shift_id == shift_id,
            Sale.status != "VOIDED",
            SalePayment.method == "CASH",
        )
    ).scalar_one()
    return count, Decimal(str(total)), Decimal(str(cash))


def _shift_out(db: Session, shift: Shift) -> ShiftOut:
    out = ShiftOut.model_validate(shift)
    out.user_name = shift.user.full_name if shift.user else None
    count, total, cash = _shift_totals(db, shift.id)
    out.sales_count = count
    out.sales_total = total
    out.cash_taken = cash
    out.cash_expenses = _cash_expenses(db, shift.id)
    return out


@router.get("/current", response_model=ShiftOut | None)
def current_shift(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("shifts.operate")),
):
    """The caller's own open shift, if any."""
    shift = db.execute(
        select(Shift).where(Shift.user_id == user.id, Shift.status == "OPEN")
    ).scalar_one_or_none()
    return _shift_out(db, shift) if shift else None


@router.post("/open", response_model=ShiftOut, status_code=201)
def open_shift(
    payload: ShiftOpenIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("shifts.operate")),
):
    enforce_branch_access(user, payload.branch_id)
    existing = db.execute(
        select(Shift).where(Shift.user_id == user.id, Shift.status == "OPEN")
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "You already have an open shift. Close it before opening a new one.",
        )
    shift = Shift(
        branch_id=payload.branch_id,
        user_id=user.id,
        status="OPEN",
        opening_float=payload.opening_float,
        notes=payload.notes,
    )
    db.add(shift)
    db.flush()
    log_action(
        db, user_id=user.id, action="shift.opened", entity_type="shift",
        entity_id=str(shift.id), branch_id=payload.branch_id,
        new_value={"opening_float": str(payload.opening_float)},
    )
    db.commit()
    db.refresh(shift)
    return _shift_out(db, shift)


@router.post("/{shift_id}/close", response_model=ShiftOut)
def close_shift(
    shift_id: int,
    payload: ShiftCloseIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("shifts.operate")),
):
    # lazyload("*") keeps this a plain row lock. Shift.user is eager-joined by
    # default, and Postgres rejects FOR UPDATE on the nullable side of a join.
    shift = db.execute(
        for_update(
            select(Shift)
            .options(lazyload("*"))
            .where(Shift.id == shift_id)
        )
    ).scalar_one_or_none()
    if shift is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found")
    # Only the owner, or someone who can view all shifts, may close it.
    if shift.user_id != user.id and "shifts.view_all" not in user_permissions(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only close your own shift")
    enforce_branch_access(user, shift.branch_id)
    if shift.status == "CLOSED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Shift is already closed")

    _, _, cash_taken = _shift_totals(db, shift.id)
    expected = (shift.opening_float + cash_taken - _cash_expenses(db, shift.id)).quantize(TWO_PLACES)
    shift.expected_cash = expected
    shift.counted_cash = payload.counted_cash
    shift.variance = (payload.counted_cash - expected).quantize(TWO_PLACES)
    shift.status = "CLOSED"
    shift.closed_at = datetime.now(timezone.utc)
    if payload.notes:
        shift.notes = payload.notes

    log_action(
        db, user_id=user.id, action="shift.closed", entity_type="shift",
        entity_id=str(shift.id), branch_id=shift.branch_id,
        new_value={
            "expected_cash": str(expected),
            "counted_cash": str(payload.counted_cash),
            "variance": str(shift.variance),
        },
    )
    db.commit()
    db.refresh(shift)
    return _shift_out(db, shift)


@router.get("", response_model=list[ShiftOut])
def list_shifts(
    branch_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("shifts.operate")),
):
    """Shift history. Without shifts.view_all a user only sees their own."""
    query = select(Shift)
    if "shifts.view_all" not in user_permissions(user):
        query = query.where(Shift.user_id == user.id)
    if user.branch_id is not None:
        query = query.where(Shift.branch_id == user.branch_id)
    elif branch_id is not None:
        enforce_branch_access(user, branch_id)
        query = query.where(Shift.branch_id == branch_id)
    if status_filter:
        query = query.where(Shift.status == status_filter)

    shifts = (
        db.execute(
            query.order_by(Shift.opened_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return [_shift_out(db, s) for s in shifts]
