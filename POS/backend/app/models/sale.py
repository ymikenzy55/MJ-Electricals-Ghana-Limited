import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.types import json_type


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        CheckConstraint("total >= 0", name="ck_sale_total_non_negative"),
        CheckConstraint("discount_amount >= 0", name="ck_sale_discount_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, unique=True, nullable=False, index=True
    )
    receipt_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    cashier_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), index=True)
    device_id: Mapped[int | None] = mapped_column(ForeignKey("pos_devices.id"))
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="COMPLETED", nullable=False)
    # COMPLETED / VOIDED / PARTIALLY_RETURNED / RETURNED
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(6, 4), default=0, nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(24), default="CASH", nullable=False)
    is_offline: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sold_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["SaleItem"]] = relationship(back_populates="sale", lazy="selectin")
    payments: Mapped[list["SalePayment"]] = relationship(back_populates="sale", lazy="selectin")
    customer = relationship("Customer", lazy="joined")
    cashier = relationship("User", lazy="joined")
    branch = relationship("Branch", lazy="joined")


class SalePayment(Base):
    """One tender line on a sale. Multiple rows = split payment."""

    __tablename__ = "sale_payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_sale_payment_amount_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False, index=True)
    method: Mapped[str] = mapped_column(String(24), nullable=False)
    # CASH / MOBILE_MONEY / CARD / BANK_TRANSFER
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(64))

    sale: Mapped[Sale] = relationship(back_populates="payments")


class SaleItem(Base):
    __tablename__ = "sale_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_sale_item_qty_positive"),
        CheckConstraint("unit_price >= 0", name="ck_sale_item_price_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False, index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"), nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    variant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    line_discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    returned_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0, nullable=False)

    sale: Mapped[Sale] = relationship(back_populates="items")


class HeldSale(Base):
    __tablename__ = "held_sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    cashier_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    label: Mapped[str | None] = mapped_column(String(128))
    cart_data: Mapped[dict] = mapped_column(json_type(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Return(Base):
    __tablename__ = "returns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    return_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False, index=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    processed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    total_refund: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["ReturnItem"]] = relationship(lazy="selectin")


class ReturnItem(Base):
    __tablename__ = "return_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_return_item_qty_positive"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    return_id: Mapped[int] = mapped_column(ForeignKey("returns.id"), nullable=False, index=True)
    sale_item_id: Mapped[int] = mapped_column(ForeignKey("sale_items.id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    restock: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
