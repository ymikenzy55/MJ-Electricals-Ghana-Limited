"""Offline-first sync engine: local SQLite <-> cloud Postgres.

Only active when ``POS_MODE=local``. Design:

* Every local write lands in ``sync_outbox`` (mapper listeners, see
  ``local_init``). A push cycle upserts those rows into the cloud database.
* A pull cycle copies cloud-side changes into the local database. Rows with a
  pending outbox entry are skipped — the local version wins and is pushed.
* Local primary keys are offset above ``LOCAL_ID_OFFSET`` so a row created
  offline can be pushed with its id intact and never collides with a
  cloud-generated row.
* Rows that were seeded offline and already exist in the cloud under a
  different id (the admin user, the main branch, roles...) are reconciled by
  natural key: the local row adopts the cloud identity and its foreign-key
  dependents are remapped.
* ``branch_inventory.quantity`` is pushed as a delta against the last synced
  baseline, so stock decremented on both sides while offline is not lost.
"""

import asyncio
import json
import logging
import platform
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, create_engine, delete, func, inspect, literal_column, not_, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm.exc import ObjectDeletedError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.database import Base, engine, IS_SQLITE
from app.core.local_init import SYNCED_TABLES, outbox_suppressed
from app.models.sync import SyncBaseline, SyncOutbox, SyncState

logger = logging.getLogger("mj_pos.sync")

DEVICE_NAME = platform.node() or "pos-terminal"

# Unique-key columns used to reconcile a locally created row with an
# equivalent cloud row. Document numbers (purchase_number, return_number,
# transfer_number) are deliberately excluded — the same number on two
# different documents is a real conflict, not an identity match.
NATURAL_KEYS: dict[str, tuple[str, ...] | None] = {
    "permissions": ("code",),
    "roles": ("name",),
    "branches": ("code",),
    "pos_devices": ("device_code",),
    "users": ("username",),
    "categories": ("name",),
    "brands": ("name",),
    "products": None,
    "product_variants": ("sku",),
    "suppliers": None,
    "branch_inventory": ("branch_id", "variant_id"),
    "customers": None,
    "shifts": None,
    "sales": ("transaction_id",),
    "sale_items": None,
    "sale_payments": None,
    "returns": None,
    "return_items": None,
    "stock_transfers": None,
    "stock_transfer_items": None,
    "purchases": None,
    "purchase_items": None,
    "stock_movements": None,
    "held_sales": None,
    "audit_logs": None,
    "expenses": None,
    "app_settings": ("key",),
}

# Column used to detect that a cloud row changed since the last pull.
CURSOR_COLUMNS: dict[str, str] = {
    "products": "updated_at",
    "product_variants": "created_at",
    "branch_inventory": "updated_at",
    "stock_transfers": "created_at",
    "sales": "sold_at",
    "shifts": "opened_at",
    "pos_devices": "registered_at",
    "expenses": "updated_at",
    "app_settings": "updated_at",
}

MODELS: dict[str, type] = {}
for _m in Base.registry.mappers:
    MODELS[_m.local_table.name] = _m.class_

# Small tables whose rows can change without a usable cursor column (user
# edits, role changes, branch info, catalog lookups, and status-heavy docs
# like shifts, transfers and held sales). They are fully refreshed on the
# first cycle, on "Sync now", and then every FULL_REFRESH_EVERY cycles —
# every other cycle only pulls what changed (see pull_table).
FULL_REFRESH_EVERY = 10
ALWAYS_REFRESH = {
    "permissions", "roles", "branches", "pos_devices", "users",
    "categories", "brands", "suppliers", "customers",
    "shifts", "stock_transfers", "held_sales",
}

_cloud_engine = None
CloudSession = None
_sync_lock = asyncio.Lock()
_last_probe_ok: bool | None = None


def _cloud():
    global _cloud_engine, CloudSession
    if _cloud_engine is None:
        _cloud_engine = create_engine(
            settings.DATABASE_URL,
            connect_args={"connect_timeout": 5},
            pool_size=2,
            pool_pre_ping=True,
        )
        CloudSession = sessionmaker(bind=_cloud_engine, expire_on_commit=False)
    return _cloud_engine, CloudSession


def probe_cloud() -> bool:
    """True when the cloud database answers within the connect timeout."""
    global _last_probe_ok
    try:
        cloud_engine, _ = _cloud()
        with cloud_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        _last_probe_ok = True
    except Exception as exc:
        _last_probe_ok = False
        logger.info("Cloud probe failed: %s", exc)
    return _last_probe_ok


def _state(db: Session, key: str) -> str | None:
    row = db.get(SyncState, key)
    return row.value if row else None


def _set_state(db: Session, key: str, value: str | None) -> None:
    row = db.get(SyncState, key)
    if row is None:
        db.add(SyncState(key=key, value=value))
    else:
        row.value = value


