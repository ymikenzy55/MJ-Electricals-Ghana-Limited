"""Stock reservation against the POS ``branch_inventory`` table.

Website orders reserve stock immediately so the POS and the website can never
oversell the same unit. The POS sync engine pushes inventory as deltas, so
these decrements merge safely with sales made offline at a branch.
"""
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session


def _system_user_id(db: Session) -> int:
    """StockMovement.user_id is mandatory, attribute website activity to the
    main administrator account."""
    uid = db.execute(text(
        "SELECT id FROM users WHERE username = 'admin' ORDER BY id LIMIT 1"
    )).scalar()
    if uid is None:
        uid = db.execute(text("SELECT id FROM users ORDER BY id LIMIT 1")).scalar()
    if uid is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Store is not configured yet")
    return uid


def _stock_rows(db: Session, variant_id: int, branch_id: int | None):
    """Lock and return (inventory_id, branch_id, quantity) rows, most stock first."""
    where = "bi.branch_id = :branch_id" if branch_id is not None else "br.is_active = true"
    return db.execute(text(f"""
        SELECT bi.id, bi.branch_id, bi.quantity
        FROM branch_inventory bi JOIN branches br ON br.id = bi.branch_id
        WHERE bi.variant_id = :vid AND bi.quantity > 0 AND {where}
        ORDER BY bi.quantity DESC, bi.id
        FOR UPDATE OF bi
    """), {"vid": variant_id, "branch_id": branch_id}).all()


def available(db: Session, variant_id: int, branch_id: int | None) -> Decimal:
    where = "bi.branch_id = :branch_id" if branch_id is not None else "br.is_active = true"
    return Decimal(str(db.execute(text(f"""
        SELECT COALESCE(SUM(bi.quantity), 0)
        FROM branch_inventory bi JOIN branches br ON br.id = bi.branch_id
        WHERE bi.variant_id = :vid AND {where}
    """), {"vid": variant_id, "branch_id": branch_id}).scalar_one()))


def reserve(db: Session, variant_id: int, qty: Decimal, branch_id: int | None,
            order_ref: str, label: str) -> list[dict]:
    """Deduct `qty` and return the allocation list. Raises 409 when short.
    Must run inside the caller's transaction (rolled back on failure)."""
    remaining = Decimal(qty)
    rows = _stock_rows(db, variant_id, branch_id)
    have = sum((Decimal(str(r.quantity)) for r in rows), Decimal("0"))
    if have < remaining:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"\"{label}\" only has {have.normalize():f} unit(s) available (requested {Decimal(qty).normalize():f}).",
        )
    user_id = _system_user_id(db)
    allocations: list[dict] = []
    for r in rows:
        if remaining <= 0:
            break
        take = min(remaining, Decimal(str(r.quantity)))
        new_qty = db.execute(text("""
            UPDATE branch_inventory SET quantity = quantity - :take, updated_at = now()
            WHERE id = :id AND quantity >= :take RETURNING quantity
        """), {"take": take, "id": r.id}).scalar()
        if new_qty is None:  # lost a race, caller retries / reports shortage
            raise HTTPException(status.HTTP_409_CONFLICT, f"\"{label}\" just sold out. Please refresh your cart.")
        db.execute(text("""
            INSERT INTO stock_movements
              (branch_id, variant_id, movement_type, quantity_change, quantity_after,
               reference_type, reference_id, reason, user_id, created_at)
            VALUES (:b, :v, 'WEB_ORDER', :chg, :after, 'WEB_ORDER', :ref, :reason, :uid, now())
        """), {"b": r.branch_id, "v": variant_id, "chg": -take, "after": new_qty,
               "ref": order_ref, "reason": f"Website order {order_ref}", "uid": user_id})
        allocations.append({"branch_id": r.branch_id, "variant_id": variant_id, "qty": str(take)})
        remaining -= take
    return allocations


def release(db: Session, allocations: list[dict], order_ref: str) -> None:
    """Put reserved stock back (order cancelled)."""
    if not allocations:
        return
    user_id = _system_user_id(db)
    for a in allocations:
        qty = Decimal(str(a["qty"]))
        row = db.execute(text("""
            UPDATE branch_inventory SET quantity = quantity + :q, updated_at = now()
            WHERE branch_id = :b AND variant_id = :v RETURNING quantity
        """), {"q": qty, "b": a["branch_id"], "v": a["variant_id"]}).scalar()
        if row is None:  # inventory row vanished, recreate it
            row = db.execute(text("""
                INSERT INTO branch_inventory (branch_id, variant_id, quantity, updated_at)
                VALUES (:b, :v, :q, now()) RETURNING quantity
            """), {"q": qty, "b": a["branch_id"], "v": a["variant_id"]}).scalar()
        db.execute(text("""
            INSERT INTO stock_movements
              (branch_id, variant_id, movement_type, quantity_change, quantity_after,
               reference_type, reference_id, reason, user_id, created_at)
            VALUES (:b, :v, 'WEB_CANCEL', :chg, :after, 'WEB_ORDER', :ref, :reason, :uid, now())
        """), {"b": a["branch_id"], "v": a["variant_id"], "chg": qty, "after": row,
               "ref": order_ref, "reason": f"Website order {order_ref} cancelled", "uid": user_id})
