from fastapi import APIRouter, Depends, HTTPException, Query, status
from decimal import Decimal
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.cache import cache_get, cache_set, cache_invalidate
from app.core.database import get_db
from app.core.security import hash_password
from app.dependencies.auth import enforce_branch_access, get_current_user, require_permission, user_permissions
from app.models import AuditLog, Branch, Role, User
from app.models.sale import Sale
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1", tags=["admin"])

BRANCH_CACHE_KEY = "branches_active"
BRANCH_CACHE_TTL = 120  # seconds


def _invalidate_branch_cache() -> None:
    cache_set(BRANCH_CACHE_KEY, None, 0.001)


class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    address: str | None
    phone: str | None
    is_active: bool


class BranchCreate(BaseModel):
    code: str
    name: str
    address: str | None = None
    phone: str | None = None


class BranchUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    address: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None


def _user_out(db: Session, u: User) -> UserOut:
    branch = db.get(Branch, u.branch_id) if u.branch_id else None
    return UserOut(
        id=u.id, username=u.username, full_name=u.full_name, email=u.email,
        role_name=u.role.name, permissions=sorted(user_permissions(u)),
        branch_id=u.branch_id, branch_name=branch.name if branch else None,
        is_active=u.is_active, last_login_at=u.last_login_at,
    )


@router.get("/branches", response_model=list[BranchOut])
def list_branches(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Branch-scoped users only see their own branch; admins see all.
    # The active-branches list is cached for admins because it rarely changes.
    if not include_inactive and user.branch_id is None:
        cached = cache_get(BRANCH_CACHE_KEY)
        if cached is not None:
            return cached
        query = select(Branch).where(Branch.is_active).order_by(Branch.name)
        result = db.execute(query).scalars().all()
        cache_set(BRANCH_CACHE_KEY, result, BRANCH_CACHE_TTL)
        return result

    query = select(Branch)
    if not include_inactive:
        query = query.where(Branch.is_active)
    if user.branch_id is not None:
        query = query.where(Branch.id == user.branch_id)
    return db.execute(query.order_by(Branch.name)).scalars().all()


@router.post("/branches", response_model=BranchOut, status_code=201)
def create_branch(
    payload: BranchCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("branches.manage")),
):
    branch = Branch(**payload.model_dump())
    db.add(branch)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Branch code already exists")
    log_action(db, user_id=user.id, action="branch.created", entity_type="branch",
               entity_id=str(branch.id), new_value={"code": branch.code, "name": branch.name})
    db.commit()
    _invalidate_branch_cache()
    return branch


