"""System information and local backups (offline/local mode only)."""
import asyncio
import tempfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse

from app.core.database import IS_LOCAL, IS_SQLITE
from app.dependencies.auth import require_permission
from app.models import User
from app.services import backup as backup_service

router = APIRouter(prefix="/api/v1/system", tags=["system"])


def _require_local():
    if not (IS_LOCAL and IS_SQLITE):
        raise HTTPException(404, "Local backups are only available on the offline terminal")


@router.get("/backups")
def backups(_: User = Depends(require_permission("settings.manage"))):
    _require_local()
    return backup_service.list_backups()


@router.post("/backups")
async def create_backup(_: User = Depends(require_permission("settings.manage"))):
    _require_local()
    path = await asyncio.to_thread(backup_service.make_backup)
    await asyncio.to_thread(backup_service.prune)
    return {"name": path.name, "size": path.stat().st_size}


@router.get("/backups/download")
async def download_backup(background: BackgroundTasks, _: User = Depends(require_permission("settings.manage"))):
    """A fresh snapshot of the local database as a downloadable file."""
    _require_local()
    tmp = Path(tempfile.gettempdir()) / f"mjpos_backup_{datetime.now():%Y%m%d_%H%M%S}.db"
    await asyncio.to_thread(backup_service.make_backup, tmp)
    background.add_task(lambda: tmp.unlink(missing_ok=True))
    return FileResponse(tmp, media_type="application/octet-stream", filename=tmp.name)
