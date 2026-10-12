"""Checkout router: place orders (guest or registered), quotes, tracking and
the signed-in customer's order history."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import WebsiteOrder, WebsiteUser
from app.routers.auth import get_current_user, get_optional_user
from app.schemas import (
    CheckoutRequest, OrderListOut, PublicOrderOut, QuoteOut, QuoteRequest, TrackRequest,
)
from app.services import orders as svc
from app.services.email import send_order_confirmation_email, send_status_email

router = APIRouter(prefix="/api/v1/checkout", tags=["checkout"])
limiter = Limiter(key_func=get_remote_address)


def _list_out(o: WebsiteOrder) -> OrderListOut:
    return OrderListOut(
        id=o.id, order_number=o.order_number, guest_name=o.guest_name,
        guest_email=o.guest_email, status=o.status, total=o.total,
        payment_status=o.payment_status, created_at=o.created_at, items_count=len(o.items),
    )


@router.post("/quote", response_model=QuoteOut)
@limiter.limit("60 per minute")
def get_quote(request: Request, req: QuoteRequest, db: Session = Depends(get_db)):
    """Totals preview: applies a coupon and the shipping rules."""
    return svc.quote(db, req.subtotal, req.fulfilment_type, req.coupon_code)


@router.post("/order", response_model=PublicOrderOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10 per minute")
def place_order(
    request: Request,
    background_tasks: BackgroundTasks,
    req: CheckoutRequest,
    db: Session = Depends(get_db),
    user: WebsiteUser | None = Depends(get_optional_user),
):
    """Place an order. Works for both guests and registered users."""
    order = svc.create_order(db, req, user)
    background_tasks.add_task(send_order_confirmation_email, order)
    return order


@router.post("/track", response_model=PublicOrderOut)
@limiter.limit("15 per minute")
def track_order(request: Request, req: TrackRequest, db: Session = Depends(get_db)):
    """Guest order tracking: order number + the e-mail or phone used."""
    contact = req.contact.strip().lower()
    digits = "".join(ch for ch in contact if ch.isdigit())
    order = db.execute(
        select(WebsiteOrder).where(func.upper(WebsiteOrder.order_number) == req.order_number.strip().upper())
    ).scalar_one_or_none()
    ok = False
    if order:
        if order.guest_email and order.guest_email.lower() == contact:
            ok = True
        elif digits and len(digits) >= 7 and order.guest_phone and "".join(c for c in order.guest_phone if c.isdigit()).endswith(digits[-9:]):
            ok = True
        elif order.user and (order.user.email.lower() == contact):
            ok = True
    if not ok:
        # Same answer whether the number or the contact was wrong.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn't find an order matching those details.")
    return order


@router.get("/my-orders", response_model=list[OrderListOut])
def my_orders(db: Session = Depends(get_db), user: WebsiteUser = Depends(get_current_user)):
    """Order history for the logged-in customer, newest first."""
    orders = db.execute(
        select(WebsiteOrder).where(WebsiteOrder.user_id == user.id).order_by(WebsiteOrder.created_at.desc())
    ).scalars().all()
    return [_list_out(o) for o in orders]


def _own_order(db: Session, order_id: int, user: WebsiteUser) -> WebsiteOrder:
    order = db.execute(
        select(WebsiteOrder).where(WebsiteOrder.id == order_id, WebsiteOrder.user_id == user.id)
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


@router.get("/my-orders/by-number/{order_number}", response_model=PublicOrderOut)
def my_order_by_number(order_number: str, db: Session = Depends(get_db), user: WebsiteUser = Depends(get_current_user)):
    order = db.execute(
        select(WebsiteOrder).where(
            func.upper(WebsiteOrder.order_number) == order_number.upper(), WebsiteOrder.user_id == user.id,
        )
    ).scalar_one_or_none()
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


@router.get("/my-orders/{order_id}", response_model=PublicOrderOut)
def my_order_detail(order_id: int, db: Session = Depends(get_db), user: WebsiteUser = Depends(get_current_user)):
    return _own_order(db, order_id, user)


@router.post("/my-orders/{order_id}/cancel", response_model=PublicOrderOut)
def cancel_my_order(
    order_id: int, background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), user: WebsiteUser = Depends(get_current_user),
):
    """Customers may cancel until the store starts processing the order."""
    order = _own_order(db, order_id, user)
    if order.status not in ("PENDING", "CONFIRMED"):
        raise HTTPException(status.HTTP_409_CONFLICT, "This order is already being prepared. Please contact us to change it.")
    svc.cancel_order(db, order, "Cancelled by customer")
    db.commit()
    db.refresh(order)
    background_tasks.add_task(send_status_email, order)
    return order