def _row_dict(obj) -> dict:
    return {attr.key: getattr(obj, attr.key) for attr in inspect(obj).mapper.column_attrs}


def _ts(value) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.replace(tzinfo=None)
    return value


def _dirty_pks(db: Session, table_name: str) -> set[str]:
    return {
        r[0]
        for r in db.execute(
            select(SyncOutbox.row_pk).where(SyncOutbox.table_name == table_name)
        )
    }


# ---------------------------------------------------------------- pull ----

def _temp_nk_value(model, column_name: str, row_id) -> object:
    """A throwaway natural-key value that frees the real one."""
    import uuid as _uuid

    col = model.__table__.c[column_name]
    if col.type.__class__.__name__ in ("Uuid", "UUID"):
        return _uuid.uuid4()
    sentinel = f"__dup_{row_id}"
    length = getattr(col.type, "length", None)
    return sentinel[:length] if length else sentinel


def _adopt_remote(local_db: Session, model, remote: dict, local_row, was_dirty: bool):
    """Replace a local natural-key duplicate with the authoritative cloud row.

    Keeps every foreign key valid at each step — free the local row's unique
    key, insert the cloud row under its real id, point the local row's
    dependents at it, then drop the duplicate. When the local row had unsynced
    edits, an upsert is requeued under the cloud id so they still push.
    """
    table_name = model.__table__.name
    local_snapshot = _row_dict(local_row)
    nk = NATURAL_KEYS.get(table_name)
    single_nk = nk is not None and len(nk) == 1

    if single_nk:
        setattr(local_row, nk[0], _temp_nk_value(model, nk[0], local_row.id))
        local_db.flush()
    else:
        # Composite natural keys (branch_inventory) can't be temp-freed — the
        # duplicate must be removed first. Safe: nothing references those
        # rows by id.
        local_db.delete(local_row)
        local_db.flush()

    adopted = local_db.get(model, remote["id"])
    if adopted is None:
        adopted = model(**remote)
        local_db.add(adopted)
    else:
        for key, value in remote.items():
            if key != "id":
                setattr(adopted, key, value)
    local_db.flush()

    _remap_local_pk(local_db, table_name, local_row.id, remote["id"], skip_table=table_name)
    if single_nk:
        # Reload relationship collections — the remap just moved association
        # rows out from under them, and a stale cascade count would fail.
        local_db.expire(local_row)
        local_db.delete(local_row)
        local_db.flush()

    if was_dirty:
        # Inventory: keep the local stock change on top of the remote
        # quantity — the seeded baseline makes the next push send only the
        # local delta, so neither side's count is lost.
        if table_name == "branch_inventory":
            adopted.quantity = Decimal(str(remote["quantity"])) + Decimal(
                str(local_snapshot["quantity"])
            )
            local_db.merge(
                SyncBaseline(
                    table_name=table_name,
                    row_pk=str(remote["id"]),
                    quantity=Decimal(str(remote["quantity"])),
                )
            )
        local_db.execute(
            SyncOutbox.__table__.insert().values(
                table_name=table_name, row_pk=str(remote["id"]), op="upsert"
            )
        )
    return adopted


def _adopt_or_insert(local_db: Session, model, row: dict, dirty: set[str]) -> None:
    """Insert a pulled cloud row, reconciling natural-key duplicates.

    If a local row with the same unique key exists under a different id
    (e.g. the offline-seeded admin user), the cloud identity is adopted:
    the local row's dependents are remapped and the duplicate is removed.
    """
    table = model.__table__

    existing = local_db.get(model, row["id"])
    if existing is not None:
        if str(existing.id) in dirty:
            return  # local change pending — local version wins
        for key, value in row.items():
            if key != "id":
                setattr(existing, key, value)
        _reset_inventory_baseline(local_db, table.name, row)
        return

    nk = NATURAL_KEYS.get(table.name)
    local_row = None
    if nk and all(row.get(c) is not None for c in nk):
        local_row = local_db.execute(
            select(model).where(*[getattr(model, c) == row[c] for c in nk])
        ).scalar_one_or_none()

    if local_row is not None:
        _adopt_remote(
            local_db, model, row, local_row, was_dirty=str(local_row.id) in dirty
        )
        return

    local_db.add(model(**row))
    _reset_inventory_baseline(local_db, table.name, row)


def _reset_inventory_baseline(local_db: Session, table_name: str, row: dict) -> None:
    """A pulled stock count is the new push baseline. Otherwise the next local
    sale pushes (local - old baseline) and re-applies every cloud-side change
    since the last push — a website order or another till's sale counted twice."""
    if table_name == "branch_inventory":
        local_db.merge(SyncBaseline(
            table_name=table_name, row_pk=str(row["id"]), quantity=Decimal(str(row["quantity"])),
        ))


