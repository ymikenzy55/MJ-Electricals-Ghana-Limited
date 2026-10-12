"""Expenses, app settings, and their permissions.

Revision ID: a7b9c1d3e5f8
Revises: f6a8b3c5d7e2
Create Date: 2026-10-20 09:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "a7b9c1d3e5f8"
down_revision = "f6a8b3c5d7e2"
branch_labels = None
depends_on = None

NEW_PERMISSIONS = {
    "expenses.view": "View expenses",
    "expenses.manage": "Record and void expenses",
}
# role name -> permission codes to grant
GRANTS = {
    "Manager": ["expenses.view", "expenses.manage"],
    "Accountant": ["expenses.view"],
    "Administrator": ["expenses.view", "expenses.manage"],
    "CEO": ["expenses.view", "expenses.manage"],
}


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("shifts.id")),
        sa.Column("category", sa.String(48), nullable=False),
        sa.Column("description", sa.String(255)),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_via", sa.String(16), nullable=False, server_default="CASH"),
        sa.Column("reference", sa.String(64)),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="ACTIVE"),
        sa.Column("void_reason", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("amount > 0", name="ck_expense_positive"),
    )
    op.create_index("ix_expenses_branch_id", "expenses", ["branch_id"])
    op.create_index("ix_expenses_shift_id", "expenses", ["shift_id"])
    op.create_index("ix_expenses_category", "expenses", ["category"])
    op.create_index("ix_expenses_expense_date", "expenses", ["expense_date"])
    op.create_index("ix_expenses_updated_at", "expenses", ["updated_at"])

    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(64), nullable=False, unique=True),
        sa.Column("value", sa.Text()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    conn = op.get_bind()
    for code, desc in NEW_PERMISSIONS.items():
        conn.execute(
            sa.text(
                "INSERT INTO permissions (code, description) "
                "SELECT CAST(:c AS VARCHAR), CAST(:d AS VARCHAR) WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = :c)"
            ),
            {"c": code, "d": desc},
        )
    for role, codes in GRANTS.items():
        for code in codes:
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, permission_id) "
                    "SELECT r.id, p.id FROM roles r, permissions p "
                    "WHERE r.name = CAST(:r AS VARCHAR) AND p.code = CAST(:c AS VARCHAR) "
                    "AND NOT EXISTS (SELECT 1 FROM role_permissions rp "
                    "WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
                ),
                {"r": role, "c": code},
            )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE code IN ('expenses.view','expenses.manage'))"
    ))
    conn.execute(sa.text("DELETE FROM permissions WHERE code IN ('expenses.view','expenses.manage')"))
    op.drop_table("app_settings")
    op.drop_table("expenses")
