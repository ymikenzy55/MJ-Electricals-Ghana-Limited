"""Order service: pricing, coupons, stock reservation, status workflow."""
import secrets
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    WebsiteCoupon, WebsiteOrder, WebsiteOrderItem, WebsiteSettings, WebsiteUser,
)
from app.schemas import CheckoutRequest, OrderStatusUpdate
from app.services import inventory
from app.services.catalog import get_variant_for_order

TWO = Decimal("0.01")

VALID_STATUSES = {"PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"}
# Allowed forward moves. Delivered and cancelled orders are final.
TRANSITIONS = {
    "PENDING": {"CONFIRMED", "PROCESSING", "CANCELLED"},
    "CONFIRMED": {"PROCESSING", "SHIPPED", "CANCELLED"},
    "PROCESSING": {"SHIPPED", "DELIVERED", "CANCELLED"},
    "SHIPPED": {"DELIVERED", "CANCELLED"},
    "DELIVERED": set(),
    "CANCELLED": set(),
}


def generate_order_number() -> str:
    """Human-readable unique order number like WEB-1A2B3C4D."""
    return "WEB-" + secrets.token_hex(4).upper()


def _settings(db: Session) -> WebsiteSettings:
    s = db.get(WebsiteSettings, 1)
    if s is None:
        s = WebsiteSettings(id=1)
        db.add(s)
        db.flush()
    return s


def evaluate_coupon(db: Session, code: str | None, subtotal: Decimal, lock: bool = False):
    """Return (discount, coupon_or_None, message). Never raises for bad codes
    when previewing; the caller decides whether a bad code blocks checkout."""
    if not code:
        return Decimal("0"), None, None
    stmt = select(WebsiteCoupon).where(func.upper(WebsiteCoupon.code) == code.strip().upper())
    if lock:
        stmt = stmt.with_for_update()
    c = db.execute(stmt).scalar_one_or_none()
    if c is None or not c.is_active:
        return Decimal("0"), None, "This coupon code is not valid."
    if c.expires_at and c.expires_at < datetime.now(timezone.utc):
        return Decimal("0"), None, "This coupon has expired."
    if c.max_uses is not None and c.used_count >= c.max_uses:
        return Decimal("0"), None, "This coupon has been fully redeemed."
    if subtotal < c.min_order:
        return Decimal("0"), None, f"Spend at least GH₵{c.min_order:,.2f} to use this coupon."
    if c.kind == "PERCENT":
        discount = (subtotal * c.value / Decimal("100")).quantize(TWO)
    else:
        discount = Decimal(str(c.value))
    discount = min(discount, subtotal).quantize(TWO)
    return discount, c, f"Coupon {c.code} applied."


def shipping_for(s: WebsiteSettings, fulfilment: str, merchandise_total: Decimal) -> Decimal:
    if fulfilment == "PICKUP":
        return Decimal("0.00")
    if s.free_shipping_threshold is not None and merchandise_total >= s.free_shipping_threshold:
        return Decimal("0.00")
    return Decimal(str(s.default_shipping_fee or 0)).quantize(TWO)


def quote(db: Session, subtotal: Decimal, fulfilment: str, coupon_code: str | None) -> dict:
    s = _settings(db)
    discount, coupon, msg = evaluate_coupon(db, coupon_code, subtotal)
    shipping = shipping_for(s, fulfilment, subtotal - discount)
    return {
        "subtotal": subtotal, "discount": discount, "shipping_fee": shipping,
        "total": (subtotal - discount + shipping).quantize(TWO),
        "coupon_code": coupon.code if coupon else None, "coupon_message": msg,
        "free_shipping_threshold": s.free_shipping_threshold,
    }


