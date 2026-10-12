"""Local database backups (offline mode).

Uses SQLite's online backup API, so a copy can be taken safely while the POS
is running. A dated backup is written at start-up and then every 12 hours;
the newest 14 are kept in ``data/backups``.
"""
import asyncio
import logging
import sqlite3
from datetime import datetime
from pathlib import Path

from app.core.local_init import _sqlite_path

logger = logging.getLogger("mj_pos.backup")

KEEP = 14


def backup_dir() -> Path:
    d = _sqlite_path().parent / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def make_backup(dest: Path | None = None) -> Path:
    src_path = _sqlite_path()
    dest = dest or backup_dir() / f"mjpos_{datetime.now():%Y%m%d_%H%M%S}.db"
    src = sqlite3.connect(str(src_path), timeout=30)
    try:
        dst = sqlite3.connect(str(dest))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return dest


def prune() -> None:
    files = sorted(backup_dir().glob("mjpos_*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in files[KEEP:]:
        try:
            old.unlink()
        except OSError:
            pass


def list_backups() -> list[dict]:
    return [
        {"name": p.name, "size": p.stat().st_size, "created_at": datetime.fromtimestamp(p.stat().st_mtime).isoformat()}
        for p in sorted(backup_dir().glob("mjpos_*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    ]


async def backup_loop() -> None:
    while True:
        try:
            path = await asyncio.to_thread(make_backup)
            await asyncio.to_thread(prune)
            logger.info("Local backup written: %s", path.name)
        except Exception:
            logger.exception("Automatic backup failed")
        await asyncio.sleep(12 * 3600)
