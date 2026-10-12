"""Add pg_trgm GIN indexes for fast ILIKE search and customer indexes.

Revision ID: a2f3b8c1d4e6
Revises: 18f72b4d978e
Create Date: 2025-01-20 12:00:00
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "a2f3b8c1d4e6"
down_revision = "18f72b4d978e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pg_trgm for trigram-based fast ILIKE search
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # GIN trigram indexes for fast ILIKE '%term%' search on product fields
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_products_name_trgm "
        "ON products USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_variants_variant_name_trgm "
        "ON product_variants USING gin (variant_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_variants_sku_trgm "
        "ON product_variants USING gin (sku gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_variants_barcode_trgm "
        "ON product_variants USING gin (barcode gin_trgm_ops)"
    )

    # Customer search indexes (trigram for name + phone)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customers_name_trgm "
        "ON customers USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_customers_phone_trgm "
        "ON customers USING gin (phone gin_trgm_ops)"
    )

    # Supplier name search
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_suppliers_name_trgm "
        "ON suppliers USING gin (name gin_trgm_ops)"
    )

    # Composite index for branch_inventory lookups (branch + variant together)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_branch_inventory_branch_variant "
        "ON branch_inventory (branch_id, variant_id)"
    )

    # Index for low-stock queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_branch_inventory_quantity "
        "ON branch_inventory (quantity)"
    )

    # Index for stock movements by branch + created_at (reporting)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_stock_movements_branch_created "
        "ON stock_movements (branch_id, created_at DESC)"
    )

    # Index for sales by branch + sold_at (dashboard/reports)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sales_branch_sold_at "
        "ON sales (branch_id, sold_at DESC)"
    )

    # Index for sale_items by sale_id (receipt detail lookup)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sale_items_sale_id "
        "ON sale_items (sale_id)"
    )

    # Index for audit logs by action + created_at
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_audit_logs_action_created "
        "ON audit_logs (action, created_at DESC)"
    )

    # Index for transfers by status (filtering)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_transfers_status "
        "ON stock_transfers (status)"
    )

    # Index for returns by branch + created_at
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_returns_branch_created "
        "ON returns (branch_id, created_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_returns_branch_created")
    op.execute("DROP INDEX IF EXISTS ix_transfers_status")
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_action_created")
    op.execute("DROP INDEX IF EXISTS ix_sale_items_sale_id")
    op.execute("DROP INDEX IF EXISTS ix_sales_branch_sold_at")
    op.execute("DROP INDEX IF EXISTS ix_stock_movements_branch_created")
    op.execute("DROP INDEX IF EXISTS ix_branch_inventory_quantity")
    op.execute("DROP INDEX IF EXISTS ix_branch_inventory_branch_variant")
    op.execute("DROP INDEX IF EXISTS ix_suppliers_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_customers_phone_trgm")
    op.execute("DROP INDEX IF EXISTS ix_customers_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_variants_barcode_trgm")
    op.execute("DROP INDEX IF EXISTS ix_variants_sku_trgm")
    op.execute("DROP INDEX IF EXISTS ix_variants_variant_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_products_name_trgm")