@router.patch("/branches/{branch_id}", response_model=BranchOut)
def update_branch(
    branch_id: int,
    payload: BranchUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("branches.manage")),
):
    branch = db.get(Branch, branch_id)
    if branch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
    changes = payload.model_dump(exclude_unset=True)
    old = {k: str(getattr(branch, k)) for k in changes}
    for k, v in changes.items():
        setattr(branch, k, v)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Branch code already exists")
    log_action(db, user_id=user.id, action="branch.updated", entity_type="branch",
               entity_id=str(branch.id), old_value=old,
               new_value={k: str(v) for k, v in changes.items()})
    db.commit()
    _invalidate_branch_cache()
    return branch


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db), _: User = Depends(require_permission("users.manage"))):
    return db.execute(select(Role).order_by(Role.name)).scalars().all()


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_permission("users.manage"))):
    users = db.execute(
        select(User).outerjoin(Branch, User.branch_id == Branch.id).order_by(User.username)
    ).scalars().all()
    return [_user_out(db, u) for u in users]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission("users.manage")),
):
    if len(payload.password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password must be at least 8 characters")
    if db.get(Role, payload.role_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid role")
    user = User(
        username=payload.username,
        full_name=payload.full_name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role_id=payload.role_id,
        branch_id=payload.branch_id,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Username or email already exists")
    log_action(db, user_id=admin.id, action="user.created", entity_type="user",
               entity_id=str(user.id), new_value={"username": user.username, "role_id": user.role_id})
    db.commit()
    return _user_out(db, user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission("users.manage")),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    changes = payload.model_dump(exclude_unset=True)
    if "password" in changes:
        password = changes.pop("password")
        if password:
            if len(password) < 8:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password must be at least 8 characters")
            user.password_hash = hash_password(password)
    old = {k: str(getattr(user, k)) for k in changes}
    for k, v in changes.items():
        setattr(user, k, v)
    log_action(db, user_id=admin.id, action="user.updated", entity_type="user",
               entity_id=str(user.id), old_value=old,
               new_value={k: str(v) for k, v in changes.items()})
    # If the role changed, invalidate the cached permission set so the next
    # request for this user loads the new permissions from the database.
    if "role_id" in changes:
        cache_invalidate(f"perms:{user.id}")
    db.commit()
    return _user_out(db, user)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission("users.manage")),
):
    """Delete a user. Prevents self-deletion and deletion of the last admin."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    # Prevent deleting the last user with users.manage permission (last admin).
    admin_role = db.execute(
        select(Role).where(Role.name == "Administrator")
    ).scalar_one_or_none()
    if admin_role is not None and user.role_id == admin_role.id:
        admin_count = db.execute(
            select(func.count()).select_from(
                select(User).where(User.role_id == admin_role.id, User.is_active).subquery()
            )
        ).scalar_one()
        if admin_count <= 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Cannot delete the last administrator account",
            )
    log_action(db, user_id=admin.id, action="user.deleted", entity_type="user",
               entity_id=str(user.id), old_value={"username": user.username, "role_id": user.role_id})
    db.delete(user)
    db.commit()


class UserActivityItem(BaseModel):
    id: int
    type: str  # "sale" or "audit"
    action: str
    description: str
    amount: str | None
    status: str | None
    created_at: str


class UserActivitySummary(BaseModel):
    user_id: int
    username: str
    full_name: str
    role_name: str
    branch_name: str | None
    sales_count: int
    total_revenue: str
    voided_count: int
    returns_count: int
    audit_count: int
    items: list[UserActivityItem]
    total: int
    page: int
    page_size: int


@router.get("/users/{user_id}/activity", response_model=UserActivitySummary)
def user_activity(
    user_id: int,
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission("users.manage")),
):
    """Return a user's sales and audit-log activity for a selected date range."""
    from datetime import datetime, time, timezone

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    branch = db.get(Branch, user.branch_id) if user.branch_id else None

    dt_from = None
    dt_to = None
    if date_from:
        try:
            dt_from = datetime.combine(
                datetime.strptime(date_from, "%Y-%m-%d").date(), time.min, tzinfo=timezone.utc
            )
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid date_from format. Use YYYY-MM-DD.")
    if date_to:
        try:
            dt_to = datetime.combine(
                datetime.strptime(date_to, "%Y-%m-%d").date(), time.max, tzinfo=timezone.utc
            )
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid date_to format. Use YYYY-MM-DD.")

    # Sales by this cashier in the date range.
    sale_query = select(Sale).where(Sale.cashier_id == user_id)
    if dt_from:
        sale_query = sale_query.where(Sale.sold_at >= dt_from)
    if dt_to:
        sale_query = sale_query.where(Sale.sold_at <= dt_to)
    sales = db.execute(sale_query.order_by(Sale.sold_at.desc())).scalars().all()

    sales_count = sum(1 for s in sales if s.status == "COMPLETED")
    voided_count = sum(1 for s in sales if s.status == "VOIDED")
    total_revenue = sum((s.total for s in sales if s.status == "COMPLETED"), Decimal("0"))

    # Audit logs by this user in the date range.
    audit_query = select(AuditLog).where(AuditLog.user_id == user_id)
    if dt_from:
        audit_query = audit_query.where(AuditLog.created_at >= dt_from)
    if dt_to:
        audit_query = audit_query.where(AuditLog.created_at <= dt_to)
    audit_logs = db.execute(audit_query.order_by(AuditLog.created_at.desc())).scalars().all()
    audit_count = len(audit_logs)

    # Build a unified, paginated activity feed (sales + audit logs merged by time).
    all_items: list[UserActivityItem] = []
    for s in sales:
        all_items.append(UserActivityItem(
            id=s.id,
            type="sale",
            action=f"sale.{s.status.lower()}",
            description=f"Sale {s.receipt_number} - {s.payment_method.replace('_', ' ')}",
            amount=str(s.total),
            status=s.status,
            created_at=s.sold_at.isoformat() if s.sold_at else "",
        ))
    for log in audit_logs:
        all_items.append(UserActivityItem(
            id=log.id,
            type="audit",
            action=log.action,
            description=f"{log.action}" + (f" ({log.entity_type})" if log.entity_type else ""),
            amount=None,
            status=None,
            created_at=log.created_at.isoformat() if log.created_at else "",
        ))
    # Sort newest first.
    all_items.sort(key=lambda x: x.created_at, reverse=True)
    total = len(all_items)
    start = (page - 1) * page_size
    paged = all_items[start:start + page_size]

    return UserActivitySummary(
        user_id=user_id,
        username=user.username,
        full_name=user.full_name,
        role_name=user.role.name,
        branch_name=branch.name if branch else None,
        sales_count=sales_count,
        total_revenue=str(total_revenue),
        voided_count=voided_count,
        returns_count=0,
        audit_count=audit_count,
        items=paged,
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------- Audit Logs ----------

class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int | None
    user_name: str | None
    action: str
    entity_type: str | None
    entity_id: str | None
    branch_id: int | None
    branch_name: str | None
    old_value: dict | None
    new_value: dict | None
    is_offline: bool
    created_at: str


class PaginatedAuditLogs(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int


@router.get("/audit-logs", response_model=PaginatedAuditLogs)
def list_audit_logs(
    branch_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("audit_logs.view")),
):
    """View audit logs. Branch-scoped users only see their own branch."""
    if user.branch_id is not None:
        branch_id = user.branch_id
    elif branch_id is not None:
        enforce_branch_access(user, branch_id)

    query = select(AuditLog)
    if branch_id is not None:
        query = query.where(AuditLog.branch_id == branch_id)
    if action:
        query = query.where(AuditLog.action == action)
    if user_id:
        query = query.where(AuditLog.user_id == user_id)

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    logs = (
        db.execute(
            query.order_by(AuditLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    # Pre-load user and branch names for the current page of logs.
    user_ids = {log.user_id for log in logs if log.user_id is not None}
    branch_ids = {log.branch_id for log in logs if log.branch_id is not None}
    user_names: dict[int, str] = {}
    branch_names: dict[int, str] = {}
    if user_ids:
        for u in db.execute(select(User).where(User.id.in_(user_ids))).scalars().all():
            user_names[u.id] = u.full_name
    if branch_ids:
        for b in db.execute(select(Branch).where(Branch.id.in_(branch_ids))).scalars().all():
            branch_names[b.id] = b.name
    items = []
    for log in logs:
        items.append(AuditLogOut(
            id=log.id,
            user_id=log.user_id,
            user_name=user_names.get(log.user_id) if log.user_id else None,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            branch_id=log.branch_id,
            branch_name=branch_names.get(log.branch_id) if log.branch_id else None,
            old_value=log.old_value,
            new_value=log.new_value,
            is_offline=log.is_offline,
            created_at=log.created_at.isoformat() if log.created_at else None,
        ))
    return PaginatedAuditLogs(items=items, total=total, page=page, page_size=page_size)
