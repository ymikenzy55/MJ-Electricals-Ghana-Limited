"""Employee CRUD endpoints (admin only)."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_secret
from app.models import PayrollComponent, PayrollEmployee, PayrollPayslip
from app.routers.auth import require_admin
from app.schemas import ComponentIn, ComponentOut, EmployeeCreate, EmployeeOut, EmployeeUpdate
from app.services.common import audit

router = APIRouter(prefix="/api/v1/employees", tags=["employees"], dependencies=[Depends(require_admin)])


def _out(emp: PayrollEmployee) -> EmployeeOut:
    out = EmployeeOut.model_validate(emp)
    out.has_pin = emp.pin_hash is not None
    return out


@router.get("", response_model=list[EmployeeOut])
def list_employees(
    q: str | None = Query(default=None, max_length=100),
    status: str | None = None,
    department: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(PayrollEmployee)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            PayrollEmployee.full_name.ilike(like),
            PayrollEmployee.employee_code.ilike(like),
            PayrollEmployee.position.ilike(like),
        ))
    if status:
        stmt = stmt.where(PayrollEmployee.status == status)
    if department:
        stmt = stmt.where(PayrollEmployee.department == department)
    return [_out(e) for e in db.execute(stmt.order_by(PayrollEmployee.full_name)).scalars().all()]


@router.get("/departments", response_model=list[str])
def departments(db: Session = Depends(get_db)):
    rows = db.execute(
        select(PayrollEmployee.department).where(PayrollEmployee.department.isnot(None)).distinct()
    ).scalars().all()
    return sorted(r for r in rows if r)


@router.post("/{employee_id}/approve", response_model=EmployeeOut)
def approve_employee(employee_id: int, db: Session = Depends(get_db)):
    """Approve a worker who signed up themselves so they can sign in and scan."""
    emp = db.get(PayrollEmployee, employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    if emp.status != "PENDING":
        raise HTTPException(409, "This account is not waiting for approval")
    emp.status = "ACTIVE"
    from datetime import date as _date
    emp.hire_date = emp.hire_date or _date.today()
    audit(db, "APPROVE", "employee", emp.id, f"Approved sign up of {emp.employee_code} {emp.full_name}")
    db.commit()
    db.refresh(emp)
    return _out(emp)


@router.post("/{employee_id}/reject", status_code=204)
def reject_employee(employee_id: int, db: Session = Depends(get_db)):
    """Decline (delete) a pending sign up."""
    emp = db.get(PayrollEmployee, employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    if emp.status != "PENDING":
        raise HTTPException(409, "Only pending sign ups can be declined")
    audit(db, "REJECT", "employee", emp.id, f"Declined sign up of {emp.full_name} ({emp.phone})")
    db.delete(emp)
    db.commit()


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(employee_id: int, db: Session = Depends(get_db)):
    emp = db.get(PayrollEmployee, employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    return _out(emp)


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    code = payload.employee_code.strip().upper()
    existing = db.execute(
        select(PayrollEmployee).where(PayrollEmployee.employee_code == code)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Employee code already exists")
    data = payload.model_dump()
    pin = data.pop("pin", None)
    data["employee_code"] = code
    emp = PayrollEmployee(**data)
    if pin:
        emp.pin_hash = hash_secret(pin)
    db.add(emp)
    db.flush()
    audit(db, "CREATE", "employee", emp.id, f"Created employee {emp.employee_code}, {emp.full_name}")
    db.commit()
    db.refresh(emp)
    return _out(emp)


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(employee_id: int, payload: EmployeeUpdate, db: Session = Depends(get_db)):
    emp = db.get(PayrollEmployee, employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    data = payload.model_dump(exclude_unset=True)
    if "employee_code" in data:
        data["employee_code"] = data["employee_code"].strip().upper()
        clash = db.execute(
            select(PayrollEmployee).where(
                PayrollEmployee.employee_code == data["employee_code"],
                PayrollEmployee.id != employee_id,
            )
        ).scalar_one_or_none()
        if clash:
            raise HTTPException(409, "Employee code already exists")
    changed = []
    if "pin" in data:
        pin = data.pop("pin")
        emp.pin_hash = hash_secret(pin) if pin else None
        emp.failed_pins = 0
        emp.pin_locked_until = None
        changed.append("pin")
    for k, v in data.items():
        if getattr(emp, k) != v:
            changed.append(k)
        setattr(emp, k, v)
    if data.get("status") == "TERMINATED" and not emp.termination_date:
        from datetime import date
        emp.termination_date = date.today()
    audit(db, "UPDATE", "employee", emp.id, f"Updated {emp.employee_code}: {', '.join(changed) or 'no changes'}")
    db.commit()
    db.refresh(emp)
    return _out(emp)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    """Hard delete is only allowed while the employee has no payroll history;
    otherwise terminate them so statutory records stay intact."""
    emp = db.get(PayrollEmployee, employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    slips = db.scalar(
        select(func.count()).select_from(PayrollPayslip).where(PayrollPayslip.employee_id == employee_id)
    ) or 0
    if slips:
        raise HTTPException(
            409,
            "This employee has payslips on record and cannot be deleted. "
            "Set their status to Terminated instead.",
        )
    audit(db, "DELETE", "employee", emp.id, f"Deleted employee {emp.employee_code}, {emp.full_name}")
    db.delete(emp)
    db.commit()


# ------------------- Recurring allowances / deductions -------------------

@router.get("/{employee_id}/components", response_model=list[ComponentOut])
def list_components(employee_id: int, db: Session = Depends(get_db)):
    return db.execute(
        select(PayrollComponent).where(PayrollComponent.employee_id == employee_id)
        .order_by(PayrollComponent.kind, PayrollComponent.name)
    ).scalars().all()


@router.post("/{employee_id}/components", response_model=ComponentOut, status_code=201)
def add_component(employee_id: int, payload: ComponentIn, db: Session = Depends(get_db)):
    emp = db.get(PayrollEmployee, employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    comp = PayrollComponent(employee_id=employee_id, **payload.model_dump())
    db.add(comp)
    db.flush()
    audit(db, "CREATE", "component", comp.id, f"{comp.kind} '{comp.name}' ₵{comp.amount} for {emp.employee_code}")
    db.commit()
    db.refresh(comp)
    return comp


@router.delete("/{employee_id}/components/{component_id}", status_code=204)
def delete_component(employee_id: int, component_id: int, db: Session = Depends(get_db)):
    comp = db.get(PayrollComponent, component_id)
    if not comp or comp.employee_id != employee_id:
        raise HTTPException(404, "Component not found")
    audit(db, "DELETE", "component", comp.id, f"Removed {comp.kind} '{comp.name}'")
    db.delete(comp)
    db.commit()
