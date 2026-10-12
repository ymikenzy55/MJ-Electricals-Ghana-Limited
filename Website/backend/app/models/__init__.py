"""Website models.

The website has its own tables for:
  - website_users: registered customers who create accounts on the website
  - website_orders: orders placed on the website
  - website_order_items: line items in each order
  - website_settings: site-wide configuration managed from the POS

It reads the POS `products` and `product_variants` tables directly so that
products published from the POS appear on the website immediately.
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WebsiteUser(Base):
    """A customer who registers an account on the website."""
    __tablename__ = "website_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reset_token_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    reset_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Bumped on password change/reset so previously issued tokens stop working.
    pwd_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    orders: Mapped[list["WebsiteOrder"]] = relationship(back_populates="user")


class WebsiteOrder(Base):
    """An order placed on the website (by a registered user or a guest)."""
    __tablename__ = "website_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)

    # Customer info, user_id is null for guest orders
    user_id: Mapped[int | None] = mapped_column(ForeignKey("website_users.id"))
    guest_name: Mapped[str | None] = mapped_column(String(128))
    guest_email: Mapped[str | None] = mapped_column(String(255), index=True)
    guest_phone: Mapped[str | None] = mapped_column(String(32))
    guest_address: Mapped[str | None] = mapped_column(Text)

    # Fulfilment
    status: Mapped[str] = mapped_column(String(32), default="PENDING", nullable=False, index=True)
    # PENDING / CONFIRMED / PROCESSING / SHIPPED / DELIVERED / CANCELLED
    fulfilment_type: Mapped[str] = mapped_column(String(16), default="DELIVERY", nullable=False)
    # DELIVERY / PICKUP
    branch_id: Mapped[int | None] = mapped_column(Integer, index=True)
    # For pickup orders, which POS branch to pick up from

    # Totals
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False, server_default="0")
    coupon_code: Mapped[str | None] = mapped_column(String(32))
    shipping_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # Stock reserved from POS branch inventory when the order was placed:
    # [{"branch_id": 1, "variant_id": 5, "qty": "2"}], restored on cancel.
    stock_deducted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    allocations: Mapped[list | None] = mapped_column(JSON)
    cancel_reason: Mapped[str | None] = mapped_column(String(255))

    # Payment
    payment_method: Mapped[str] = mapped_column(String(32), default="MOBILE_MONEY", nullable=False)
    payment_status: Mapped[str] = mapped_column(String(32), default="UNPAID", nullable=False)
    # UNPAID / PAID / REFUNDED
    payment_reference: Mapped[str | None] = mapped_column(String(255))

    # Admin
    notes: Mapped[str | None] = mapped_column(Text)
    admin_notes: Mapped[str | None] = mapped_column(Text)
    handled_by: Mapped[int | None] = mapped_column(Integer)
    # POS user id of the admin who last changed the status

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[WebsiteUser | None] = relationship(back_populates="orders")
    items: Mapped[list["WebsiteOrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )


class WebsiteOrderItem(Base):
    """A line item in a website order. References the POS variant by ID."""
    __tablename__ = "website_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("website_orders.id"), nullable=False, index=True)
    variant_id: Mapped[int] = mapped_column(Integer, nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    variant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    option_label: Mapped[str | None] = mapped_column(String(100))
    image_url: Mapped[str | None] = mapped_column(String(512))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    order: Mapped[WebsiteOrder] = relationship(back_populates="items")


class WebsiteSettings(Base):
    """Site-wide settings managed from the POS admin panel."""
    __tablename__ = "website_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    site_name: Mapped[str] = mapped_column(String(128), default="MJ Electricals Ghana Limited")
    site_tagline: Mapped[str] = mapped_column(String(255), default="Quality Electrical Products")
    hero_title: Mapped[str] = mapped_column(String(255), default="Welcome to MJ Electricals")
    hero_subtitle: Mapped[str] = mapped_column(Text, default="Your trusted electrical supplier in Ghana")
    hero_eyebrow: Mapped[str | None] = mapped_column(String(255), default="MJ Electricals Ghana Limited")
    hero_cta_label: Mapped[str | None] = mapped_column(String(64), default="Shop Products")
    hero_image: Mapped[str | None] = mapped_column(Text)
    contact_phone: Mapped[str] = mapped_column(String(32), default="")
    contact_email: Mapped[str] = mapped_column(String(128), default="")
    contact_address: Mapped[str] = mapped_column(Text, default="")
    social_facebook: Mapped[str | None] = mapped_column(String(255))
    social_instagram: Mapped[str | None] = mapped_column(String(255))
    social_twitter: Mapped[str | None] = mapped_column(String(255))
    default_shipping_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("20.00"))
    free_shipping_threshold: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    is_maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    announcement: Mapped[str | None] = mapped_column(Text)


class WebsiteCoupon(Base):
    """Discount code applied to the merchandise subtotal at checkout."""
    __tablename__ = "website_coupons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(8), nullable=False)  # PERCENT / FIXED
    value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    min_order: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    max_uses: Mapped[int | None] = mapped_column(Integer)
    used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WebsiteReview(Base):
    """A verified buyer's rating of a product."""
    __tablename__ = "website_reviews"
    __table_args__ = (UniqueConstraint("product_id", "user_id", name="uq_review_product_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("website_users.id"), nullable=False)
    author_name: Mapped[str] = mapped_column(String(128), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(120))
    body: Mapped[str | None] = mapped_column(Text)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WebsiteMessage(Base):
    """A message sent through the Contact Us form."""
    __tablename__ = "website_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    subject: Mapped[str | None] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_handled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