def _remap_local_pk(db: Session, table_name: str, old_id, new_id, skip_table: str | None = None) -> None:
    """Point every foreign key referencing ``old_id`` at ``new_id``."""
    target = Base.metadata.tables[table_name]
    for table in Base.metadata.tables.values():
        if table.name == skip_table:
            continue
        for fk in table.foreign_keys:
            if fk.column.table.name == table_name:
                db.execute(
                    table.update()
                    .where(table.c[fk.parent.name] == old_id)
                    .values(**{fk.parent.name: new_id})
                )


def _wm_key(table_name: str) -> str:
    return f"wm:{table_name}"


# Id blocks: CLOUD_BLOCK is every id below LOCAL_ID_BASE (generated by the
# cloud database); block n >= 0 is one offline terminal's range.
CLOUD_BLOCK = -1


def _id_block(pk: int) -> int:
    if pk < settings.LOCAL_ID_BASE:
        return CLOUD_BLOCK
    return (pk - settings.LOCAL_ID_BASE) // settings.LOCAL_ID_BLOCK


def _block_range(block: int) -> tuple[int, int]:
    if block == CLOUD_BLOCK:
        return 0, settings.LOCAL_ID_BASE
    lo = settings.LOCAL_ID_BASE + block * settings.LOCAL_ID_BLOCK
    return lo, lo + settings.LOCAL_ID_BLOCK


def _load_id_watermarks(raw: str) -> dict[int, int]:
    """Per-block id watermarks. Older versions stored one plain number — the
    watermark of the cloud range."""
    try:
        data = json.loads(raw)
    except ValueError:
        data = None
    if isinstance(data, dict):
        wms = {int(k): int(v) for k, v in data.items()}
    else:
        wms = {CLOUD_BLOCK: int(raw)}
    wms.setdefault(CLOUD_BLOCK, 0)
    return wms


def _dump_id_watermarks(wms: dict[int, int]) -> str:
    return json.dumps({str(k): v for k, v in sorted(wms.items())})


def _id_wm_key(table_name: str) -> str:
    return f"wmid:{table_name}"


def _id_watermarks_from(ids) -> dict[int, int]:
    """Watermarks for rows already present: the highest id seen per block,
    skipping this terminal's own block."""
    own = _id_block(settings.LOCAL_ID_OFFSET)
    wms = {CLOUD_BLOCK: 0}
    for pk in ids:
        block = _id_block(pk)
        if block != own:
            wms[block] = max(wms.get(block, 0), pk)
    return wms


def _pull_new_ids(local_db: Session, cloud_db: Session, model, wms: dict[int, int], dirty: set[str]) -> int:
    """Pull rows above each id block's watermark; updates ``wms`` in place.

    Ids are only monotonic within one block (the cloud's own range, or one
    terminal's), so there is a watermark per block. A block not seen before
    (a newly installed till) is picked up in full.
    """
    table = model.__table__
    pulled = 0
    while True:
        rows = list(
            cloud_db.execute(
                select(*table.c)
                .where(_new_ids_clause(table, wms))
                .order_by(table.c.id).limit(1000)
            ).mappings()
        )
        if not rows:
            break
        with local_db.no_autoflush:
            for row in rows:
                r = dict(row)
                if local_db.get(model, r["id"]) is None:
                    _adopt_or_insert(local_db, model, r, dirty)
                    pulled += 1
                block = _id_block(r["id"])
                wms[block] = max(wms.get(block, 0), r["id"])
        if len(rows) < 1000:
            break
    return pulled


def _new_ids_clause(table, wms: dict[int, int]):
    """Rows above each known block's watermark, plus every row of a block not
    seen yet. This terminal's own block is skipped — those rows are local."""
    own = _id_block(settings.LOCAL_ID_OFFSET)
    known = [own] + [b for b in wms if b not in (own, CLOUD_BLOCK)]
    parts = []
    for block, last in wms.items():
        if block == own:
            continue
        lo, hi = _block_range(block)
        parts.append(and_(table.c.id > max(last, lo - 1), table.c.id < hi))
    parts.append(and_(
        table.c.id >= settings.LOCAL_ID_BASE,
        *[not_(table.c.id.between(lo, hi - 1)) for lo, hi in map(_block_range, known)],
    ))
    return or_(*parts)


