"""Sync status and manual-trigger endpoints (local/offline mode)."""

from fastapi import APIRouter, Depends

from app.dependencies.auth import require_permission
from app.models import User
from app.services import sync as sync_service

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])


@router.get("/status")
def get_sync_status(_: User = Depends(require_permission("sales.create"))):
    """Online/offline state, pending outbox count, and last sync time.

    Any authenticated POS user may read this — the sidebar banner needs it.
    """
    return sync_service.sync_status()


@router.post("/run")
async def trigger_sync(_: User = Depends(require_permission("settings.manage"))):
    """Force an immediate pull+push cycle (admin only)."""
    return await sync_service.run_sync_now()
