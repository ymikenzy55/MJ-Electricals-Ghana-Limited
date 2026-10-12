"""Payroll & attendance models.

All tables use the `payroll_` prefix so they live alongside, but never
collide with, POS-owned tables in the shared database.
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PayrollAdmin(Base):
    """Payroll administrator account (password stored as a salted hash)."""
    __tablename__ = "payroll_admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PayrollSetting(Base):
    """Single-row (id=1) statutory and policy configuration."""
    __tablename__ = "payroll_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    company_name: Mapped[str] = mapped_column(String(128), default="MJ Electricals Ghana Limited")
    company_address: Mapped[str | None] = mapped_column(Text)
    company_phone: Mapped[str | None] = mapped_column(String(32))
    company_tin: Mapped[str | None] = mapped_column(String(32))
    company_ssnit_no: Mapped[str | None] = mapped_column(String(32))

    ssnit_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    ssnit_employee_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), default=Decimal("0.055"))
    ssnit_employer_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), default=Decimal("0.13"))
    paye_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    tax_bands: Mapped[list | None] = mapped_column(JSON)

    working_days_per_month: Mapped[int] = mapped_column(Integer, default=26)
    working_days_of_week: Mapped[str] = mapped_column(String(16), default="0,1,2,3,4,5")  # Mon=0
    work_start_time: Mapped[str] = mapped_column(String(5), default="08:00")
    late_grace_minutes: Mapped[int] = mapped_column(Integer, default=0)
    standard_hours_per_day: Mapped[Decimal] = mapped_column(Numeric(4, 1), default=Decimal("8"))

    overtime_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    overtime_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=Decimal("1.5"))
    late_deduction_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    late_deduction_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))

    annual_leave_days: Mapped[int] = mapped_column(Integer, default=15)
    kiosk_require_pin: Mapped[bool] = mapped_column(Boolean, default=True)
    require_workplace_qr: Mapped[bool] = mapped_column(Boolean, default=False)

    # Attendance by QR scan: one printed QR on the office wall, checked against
    # the office location. The code can be rotated if the printout leaks.
    workplace_code: Mapped[str | None] = mapped_column(String(64))
    office_name: Mapped[str] = mapped_column(String(128), default="MJ Electricals Ghana Limited, Burase Road, Kumasi")
    office_lat: Mapped[Decimal] = mapped_column(Numeric(9, 6), default=Decimal("6.692099"))
    office_lng: Mapped[Decimal] = mapped_column(Numeric(9, 6), default=Decimal("-1.622597"))
    geofence_radius_m: Mapped[int] = mapped_column(Integer, default=120)
    min_checkout_minutes: Mapped[int] = mapped_column(Integer, default=30)


class PayrollEmployee(Base):
    __tablename__ = "payroll_employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(128))
    phone: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(String(64))
    position: Mapped[str | None] = mapped_column(String(64))
    branch_id: Mapped[int | None] = mapped_column(Integer)  # POS branch id
    hire_date: Mapped[date | None] = mapped_column(Date)
    termination_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")  # PENDING / ACTIVE / SUSPENDED / TERMINATED
    registered_via: Mapped[str] = mapped_column(String(8), default="ADMIN")  # ADMIN / SELF
    salary_type: Mapped[str] = mapped_column(String(16), default="MONTHLY")  # MONTHLY / DAILY
    base_salary: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    payment_method: Mapped[str] = mapped_column(String(16), default="BANK")  # BANK / MOMO / CASH
    bank_name: Mapped[str | None] = mapped_column(String(64))
    bank_account: Mapped[str | None] = mapped_column(String(64))
    ssnit_number: Mapped[str | None] = mapped_column(String(32))
    tin_number: Mapped[str | None] = mapped_column(String(32))
    ssnit_exempt: Mapped[bool] = mapped_column(Boolean, default=False)
    # Worker-portal login PIN (salted hash). Set by admin; used with employee_code.
    pin_hash: Mapped[str | None] = mapped_column(String(255))
    failed_pins: Mapped[int] = mapped_column(Integer, default=0)
    pin_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    attendance: Mapped[list["PayrollAttendance"]] = relationship(back_populates="employee", cascade="all, delete-orphan")
    payslips: Mapped[list["PayrollPayslip"]] = relationship(back_populates="employee", cascade="all, delete-orphan")
    components: Mapped[list["PayrollComponent"]] = relationship(back_populates="employee", cascade="all, delete-orphan")


class PayrollComponent(Base):
    """Recurring allowance / deduction applied to every payroll run."""
    __tablename__ = "payroll_components"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("payroll_employees.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16))  # ALLOWANCE / DEDUCTION
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    taxable: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped[PayrollEmployee] = relationship(back_populates="components")


class PayrollAttendance(Base):
    __tablename__ = "payroll_attendance"
    __table_args__ = (UniqueConstraint("employee_id", "date", name="uq_attendance_emp_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("payroll_employees.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    check_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="PRESENT")  # PRESENT / LATE / ABSENT / LEAVE / HALF_DAY
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(8), default="MANUAL")  # QR / MANUAL / CSV
    check_in_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    check_in_lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    check_in_distance_m: Mapped[int | None] = mapped_column(Integer)
    check_in_accuracy_m: Mapped[int | None] = mapped_column(Integer)
    check_out_lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    check_out_lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    check_out_distance_m: Mapped[int | None] = mapped_column(Integer)
    device_id: Mapped[str | None] = mapped_column(String(64))
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped[PayrollEmployee] = relationship(back_populates="attendance")


class PayrollScanAttempt(Base):
    """Every scan the system received (accepted or refused), with the location the
    phone reported, so the administrator can review them."""
    __tablename__ = "payroll_scan_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("payroll_employees.id", ondelete="SET NULL"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # CHECK_IN / CHECK_OUT / REJECTED
    result: Mapped[str] = mapped_column(String(16))  # OK / TOO_FAR / BAD_CODE / NO_LOCATION / DUPLICATE / TOO_SOON
    lat: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    lng: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    accuracy_m: Mapped[int | None] = mapped_column(Integer)
    distance_m: Mapped[int | None] = mapped_column(Integer)
    device_id: Mapped[str | None] = mapped_column(String(64))
    ip: Mapped[str | None] = mapped_column(String(64))
    message: Mapped[str | None] = mapped_column(String(200))
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)


class PayrollPayment(Base):
    """Payment log: every amount paid to an employee (from a payroll run or a
    manual payment based on days attended). Entries are never edited."""
    __tablename__ = "payroll_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("payroll_employees.id", ondelete="CASCADE"), index=True)
    period: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM the payment covers
    days_attended: Mapped[Decimal | None] = mapped_column(Numeric(6, 1))
    days_total: Mapped[int | None] = mapped_column(Integer)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    method: Mapped[str] = mapped_column(String(8), default="CASH")  # CASH / MOMO / BANK
    reference: Mapped[str | None] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(12), default="MANUAL")  # MANUAL / PAYROLL_RUN
    run_id: Mapped[int | None] = mapped_column(Integer)
    paid_by: Mapped[str] = mapped_column(String(64), default="admin")
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    employee: Mapped[PayrollEmployee] = relationship()


class PayrollHoliday(Base):
    __tablename__ = "payroll_holidays"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(96))


class PayrollLeaveRequest(Base):
    __tablename__ = "payroll_leave_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("payroll_employees.id", ondelete="CASCADE"), index=True)
    leave_type: Mapped[str] = mapped_column(String(16))  # ANNUAL / SICK / MATERNITY / PATERNITY / COMPASSIONATE / STUDY / UNPAID
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    days: Mapped[int] = mapped_column(Integer, default=0)  # working days, holidays excluded
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="PENDING", index=True)  # PENDING / APPROVED / REJECTED / CANCELLED
    decided_by: Mapped[str | None] = mapped_column(String(64))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped[PayrollEmployee] = relationship()


class PayrollLoan(Base):
    """Salary advance / staff loan repaid in instalments through payroll."""
    __tablename__ = "payroll_loans"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("payroll_employees.id", ondelete="CASCADE"), index=True)
    principal: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    installment: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    reason: Mapped[str | None] = mapped_column(String(255))
    issued_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE", index=True)  # ACTIVE / CLEARED / CANCELLED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped[PayrollEmployee] = relationship()
    repayments: Mapped[list["PayrollLoanRepayment"]] = relationship(cascade="all, delete-orphan")


class PayrollLoanRepayment(Base):
    __tablename__ = "payroll_loan_repayments"

    id: Mapped[int] = mapped_column(primary_key=True)
    loan_id: Mapped[int] = mapped_column(ForeignKey("payroll_loans.id", ondelete="CASCADE"), index=True)
    payslip_id: Mapped[int | None] = mapped_column(ForeignKey("payroll_payslips.id", ondelete="SET NULL"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(64))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="DRAFT")  # DRAFT / APPROVED / PAID
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    payslips: Mapped[list["PayrollPayslip"]] = relationship(back_populates="run", cascade="all, delete-orphan")


class PayrollPayslip(Base):
    __tablename__ = "payroll_payslips"
    __table_args__ = (UniqueConstraint("run_id", "employee_id", name="uq_payslip_run_emp"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("payroll_runs.id", ondelete="CASCADE"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("payroll_employees.id", ondelete="CASCADE"), index=True)
    days_present: Mapped[int] = mapped_column(Integer, default=0)
    days_late: Mapped[int] = mapped_column(Integer, default=0)
    days_absent: Mapped[int] = mapped_column(Integer, default=0)
    days_leave: Mapped[int] = mapped_column(Integer, default=0)
    days_half: Mapped[int] = mapped_column(Integer, default=0)
    days_holiday: Mapped[int] = mapped_column(Integer, default=0)
    days_expected: Mapped[Decimal] = mapped_column(Numeric(6, 1), default=0)
    days_payable: Mapped[Decimal] = mapped_column(Numeric(6, 1), default=0)
    overtime_hours: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=0)
    overtime_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    basic_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    allowances: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    deductions: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    loan_deduction: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    ssnit_employee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    paye: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    ssnit_employer: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    taxable_income: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    gross_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    net_pay: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    run: Mapped[PayrollRun] = relationship(back_populates="payslips")
    employee: Mapped[PayrollEmployee] = relationship(back_populates="payslips")
    items: Mapped[list["PayrollPayslipItem"]] = relationship(
        back_populates="payslip", cascade="all, delete-orphan", lazy="selectin",
        order_by="PayrollPayslipItem.id",
    )


class PayrollPayslipItem(Base):
    """One earning or deduction line on a payslip."""
    __tablename__ = "payroll_payslip_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    payslip_id: Mapped[int] = mapped_column(ForeignKey("payroll_payslips.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # ALLOWANCE / BONUS / DEDUCTION / LOAN / LATE
    name: Mapped[str] = mapped_column(String(96))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    taxable: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(16), default="MANUAL")  # MANUAL / COMPONENT / LOAN / LATE
    ref_id: Mapped[int | None] = mapped_column(Integer)  # loan id / component id

    payslip: Mapped[PayrollPayslip] = relationship(back_populates="items")


class PayrollAuditLog(Base):
    __tablename__ = "payroll_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    actor: Mapped[str] = mapped_column(String(128))
    details: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
