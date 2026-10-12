"""Server-side proxy for the website backend admin API.

The POS frontend calls these endpoints instead of the website backend
directly. This keeps the website admin key on the server and enforces
POS permissions:

- ``website.manage`` — full control (orders, products, settings, users).
  Restricted to admins (no branch) and users on the main branch.
- ``website.view`` — read-only access to website customers and their
  order activity (GET on users/orders/dashboard/notifications only).

Branch users without either permission get 403 — they manage POS only.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.dependencies.auth import get_current_user, user_permissions
from app.models import Branch, User

router = APIRouter(prefix="/api/v1/website-admin", tags=["website-admin"])

MAIN_BRANCH_CODE = "ACC-01"

# Shared upstream client — connection pooling keeps repeat admin calls fast
# instead of paying a TCP/TLS handshake per request.
_upstream = httpx.AsyncClient(
    timeout=20,
    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
)

# Path prefixes a read-only website.view user may GET.
_VIEWABLE_PREFIXES = ("users", "orders", "dashboard", "notifications")


def _perms(user: User) -> set[str]:
    return user_permissions(user)


def _is_main_branch_user(user: User, db: Session) -> bool:
    """Admins (no branch) or users attached to the main branch."""
    if user.branch_id is None:
        return True
    branch = db.get(Branch, user.branch_id)
    return branch is not None and branch.code == MAIN_BRANCH_CODE


def _authorize(user: User, path: str, method: str, db: Session) -> None:
    perms = _perms(user)
    if "website.manage" in perms:
        if not _is_main_branch_user(user, db):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Website management is restricted to the main branch",
            )
        return
    if "website.view" in perms and method == "GET":
        if path == "" or path.split("/", 1)[0] in _VIEWABLE_PREFIXES:
            return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "No website access")


@router.api_route("/{path:path}", methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
async def proxy(
    path: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _authorize(user, path, request.method, db)

    url = f"{settings.WEBSITE_API_URL}/api/v1/admin/{path}"
    body = await request.body()
    try:
        upstream = await _upstream.request(
            request.method,
            url,
            params=dict(request.query_params),
            content=body if body else None,
            headers={
                "Content-Type": request.headers.get("content-type", "application/json"),
                "X-Admin-Key": settings.WEBSITE_ADMIN_KEY,
            },
        )
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Website backend unavailable")

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )
