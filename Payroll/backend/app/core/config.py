"""Payroll backend configuration.

Shares the same PostgreSQL database as the POS so that employee branch
assignments stay consistent. All payroll tables are prefixed `payroll_`
to keep them clearly separated from POS-owned tables.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str
    SECRET_KEY: str = "change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720
    ENVIRONMENT: str = "development"
    PAYROLL_ADMIN_USERNAME: str = "admin"
    # Only used to seed the admin account on first start; after that the
    # (hashed) password lives in the database and is changed from the app.
    PAYROLL_ADMIN_PASSWORD: str = "admin"
    POS_API_URL: str = "http://127.0.0.1:8000"
    WORK_START_TIME: str = "08:00"
    WORKING_DAYS_PER_MONTH: int = 26
    MAX_FAILED_LOGINS: int = 5
    LOCKOUT_MINUTES: int = 15
    CORS_ORIGINS: list[str] = [
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    COMPANY_NAME: str = "MJ Electricals Ghana Limited"


settings = Settings()
