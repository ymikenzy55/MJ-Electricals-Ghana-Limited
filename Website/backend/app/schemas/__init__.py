"""Pydantic schemas for the website API."""
import re
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

_PHONE_RE = re.compile(r"^[+\d][\d\s\-()]{5,30}$")
PaymentMethod = Literal["MOBILE_MONEY", "CASH_ON_DELIVERY", "BANK_TRANSFER"]


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


# ----------------------------- Public catalog -----------------------------

class ExtraImageOut(BaseModel):
    url: str
    label: str | None = None


class CatalogVariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    variant_name: str
    sku: str
    unit: str
    attributes: dict = {}
    selling_price: Decimal
    available_quantity: Decimal = Decimal("0")


class CatalogProductOut(BaseModel):
    """A product as seen by website visitors. Only published products are
    exposed here."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    image_url: str | None
    extra_images: list[ExtraImageOut] = []
    category: str | None
    brand: str | None = None
    variants: list[CatalogVariantOut] = []
    rating_avg: float | None = None
    rating_count: int = 0


# ----------------------------- Website users -----------------------------

class WebsiteUserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=128)
    email: EmailStr
    phone: str = Field(min_length=6, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    address: str | None = Field(default=None, max_length=500)

    @field_validator("full_name", "phone", "address")
    @classmethod
    def strip(cls, v):
        return _clean(v) if v is not None else v

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v):
        if not v or not _PHONE_RE.match(v):
            raise ValueError("Enter a valid phone number")
        return v


class WebsiteUserLogin(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=128)
    phone: str | None = Field(default=None, min_length=6, max_length=32)
    address: str | None = Field(default=None, max_length=500)

    @field_validator("phone")
    @classmethod
    def phone_ok(cls, v):
        if v is not None and not _PHONE_RE.match(v.strip()):
            raise ValueError("Enter a valid phone number")
        return v.strip() if v else v


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=128)
    password: str = Field(min_length=8, max_length=128)


class WebsiteUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    phone: str
    address: str | None
    is_active: bool
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: WebsiteUserOut


# ----------------------------- Cart / checkout -----------------------------

class CartItem(BaseModel):
    variant_id: int
    quantity: Decimal = Field(gt=0, le=1000)
    # Label of the sub-image/option the customer picked (e.g. a bulb's glow
    # colour). The image itself is looked up server-side, never trusted.
    option_label: str | None = Field(default=None, max_length=100)
    image_url: str | None = Field(default=None, max_length=512)  # ignored; kept for old clients


class CheckoutRequest(BaseModel):
    """Guest or registered-user checkout."""
    items: list[CartItem] = Field(min_length=1, max_length=60)
    guest_name: str | None = Field(default=None, max_length=128)
    guest_email: EmailStr | None = None
    guest_phone: str | None = Field(default=None, max_length=32)
    guest_address: str | None = Field(default=None, max_length=500)
    fulfilment_type: Literal["DELIVERY", "PICKUP"] = "DELIVERY"
    branch_id: int | None = None
    payment_method: PaymentMethod = "MOBILE_MONEY"
    coupon_code: str | None = Field(default=None, max_length=32)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("guest_phone")
    @classmethod
    def phone_ok(cls, v):
        if v is not None and not _PHONE_RE.match(v.strip()):
            raise ValueError("Enter a valid phone number")
        return v.strip() if v else v


class QuoteRequest(BaseModel):
    """Preview of totals (coupon + shipping) without creating an order."""
    subtotal: Decimal = Field(ge=0)
    fulfilment_type: Literal["DELIVERY", "PICKUP"] = "DELIVERY"
    coupon_code: str | None = Field(default=None, max_length=32)


class QuoteOut(BaseModel):
    subtotal: Decimal
    discount: Decimal
    shipping_fee: Decimal
    total: Decimal
    coupon_code: str | None = None
    coupon_message: str | None = None
    free_shipping_threshold: Decimal | None = None


class TrackRequest(BaseModel):
    order_number: str = Field(min_length=4, max_length=32)
    contact: str = Field(min_length=3, max_length=255)  # e-mail or phone used at checkout


# ----------------------------- Orders -----------------------------

class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    variant_id: int
    product_name: str
    variant_name: str
    sku: str
    option_label: str | None = None
    image_url: str | None = None
    unit_price: Decimal
    quantity: Decimal
    line_total: Decimal


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    user_id: int | None
    guest_name: str | None
    guest_email: str | None
    guest_phone: str | None
    guest_address: str | None
    status: str
    fulfilment_type: str
    branch_id: int | None
    subtotal: Decimal
    discount_amount: Decimal = Decimal("0")
    coupon_code: str | None = None
    shipping_fee: Decimal
    total: Decimal
    payment_method: str
    payment_status: str
    payment_reference: str | None = None
    notes: str | None
    admin_notes: str | None
    cancel_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemOut]


class PublicOrderOut(OrderOut):
    """Order as shown to the customer, no internal notes."""
    admin_notes: str | None = Field(default=None, exclude=True)


class OrderStatusUpdate(BaseModel):
    status: str | None = None  # PENDING / CONFIRMED / PROCESSING / SHIPPED / DELIVERED / CANCELLED
    admin_notes: str | None = Field(default=None, max_length=1000)
    payment_status: Literal["UNPAID", "PAID", "REFUNDED"] | None = None
    payment_reference: str | None = Field(default=None, max_length=255)
    cancel_reason: str | None = Field(default=None, max_length=255)


class OrderListOut(BaseModel):
    """Lighter order representation for list views."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str
    guest_name: str | None
    guest_email: str | None
    status: str
    total: Decimal
    payment_status: str
    created_at: datetime
    items_count: int


