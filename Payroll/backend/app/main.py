"""Payroll & attendance FastAPI application, MJ Electricals."""
import logging
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.statutory import DEFAULT_TAX_BANDS
from app.models import PayrollHoliday, PayrollSetting
from app.routers import (
    admin_tools, attendance, attendance_reports, auth, dashboard, employees, leave, loans, payments, payroll, worker,
)
from app.services.common import ghana_fixed_holidays

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("mj_payroll")

_MIGRATIONS = [
    "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255)",
    "ALTER TABLE payroll_employees ALTER COLUMN pin_hash TYPE VARCHAR(255)",
    "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS termination_date DATE",
    "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS payment_method VARCHAR(16) DEFAULT 'BANK'",
    "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS ssnit_number VARCHAR(32)",
    "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS tin_number VARCHAR(32)",
    "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS ssnit_exempt BOOLEAN DEFAULT FALSE",
    "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS failed_pins INTEGER DEFAULT 0",
    "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS ssnit_employee NUMERIC(12, 2) DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS paye NUMERIC(12, 2) DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS ssnit_employer NUMERIC(12, 2) DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS days_half INTEGER DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS days_holiday INTEGER DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS days_expected NUMERIC(6, 1) DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS days_payable NUMERIC(6, 1) DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(8, 2) DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS overtime_pay NUMERIC(12, 2) DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS loan_deduction NUMERIC(12, 2) DEFAULT 0",
    "ALTER TABLE payroll_payslips ADD COLUMN IF NOT EXISTS taxable_income NUMERIC(12, 2) DEFAULT 0",
    "ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS workplace_code VARCHAR(64)",
    "ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS office_name VARCHAR(128) DEFAULT 'MJ Electricals Ghana Limited, Burase Road, Kumasi'",
    "ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS office_lat NUMERIC(9, 6) DEFAULT 6.692099",
    "ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS office_lng NUMERIC(9, 6) DEFAULT -1.622597",
    "ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER DEFAULT 120",
    "ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS min_checkout_minutes INTEGER DEFAULT 30",
    "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS registered_via VARCHAR(8) DEFAULT 'ADMIN'",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS source VARCHAR(8) DEFAULT 'MANUAL'",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS check_in_lat NUMERIC(9, 6)",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS check_in_lng NUMERIC(9, 6)",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS check_in_distance_m INTEGER",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS check_in_accuracy_m INTEGER",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS check_out_lat NUMERIC(9, 6)",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS check_out_lng NUMERIC(9, 6)",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS check_out_distance_m INTEGER",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS device_id VARCHAR(64)",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT FALSE",
    "ALTER TABLE payroll_attendance ADD COLUMN IF NOT EXISTS flag_reason VARCHAR(160)",
    "CREATE INDEX IF NOT EXISTS ix_payroll_audit_created ON payroll_audit_logs (created_at DESC)",
]


def _bootstrap() -> None:
    Base.metadata.create_all(bind=engine)  # only payroll_* tables are registered on this Base
    with engine.begin() as conn:
        for stmt in _MIGRATIONS:
            conn.execute(text(stmt))
    db = SessionLocal()
    try:
        auth.seed_admin(db)
        if db.get(PayrollSetting, 1) is None:
            db.add(PayrollSetting(
                id=1, company_name=settings.COMPANY_NAME, tax_bands=DEFAULT_TAX_BANDS,
                working_days_per_month=settings.WORKING_DAYS_PER_MONTH,
                work_start_time=settings.WORK_START_TIME,
            ))
        have = {h.date for h in db.execute(select(PayrollHoliday)).scalars()}
        for year in (date.today().year, date.today().year + 1):
            for d, name in ghana_fixed_holidays(year):
                if d not in have:
                    db.add(PayrollHoliday(date=d, name=name))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _bootstrap()
    if settings.SECRET_KEY in ("change-me", "") or len(settings.SECRET_KEY) < 24:
        logger.warning("SECRET_KEY is weak, set a long random value in Payroll/backend/.env")
    logger.info("Payroll API ready")
    yield


_prod = settings.ENVIRONMENT != "development"
app = FastAPI(
    title="MJ Electricals, Payroll & Attendance",
    lifespan=lifespan,
    docs_url=None if _prod else "/docs",
    redoc_url=None,
    openapi_url=None if _prod else "/openapi.json",
)

app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Workplace-Token"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


for r in (auth, employees, attendance, attendance_reports, payments, payroll, worker, dashboard, leave, loans, admin_tools):
    app.include_router(r.router)


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "mj-payroll"}
