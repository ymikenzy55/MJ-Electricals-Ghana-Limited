from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BranchInventory(Base):
    __tablename__ = "branch_inventory"
    __table_args__ = (
        UniqueConstraint("branch_id", "variant_id", name="uq_branch_variant"),
        CheckConstraint("quantity >= 0", name="ck_inventory_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    variant = relationship("ProductVariant", lazy="joined")


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"), nullable=False, index=True)
    movement_type: Mapped[str] = mapped_column(String(24), nullable=False)
    # OPENING / PURCHASE / SALE / RETURN / TRANSFER_OUT / TRANSFER_IN / ADJUSTMENT / DAMAGED / CORRECTION
    quantity_change: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    quantity_after: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(32))
    reference_id: Mapped[str | None] = mapped_column(String(64))
    reason: Mapped[str | None] = mapped_column(String(255))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class StockTransfer(Base):
    __tablename__ = "stock_transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transfer_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    from_branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    to_branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="REQUESTED", nullable=False)
    # REQUESTED / APPROVED / DISPATCHED / RECEIVED / CANCELLED
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["StockTransferItem"]] = relationship(lazy="selectin")


class StockTransferItem(Base):
    __tablename__ = "stock_transfer_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transfer_id: Mapped[int] = mapped_column(
        ForeignKey("stock_transfers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
