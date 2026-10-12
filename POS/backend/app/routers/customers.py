from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_permission
from app.models import Customer, User
from app.schemas.sale import CustomerCreate, CustomerOut, CustomerUpdate
from app.services.audit import log_action

router = APIRouter(prefix="/api/v1/customers", tags=["customers"])


@router.get("", response_model=list[CustomerOut])
def search_customers(
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("customers.view")),
):
    query = select(Customer).where(Customer.is_active)
    if q:
        term = f"%{q}%"
        query = query.where(or_(Customer.name.ilike(term), Customer.phone.ilike(term)))
    return db.execute(query.order_by(Customer.name).limit(limit)).scalars().all()


@router.post("", response_model=CustomerOut, status_code=201)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("customers.create")),
):
    if payload.phone:
        # Use EXISTS (stops at first match) instead of COUNT for a faster check.
        dup = db.execute(
            select(exists().where(Customer.phone == payload.phone, Customer.is_active))
        ).scalar()
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, "A customer with this phone already exists")
    customer = Customer(**payload.model_dump())
    db.add(customer)
    db.flush()
    log_action(
        db, user_id=user.id, action="customer.created", entity_type="customer",
        entity_id=str(customer.id), new_value={"name": customer.name, "phone": customer.phone},
    )
    db.commit()
    return customer


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("customers.view")),
):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    return customer


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("customers.update")),
):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    changes = payload.model_dump(exclude_unset=True)
    old = {k: str(getattr(customer, k)) for k in changes}
    for k, v in changes.items():
        setattr(customer, k, v)
    log_action(
        db, user_id=user.id, action="customer.updated", entity_type="customer",
        entity_id=str(customer.id), old_value=old,
        new_value={k: str(v) for k, v in changes.items()},
    )
    db.commit()
    return customer
