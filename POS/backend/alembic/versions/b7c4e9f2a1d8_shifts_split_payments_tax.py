"""Add shifts (cash drawer), split payments, and sale tax columns.

Revision ID: b7c4e9f2a1d8
Revises: a2f3b8c1d4e6
Create Date: 2025-01-21 10:00:00
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b7c4e9f2a1d8"
down_revision = "a2f3b8c1d4e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- shifts (cash drawer sessions) ----
    op.create_table(
        "shifts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="OPEN"),
        sa.Column("opening_float", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("counted_cash", sa.Numeric(12, 2), nullable=True),
        sa.Column("expected_cash", sa.Numeric(12, 2), nullable=True),
        sa.Column("variance", sa.Numeric(12, 2), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.CheckConstraint("opening_float >= 0", name="ck_shift_float_non_negative"),
    )
    op.create_index("ix_shifts_branch_id", "shifts", ["branch_id"])
    op.create_index("ix_shifts_user_id", "shifts", ["user_id"])
    op.create_index("ix_shifts_status", "shifts", ["status"])

    # ---- sale_payments (split payments) ----
    op.create_table(
        "sale_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sale_id", sa.Integer(), sa.ForeignKey("sales.id"), nullable=False),
        sa.Column("method", sa.String(24), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("reference", sa.String(64), nullable=True),
        sa.CheckConstraint("amount > 0", name="ck_sale_payment_amount_positive"),
    )
    op.create_index("ix_sale_payments_sale_id", "sale_payments", ["sale_id"])

    # ---- sale tax + shift link ----
    op.add_column("sales", sa.Column("shift_id", sa.Integer(), sa.ForeignKey("shifts.id"), nullable=True))
    op.add_column("sales", sa.Column("tax_rate", sa.Numeric(6, 4), nullable=False, server_default="0"))
    op.add_column("sales", sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False, server_default="0"))
    op.create_index("ix_sales_shift_id", "sales", ["shift_id"])

    # Backfill: existing sales become a single CASH payment for their full total
    # so reporting over sale_payments is consistent with historical data.
    op.execute(
        """
        INSERT INTO sale_payments (sale_id, method, amount)
        SELECT id, COALESCE(payment_method, 'CASH'), total
        FROM sales
        WHERE total > 0
        """
    )


def downgrade() -> None:
    op.drop_index("ix_sales_shift_id", table_name="sales")
    op.drop_column("sales", "tax_amount")
    op.drop_column("sales", "tax_rate")
    op.drop_column("sales", "shift_id")
    op.drop_index("ix_sale_payments_sale_id", table_name="sale_payments")
    op.drop_table("sale_payments")
    op.drop_index("ix_shifts_status", table_name="shifts")
    op.drop_index("ix_shifts_user_id", table_name="shifts")
    op.drop_index("ix_shifts_branch_id", table_name="shifts")
    op.drop_table("shifts")
