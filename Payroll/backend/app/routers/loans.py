"""Staff loans / salary advances repaid through payroll."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models import PayrollEmployee, PayrollLoan
from app.routers.auth import require_admin
from app.schemas import LoanCreate, LoanOut
from app.services.common import audit

router = APIRouter(prefix="/api/v1/loans", tags=["loans"], dependencies=[Depends(require_admin)])


def _out(loan: PayrollLoan) -> LoanOut:
    out = LoanOut.model_validate(loan)
    if loan.employee:
        out.employee_name = loan.employee.full_name
        out.employee_code = loan.employee.employee_code
    return out


@router.get("", response_model=list[LoanOut])
def list_loans(status: str | None = None, db: Session = Depends(get_db)):
    stmt = select(PayrollLoan).options(joinedload(PayrollLoan.employee))
    if status:
        stmt = stmt.where(PayrollLoan.status == status)
    return [_out(l) for l in db.execute(stmt.order_by(PayrollLoan.created_at.desc())).scalars().all()]


@router.post("", response_model=LoanOut, status_code=201)
def create_loan(payload: LoanCreate, db: Session = Depends(get_db)):
    emp = db.get(PayrollEmployee, payload.employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    if payload.installment > payload.principal:
        raise HTTPException(422, "Instalment cannot be larger than the loan amount")
    loan = PayrollLoan(
        employee_id=emp.id, principal=payload.principal, installment=payload.installment,
        balance=payload.principal, reason=payload.reason,
        issued_date=payload.issued_date or date.today(), status="ACTIVE",
    )
    db.add(loan)
    db.flush()
    audit(db, "CREATE", "loan", loan.id, f"Loan ₵{loan.principal} to {emp.employee_code}, ₵{loan.installment}/run")
    db.commit()
    db.refresh(loan)
    loan.employee = emp
    return _out(loan)


@router.post("/{loan_id}/cancel", response_model=LoanOut)
def cancel_loan(loan_id: int, db: Session = Depends(get_db)):
    loan = db.execute(
        select(PayrollLoan).options(joinedload(PayrollLoan.employee)).where(PayrollLoan.id == loan_id)
    ).scalar_one_or_none()
    if not loan:
        raise HTTPException(404, "Loan not found")
    if loan.status != "ACTIVE":
        raise HTTPException(409, f"Loan is already {loan.status.lower()}")
    loan.status = "CANCELLED"
    audit(db, "CANCEL", "loan", loan.id, f"Cancelled loan (balance ₵{loan.balance} written off)")
    db.commit()
    return _out(loan)
