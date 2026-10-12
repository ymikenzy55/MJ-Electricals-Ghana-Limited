"""Dialect-portable column types.

The production database is Postgres (Neon); offline/local mode runs on
SQLite. These helpers keep the Postgres types where supported and fall back
to portable equivalents elsewhere.
"""

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB


def json_type():
    """JSONB on Postgres, generic JSON on SQLite."""
    return JSONB().with_variant(JSON(), "sqlite")