def pull_table(local_db: Session, cloud_db: Session, table_name: str, full: bool = False) -> int:
    """Copy new/changed cloud rows into the local database.

    Incremental by default: tables with a cursor column fetch only rows whose
    cursor moved past the stored watermark; append-only tables fetch only ids
    above the watermark. ``full`` (first run, manual sync, periodic refresh of
    small mutable tables) compares every row.
    """
    model = MODELS[table_name]
    table = model.__table__
    cursor_col = CURSOR_COLUMNS.get(table_name)
    dirty = _dirty_pks(local_db, table_name)
    wm_raw = _state(local_db, _wm_key(table_name))
    incremental = wm_raw is not None and not (full and table_name in ALWAYS_REFRESH)
    pulled = 0

    if incremental and cursor_col and table_name not in ALWAYS_REFRESH:
        wm = datetime.fromisoformat(wm_raw)
        # small overlap so rows committed just behind the watermark are not missed
        since = wm - timedelta(seconds=15)
        rows = list(
            cloud_db.execute(
                select(*table.c).where(table.c[cursor_col] > since).order_by(table.c[cursor_col])
            ).mappings()
        )
        newest = wm
        with local_db.no_autoflush:
            for row in rows:
                r = dict(row)
                if str(r["id"]) not in dirty:
                    _adopt_or_insert(local_db, model, r, dirty)
                    pulled += 1
                ts = _ts(r[cursor_col])
                if ts and ts > newest:
                    newest = ts
        _set_state(local_db, _wm_key(table_name), newest.isoformat())
        # The cursor is business time (sold_at, created_at): a row another
        # till made offline arrives in the cloud with an old timestamp, behind
        # the watermark. New ids per block catch those late arrivals.
        id_raw = _state(local_db, _id_wm_key(table_name))
        wms = _load_id_watermarks(id_raw) if id_raw else _id_watermarks_from(
            local_db.execute(select(table.c.id)).scalars())
        pulled += _pull_new_ids(local_db, cloud_db, model, wms, dirty)
        _set_state(local_db, _id_wm_key(table_name), _dump_id_watermarks(wms))
        return pulled

    if incremental and not cursor_col and table_name not in ALWAYS_REFRESH:
        wms = _load_id_watermarks(wm_raw)
        pulled += _pull_new_ids(local_db, cloud_db, model, wms, dirty)
        _set_state(local_db, _wm_key(table_name), _dump_id_watermarks(wms))
        return pulled

    if incremental and table_name in ALWAYS_REFRESH and not full:
        # Mutable small table between full refreshes: only rows that
        # changed according to the cursor (if any) or new ids.
        if cursor_col:
            wm = datetime.fromisoformat(wm_raw) if wm_raw.count("-") >= 2 and "T" in wm_raw else None
            if wm is not None:
                since = wm - timedelta(seconds=15)
                rows = list(cloud_db.execute(
                    select(*table.c).where(table.c[cursor_col] > since)
                ).mappings())
                newest = wm
                with local_db.no_autoflush:
                    for row in rows:
                        r = dict(row)
                        if str(r["id"]) not in dirty:
                            _adopt_or_insert(local_db, model, r, dirty)
                            pulled += 1
                        ts = _ts(r[cursor_col])
                        if ts and ts > newest:
                            newest = ts
                _set_state(local_db, _wm_key(table_name), newest.isoformat())
                return pulled
        return 0  # wait for the next scheduled full refresh

    # ---- full comparison (first run, or periodic refresh of mutable tables)
    cols = [table.c.id]
    if cursor_col:
        cols.append(table.c[cursor_col])
    remote = {
        r[0]: _ts(r[1]) if cursor_col else None
        for r in cloud_db.execute(select(*cols))
    }
    local = {
        r[0]: _ts(r[1]) if cursor_col else None
        for r in local_db.execute(select(*cols))
    }

    wanted = []
    for pk, remote_ts in remote.items():
        if pk in dirty:
            continue  # local change pending — local version wins
        if table_name in ALWAYS_REFRESH:
            wanted.append(pk)
            continue
        local_ts = local.get(pk)
        if pk not in local or (cursor_col and remote_ts and local_ts and remote_ts > local_ts):
            wanted.append(pk)

    chunk = 500
    with local_db.no_autoflush:
        for i in range(0, len(wanted), chunk):
            ids = wanted[i : i + chunk]
            rows = cloud_db.execute(
                select(*table.c).where(table.c.id.in_(ids))
            ).mappings()
            for row in rows:
                _adopt_or_insert(local_db, model, dict(row), dirty)
                pulled += 1

    # seed the watermark for next time
    if cursor_col:
        stamps = [t for t in remote.values() if t is not None]
        _set_state(local_db, _wm_key(table_name), (max(stamps) if stamps else datetime(1970, 1, 1)).isoformat())
        if table_name not in ALWAYS_REFRESH:
            _set_state(local_db, _id_wm_key(table_name), _dump_id_watermarks(_id_watermarks_from(remote)))
    elif table_name not in ALWAYS_REFRESH:
        _set_state(local_db, _wm_key(table_name), _dump_id_watermarks(_id_watermarks_from(remote)))
    else:
        _set_state(local_db, _wm_key(table_name), datetime.now().isoformat())
    return pulled