def create_order(db: Session, req: CheckoutRequest, user: WebsiteUser | None) -> WebsiteOrder:
    """Validate the cart against the published catalog, reserve stock and
    persist the order atomically."""
    if user is None:
        missing = []
        if not req.guest_name: missing.append("name")
        if not req.guest_email: missing.append("email")
        if not req.guest_phone: missing.append("phone")
        if req.fulfilment_type == "DELIVERY" and not req.guest_address:
            missing.append("delivery address")
        if missing:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Please provide your {', '.join(missing)}.")
    elif req.fulfilment_type == "DELIVERY" and not (req.guest_address or user.address):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please provide a delivery address.")

    if req.fulfilment_type == "PICKUP" and not req.branch_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a branch for pickup.")

    order_number = generate_order_number()
    # Merge duplicate variant lines (same variant, different option labels
    # still reserve from the same stock pool).
    items: list[WebsiteOrderItem] = []
    subtotal = Decimal("0")
    allocations: list[dict] = []
    totals_by_variant: dict[int, Decimal] = {}
    for ci in req.items:
        totals_by_variant[ci.variant_id] = totals_by_variant.get(ci.variant_id, Decimal("0")) + Decimal(ci.quantity)

    variants: dict[int, dict] = {}
    for vid in sorted(totals_by_variant):  # stable order avoids deadlocks
        v = get_variant_for_order(db, vid)
        if v is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "An item in your cart is no longer available. Please refresh your cart.")
        variants[vid] = v
    if req.fulfilment_type == "PICKUP":
        if not db.execute(text("SELECT 1 FROM branches WHERE id = :i AND is_active = true"), {"i": req.branch_id}).first():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That pickup branch is not available.")

    for vid in sorted(totals_by_variant):
        v = variants[vid]
        label = f"{v['product_name']}, {v['variant_name']}"
        allocations += inventory.reserve(
            db, vid, totals_by_variant[vid],
            req.branch_id if req.fulfilment_type == "PICKUP" else None,
            order_number, label,
        )

    for ci in req.items:
        v = variants[ci.variant_id]
        unit_price = Decimal(str(v["selling_price"]))
        qty = Decimal(ci.quantity)
        line_total = (unit_price * qty).quantize(TWO)
        subtotal += line_total
        # Image comes from the catalog only. If an option label matches one of
        # the product's extra images use that image, otherwise the main one.
        image = v["image_url"]
        if ci.option_label:
            for extra in v["extra_images"] or []:
                if isinstance(extra, dict) and extra.get("label") == ci.option_label and extra.get("url"):
                    image = extra["url"]
                    break
        items.append(WebsiteOrderItem(
            variant_id=ci.variant_id, product_name=v["product_name"],
            variant_name=v["variant_name"], sku=v["sku"],
            option_label=(ci.option_label or None), image_url=image,
            unit_price=unit_price, quantity=qty, line_total=line_total,
        ))

    s = _settings(db)
    discount, coupon, msg = evaluate_coupon(db, req.coupon_code, subtotal, lock=True)
    if req.coupon_code and coupon is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg or "Invalid coupon code.")
    if coupon:
        coupon.used_count += 1
    shipping = shipping_for(s, req.fulfilment_type, subtotal - discount)
    total = (subtotal - discount + shipping).quantize(TWO)

    order = WebsiteOrder(
        order_number=order_number,
        user_id=user.id if user else None,
        guest_name=None if user else req.guest_name,
        guest_email=None if user else str(req.guest_email).lower(),
        guest_phone=None if user else req.guest_phone,
        guest_address=(req.guest_address or (user.address if user else None)),
        status="PENDING", fulfilment_type=req.fulfilment_type,
        branch_id=req.branch_id if req.fulfilment_type == "PICKUP" else None,
        subtotal=subtotal, discount_amount=discount, coupon_code=coupon.code if coupon else None,
        shipping_fee=shipping, total=total,
        payment_method=req.payment_method, payment_status="UNPAID",
        notes=req.notes, stock_deducted=True, allocations=allocations,
    )
    order.items = items
    db.add(order)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not place the order, please try again.")
    db.refresh(order)
    return order


def apply_admin_update(db: Session, order: WebsiteOrder, upd: OrderStatusUpdate, admin_ref: int = 0) -> str | None:
    """Apply a status / payment / notes update. Returns the new status if it
    changed (so the caller can e-mail the customer)."""
    changed_status = None
    if upd.status and upd.status != order.status:
        if upd.status not in VALID_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid status. Valid: {', '.join(sorted(VALID_STATUSES))}")
        if upd.status not in TRANSITIONS[order.status]:
            raise HTTPException(status.HTTP_409_CONFLICT, f"An order that is {order.status.lower()} cannot be moved to {upd.status.lower()}.")
        if upd.status == "CANCELLED":
            cancel_order(db, order, upd.cancel_reason or "Cancelled by store")
        else:
            order.status = upd.status
        changed_status = upd.status
    if upd.admin_notes is not None:
        order.admin_notes = upd.admin_notes
    if upd.payment_status is not None:
        order.payment_status = upd.payment_status
    if upd.payment_reference is not None:
        order.payment_reference = upd.payment_reference
    if order.status == "DELIVERED" and order.payment_status == "UNPAID" and order.payment_method == "CASH_ON_DELIVERY":
        order.payment_status = "PAID"  # cash collected on delivery
    order.handled_by = admin_ref
    db.commit()
    db.refresh(order)
    return changed_status


def cancel_order(db: Session, order: WebsiteOrder, reason: str) -> None:
    """Cancel and return reserved stock + coupon use. Caller commits."""
    if order.status in ("DELIVERED", "CANCELLED"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"This order is already {order.status.lower()}.")
    if order.stock_deducted:
        inventory.release(db, order.allocations or [], order.order_number)
        order.stock_deducted = False
    if order.coupon_code:
        c = db.execute(select(WebsiteCoupon).where(WebsiteCoupon.code == order.coupon_code).with_for_update()).scalar_one_or_none()
        if c and c.used_count > 0:
            c.used_count -= 1
    if order.payment_status == "PAID":
        order.payment_status = "REFUNDED"
    order.status = "CANCELLED"
    order.cancel_reason = reason[:255]


def list_orders(
    db: Session, status_filter: str | None = None, page: int = 1, page_size: int = 20,
    q: str | None = None, payment_status: str | None = None,
) -> tuple[list[WebsiteOrder], int]:
    cond = []
    if status_filter:
        cond.append(WebsiteOrder.status == status_filter)
    if payment_status:
        cond.append(WebsiteOrder.payment_status == payment_status)
    if q:
        like = f"%{q.strip()}%"
        cond.append(or_(
            WebsiteOrder.order_number.ilike(like), WebsiteOrder.guest_name.ilike(like),
            WebsiteOrder.guest_email.ilike(like), WebsiteOrder.guest_phone.ilike(like),
            WebsiteOrder.user.has(or_(WebsiteUser.full_name.ilike(like), WebsiteUser.email.ilike(like), WebsiteUser.phone.ilike(like))),
        ))
    total = db.execute(select(func.count()).select_from(WebsiteOrder).where(*cond)).scalar_one()
    orders = db.execute(
        select(WebsiteOrder).where(*cond).order_by(desc(WebsiteOrder.created_at))
        .offset((page - 1) * page_size).limit(page_size)
    ).scalars().all()
    return orders, total


def get_order(db: Session, order_id: int) -> WebsiteOrder | None:
    return db.get(WebsiteOrder, order_id)


def count_pending_orders(db: Session) -> int:
    return db.execute(
        select(func.count()).select_from(WebsiteOrder).where(WebsiteOrder.status == "PENDING")
    ).scalar_one()
