"""Add extra_images JSONB column to products table.

Stores up to 5 additional website images per product, each with an
optional label (e.g. a bulb's glow colour) — rendered as a gallery on
the storefront and carried into orders.

Revision ID: f6a8b3c5d7e2
Revises: e5f7a2b8c4d1
Create Date: 2026-10-06 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "f6a8b3c5d7e2"
down_revision = "e5f7a2b8c4d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "extra_images",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("products", "extra_images")