def pull_role_permissions(local_db: Session, cloud_db: Session) -> None:
    table = Base.metadata.tables["role_permissions"]
    rows = cloud_db.execute(select(table.c)).mappings().all()
    local_db.execute(delete(table))
    for row in rows:
        local_db.execute(table.insert().values(**dict(row)))


def pull_all(local_db: Session, cloud_db: Session, full: bool = False) -> dict[str, int]:
    counts: dict[str, int] = {}
    with outbox_suppressed():
        for table_name in SYNCED_TABLES:
            try:
                counts[table_name] = pull_table(local_db, cloud_db, table_name, full)
                local_db.flush()
                # Commit per table: keeps each local write lock short so the
                # cashier's sales never wait behind a long sync transaction.
                local_db.commit()
            except Exception:
                local_db.rollback()
                logger.exception("Pull failed for table %s", table_name)
                raise
        pull_role_permissions(local_db, cloud_db)
        local_db.commit()
    return counts


# ---------------------------------------------------------------- push ----

def _push_inventory(cloud_db: Session, local_db: Session, row: dict, baseline: Decimal | None) -> Decimal:
    """Push a branch_inventory row as a quantity delta, not an absolute value."""
    from app.models import BranchInventory

    table = BranchInventory.__table__
    cloud_qty = cloud_db.execute(
        select(table.c.quantity).where(table.c.id == row["id"])
    ).scalar_one_or_none()
    if baseline is None and cloud_qty is not None:
        baseline = Decimal(str(cloud_qty))
    delta = Decimal(str(row["quantity"])) - (baseline or Decimal("0"))
    if cloud_qty is None:
        cloud_db.execute(table.insert().values(**_cloud_stamped(table, row)))
    else:
        others = {k: v for k, v in _cloud_stamped(table, row).items() if k not in ("id", "quantity")}
        cloud_db.execute(
            table.update().where(table.c.id == row["id"]).values(
                quantity=table.c.quantity + delta, **others
            )
        )
    return Decimal(str(row["quantity"]))


def _log_conflict(cloud_db: Session, table_name: str, row_id) -> None:
    """Record a last-write-wins overwrite in audit_logs so it is visible to
    managers. Only fires when a row already existed on the cloud (i.e. a real
    conflict, not a first-time push)."""
    try:
        from app.models import AuditLog
        cloud_db.add(AuditLog(
            user_id=None,
            action="sync.conflict_overwrite",
            entity_type=table_name,
            entity_id=str(row_id),
            branch_id=None,
            new_value={"device": DEVICE_NAME},
            is_offline=True,
        ))
    except Exception:
        pass  # never let conflict logging break the push


def _cloud_stamped(table, row: dict) -> dict:
    """Stamp ``updated_at`` with the cloud's clock on push. Other terminals
    pull these tables by updated_at; an edit made offline keeps its old local
    time and would sit behind their watermark forever."""
    if "updated_at" in table.c:
        row = {**row, "updated_at": func.now()}
    return row


def _push_row(cloud_db: Session, model, row: dict) -> None:
    row = _cloud_stamped(model.__table__, row)
    stmt = pg_insert(model.__table__).values(**row)
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={k: v for k, v in row.items() if k != "id"},
    ).returning(literal_column("xmax <> 0"))  # true when an existing row was updated
    overwritten = cloud_db.execute(stmt).scalar()
    # Fix #8: log the overwrite so managers can audit last-write-wins conflicts.
    if overwritten:
        _log_conflict(cloud_db, model.__table__.name, row.get("id"))


def _reconcile_push(local_db: Session, cloud_db: Session, model, row: dict) -> bool:
    """Adopt the cloud identity for a natural-key duplicate. True if resolved."""
    nk = NATURAL_KEYS.get(model.__table__.name)
    if not nk:
        return False
    cloud_row = cloud_db.execute(
        select(model).where(*[getattr(model, c) == row[c] for c in nk])
    ).scalar_one_or_none()
    if cloud_row is None or cloud_row.id == row["id"]:
        return False
    local_row = local_db.get(model, row["id"])
    if local_row is None:
        return True  # nothing local left to adopt — the entry is stale
    with outbox_suppressed():
        _adopt_remote(local_db, model, _row_dict(cloud_row), local_row, was_dirty=True)
    return True


PUSH_BATCH = 300


