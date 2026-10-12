"""Public engagement endpoints: product reviews and the contact form."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.cache import invalidate
from app.core.database import get_db
from app.models import WebsiteMessage, WebsiteReview, WebsiteUser
from app.routers.auth import get_current_user, get_optional_user
from app.schemas import ContactCreate, ReviewCreate, ReviewOut, ReviewSummary
from app.services.email import send_contact_alert

router = APIRouter(prefix="/api/v1", tags=["engagement"])
limiter = Limiter(key_func=get_remote_address)


def _has_bought(db: Session, user_id: int, product_id: int) -> bool:
    return bool(db.execute(text("""
        SELECT 1 FROM website_orders o
        JOIN website_order_items i ON i.order_id = o.id
        JOIN product_variants pv ON pv.id = i.variant_id
        WHERE o.user_id = :u AND o.status = 'DELIVERED' AND pv.product_id = :p
        LIMIT 1
    """), {"u": user_id, "p": product_id}).first())


@router.get("/products/{product_id}/reviews", response_model=ReviewSummary)
def product_reviews(product_id: int, db: Session = Depends(get_db), user: WebsiteUser | None = Depends(get_optional_user)):
    rows = db.execute(
        select(WebsiteReview).where(WebsiteReview.product_id == product_id, WebsiteReview.is_visible.is_(True))
        .order_by(WebsiteReview.created_at.desc()).limit(50)
    ).scalars().all()
    count = db.execute(select(func.count()).select_from(WebsiteReview).where(
        WebsiteReview.product_id == product_id, WebsiteReview.is_visible.is_(True))).scalar_one()
    avg = db.execute(select(func.avg(WebsiteReview.rating)).where(
        WebsiteReview.product_id == product_id, WebsiteReview.is_visible.is_(True))).scalar()
    mine = bool(user and db.execute(select(WebsiteReview.id).where(
        WebsiteReview.product_id == product_id, WebsiteReview.user_id == user.id)).first())
    return ReviewSummary(
        average=round(float(avg), 1) if avg is not None else None, count=count,
        can_review=bool(user and not mine and _has_bought(db, user.id, product_id)),
        already_reviewed=mine, reviews=[ReviewOut.model_validate(r) for r in rows],
    )


@router.post("/products/{product_id}/reviews", response_model=ReviewOut, status_code=201)
@limiter.limit("10 per hour")
def add_review(request: Request, product_id: int, payload: ReviewCreate,
               user: WebsiteUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Only customers who received this product can review it (one review each)."""
    if not _has_bought(db, user.id, product_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only customers who have received this product can review it.")
    if db.execute(select(WebsiteReview.id).where(
            WebsiteReview.product_id == product_id, WebsiteReview.user_id == user.id)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already reviewed this product.")
    review = WebsiteReview(
        product_id=product_id, user_id=user.id, author_name=user.full_name.split(" ")[0] + " " + (user.full_name.split(" ")[-1][:1] + "." if " " in user.full_name else ""),
        rating=payload.rating, title=(payload.title or "").strip() or None, body=(payload.body or "").strip() or None,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    invalidate("prod:")
    invalidate("cat:")
    return review


@router.post("/contact", status_code=201)
@limiter.limit("5 per hour")
def send_message(request: Request, payload: ContactCreate, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Contact-form submission, stored for the POS admin and e-mailed to the store."""
    if payload.website:  # honeypot filled in => bot; pretend success
        return {"message": "Thank you, we'll be in touch shortly."}
    msg = WebsiteMessage(
        name=payload.name.strip(), email=str(payload.email).lower(), phone=(payload.phone or "").strip() or None,
        subject=(payload.subject or "").strip() or None, message=payload.message.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    background.add_task(send_contact_alert, msg)
    return {"message": "Thank you, we'll be in touch shortly."}
