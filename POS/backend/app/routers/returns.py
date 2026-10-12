from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import enforce_branch_access, require_permission
from app.models import Return, Sale, User
from app.schemas.returns import ReturnCreate, ReturnOut
from app.schemas.sale import SaleOut
from app.services.returns import process_return

router = APIRouter(prefix="/api/v1/returns", tags=["returns"])


@router.post("", response_model=ReturnOut, status_code=201)
def create_return(
    payload: ReturnCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.return")),
):
    sale = db.get(Sale, payload.sale_id)
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    enforce_branch_access(user, sale.branch_id)
    ret = process_return(db, payload, user)
    return ret


@router.get("", response_model=list[ReturnOut])
def list_returns(
    branch_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.view")),
):
    enforce_branch_access(user, branch_id)
    return db.execute(
        select(Return)
        .where(Return.branch_id == branch_id)
        .order_by(Return.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()


@router.get("/{return_id}", response_model=ReturnOut)
def get_return(
    return_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.view")),
):
    ret = db.get(Return, return_id)
    if ret is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Return not found")
    enforce_branch_access(user, ret.branch_id)
    return ret
