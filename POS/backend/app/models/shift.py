"""Cashier shift / cash drawer sessions.

A shift records the cash float a cashier starts with, the sales taken during
the session, and the physical cash counted at close. The variance between
expected and counted cash is the core control for cash handling.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Shift(Base):
    __tablename__ = "shifts"
    __table_args__ = (
        CheckConstraint("opening_float >= 0", name="ck_shift_float_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), default="OPEN", nullable=False, index=True)
    # OPEN / CLOSED
    opening_float: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    counted_cash: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    expected_cash: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    variance: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(String(500))

    user = relationship("User", lazy="joined")