def _push_entry(local_db: Session, cloud_db: Session, entry) -> None:
    """Stage one outbox entry on the cloud session (caller commits)."""
    model = MODELS.get(entry.table_name)
    if model is None:
        return
    pk = int(entry.row_pk)
    if entry.op == "delete":
        cloud_db.execute(delete(model.__table__).where(model.__table__.c.id == pk))
        return
    obj = local_db.get(model, pk)
    if obj is None:
        cloud_db.execute(delete(model.__table__).where(model.__table__.c.id == pk))
        return
    row = _row_dict(obj)
    if entry.table_name == "branch_inventory":
        baseline_row = local_db.get(SyncBaseline, (entry.table_name, entry.row_pk))
        baseline = baseline_row.quantity if baseline_row else None
        new_baseline = _push_inventory(cloud_db, local_db, row, baseline)
        local_db.merge(
            SyncBaseline(table_name=entry.table_name, row_pk=entry.row_pk, quantity=new_baseline)
        )
    else:
        _push_row(cloud_db, model, row)


FAST_TABLES = {"products", "product_variants", "branch_inventory", "stock_movements", "audit_logs"}


def _push_group_fast(local_db: Session, cloud_db: Session, table_name: str, entries: list) -> None:
    """Send many rows of one table in a couple of statements (bulk insert / upsert)."""
    model = MODELS[table_name]
    table = model.__table__
    rows = []
    for e in entries:
        obj = local_db.get(model, int(e.row_pk))
        if obj is None:
            cloud_db.execute(delete(table).where(table.c.id == int(e.row_pk)))
        else:
            rows.append(_row_dict(obj))
    if not rows:
        return
    if table_name == "branch_inventory":
        ids = [r["id"] for r in rows]
        have = set(cloud_db.execute(select(table.c.id).where(table.c.id.in_(ids))).scalars())
        fresh = [r for r in rows if r["id"] not in have]
        for r in rows:
            if r["id"] in have:  # rare: keep the careful delta merge for rows the cloud already has
                bl = local_db.get(SyncBaseline, (table_name, str(r["id"])))
                nb = _push_inventory(cloud_db, local_db, r, bl.quantity if bl else None)
                local_db.merge(SyncBaseline(table_name=table_name, row_pk=str(r["id"]), quantity=nb))
        if fresh:
            cloud_db.execute(pg_insert(table).values([_cloud_stamped(table, r) for r in fresh]).on_conflict_do_nothing(index_elements=["id"]))
            for r in fresh:
                local_db.merge(SyncBaseline(table_name=table_name, row_pk=str(r["id"]), quantity=Decimal(str(r["quantity"]))))
        return
    stmt = pg_insert(table).values([_cloud_stamped(table, r) for r in rows])
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={c.name: stmt.excluded[c.name] for c in table.columns if c.name != "id"},
    )
    cloud_db.execute(stmt)


def _push_batch(local_db: Session, cloud_db: Session, batch: list) -> None:
    i = 0
    while i < len(batch):
        j = i
        while j < len(batch) and batch[j].table_name == batch[i].table_name:
            j += 1
        group = batch[i:j]
        if group[0].table_name in FAST_TABLES:
            _push_group_fast(local_db, cloud_db, group[0].table_name, group)
        else:
            for entry in group:
                _push_entry(local_db, cloud_db, entry)
        i = j


def _push_single(local_db: Session, cloud_db: Session, entry, errors: list[str]) -> str:
    """Push one entry in its own transaction.

    Returns "ok", "skip" (a data conflict — keep going) or "stop" (looks like
    a connectivity problem — retry the rest next cycle).
    """
    model = MODELS.get(entry.table_name)
    try:
        _push_entry(local_db, cloud_db, entry)
        cloud_db.commit()
        local_db.delete(entry)
        return "ok"
    except IntegrityError:
        cloud_db.rollback()
        obj = local_db.get(model, int(entry.row_pk)) if entry.op != "delete" and model else None
        if obj is not None and _reconcile_push(local_db, cloud_db, model, _row_dict(obj)):
            local_db.delete(entry)
            return "ok"
        errors.append(f"{entry.table_name}#{entry.row_pk}: constraint conflict")
        return "skip"
    except Exception as exc:
        cloud_db.rollback()
        errors.append(f"{entry.table_name}#{entry.row_pk}: {exc}")
        return "stop"


