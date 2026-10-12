"""Sale processing.

The critical invariant: a sale and its inventory deductions commit atomically.
Row-level locks (SELECT ... FOR UPDATE) on branch_inventory prevent two
concurrent sales from both consuming the final unit of stock. The unique
transaction_id makes sale creation idempotent for offline/retry safety.
"""

import json
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session, lazyload
from app.core.database import IS_SQLITE, for_update

from app.core.config import settings
from app.models import (
    Branch,
    BranchInventory,
    Customer,
    ProductVariant,
    Sale,
    SaleItem,
    SalePayment,
    Shift,
    StockMovement,
    User,
)
from app.schemas.sale import SaleCreate, SaleOut
from app.services.app_settings import tax_settings
from app.services.audit import log_action

TWO_PLACES = Decimal("0.01")


def sale_to_out(sale: Sale) -> SaleOut:
    """Serialize a Sale for API responses.

    Safe to call on objects whose relationships are already loaded (joined,
    selectin, or populated in-memory) — it issues no additional queries.
    """
    out = SaleOut.model_validate(sale)
    out.cashier_name = sale.cashier.full_name if sale.cashier else None
    out.customer_name = sale.customer.name if sale.customer else None
    out.customer_phone = sale.customer.phone if sale.customer else None
    out.branch_name = sale.branch.name if sale.branch else None
    return out


def compute_tax(total: Decimal) -> tuple[Decimal, Decimal]:
    """Return (tax_rate, tax_amount) for a gross sale total.

    Tax-inclusive: the tax is backed out of the total the customer pays.
    Tax-exclusive: callers add the returned amount on top of the net total.
    """
    rate, inclusive = tax_settings()
    if rate <= 0:
        return Decimal("0"), Decimal("0")
    if inclusive:
        tax = (total - (total / (Decimal("1") + rate))).quantize(TWO_PLACES)
    else:
        tax = (total * rate).quantize(TWO_PLACES)
    return rate, tax


