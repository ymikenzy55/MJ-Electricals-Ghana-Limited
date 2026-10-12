import asyncio
import logging

from app.core import dns_cache

dns_cache.install()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.database import engine, IS_LOCAL, IS_SQLITE
from fastapi.middleware.gzip import GZipMiddleware

from app.routers import (
    admin, app_settings, auth, customers, expenses, imports, inventory, products, purchasing,
    reports, returns, sales, shifts, sync, system, transfers, website_admin,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mj_pos")

limiter = Limiter(key_func=get_remote_address, default_limits=["200 per minute"])

app = FastAPI(
    title="MJ Electricals POS API",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/docs/redoc" if settings.ENVIRONMENT == "development" else None,
    openapi_url="/openapi.json" if settings.ENVIRONMENT == "development" else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,  # bearer tokens only
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith(("/api/v1/auth", "/api/v1/settings", "/api/v1/sync")):
        response.headers["Cache-Control"] = "no-store"
    return response

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(customers.router)
app.include_router(sales.router)
app.include_router(shifts.router)
app.include_router(returns.router)
app.include_router(transfers.router)
app.include_router(purchasing.router)
app.include_router(reports.router)
app.include_router(imports.router)
app.include_router(website_admin.router)
app.include_router(expenses.router)
app.include_router(app_settings.router)
app.include_router(system.router)
if IS_LOCAL:
    app.include_router(sync.router)


# Background task that pings the database every 2 minutes to prevent the
# cloud database (Neon) from scaling its compute to zero after inactivity.
# A cold-start wake-up takes 2-5 seconds; keeping the connection warm avoids
# that delay on the first real request after an idle period.
async def _db_keepalive():
    from sqlalchemy import text

    while True:
        await asyncio.sleep(120)
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("DB keepalive OK")
        except Exception as exc:
            logger.warning("DB keepalive failed: %s", exc)


@app.on_event("startup")
async def _startup_keepalive():
    if IS_LOCAL and IS_SQLITE:
        # Offline-first mode: build/upgrade the local schema, seed the
        # minimum login data, and start the background sync loop.
        from app.core.local_init import ensure_seed, init_local_db
        from app.services.sync import sync_loop

        from app.services.backup import backup_loop

        init_local_db()
        ensure_seed()
        asyncio.create_task(sync_loop())
        asyncio.create_task(backup_loop())
        logger.info("Local mode active — SQLite at %s", settings.LOCAL_DATABASE_URL)
    else:
        asyncio.create_task(_db_keepalive())


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/config")
def public_config():
    """Non-sensitive settings the POS terminal needs (tax rate, company name)."""
    from app.core.cache import cached
    from app.services.app_settings import load_settings

    def _build() -> dict:
        s = load_settings()
        return {
            "company_name": s["company_name"],
            "company_tin": s["company_tin"],
            "company_address": s["company_address"],
            "company_phone": s["company_phone"],
            "company_email": s["company_email"],
            "receipt_footer": s["receipt_footer"],
            "tax_rate": s["tax_rate"],
            "tax_inclusive": s["tax_inclusive"],
            "return_window_days": s["return_window_days"],
            "currency": "GHS",
            "currency_symbol": "\u20b5",
        }

    # Saving settings clears this entry; the TTL only bounds cross-process staleness.
    return cached("public_config", 60, _build)
