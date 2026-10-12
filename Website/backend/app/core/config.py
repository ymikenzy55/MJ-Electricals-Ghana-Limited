"""Website backend configuration.

Shares the same PostgreSQL database as the POS backend so that products
published from the POS are immediately visible on the website, and orders
placed on the website are visible to POS administrators.
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
    # Shared secret the POS proxy sends in X-Admin-Key. Falls back to
    # SECRET_KEY only for old installs, set ADMIN_API_KEY explicitly.
    ADMIN_API_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: list[str] = [
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    FRONTEND_URL: str = "http://localhost:3001"
    COMPANY_NAME: str = "MJ Electricals Ghana Limited"
    COMPANY_PHONE: str = ""
    COMPANY_EMAIL: str = ""
    COMPANY_ADDRESS: str = ""

    # Outgoing e-mail (order confirmations, password reset, contact form).
    # Leave SMTP_HOST empty to disable sending (messages are logged instead).
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_TLS: bool = True

    # Public catalog cache lifetimes (seconds).
    CACHE_CATALOG_TTL: int = 30
    CACHE_STATIC_TTL: int = 120

    # How many "similar products" to suggest on a product page / in the cart.
    SIMILAR_PRODUCTS_LIMIT: int = 8

    MAX_LOGIN_ATTEMPTS: int = 6
    LOGIN_LOCKOUT_MINUTES: int = 15

    @property
    def admin_key(self) -> str:
        return self.ADMIN_API_KEY or self.SECRET_KEY


settings = Settings()
