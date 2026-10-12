"""Website FastAPI application."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine
from app.routers import admin, auth, catalog, checkout, engagement

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("mj_website")

_WEBSITE_TABLES = [
    "website_users", "website_orders", "website_order_items", "website_settings",
    "website_coupons", "website_reviews", "website_messages",
]

_MIGRATIONS = [
    "ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS hero_eyebrow VARCHAR(255)",
    "ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS hero_cta_label VARCHAR(64)",
    "ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS hero_image TEXT",
    "ALTER TABLE website_settings ADD COLUMN IF NOT EXISTS free_shipping_threshold NUMERIC(12, 2)",
    "ALTER TABLE website_order_items ADD COLUMN IF NOT EXISTS option_label VARCHAR(100)",
    "ALTER TABLE website_order_items ADD COLUMN IF NOT EXISTS image_url VARCHAR(512)",
    "ALTER TABLE website_users ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(64)",
    "ALTER TABLE website_users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ",
    "ALTER TABLE website_users ADD COLUMN IF NOT EXISTS pwd_version INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0",
    "ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(32)",
    "ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS allocations JSON",
    "ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(255)",
    "CREATE INDEX IF NOT EXISTS ix_website_orders_user ON website_orders (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_website_orders_created ON website_orders (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_website_orders_payment ON website_orders (payment_status)",
    "CREATE INDEX IF NOT EXISTS ix_website_order_items_variant ON website_order_items (variant_id)",
    "CREATE INDEX IF NOT EXISTS ix_website_reviews_product ON website_reviews (product_id)",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create website-owned tables only. The POS tables (products, branches,
    # branch_inventory ...) belong to the POS backend and are never touched.
    Base.metadata.create_all(bind=engine, tables=[Base.metadata.tables[t] for t in _WEBSITE_TABLES])
    with engine.begin() as conn:
        for stmt in _MIGRATIONS:
            conn.execute(text(stmt))
    if settings.SECRET_KEY in ("", "change-me") or len(settings.SECRET_KEY) < 24:
        logger.warning("SECRET_KEY is weak, set a long random value in Website/backend/.env")
    if not settings.ADMIN_API_KEY:
        logger.warning("ADMIN_API_KEY is not set; falling back to SECRET_KEY for the POS admin key")
    logger.info("Website backend started")
    yield
    logger.info("Website backend shutting down")


_prod = settings.ENVIRONMENT != "development"
app = FastAPI(
    title="MJ Electricals Website API",
    description="Public catalog and checkout API for the MJ Electricals Ghana website. Managed by the POS.",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None if _prod else "/docs",
    redoc_url=None,
    openapi_url=None if _prod else "/openapi.json",
)

limiter = Limiter(key_func=get_remote_address, default_limits=["300 per minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,  # bearer tokens only, no cookies to protect
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path.startswith(("/api/v1/auth", "/api/v1/checkout", "/api/v1/admin")):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})


for r in (catalog, auth, checkout, engagement, admin):
    app.include_router(r.router)


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "mj-website"}
