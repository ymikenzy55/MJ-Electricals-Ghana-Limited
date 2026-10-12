"""Local (offline-first) database bootstrap.

Runs only when ``POS_MODE=local``. Responsibilities:

* create the SQLite schema for every business model
* offset auto-increment primary keys above ``LOCAL_ID_OFFSET`` so locally
  created rows can never collide with rows created on the cloud database
* attach outbox listeners that queue every local write for the sync engine
* seed the minimum data needed to log in before the first cloud sync
"""

import contextvars
import os
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import event, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base, engine, IS_SQLITE
from app.models.sync import SyncBase, SyncOutbox

# When the sync engine writes pulled cloud rows into the local database it
# sets this flag so the outbox listeners ignore its own writes.
suppress_outbox: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "suppress_outbox", default=False
)


@contextmanager
def outbox_suppressed():
    """Suppress outbox tracking for the wrapped block (sync-engine writes)."""
    token = suppress_outbox.set(True)
    try:
        yield
    finally:
        suppress_outbox.reset(token)

# Every business table whose rows flow local -> cloud on push. Association
# and sync-internal tables are excluded (role_permissions is refreshed by the
# pull instead).
SYNCED_TABLES: list[str] = [
    # parents first — pushed in this order so foreign keys resolve
    "permissions",
    "app_settings",
    "roles",
    "branches",
    "pos_devices",
    "users",
    "categories",
    "brands",
    "suppliers",
    "products",
    "product_variants",
    "branch_inventory",
    "customers",
    "shifts",
    "expenses",
    "sales",
    "sale_items",
    "sale_payments",
    "returns",
    "return_items",
    "stock_transfers",
    "stock_transfer_items",
    "purchases",
    "purchase_items",
    "stock_movements",
    "held_sales",
    "audit_logs",
]


def _sqlite_path() -> Path:
    url = settings.LOCAL_DATABASE_URL
    # sqlite:///relative or sqlite:////absolute
    raw = url.split("sqlite:///", 1)[-1]
    path = Path(raw)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / path
    return path


def ensure_sqlite_dir() -> None:
    _sqlite_path().parent.mkdir(parents=True, exist_ok=True)


def init_local_db() -> None:
    """Create the local schema, offset IDs, and register outbox tracking."""
    if not IS_SQLITE:
        return

    ensure_sqlite_dir()

    # AUTOINCREMENT lets us reserve the high ID range for this device via
    # sqlite_sequence. The option is a no-op for Postgres DDL.
    for table in Base.metadata.tables.values():
        table.dialect_options["sqlite"]["autoincrement"] = True

    Base.metadata.create_all(engine)
    SyncBase.metadata.create_all(engine)

    # Idempotent migration: add the unique index on sync_outbox if it was
    # created before the deduplication constraint was introduced.
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_outbox_table_pk "
            "ON sync_outbox (table_name, row_pk)"
        ))

    with engine.begin() as conn:
        for name in SYNCED_TABLES:
            if conn.execute(
                text("SELECT 1 FROM sqlite_sequence WHERE name = :n"), {"n": name}
            ).scalar() is None:
                conn.execute(
                    text("INSERT INTO sqlite_sequence (name, seq) VALUES (:n, :s)"),
                    {"n": name, "s": settings.LOCAL_ID_OFFSET},
                )

    _register_outbox_listeners()


def _register_outbox_listeners() -> None:
    """Queue every local write into sync_outbox for the next push cycle."""
    tracked = {
        table.name
        for table in Base.metadata.tables.values()
        if table.name in SYNCED_TABLES
    }

    def _enqueue(mapper, connection, target, op):
        if suppress_outbox.get():
            return
        if connection.engine is not engine:
            return  # writes on the cloud session are not local changes
        table_name = mapper.local_table.name
        if table_name not in tracked:
            return
        pk = getattr(target, "id", None)
        if pk is None:
            return
        # Upsert: if an entry already exists for this row, update op and
        # reset queued_at rather than accumulating duplicate rows. This means
        # 10 rapid updates to the same row produce exactly one push cycle.
        connection.execute(
            text(
                "INSERT INTO sync_outbox (table_name, row_pk, op, queued_at) "
                "VALUES (:t, :pk, :op, CURRENT_TIMESTAMP) "
                "ON CONFLICT (table_name, row_pk) DO UPDATE "
                "SET op = excluded.op, queued_at = excluded.queued_at"
            ),
            {"t": table_name, "pk": str(pk), "op": op},
        )

    for mapper in Base.registry.mappers:
        if mapper.local_table.name not in tracked:
            continue

        def ins(m, c, t):
            _enqueue(m, c, t, "upsert")

        def upd(m, c, t):
            _enqueue(m, c, t, "upsert")

        def dele(m, c, t):
            _enqueue(m, c, t, "delete")

        event.listen(mapper, "after_insert", ins)
        event.listen(mapper, "after_update", upd)
        event.listen(mapper, "after_delete", dele)


def ensure_seed() -> None:
    """Seed the minimum needed to log in while offline.

    Permissions, roles, the main branch and the admin user — the same natural
    keys as the cloud seed, so the sync engine reconciles them by unique key
    (username / role name / branch code / permission code) on first push.
    Skips everything that already exists and never seeds sample products.
    """
    from app.core.permissions import PERMISSIONS, ROLE_PERMISSIONS
    from app.core.security import hash_password
    from app.models import Branch, Permission, Role, User

    db = Session(engine)
    try:
        existing = {p.code: p for p in db.execute(select(Permission)).scalars()}
        for code, description in PERMISSIONS.items():
            if code not in existing:
                p = Permission(code=code, description=description)
                db.add(p)
                existing[code] = p
        db.flush()

        roles = {r.name: r for r in db.execute(select(Role)).scalars()}
        for name, perm_codes in ROLE_PERMISSIONS.items():
            role = roles.get(name)
            if role is None:
                role = Role(name=name)
                db.add(role)
                roles[name] = role
            role.permissions = [existing[c] for c in perm_codes]
        db.flush()

        branch = db.execute(
            select(Branch).where(Branch.code == "ACC-01")
        ).scalar_one_or_none()
        if branch is None:
            branch = Branch(code="ACC-01", name="Accra Main Branch", address="Accra, Ghana")
            db.add(branch)
            db.flush()

        admin = db.execute(
            select(User).where(User.username == "admin")
        ).scalar_one_or_none()
        if admin is None:
            db.add(User(
                username="admin",
                full_name="System Administrator",
                password_hash=hash_password(
                    os.environ.get(
                        "SEED_ADMIN_PASSWORD",
                        os.environ.get("SUPER_ADMIN_PASSWORD", "Admin@1234"),
                    )
                ),
                role_id=roles["Administrator"].id,
                branch_id=None,
            ))
        db.commit()
    finally:
        db.close()
