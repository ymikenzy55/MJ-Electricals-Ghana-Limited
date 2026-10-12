"""Expenses: petty cash, utilities, transport, supplies …

Cash expenses recorded during an open shift reduce that shift's expected cash,
so the drawer still balances when money is paid out of it.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import enforce_branch_access, require_permission
from app.models import Expense, Shift, User
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/expenses", tags=["expenses"])

CATEGORIES = [
    "Rent", "Utilities", "Transport & delivery", "Salaries & wages", "Supplies",
    "Repairs & maintenance", "Marketing", "Taxes & licences", "Bank charges", "Meals & refreshments", "Other",
]


class ExpenseIn(BaseModel):
    branch_id: int
    category: str = Field(min_length=2, max_length=48)
    description: str | None = Field(default=None, max_length=255)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    paid_via: Literal["CASH", "MOMO", "BANK"] = "CASH"
    reference: str | None = Field(default=None, max_length=64)
    expense_date: date | None = None


class ExpenseVoid(BaseModel):
    reason: str = Field(min_length=3, max_length=255)


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    branch_id: int
    user_id: int
    shift_id: int | None
    category: str
    description: str | None
    amount: Decimal
    paid_via: str
    reference: str | None
    expense_date: date
    status: str
    void_reason: str | None
    created_at: datetime
    user_name: str | None = None


class ExpenseList(BaseModel):
    items: list[ExpenseOut]
    total: int
    total_amount: Decimal
    by_category: dict[str, Decimal]
    page: int
    page_size: int


@router.get("/categories", response_model=list[str])
def categories(_: User = Depends(require_permission("expenses.view"))):
    return CATEGORIES


@router.get("", response_model=ExpenseList)
def list_expenses(
    branch_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("expenses.view")),
):
    conds = []
    if user.branch_id is not None:
        conds.append(Expense.branch_id == user.branch_id)
    elif branch_id is not None:
        conds.append(Expense.branch_id == branch_id)
    if date_from:
        conds.append(Expense.expense_date >= date_from)
    if date_to:
        conds.append(Expense.expense_date <= date_to)
    if category:
        conds.append(Expense.category == category)

    active = [*conds, Expense.status == "ACTIVE"]
    total, total_amount = db.execute(
        select(func.count(), func.coalesce(func.sum(Expense.amount), 0)).where(*active)
    ).one()
    by_cat = dict(db.execute(
        select(Expense.category, func.sum(Expense.amount)).where(*active).group_by(Expense.category)
    ).all())
    # voided rows are listed too (greyed out) but excluded from the totals above
    rows = db.execute(
        select(Expense, User.full_name).join(User, User.id == Expense.user_id).where(*conds)
        .order_by(Expense.expense_date.desc(), Expense.id.desc())
        .offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = []
    for e, name in rows:
        out = ExpenseOut.model_validate(e)
        out.user_name = name
        items.append(out)
    return ExpenseList(
        items=items, total=total, total_amount=Decimal(str(total_amount)),
        by_category={k: Decimal(str(v)) for k, v in by_cat.items()}, page=page, page_size=page_size,
    )


@router.post("", response_model=ExpenseOut, status_code=201)
def create_expense(
    payload: ExpenseIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("expenses.manage")),
):
    enforce_branch_access(user, payload.branch_id)
    shift_id = None
    if payload.paid_via == "CASH":
        # Tie cash payouts to the cashier's open shift so the drawer balances.
        shift_id = db.execute(
            select(Shift.id).where(
                Shift.user_id == user.id, Shift.branch_id == payload.branch_id, Shift.status == "OPEN"
            ).limit(1)
        ).scalar_one_or_none()
    exp = Expense(
        branch_id=payload.branch_id, user_id=user.id, shift_id=shift_id,
        category=payload.category.strip(), description=(payload.description or "").strip() or None,
        amount=payload.amount, paid_via=payload.paid_via,
        reference=(payload.reference or "").strip() or None,
        expense_date=payload.expense_date or date.today(),
    )
    db.add(exp)
    db.flush()
    log_action(
        db, user_id=user.id, action="expense.created", entity_type="expense", entity_id=str(exp.id),
        branch_id=exp.branch_id, new_value={"amount": str(exp.amount), "category": exp.category, "paid_via": exp.paid_via},
    )
    out = ExpenseOut.model_validate(exp)
    out.user_name = user.full_name
    db.commit()
    return out


@router.post("/{expense_id}/void", response_model=ExpenseOut)
def void_expense(
    expense_id: int,
    payload: ExpenseVoid,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("expenses.manage")),
):
    exp = db.get(Expense, expense_id)
    if exp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    enforce_branch_access(user, exp.branch_id)
    if exp.status == "VOIDED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Expense is already voided")
    shift = db.get(Shift, exp.shift_id) if exp.shift_id else None
    if shift is not None and shift.status == "CLOSED":
        raise HTTPException(status.HTTP_409_CONFLICT, "This expense belongs to a closed cash-drawer shift and can no longer be voided")
    exp.status = "VOIDED"
    exp.void_reason = payload.reason.strip()
    log_action(
        db, user_id=user.id, action="expense.voided", entity_type="expense", entity_id=str(exp.id),
        branch_id=exp.branch_id, new_value={"reason": exp.void_reason},
    )
    out = ExpenseOut.model_validate(exp)
    db.commit()
    return out