def push_outbox(local_db: Session, cloud_db: Session) -> int:
    """Flush pending outbox entries to the cloud in batches. Returns rows pushed.

    Each remote round trip costs ~100-300 ms, so entries are grouped into one
    transaction per batch. If a batch fails it is replayed row by row so a
    single bad row cannot block the rest.
    """
    order = {name: i for i, name in enumerate(SYNCED_TABLES)}
    entries = local_db.execute(select(SyncOutbox).order_by(SyncOutbox.id)).scalars().all()
    # Inserts and updates go parents first; deletes go children first, so a product is
    # only removed after its options, stock rows and movements are gone.
    entries.sort(key=lambda e: (1, -order.get(e.table_name, 999), e.id) if e.op == "delete"
                 else (0, order.get(e.table_name, 999), e.id))

    pushed = 0
    errors: list[str] = []
    stop = False
    # Deletes are sent as a few big statements per table instead of one round trip per row.
    deletes = [e for e in entries if e.op == "delete"]
    entries = [e for e in entries if e.op != "delete"]
    # Removals first: a replaced product keeps its SKUs, so the old rows must leave the cloud
    # before their successors arrive, or the unique SKU would clash.
    if deletes and not stop:
        by_table: dict[str, list] = {}
        for e in deletes:
            by_table.setdefault(e.table_name, []).append(e)
        for tname in sorted(by_table, key=lambda t: -order.get(t, 999)):
            model = MODELS.get(tname)
            group = by_table[tname]
            for start in range(0, len(group), 400):
                chunk = group[start:start + 400]
                try:
                    if model is not None:
                        ids = [int(e.row_pk) for e in chunk]
                        cloud_db.execute(delete(model.__table__).where(model.__table__.c.id.in_(ids)))
                    cloud_db.commit()
                    for e in chunk:
                        local_db.delete(local_db.merge(e))
                    local_db.commit()
                    pushed += len(chunk)
                except Exception:
                    cloud_db.rollback()
                    local_db.rollback()
                    for e in chunk:
                        try:
                            e = local_db.merge(e)
                            e.table_name
                        except ObjectDeletedError:
                            local_db.rollback()
                            continue
                        result = _push_single(local_db, cloud_db, e, errors)
                        local_db.commit()
                        if result == "ok":
                            pushed += 1
                        elif result == "stop":
                            stop = True
                            break
                if stop:
                    break
            if stop:
                break
    for start in range(0, len(entries), PUSH_BATCH):
        if stop:
            break
        batch = entries[start : start + PUSH_BATCH]
        try:
            _push_batch(local_db, cloud_db, batch)
            cloud_db.commit()
            for entry in batch:
                local_db.delete(entry)
            local_db.commit()
            pushed += len(batch)
            continue
        except Exception as exc:
            cloud_db.rollback()
            local_db.rollback()
            if isinstance(exc, OperationalError):
                # Connection blip: pause, then retry the whole batch once.
                time.sleep(2)
                try:
                    for entry in batch:
                        entry = local_db.merge(entry)
                        _push_entry(local_db, cloud_db, entry)
                    cloud_db.commit()
                    for entry in batch:
                        local_db.delete(local_db.merge(entry))
                    local_db.commit()
                    pushed += len(batch)
                    continue
                except Exception:
                    cloud_db.rollback()
                    local_db.rollback()
        # Batch failed — replay it one row at a time to isolate the problem row.
        for entry in batch:
            try:
                entry = local_db.merge(entry)
                entry.table_name  # touch: raises if the row is already gone
            except ObjectDeletedError:
                local_db.rollback()
                continue
            result = _push_single(local_db, cloud_db, entry, errors)
            local_db.commit()
            if result == "ok":
                pushed += 1
            elif result == "stop":
                stop = True
                break
    if errors:
        _set_state(local_db, "last_error", "; ".join(errors[:5]))
    else:
        _set_state(local_db, "last_error", None)
    local_db.commit()
    return pushed


# ------------------------------------------------------------- orchestrate

_cycle_count = 0
_fail_streak = 0
_sequences_checked = False


def _advance_local_sequences(cloud_db: Session) -> None:
    """Never hand out an id this terminal already used.

    After restoring an older backup the local id counters are behind ids
    this terminal already pushed; the next new sale would reuse one and its
    push would overwrite the old sale in the cloud. Once per start-up, move
    every counter past the highest id of this terminal's block in the cloud.
    """
    lo, hi = _block_range(_id_block(settings.LOCAL_ID_OFFSET))
    with engine.begin() as conn:
        for name in SYNCED_TABLES:
            table = MODELS[name].__table__
            cloud_max = cloud_db.execute(
                select(func.max(table.c.id)).where(table.c.id >= lo, table.c.id < hi)
            ).scalar()
            if cloud_max is None:
                continue
            moved = conn.execute(
                text("UPDATE sqlite_sequence SET seq = :m WHERE name = :n AND seq < :m"),
                {"m": cloud_max, "n": name},
            ).rowcount
            if moved:
                logger.warning("Advanced local id counter for %s to %s (restored backup?)", name, cloud_max)


