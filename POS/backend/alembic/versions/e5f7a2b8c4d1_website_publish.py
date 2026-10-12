"""Add is_published_to_website column to products table.

Revision ID: e5f7a2b8c4d1
Revises: d4e6f1a5b3c8
Create Date: 2025-01-15 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "e5f7a2b8c4d1"
down_revision = "d4e6f1a5b3c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "is_published_to_website",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_products_is_published_to_website",
        "products",
        ["is_published_to_website"],
    )


def downgrade() -> None:
    op.drop_index("ix_products_is_published_to_website", table_name="products")
    op.drop_column("products", "is_published_to_website")
