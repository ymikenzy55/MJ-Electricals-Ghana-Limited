"""Pydantic schemas for the payroll API."""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ------------------------------- Auth ---------------------------------

class LoginRequest(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=200)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ----------------------------- Employees -------------------------------

SalaryType = Literal["MONTHLY", "DAILY"]
EmployeeStatus = Literal["PENDING", "ACTIVE", "SUSPENDED", "TERMINATED"]
PaymentMethod = Literal["BANK", "MOMO", "CASH"]


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=1, max_length=20)
    full_name: str = Field(min_length=2, max_length=128)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = None
    department: str | None = Field(default=None, max_length=64)
    position: str | None = Field(default=None, max_length=64)
    branch_id: int | None = None
    hire_date: date | None = None
    termination_date: date | None = None
    salary_type: SalaryType = "MONTHLY"
    base_salary: Decimal = Field(default=Decimal("0"), ge=0)
    payment_method: PaymentMethod = "BANK"
    bank_name: str | None = Field(default=None, max_length=64)
    bank_account: str | None = Field(default=None, max_length=64)
    ssnit_number: str | None = Field(default=None, max_length=32)
    tin_number: str | None = Field(default=None, max_length=32)
    ssnit_exempt: bool = False
    pin: str | None = Field(default=None, min_length=4, max_length=12, pattern=r"^\d+$")


class EmployeeUpdate(BaseModel):
    employee_code: str | None = Field(default=None, max_length=20)
    full_name: str | None = Field(default=None, min_length=2, max_length=128)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = None
    department: str | None = Field(default=None, max_length=64)
    position: str | None = Field(default=None, max_length=64)
    branch_id: int | None = None
    hire_date: date | None = None
    termination_date: date | None = None
    status: EmployeeStatus | None = None
    salary_type: SalaryType | None = None
    base_salary: Decimal | None = Field(default=None, ge=0)
    payment_method: PaymentMethod | None = None
    bank_name: str | None = Field(default=None, max_length=64)
    bank_account: str | None = Field(default=None, max_length=64)
    ssnit_number: str | None = Field(default=None, max_length=32)
    tin_number: str | None = Field(default=None, max_length=32)
    ssnit_exempt: bool | None = None
    pin: str | None = Field(default=None, min_length=4, max_length=12, pattern=r"^\d+$")


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_code: str
    full_name: str
    email: str | None
    phone: str | None
    address: str | None
    department: str | None
    position: str | None
    branch_id: int | None
    hire_date: date | None
    termination_date: date | None = None
    status: str
    salary_type: str
    base_salary: Decimal
    payment_method: str = "BANK"
    bank_name: str | None
    bank_account: str | None
    ssnit_number: str | None = None
    tin_number: str | None = None
    ssnit_exempt: bool = False
    has_pin: bool = False
    created_at: datetime


