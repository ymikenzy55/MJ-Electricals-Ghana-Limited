"""First-run setup for an installed POS till.

Run by the launcher once per computer, before the backend starts:

    python -m app.till_setup <path-to-till.env> <path-to-local-database>

Claims a free offline id block from the cloud ``pos_till_blocks`` registry
(so records created offline on different tills can never collide) and writes
the per-machine settings file the launcher passes to the backend: a random
SECRET_KEY, this till's LOCAL_ID_OFFSET, and a random password for the admin
account seeded before the first sync (the real admin replaces it on sync).

If till.env exists but the local database does not (deleted, or a fresh
data folder), a new block is claimed: a new database restarts its id
counters at the block start, and reusing the old block would overwrite
sales this till already sent to the cloud.

Deliberately does not import app.core.config — SECRET_KEY does not exist yet.
Exit codes: 0 done (or already set up), 2 cloud unreachable, 3 no free block.
"""

import platform
import secrets
import sys
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, OperationalError

BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"

# Must match LOCAL_ID_BASE / LOCAL_ID_BLOCK in app.core.config. Ids are
# 32-bit integers, so the last whole block below 2^31 is the limit.
ID_BASE = 1_500_000_000
ID_BLOCK = 10_000_000
MAX_BLOCK = (2**31 - 1 - ID_BASE) // ID_BLOCK - 1


def claim_block(database_url: str, device: str) -> int:
    engine = create_engine(database_url, connect_args={"connect_timeout": 10})
    try:
        with engine.connect() as conn:
            used = {r[0] for r in conn.execute(text("SELECT block FROM pos_till_blocks"))}
            for block in range(1, MAX_BLOCK + 1):
                if block in used:
                    continue
                try:
                    conn.execute(
                        text("INSERT INTO pos_till_blocks (block, device) VALUES (:b, :d)"),
                        {"b": block, "d": device},
                    )
                    conn.commit()
                    return block
                except IntegrityError:
                    conn.rollback()  # another till claimed it a moment ago
            raise LookupError("no free id block")
    finally:
        engine.dispose()


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    till_env, local_db = Path(sys.argv[1]), Path(sys.argv[2])
    if till_env.exists():
        if local_db.exists():
            print(f"Already set up: {till_env}")
            return 0
        print(f"{local_db} is missing: claiming a new id block")

    database_url = dotenv_values(BACKEND_ENV).get("DATABASE_URL")
    if not database_url:
        print(f"DATABASE_URL missing from {BACKEND_ENV}")
        return 1
    device = platform.node() or "pos-terminal"
    try:
        block = claim_block(database_url, device)
    except OperationalError as exc:
        print(f"Cloud database unreachable: {exc}")
        return 2
    except LookupError:
        print("Every offline id block is taken")
        return 3

    till_env.parent.mkdir(parents=True, exist_ok=True)
    till_env.write_text(
        "# Created on first run by app.till_setup. Unique to this computer —\n"
        "# do not copy it to another till.\n"
        f"SECRET_KEY={secrets.token_urlsafe(48)}\n"
        f"LOCAL_ID_OFFSET={ID_BASE + block * ID_BLOCK}\n"
        f"SEED_ADMIN_PASSWORD={secrets.token_urlsafe(24)}\n",
        encoding="utf-8",
    )
    print(f"Claimed id block {block} for {device}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