def run_sync_cycle(force_full: bool = False) -> dict:
    """One full pull+push cycle. Safe to call when offline."""
    global _cycle_count
    if not IS_SQLITE:
        return {"mode": "cloud", "online": True}
    global _fail_streak, _sequences_checked
    if not probe_cloud():
        _fail_streak += 1
        # One missed probe (a DNS or network blip) is not "offline"; two in a row is.
        if _fail_streak >= 2:
            _update_probe_state(False)
        return {"mode": "local", "online": _fail_streak < 2}
    _fail_streak = 0
    _update_probe_state(True)

    local_db = Session(engine)
    _, CloudSess = _cloud()
    cloud_db = CloudSess()
    result = {"mode": "local", "online": True, "pulled": 0, "pushed": 0}
    try:
        if not _sequences_checked:
            _advance_local_sequences(cloud_db)
            _sequences_checked = True
        # Push first: local sales reach the cloud before anything else, and
        # the pull that follows already sees the rows we just wrote.
        pushed = push_outbox(local_db, cloud_db)
        full = force_full or _cycle_count % FULL_REFRESH_EVERY == 0
        _cycle_count += 1
        # One consistent snapshot for the whole pull so parent and child rows
        # (sales / sale_items ...) always arrive together.
        cloud_db.commit()  # end any open transaction so the isolation level applies
        cloud_db.connection(execution_options={"isolation_level": "REPEATABLE READ"})
        try:
            pulled = pull_all(local_db, cloud_db, full)
        finally:
            cloud_db.rollback()
        _set_state(local_db, "last_sync_at", datetime.now(timezone.utc).isoformat())
        # Tell the UI when visible data actually changed so open pages can
        # refresh themselves. Periodic full refreshes re-read small tables
        # unchanged, so only count those on non-full cycles.
        changed = sum(v for t, v in pulled.items() if t not in ALWAYS_REFRESH or not full)
        if changed:
            _set_state(local_db, "data_version", str(int(_state(local_db, "data_version") or "0") + 1))
        _update_probe_state(True, local_db)
        local_db.commit()
        result["pulled"] = sum(pulled.values())
        result["pushed"] = pushed
    except Exception as exc:
        local_db.rollback()
        logger.exception("Sync cycle failed")
        try:
            _set_state(local_db, "last_error", str(exc)[:500])
            local_db.commit()
        except Exception:
            pass
        result["error"] = str(exc)
    finally:
        local_db.close()
        cloud_db.close()
    return result


def _update_probe_state(online: bool, db: Session | None = None) -> None:
    own = db is None
    db = db or Session(engine)
    try:
        _set_state(db, "online", "1" if online else "0")
        if own:
            db.commit()
    finally:
        if own:
            db.close()


def pending_count() -> int:
    if not IS_SQLITE:
        return 0
    db = Session(engine)
    try:
        from sqlalchemy import func

        return db.execute(select(func.count()).select_from(SyncOutbox)).scalar_one()
    finally:
        db.close()


def sync_status() -> dict:
    if not IS_SQLITE:
        return {"mode": "cloud", "online": True, "pending": 0}
    db = Session(engine)
    try:
        return {
            "mode": "local",
            "online": _state(db, "online") == "1",
            "last_sync_at": _state(db, "last_sync_at"),
            "last_error": _state(db, "last_error"),
            "pending": pending_count(),
            "device": DEVICE_NAME,
            "sync_interval_seconds": settings.SYNC_INTERVAL_SECONDS,
            "data_version": int(_state(db, "data_version") or "0"),
        }
    finally:
        db.close()


async def sync_loop() -> None:
    """Background task: probe + sync every SYNC_INTERVAL_SECONDS."""
    try:
        await asyncio.to_thread(heal_inventory_baselines)
    except Exception:
        logger.exception("Inventory baseline repair failed")
    while True:
        await asyncio.sleep(settings.SYNC_INTERVAL_SECONDS)
        try:
            # Same lock as "Sync now", so a manual sync never runs alongside
            # the scheduled one and pushes the same outbox rows twice.
            async with _sync_lock:
                while True:
                    res = await asyncio.to_thread(run_sync_cycle)
                    # A big backlog (bulk import) keeps flowing until it is empty.
                    if not (res.get("pushed") and pending_count() > 0):
                        break
                    await asyncio.sleep(1)
        except Exception:
            logger.exception("Sync loop iteration failed")


def heal_inventory_baselines() -> int:
    """A stock row with no pending push matches the cloud, so its baseline must
    equal its quantity. Repairs baselines left stale by older versions, which
    did not reset them on pull (see _reset_inventory_baseline)."""
    with engine.begin() as conn:
        n = conn.execute(text(
            "UPDATE sync_baseline SET quantity = ("
            "  SELECT i.quantity FROM branch_inventory i WHERE i.id = CAST(sync_baseline.row_pk AS INTEGER))"
            " WHERE table_name = 'branch_inventory'"
            "   AND row_pk NOT IN (SELECT row_pk FROM sync_outbox WHERE table_name = 'branch_inventory')"
            "   AND quantity <> (SELECT i.quantity FROM branch_inventory i WHERE i.id = CAST(sync_baseline.row_pk AS INTEGER))"
        )).rowcount
    if n:
        logger.info("Repaired %d stale inventory baselines", n)
    return n


async def run_sync_now() -> dict:
    async with _sync_lock:
        return await asyncio.to_thread(run_sync_cycle, True)
