"""Sync bookkeeping tables — local SQLite only.

These live in their own declarative base so they are never created on the
cloud Postgres schema. ``SyncBase.metadata.create_all`` is run against the
local engine during local-mode initialisation.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class SyncBase(DeclarativeBase):
    pass


class SyncOutbox(SyncBase):
    """One row per locally-changed entity waiting to be pushed to the cloud.

    Populated by mapper ``after_insert``/``after_update``/``after_delete``
    listeners on the business models. Rows are removed once the push succeeds.
    """

    __tablename__ = "sync_outbox"
    __table_args__ = (UniqueConstraint("table_name", "row_pk", name="uq_outbox_table_pk"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    row_pk: Mapped[str] = mapped_column(String(64), nullable=False)
    op: Mapped[str] = mapped_column(String(8), nullable=False)  # upsert / delete
    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class SyncState(SyncBase):
    """Key/value sync state: last pull timestamps, last push time, counters."""

    __tablename__ = "sync_state"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)


class SyncBaseline(SyncBase):
    """Baseline snapshot of numeric fields as of the last successful push.

    For rows whose values change on both sides (inventory quantity), the push
    sends the *delta* between the current value and this baseline so remote
    changes made while offline are preserved instead of overwritten.
    """

    __tablename__ = "sync_baseline"

    table_name: Mapped[str] = mapped_column(String(64), primary_key=True)
    row_pk: Mapped[str] = mapped_column(String(64), primary_key=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
