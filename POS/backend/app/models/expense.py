"""Business expenses (petty cash, utilities, transport …) and app settings."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_expense_positive"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id"), index=True)
    category: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_via: Mapped[str] = mapped_column(String(16), default="CASH", nullable=False)  # CASH / MOMO / BANK
    reference: Mapped[str | None] = mapped_column(String(64))
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(12), default="ACTIVE", nullable=False)  # ACTIVE / VOIDED
    void_reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), index=True
    )


class AppSetting(Base):
    """Business-wide settings (company details, tax, receipt text).

    Stored in the database so every terminal — including offline ones — uses
    the same values once synced. ``key`` is the natural key; ``id`` exists so
    the sync engine can treat this like every other table.
    """
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    value: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
