"""Add image_url column to products.

Revision ID: d4e6f1a5b3c8
Revises: c3d5f0a4b2e7
Create Date: 2026-09-16 10:00:00
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d4e6f1a5b3c8"
down_revision = "c3d5f0a4b2e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("image_url", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "image_url")