def create_sale(db: Session, payload: SaleCreate, cashier: User) -> SaleOut:
    # Fetch the independent lookups the sale needs: customer (validation +
    # receipt display), branch name, and the cashier's open shift. On the
    # remote Postgres database each query costs ~200ms, so they are batched
    # into one round trip; on local SQLite plain ORM lookups are cheap enough.
    # Idempotency is enforced by the unique transaction_id constraint — a
    # duplicate raises IntegrityError, which the caller already handles by
    # returning the committed sale.
    if IS_SQLITE:
        customer = db.get(Customer, payload.customer_id) if payload.customer_id is not None else None
        customer_row = (
            {
                "name": customer.name,
                "phone": customer.phone,
                "is_active": customer.is_active,
            }
            if customer is not None
            else None
        )
        branch_name = db.execute(
            select(Branch.name).where(Branch.id == payload.branch_id)
        ).scalar_one_or_none()
        shift_id = db.execute(
            select(Shift.id)
            .where(
                Shift.user_id == cashier.id,
                Shift.branch_id == payload.branch_id,
                Shift.status == "OPEN",
            )
            .limit(1)
        ).scalar_one_or_none()
    else:
        meta = db.execute(
            text(
                """
                SELECT
                    (SELECT row_to_json(c) FROM (
                        SELECT id, name, phone, is_active
                        FROM customers WHERE id = :cid
                    ) c) AS customer,
                    (SELECT name FROM branches WHERE id = :bid) AS branch_name,
                    (SELECT id FROM shifts
                     WHERE user_id = :uid AND branch_id = :bid AND status = 'OPEN'
                     LIMIT 1) AS shift_id
                """
            ),
            {"cid": payload.customer_id, "bid": payload.branch_id, "uid": cashier.id},
        ).one()
        customer_row = meta.customer
        if isinstance(customer_row, str):
            customer_row = json.loads(customer_row)
        branch_name = meta.branch_name
        shift_id = meta.shift_id

    if payload.customer_id is not None:
        if customer_row is None or not customer_row["is_active"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid customer")

    # Merge duplicate variant lines and lock inventory rows in a stable order to avoid deadlocks.
    quantities: dict[int, Decimal] = {}
    discounts: dict[int, Decimal] = {}
    for item in payload.items:
        quantities[item.variant_id] = quantities.get(item.variant_id, Decimal("0")) + item.quantity
        discounts[item.variant_id] = discounts.get(item.variant_id, Decimal("0")) + item.line_discount

    variant_ids = sorted(quantities)
    variants = {
        v.id: v
        for v in db.execute(
            select(ProductVariant).where(ProductVariant.id.in_(variant_ids))
        ).scalars()
    }
    for vid in variant_ids:
        v = variants.get(vid)
        if v is None or not v.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown or inactive product variant {vid}")

    inventory_rows = {
        row.variant_id: row
        for row in db.execute(
            for_update(
                select(BranchInventory)
                .options(lazyload("*"))  # plain row lock; eager joins are not allowed with FOR UPDATE
                .where(
                    BranchInventory.branch_id == payload.branch_id,
                    BranchInventory.variant_id.in_(variant_ids),
                )
                .order_by(BranchInventory.variant_id)
            )
        ).scalars()
    }

    subtotal = Decimal("0")
    sale_items: list[SaleItem] = []
    movements: list[StockMovement] = []

    for vid in variant_ids:
        variant = variants[vid]
        qty = quantities[vid]
        line_discount = discounts[vid]
        inv = inventory_rows.get(vid)
        available = inv.quantity if inv is not None else Decimal("0")
        if available < qty:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Insufficient stock for {variant.product.name} — {variant.variant_name} "
                f"(available: {available}, requested: {qty})",
            )

        line_total = (variant.selling_price * qty - line_discount).quantize(TWO_PLACES)
        if line_total < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Line discount exceeds line amount")
        subtotal += (variant.selling_price * qty).quantize(TWO_PLACES)

        inv.quantity = inv.quantity - qty
        sale_items.append(
            SaleItem(
                variant_id=vid,
                product_name=variant.product.name,
                variant_name=variant.variant_name,
                sku=variant.sku,
                quantity=qty,
                unit_price=variant.selling_price,
                line_discount=line_discount,
                line_total=line_total,
            )
        )
        movements.append(
            StockMovement(
                branch_id=payload.branch_id,
                variant_id=vid,
                movement_type="SALE",
                quantity_change=-qty,
                quantity_after=inv.quantity,
                reference_type="SALE",
                user_id=cashier.id,
            )
        )

    total_line_discounts = sum(discounts.values(), Decimal("0"))
    net = (subtotal - total_line_discounts - payload.discount_amount).quantize(TWO_PLACES)
    if net < 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Discount exceeds sale total")

    # Tax: inclusive prices keep the total as-is; exclusive prices add tax on top.
    tax_rate, tax_amount = compute_tax(net)
    total = net if tax_settings()[1] else (net + tax_amount).quantize(TWO_PLACES)

    # Validate split payments against the final total.
    payment_rows: list[SalePayment] = []
    payment_method = payload.payment_method
    if payload.payments:
        paid = sum((p.amount for p in payload.payments), Decimal("0")).quantize(TWO_PLACES)
        if paid < total:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Split payments total {paid} is less than the sale total {total}",
            )
        payment_rows = [
            SalePayment(method=p.method, amount=p.amount, reference=p.reference)
            for p in payload.payments
        ]
        # Dominant tender is the largest single payment.
        payment_method = max(payload.payments, key=lambda p: p.amount).method
    elif total > 0:
        payment_rows = [SalePayment(method=payment_method, amount=total)]

    sale = Sale(
        transaction_id=payload.transaction_id,
        receipt_number=f"TMP-{payload.transaction_id.hex[:20]}",
        branch_id=payload.branch_id,
        cashier_id=cashier.id,
        customer_id=payload.customer_id,
        shift_id=shift_id,
        subtotal=subtotal,
        discount_amount=payload.discount_amount,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total=total,
        payment_method=payment_method,
        is_offline=payload.is_offline,
        sold_at=payload.sold_at or datetime.now(timezone.utc),
        items=sale_items,
        payments=payment_rows,
    )
    db.add(sale)
    db.flush()
    # Receipt number derived from the primary key: unique and race-free under concurrency.
    sale.receipt_number = f"RCP-{payload.branch_id:02d}-{sale.id:06d}"

    for m in movements:
        m.reference_id = str(sale.id)
        db.add(m)

    log_action(
        db,
        user_id=cashier.id,
        action="sale.created",
        entity_type="sale",
        entity_id=str(sale.id),
        branch_id=payload.branch_id,
        new_value={
            "receipt_number": sale.receipt_number,
            "total": str(total),
            "discount": str(payload.discount_amount),
            "items": len(sale_items),
        },
        is_offline=payload.is_offline,
    )

    # Serialize while the object graph is still fully in-memory — items and
    # payments were populated at construction, so model_validate needs no
    # queries. Name fields come from the lookups already fetched above.
    out = SaleOut.model_validate(sale)
    out.cashier_name = cashier.full_name
    out.customer_name = customer_row["name"] if customer_row else None
    out.customer_phone = customer_row["phone"] if customer_row else None
    out.branch_name = branch_name
    db.commit()
    return out
