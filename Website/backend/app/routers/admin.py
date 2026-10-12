"""Admin router. Used by the POS website-management tab to manage website
orders, customers, coupons, reviews, messages and settings.

Authentication is a shared secret (ADMIN_API_KEY) sent by the POS server in
the X-Admin-Key header. The POS proxy enforces per-user permissions; this
service is not meant to be reachable from browsers.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.cache import invalidate
from app.core.config import settings as app_settings
from app.core.database import get_db
from app.core.security import constant_time_equals
from app.models import (
    WebsiteCoupon, WebsiteMessage, WebsiteOrder, WebsiteReview, WebsiteSettings, WebsiteUser,
)
from app.schemas import (
    CouponCreate, CouponOut, CouponUpdate, DashboardStats, MessageOut, OrderListOut, OrderOut,
    OrderStatusUpdate, ReviewOut, WebsiteSettingsOut, WebsiteSettingsUpdate, WebsiteUserOut,
)
from app.services import orders as svc
from app.services.catalog import count_published
from app.services.email import send_status_email


def verify_admin_key(x_admin_key: str | None = Header(default=None)):
    if not constant_time_equals(x_admin_key, app_settings.admin_key):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing admin API key")


router = APIRouter(prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(verify_admin_key)])


def _list_out(o: WebsiteOrder) -> OrderListOut:
    name = o.guest_name or (o.user.full_name if o.user else None)
    email = o.guest_email or (o.user.email if o.user else None)
    return OrderListOut(
        id=o.id, order_number=o.order_number, guest_name=name, guest_email=email,
        status=o.status, total=o.total, payment_status=o.payment_status,
        created_at=o.created_at, items_count=len(o.items),
    )


# ----------------------------- Dashboard -----------------------------

@router.get("/dashboard", response_model=DashboardStats)
def dashboard(db: Session = Depends(get_db)):
    agg = db.execute(text("""
        SELECT
          (SELECT COUNT(*) FROM website_orders) AS total_orders,
          (SELECT COUNT(*) FROM website_orders WHERE status = 'PENDING') AS pending,
          (SELECT COALESCE(SUM(total), 0) FROM website_orders WHERE payment_status = 'PAID') AS revenue,
          (SELECT COUNT(*) FROM website_users) AS customers,
          (SELECT COUNT(*) FROM website_messages WHERE NOT is_handled) AS unread,
          (SELECT COUNT(*) FROM website_orders WHERE created_at >= now() - interval '30 days' AND status <> 'CANCELLED') AS orders30,
          (SELECT COALESCE(SUM(total), 0) FROM website_orders WHERE created_at >= now() - interval '30 days' AND status <> 'CANCELLED') AS revenue30
    """)).mappings().one()
    since = datetime.now(timezone.utc) - timedelta(days=13)
    daily_rows = db.execute(text("""
        SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
        FROM website_orders WHERE created_at >= :since AND status <> 'CANCELLED'
        GROUP BY 1 ORDER BY 1
    """), {"since": since}).mappings().all()
    top = db.execute(text("""
        SELECT i.product_name AS name, SUM(i.quantity) AS units, SUM(i.line_total) AS revenue
        FROM website_order_items i JOIN website_orders o ON o.id = i.order_id
        WHERE o.status <> 'CANCELLED' GROUP BY i.product_name ORDER BY revenue DESC LIMIT 5
    """)).mappings().all()
    low = db.execute(text("""
        SELECT COUNT(*) FROM (
          SELECT pv.id FROM products p JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active
          WHERE p.is_published_to_website AND p.is_active
            AND COALESCE((SELECT SUM(bi.quantity) FROM branch_inventory bi WHERE bi.variant_id = pv.id), 0) <= 5
        ) x
    """)).scalar_one()
    return DashboardStats(
        total_orders=agg["total_orders"], pending_orders=agg["pending"],
        total_revenue=Decimal(str(agg["revenue"])), total_customers=agg["customers"],
        total_products=count_published(db), unread_messages=agg["unread"],
        low_stock_products=low, revenue_last_30_days=Decimal(str(agg["revenue30"])),
        orders_last_30_days=agg["orders30"],
        daily=[{"day": str(r["day"]), "orders": r["orders"], "revenue": float(r["revenue"])} for r in daily_rows],
        top_products=[{"name": r["name"], "units": float(r["units"]), "revenue": float(r["revenue"])} for r in top],
    )


@router.get("/notifications/pending-count")
def pending_count(db: Session = Depends(get_db)):
    """Pending-order + unread-message counts for the POS notification badge."""
    unread = db.execute(select(func.count()).select_from(WebsiteMessage).where(WebsiteMessage.is_handled.is_(False))).scalar_one()
    return {"count": svc.count_pending_orders(db), "messages": unread}


# ----------------------------- Orders -----------------------------

@router.get("/orders", response_model=list[OrderListOut])
def orders(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=100),
    payment_status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows, _ = svc.list_orders(db, status_filter, page, page_size, q, payment_status)
    return [_list_out(o) for o in rows]


@router.get("/orders/count")
def orders_count(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=100),
    payment_status: str | None = None,
    db: Session = Depends(get_db),
):
    _, total = svc.list_orders(db, status_filter, 1, 1, q, payment_status)
    return {"count": total}


@router.get("/orders/{order_id}", response_model=OrderOut)
def order_detail(order_id: int, db: Session = Depends(get_db)):
    o = svc.get_order(db, order_id)
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return o


@router.patch("/orders/{order_id}", response_model=OrderOut)
def change_order(order_id: int, upd: OrderStatusUpdate, background: BackgroundTasks, db: Session = Depends(get_db)):
    order = svc.get_order(db, order_id)
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    new_status = svc.apply_admin_update(db, order, upd)
    if new_status:
        background.add_task(send_status_email, order)
    return order


# ----------------------------- Users -----------------------------

@router.get("/users", response_model=list[WebsiteUserOut])
def list_users(
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(WebsiteUser)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(WebsiteUser.full_name.ilike(like) | WebsiteUser.email.ilike(like) | WebsiteUser.phone.ilike(like))
    return db.execute(stmt.order_by(WebsiteUser.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).scalars().all()


@router.get("/users/count")
def users_count(db: Session = Depends(get_db)):
    return {"count": db.execute(select(func.count()).select_from(WebsiteUser)).scalar_one()}


@router.get("/users/{user_id}", response_model=WebsiteUserOut)
def user_detail(user_id: int, db: Session = Depends(get_db)):
    u = db.get(WebsiteUser, user_id)
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return u


class UserActive(BaseModel):
    is_active: bool


@router.patch("/users/{user_id}", response_model=WebsiteUserOut)
def set_user_active(user_id: int, payload: UserActive, db: Session = Depends(get_db)):
    """Disable or re-enable a customer account (disabled users are signed out)."""
    u = db.get(WebsiteUser, user_id)
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    u.is_active = payload.is_active
    db.commit()
    db.refresh(u)
    return u


@router.get("/users/{user_id}/orders", response_model=list[OrderListOut])
def user_orders(user_id: int, db: Session = Depends(get_db)):
    rows = db.execute(
        select(WebsiteOrder).where(WebsiteOrder.user_id == user_id).order_by(WebsiteOrder.created_at.desc())
    ).scalars().all()
    return [_list_out(o) for o in rows]


# ----------------------------- Products -----------------------------

class PublishUpdate(BaseModel):
    is_published: bool


@router.get("/products")
def list_products(
    published: bool | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
):
    """POS products with their website-publish status."""
    sql = """
        SELECT p.id, p.name, p.image_url, p.is_published_to_website AS is_published,
               p.is_active, c.name AS category,
               (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true) AS variants_count
        FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE 1=1
    """
    params: dict = {}
    if published is not None:
        sql += " AND p.is_published_to_website = :published"
        params["published"] = published
    if q:
        sql += " AND p.name ILIKE :q"
        params["q"] = f"%{q}%"
    sql += " ORDER BY p.is_published_to_website DESC, p.name"
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


@router.patch("/products/{product_id}")
def toggle_publish(product_id: int, payload: PublishUpdate, db: Session = Depends(get_db)):
    res = db.execute(
        text("UPDATE products SET is_published_to_website = :pub, updated_at = now() WHERE id = :pid RETURNING id"),
        {"pub": payload.is_published, "pid": product_id},
    )
    if res.first() is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    db.commit()
    invalidate()
    return {"id": product_id, "is_published": payload.is_published}


# ----------------------------- Settings -----------------------------

def _settings_row(db: Session) -> WebsiteSettings:
    s = db.execute(select(WebsiteSettings).where(WebsiteSettings.id == 1)).scalar_one_or_none()
    if not s:
        s = WebsiteSettings(id=1)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("/settings", response_model=WebsiteSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _settings_row(db)


@router.patch("/settings", response_model=WebsiteSettingsOut)
def update_settings(payload: WebsiteSettingsUpdate, db: Session = Depends(get_db)):
    s = _settings_row(db)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    invalidate("site_settings")
    return s


# ----------------------------- Coupons -----------------------------

@router.get("/coupons", response_model=list[CouponOut])
def list_coupons(db: Session = Depends(get_db)):
    return db.execute(select(WebsiteCoupon).order_by(WebsiteCoupon.created_at.desc())).scalars().all()


@router.post("/coupons", response_model=CouponOut, status_code=201)
def create_coupon(payload: CouponCreate, db: Session = Depends(get_db)):
    if payload.kind == "PERCENT" and payload.value > 100:
        raise HTTPException(422, "A percentage discount cannot exceed 100")
    c = WebsiteCoupon(**{**payload.model_dump(), "code": payload.code.upper()})
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A coupon with that code already exists")
    db.refresh(c)
    return c


@router.patch("/coupons/{coupon_id}", response_model=CouponOut)
def update_coupon(coupon_id: int, payload: CouponUpdate, db: Session = Depends(get_db)):
    c = db.get(WebsiteCoupon, coupon_id)
    if not c:
        raise HTTPException(404, "Coupon not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/coupons/{coupon_id}", status_code=204)
def delete_coupon(coupon_id: int, db: Session = Depends(get_db)):
    c = db.get(WebsiteCoupon, coupon_id)
    if not c:
        raise HTTPException(404, "Coupon not found")
    db.delete(c)
    db.commit()


# ----------------------------- Reviews -----------------------------

class ReviewAdminOut(ReviewOut):
    is_visible: bool
    product_name: str | None = None


@router.get("/reviews", response_model=list[ReviewAdminOut])
def list_reviews(db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT r.id, r.product_id, r.author_name, r.rating, r.title, r.body, r.created_at, r.is_visible,
               (SELECT name FROM products WHERE id = r.product_id) AS product_name
        FROM website_reviews r ORDER BY r.created_at DESC LIMIT 200
    """)).mappings().all()
    return [dict(r) for r in rows]


