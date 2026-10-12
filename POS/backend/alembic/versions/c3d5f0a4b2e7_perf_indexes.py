"""Add composite indexes for dashboard and POS performance.

Revision ID: c3d5f0a4b2e7
Revises: b7c4e9f2a1d8
Create Date: 2026-09-15 12:00:00
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "c3d5f0a4b2e7"
down_revision = "b7c4e9f2a1d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Partial index for today's completed sales (dashboard "today" queries)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sales_today_completed "
        "ON sales (branch_id, sold_at DESC) "
        "WHERE status != 'VOIDED'"
    )

    # Composite index for sale_items joined to sales by product (top-products report)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sale_items_product_name "
        "ON sale_items (product_name)"
    )

    # Index for sale_payments by method (payment-mix report)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sale_payments_method "
        "ON sale_payments (method)"
    )

    # Composite index for sale_payments joined to sales by date
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sale_payments_sale_method "
        "ON sale_payments (sale_id, method)"
    )

    # Index for low-stock queries scoped to a branch
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_branch_inventory_branch_qty "
        "ON branch_inventory (branch_id, quantity)"
    )

    # Index for product_variants by is_active (POS browse filters on this)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_product_variants_active "
        "ON product_variants (is_active) WHERE is_active = true"
    )

    # Index for products by is_active (POS browse filters on this)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_products_active "
        "ON products (is_active) WHERE is_active = true"
    )

    # Composite index for held_sales by cashier (parked sales list)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_held_sales_cashier_created "
        "ON held_sales (cashier_id, created_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_held_sales_cashier_created")
    op.execute("DROP INDEX IF EXISTS ix_products_active")
    op.execute("DROP INDEX IF EXISTS ix_product_variants_active")
    op.execute("DROP INDEX IF EXISTS ix_branch_inventory_branch_qty")
    op.execute("DROP INDEX IF EXISTS ix_sale_payments_sale_method")
    op.execute("DROP INDEX IF EXISTS ix_sale_payments_method")
    op.execute("DROP INDEX IF EXISTS ix_sale_items_product_name")
    op.execute("DROP INDEX IF EXISTS ix_sales_today_completed")