class ComponentIn(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    kind: Literal["ALLOWANCE", "DEDUCTION"]
    amount: Decimal = Field(gt=0)
    taxable: bool = True
    start_date: date | None = None
    end_date: date | None = None


class ComponentOut(ComponentIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    is_active: bool


# ------------------------------ Workers --------------------------------

class WorkerLoginRequest(BaseModel):
    # employee code, phone number or email
    employee_code: str = Field(max_length=120)
    # password (or the older numeric PIN)
    pin: str = Field(min_length=4, max_length=128)


class WorkerProfile(BaseModel):
    id: int
    employee_code: str
    full_name: str
    department: str | None
    position: str | None


class WorkerTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    employee: WorkerProfile


class ChangePinRequest(BaseModel):
    current_pin: str = Field(max_length=128)
    new_pin: str = Field(min_length=6, max_length=128)


class WorkerMonthOut(BaseModel):
    """A worker's own attendance for a month: summary + day-by-day records."""
    month: str
    present: int = 0
    late: int = 0
    absent: int = 0
    leave: int = 0
    half_day: int = 0
    records: list["AttendanceOut"] = []


# ----------------------------- Attendance ------------------------------

AttendanceStatus = Literal["PRESENT", "LATE", "ABSENT", "LEAVE", "HALF_DAY"]


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    date: date
    check_in: datetime | None
    check_out: datetime | None
    status: str
    notes: str | None
    employee_name: str | None = None
    employee_code: str | None = None


class KioskPunch(BaseModel):
    employee_code: str = Field(max_length=20)
    pin: str | None = Field(default=None, max_length=12)


class ManualAttendance(BaseModel):
    employee_id: int
    date: date
    status: AttendanceStatus
    check_in: datetime | None = None
    check_out: datetime | None = None
    notes: str | None = Field(default=None, max_length=500)


class AttendanceSummary(BaseModel):
    employee_id: int
    present: int = 0
    late: int = 0
    absent: int = 0
    leave: int = 0
    half_day: int = 0


class AttendanceReportRow(BaseModel):
    employee_id: int
    employee_code: str
    employee_name: str
    department: str | None
    present: int = 0
    late: int = 0
    absent: int = 0
    leave: int = 0
    half_day: int = 0
    hours_worked: Decimal = Decimal("0")
    overtime_hours: Decimal = Decimal("0")


# ------------------------------ Payroll --------------------------------

class PayrollRunCreate(BaseModel):
    label: str = Field(min_length=2, max_length=64)
    period_start: date
    period_end: date


class PayrollRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    period_start: date
    period_end: date
    status: str
    created_at: datetime
    approved_at: datetime | None
    paid_at: datetime | None
    payslips_count: int = 0
    total_gross: Decimal = Decimal("0")
    total_net: Decimal = Decimal("0")
    total_paye: Decimal = Decimal("0")
    total_ssnit_employee: Decimal = Decimal("0")
    total_ssnit_employer: Decimal = Decimal("0")


class PayslipItemIn(BaseModel):
    kind: Literal["ALLOWANCE", "BONUS", "DEDUCTION"]
    name: str = Field(min_length=2, max_length=96)
    amount: Decimal = Field(gt=0)
    taxable: bool = True


class PayslipItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    name: str
    amount: Decimal
    taxable: bool
    source: str


class PayslipUpdate(BaseModel):
    notes: str | None = Field(default=None, max_length=500)


class PayslipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    run_id: int
    employee_id: int
    days_present: int
    days_late: int
    days_absent: int
    days_leave: int
    days_half: int = 0
    days_holiday: int = 0
    days_expected: Decimal = Decimal("0")
    days_payable: Decimal = Decimal("0")
    overtime_hours: Decimal = Decimal("0")
    overtime_pay: Decimal = Decimal("0")
    basic_pay: Decimal
    allowances: Decimal
    deductions: Decimal
    loan_deduction: Decimal = Decimal("0")
    ssnit_employee: Decimal = Decimal("0")
    paye: Decimal = Decimal("0")
    ssnit_employer: Decimal = Decimal("0")
    taxable_income: Decimal = Decimal("0")
    gross_pay: Decimal
    net_pay: Decimal
    notes: str | None
    created_at: datetime
    employee_name: str | None = None
    employee_code: str | None = None
    department: str | None = None
    position: str | None = None
    ssnit_number: str | None = None
    tin_number: str | None = None
    payment_method: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    run_label: str | None = None
    run_status: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    items: list[PayslipItemOut] = []
    company_name: str | None = None
    company_address: str | None = None
    company_tin: str | None = None


# ------------------------------ Leave ----------------------------------

LeaveType = Literal["ANNUAL", "SICK", "MATERNITY", "PATERNITY", "COMPASSIONATE", "STUDY", "UNPAID"]


class LeaveCreate(BaseModel):
    employee_id: int | None = None  # admin only; workers always use themselves
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: str | None = Field(default=None, max_length=500)


class LeaveDecision(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class LeaveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    leave_type: str
    start_date: date
    end_date: date
    days: int
    reason: str | None
    status: str
    decided_by: str | None
    decided_at: datetime | None
    decision_note: str | None
    created_at: datetime
    employee_name: str | None = None
    employee_code: str | None = None


class LeaveBalance(BaseModel):
    employee_id: int
    employee_name: str | None = None
    employee_code: str | None = None
    year: int
    entitlement: int
    used: int
    pending: int
    remaining: int


# ------------------------------ Loans ----------------------------------

class LoanCreate(BaseModel):
    employee_id: int
    principal: Decimal = Field(gt=0)
    installment: Decimal = Field(gt=0)
    reason: str | None = Field(default=None, max_length=255)
    issued_date: date | None = None


class LoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    principal: Decimal
    installment: Decimal
    balance: Decimal
    reason: str | None
    issued_date: date
    status: str
    created_at: datetime
    employee_name: str | None = None
    employee_code: str | None = None


# ----------------------------- Holidays --------------------------------

class HolidayIn(BaseModel):
    date: date
    name: str = Field(min_length=2, max_length=96)


class HolidayOut(HolidayIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


# ----------------------------- Settings --------------------------------

class TaxBand(BaseModel):
    width: float | None = Field(default=None, gt=0)
    rate: float = Field(ge=0, le=1)


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_name: str
    company_address: str | None
    company_phone: str | None
    company_tin: str | None
    company_ssnit_no: str | None
    ssnit_enabled: bool
    ssnit_employee_rate: Decimal
    ssnit_employer_rate: Decimal
    paye_enabled: bool
    tax_bands: list[TaxBand]
    working_days_per_month: int
    working_days_of_week: str
    work_start_time: str
    late_grace_minutes: int
    standard_hours_per_day: Decimal
    overtime_enabled: bool
    overtime_multiplier: Decimal
    late_deduction_enabled: bool
    late_deduction_amount: Decimal
    annual_leave_days: int
    kiosk_require_pin: bool
    require_workplace_qr: bool
    office_name: str = ""
    office_lat: Decimal = Decimal("6.692099")
    office_lng: Decimal = Decimal("-1.622597")
    geofence_radius_m: int = 120
    min_checkout_minutes: int = 30


class SettingsUpdate(BaseModel):
    company_name: str | None = Field(default=None, max_length=128)
    company_address: str | None = None
    company_phone: str | None = Field(default=None, max_length=32)
    company_tin: str | None = Field(default=None, max_length=32)
    company_ssnit_no: str | None = Field(default=None, max_length=32)
    ssnit_enabled: bool | None = None
    ssnit_employee_rate: Decimal | None = Field(default=None, ge=0, le=1)
    ssnit_employer_rate: Decimal | None = Field(default=None, ge=0, le=1)
    paye_enabled: bool | None = None
    tax_bands: list[TaxBand] | None = None
    working_days_per_month: int | None = Field(default=None, ge=1, le=31)
    working_days_of_week: str | None = Field(default=None, pattern=r"^[0-6](,[0-6])*$")
    work_start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    late_grace_minutes: int | None = Field(default=None, ge=0, le=240)
    standard_hours_per_day: Decimal | None = Field(default=None, gt=0, le=24)
    overtime_enabled: bool | None = None
    overtime_multiplier: Decimal | None = Field(default=None, ge=1, le=5)
    late_deduction_enabled: bool | None = None
    late_deduction_amount: Decimal | None = Field(default=None, ge=0)
    annual_leave_days: int | None = Field(default=None, ge=0, le=365)
    kiosk_require_pin: bool | None = None
    require_workplace_qr: bool | None = None
    office_name: str | None = Field(default=None, max_length=128)
    office_lat: Decimal | None = Field(default=None, ge=-90, le=90)
    office_lng: Decimal | None = Field(default=None, ge=-180, le=180)
    geofence_radius_m: int | None = Field(default=None, ge=20, le=5000)
    min_checkout_minutes: int | None = Field(default=None, ge=0, le=600)


# ----------------------------- Dashboard --------------------------------

class DashboardStats(BaseModel):
    total_employees: int
    active_employees: int
    present_today: int
    late_today: int
    absent_today: int
    on_leave_today: int = 0
    pending_runs: int
    pending_leave: int = 0
    active_loans: int = 0
    last_run_total: Decimal = Decimal("0")
    payroll_ytd: Decimal = Decimal("0")
    departments: int


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    entity_type: str
    entity_id: int | None
    actor: str
    details: str | None
    created_at: datetime


class WorkerPayslipOut(PayslipOut):
    pass