class VisibleUpdate(BaseModel):
    is_visible: bool


@router.patch("/reviews/{review_id}")
def review_visibility(review_id: int, payload: VisibleUpdate, db: Session = Depends(get_db)):
    r = db.get(WebsiteReview, review_id)
    if not r:
        raise HTTPException(404, "Review not found")
    r.is_visible = payload.is_visible
    db.commit()
    invalidate("prod:")
    invalidate("cat:")
    return {"id": r.id, "is_visible": r.is_visible}


@router.delete("/reviews/{review_id}", status_code=204)
def delete_review(review_id: int, db: Session = Depends(get_db)):
    r = db.get(WebsiteReview, review_id)
    if not r:
        raise HTTPException(404, "Review not found")
    db.delete(r)
    db.commit()
    invalidate("prod:")
    invalidate("cat:")


# ----------------------------- Contact messages -----------------------------

@router.get("/messages", response_model=list[MessageOut])
def list_messages(handled: bool | None = None, db: Session = Depends(get_db)):
    stmt = select(WebsiteMessage)
    if handled is not None:
        stmt = stmt.where(WebsiteMessage.is_handled.is_(handled))
    return db.execute(stmt.order_by(WebsiteMessage.created_at.desc()).limit(200)).scalars().all()


class HandledUpdate(BaseModel):
    is_handled: bool


@router.patch("/messages/{message_id}", response_model=MessageOut)
def mark_message(message_id: int, payload: HandledUpdate, db: Session = Depends(get_db)):
    m = db.get(WebsiteMessage, message_id)
    if not m:
        raise HTTPException(404, "Message not found")
    m.is_handled = payload.is_handled
    db.commit()
    db.refresh(m)
    return m
