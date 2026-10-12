r"""Create (or rotate) the restricted Neon login used by installed POS tills.

Run with the POS backend venv:   backend\.venv\Scripts\python.exe installer\create_till_role.py
Writes the till connection string to installer\secrets\till_database_url.txt.
The role can only read/write the tables the offline sync uses — no payroll
or website tables, no DDL.
Re-running only re-applies the grants; pass --rotate to change the password
(every installed till then needs a rebuilt installer).
"""
import platform
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.local_init import SYNCED_TABLES

ROLE = "mjpos_till"
READ_ONLY = ["role_permissions"]
# Cloud-only registry of offline id blocks (see app.till_setup). Not a synced
# table and not an ORM model, so it never reaches a till's local database.
REGISTRY_DDL = """
CREATE TABLE IF NOT EXISTS pos_till_blocks (
    block integer PRIMARY KEY CHECK (block >= 0),
    device text NOT NULL,
    claimed_at timestamptz NOT NULL DEFAULT now()
)"""

out = ROOT / "installer" / "secrets" / "till_database_url.txt"
rotate = "--rotate" in sys.argv
engine = create_engine(settings.DATABASE_URL)
with engine.begin() as c:
    db = c.execute(text("select current_database()")).scalar()
    exists = c.execute(text("select 1 from pg_roles where rolname = :r"), {"r": ROLE}).scalar()
    if exists and not rotate:
        if not out.exists():
            sys.exit(f"Role {ROLE} exists but {out} is missing; re-run with --rotate")
        verb, password = "UPDATE", make_url(out.read_text(encoding="utf-8").strip()).password
    else:
        password = secrets.token_urlsafe(32)
        if exists:
            verb = "ROTATE"
            c.execute(text(f"ALTER ROLE {ROLE} WITH PASSWORD '{password}'"))
        else:
            verb = "CREATE"
            c.execute(text(f"CREATE ROLE {ROLE} WITH LOGIN PASSWORD '{password}' NOSUPERUSER NOCREATEDB NOCREATEROLE"))
    c.execute(text(f'GRANT CONNECT ON DATABASE "{db}" TO {ROLE}'))
    c.execute(text(f"REVOKE CREATE ON SCHEMA public FROM {ROLE}"))
    c.execute(text(f"GRANT USAGE ON SCHEMA public TO {ROLE}"))
    for t in SYNCED_TABLES:
        c.execute(text(f'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."{t}" TO {ROLE}'))
    for t in READ_ONLY:
        c.execute(text(f'GRANT SELECT ON TABLE public."{t}" TO {ROLE}'))
    # Rows the sync creates in the cloud without an id (audit_logs conflict
    # entries) draw from the table's sequence, which needs its own grant.
    for t in SYNCED_TABLES:
        seq = c.execute(text("SELECT pg_get_serial_sequence(:t, 'id')"), {"t": f'public."{t}"'}).scalar()
        if seq:
            c.execute(text(f"GRANT USAGE, SELECT ON SEQUENCE {seq} TO {ROLE}"))
    c.execute(text(REGISTRY_DDL))
    c.execute(text(f"GRANT SELECT, INSERT ON TABLE pos_till_blocks TO {ROLE}"))
    # This (owner) machine is block 0: ids from LOCAL_ID_BASE.
    owner_block = (settings.LOCAL_ID_OFFSET - settings.LOCAL_ID_BASE) // settings.LOCAL_ID_BLOCK
    c.execute(
        text("INSERT INTO pos_till_blocks (block, device) VALUES (:b, :d) ON CONFLICT (block) DO NOTHING"),
        {"b": owner_block, "d": f"{platform.node()} (owner)"},
    )

url = make_url(settings.DATABASE_URL).set(username=ROLE, password=password)
out.write_text(url.render_as_string(hide_password=False), encoding="utf-8")
print(f"{verb}: role {ROLE}; {len(SYNCED_TABLES)} tables read/write, {len(READ_ONLY)} read-only")
print(f"Connection string saved to {out}")