# ----------------------------- Reviews / contact -----------------------------

class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str | None = Field(default=None, max_length=120)
    body: str | None = Field(default=None, max_length=2000)


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    author_name: str
    rating: int
    title: str | None
    body: str | None
    created_at: datetime


class ReviewSummary(BaseModel):
    average: float | None
    count: int
    can_review: bool = False
    already_reviewed: bool = False
    reviews: list[ReviewOut] = []


class ContactCreate(BaseModel):
    name: str = Field(min_length=2, max_length=128)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    subject: str | None = Field(default=None, max_length=160)
    message: str = Field(min_length=5, max_length=4000)
    website: str | None = Field(default=None, max_length=200)  # honeypot, must stay empty


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str | None
    subject: str | None
    message: str
    is_handled: bool
    created_at: datetime


# ----------------------------- Coupons (admin) -----------------------------

class CouponCreate(BaseModel):
    code: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    description: str | None = Field(default=None, max_length=255)
    kind: Literal["PERCENT", "FIXED"]
    value: Decimal = Field(gt=0)
    min_order: Decimal = Field(default=Decimal("0"), ge=0)
    max_uses: int | None = Field(default=None, ge=1)
    expires_at: datetime | None = None


class CouponUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    max_uses: int | None = Field(default=None, ge=1)
    expires_at: datetime | None = None


class CouponOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    description: str | None
    kind: str
    value: Decimal
    min_order: Decimal
    max_uses: int | None
    used_count: int
    expires_at: datetime | None
    is_active: bool
    created_at: datetime


# ----------------------------- Settings -----------------------------

class _SettingsBase(BaseModel):
    site_name: str
    site_tagline: str
    hero_title: str
    hero_subtitle: str
    hero_eyebrow: str | None
    hero_cta_label: str | None
    hero_image: str | None
    contact_phone: str
    contact_email: str
    contact_address: str
    social_facebook: str | None
    social_instagram: str | None
    social_twitter: str | None
    default_shipping_fee: Decimal
    free_shipping_threshold: Decimal | None = None
    is_maintenance_mode: bool
    announcement: str | None


class WebsiteSettingsOut(_SettingsBase):
    model_config = ConfigDict(from_attributes=True)


class SiteSettingsPublic(_SettingsBase):
    """Settings safe to expose publicly (no admin key required)."""
    model_config = ConfigDict(from_attributes=True)


class WebsiteSettingsUpdate(BaseModel):
    site_name: str | None = Field(default=None, max_length=128)
    site_tagline: str | None = Field(default=None, max_length=255)
    hero_title: str | None = Field(default=None, max_length=255)
    hero_subtitle: str | None = None
    hero_eyebrow: str | None = Field(default=None, max_length=255)
    hero_cta_label: str | None = Field(default=None, max_length=64)
    hero_image: str | None = None
    contact_phone: str | None = Field(default=None, max_length=32)
    contact_email: str | None = Field(default=None, max_length=128)
    contact_address: str | None = None
    social_facebook: str | None = Field(default=None, max_length=255)
    social_instagram: str | None = Field(default=None, max_length=255)
    social_twitter: str | None = Field(default=None, max_length=255)
    default_shipping_fee: Decimal | None = Field(default=None, ge=0)
    free_shipping_threshold: Decimal | None = Field(default=None, ge=0)
    is_maintenance_mode: bool | None = None
    announcement: str | None = None


class BranchOut(BaseModel):
    """Public branch info (for pickup selection / Find a Branch page)."""
    id: int
    name: str
    code: str
    address: str | None
    phone: str | None


class PaginatedCatalogOut(BaseModel):
    items: list[CatalogProductOut]
    total: int
    page: int
    page_size: int


# ----------------------------- Dashboard -----------------------------

class DashboardStats(BaseModel):
    total_orders: int
    pending_orders: int
    total_revenue: Decimal
    total_customers: int
    total_products: int
    unread_messages: int = 0
    low_stock_products: int = 0
    revenue_last_30_days: Decimal = Decimal("0")
    orders_last_30_days: int = 0
    daily: list[dict] = []
    top_products: list[dict] = []
