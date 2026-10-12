import io
import uuid
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, lazyload

from app.core.database import for_update, get_db
from app.dependencies.auth import enforce_branch_access, require_permission
from app.models import HeldSale, Sale, User
from app.schemas.sale import HeldSaleIn, HeldSaleOut, PaginatedSales, SaleCreate, SaleOut
from app.services.sales import create_sale, sale_to_out

router = APIRouter(prefix="/api/v1/sales", tags=["sales"])


def _sale_out(sale: Sale) -> SaleOut:
    return sale_to_out(sale)


@router.post("", response_model=SaleOut, status_code=201)
def new_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.create")),
):
    enforce_branch_access(user, payload.branch_id)
    if payload.discount_amount > 0 or any(i.line_discount > 0 for i in payload.items):
        from app.dependencies.auth import user_permissions

        if "discounts.apply" not in user_permissions(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing permission: discounts.apply")
    try:
        return create_sale(db, payload, user)
    except IntegrityError:
        # Concurrent retry of the same transaction_id: return the already-committed sale.
        db.rollback()
        sale = db.execute(
            select(Sale).where(Sale.transaction_id == payload.transaction_id)
        ).scalar_one_or_none()
        if sale is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Sale could not be processed")
        # Re-check branch access on the existing sale to prevent cross-branch data leaks.
        enforce_branch_access(user, sale.branch_id)
        if sale.branch_id != payload.branch_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Transaction belongs to a different branch")
    return _sale_out(sale)


@router.post("/sync", status_code=200)
def sync_offline_sales(
    payload: list[SaleCreate],
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.create")),
):
    """Replay sales captured while the terminal was offline.

    Each sale is processed independently so one bad record cannot block the
    rest of the queue. Because transaction_id is unique and create_sale is
    idempotent, replaying an already-synced sale is safe and reports as
    'duplicate' rather than creating a second sale.
    """
    if len(payload) > 200:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sync batch too large (max 200)")

    results: list[dict] = []
    for item in payload:
        try:
            enforce_branch_access(user, item.branch_id)
            existing = db.execute(
                select(Sale).where(Sale.transaction_id == item.transaction_id)
            ).scalar_one_or_none()
            if existing is not None:
                results.append({
                    "transaction_id": str(item.transaction_id),
                    "status": "duplicate",
                    "receipt_number": existing.receipt_number,
                    "sale_id": existing.id,
                })
                continue
            sale = create_sale(db, item, user)
            results.append({
                "transaction_id": str(item.transaction_id),
                "status": "synced",
                "receipt_number": sale.receipt_number,
                "sale_id": sale.id,
            })
        except HTTPException as e:
            db.rollback()
            results.append({
                "transaction_id": str(item.transaction_id),
                "status": "failed",
                "detail": e.detail,
            })
        except IntegrityError:
            db.rollback()
            existing = db.execute(
                select(Sale).where(Sale.transaction_id == item.transaction_id)
            ).scalar_one_or_none()
            results.append({
                "transaction_id": str(item.transaction_id),
                "status": "duplicate" if existing else "failed",
                "receipt_number": existing.receipt_number if existing else None,
                "sale_id": existing.id if existing else None,
            })
        except Exception:
            db.rollback()
            results.append({
                "transaction_id": str(item.transaction_id),
                "status": "failed",
                "detail": "Could not process this sale",
            })

    synced = sum(1 for r in results if r["status"] == "synced")
    duplicates = sum(1 for r in results if r["status"] == "duplicate")
    failed = sum(1 for r in results if r["status"] == "failed")
    return {
        "submitted": len(payload),
        "synced": synced,
        "duplicates": duplicates,
        "failed": failed,
        "results": results,
    }


@router.get("", response_model=PaginatedSales)
def list_sales(
    branch_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    cashier_id: int | None = None,
    customer_id: int | None = None,
    receipt_number: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.view")),
):
    query = select(Sale)
    # Branch filtering: branch users only see their own branch; admins can
    # optionally filter by a specific branch or see all branches at once.
    if branch_id is not None:
        enforce_branch_access(user, branch_id)
        query = query.where(Sale.branch_id == branch_id)
    elif user.branch_id is not None:
        query = query.where(Sale.branch_id == user.branch_id)
    if date_from:
        query = query.where(Sale.sold_at >= datetime.combine(date_from, time.min, timezone.utc))
    if date_to:
        query = query.where(Sale.sold_at <= datetime.combine(date_to, time.max, timezone.utc))
    if cashier_id:
        query = query.where(Sale.cashier_id == cashier_id)
    if customer_id:
        query = query.where(Sale.customer_id == customer_id)
    if receipt_number:
        query = query.where(Sale.receipt_number == receipt_number)
    if search:
        term = f"%{search}%"
        query = query.where(Sale.receipt_number.ilike(term))
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    sales = (
        db.execute(
            query.order_by(Sale.sold_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
        .scalars()
        .all()
    )
    return PaginatedSales(
        items=[_sale_out(s) for s in sales], total=total, page=page, page_size=page_size
    )


@router.get("/{transaction_id}", response_model=SaleOut)
def get_sale(
    transaction_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.view")),
):
    sale = db.execute(
        select(Sale).where(Sale.transaction_id == transaction_id)
    ).scalar_one_or_none()
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    enforce_branch_access(user, sale.branch_id)
    return _sale_out(sale)


@router.get("/by-id/{sale_id}", response_model=SaleOut)
def get_sale_by_id(
    sale_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.view")),
):
    """Look up a sale by its integer primary key (used by the sales history page)."""
    sale = db.get(Sale, sale_id)
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    enforce_branch_access(user, sale.branch_id)
    return _sale_out(sale)


@router.post("/by-id/{sale_id}/void", response_model=SaleOut)
def void_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.void")),
):
    """Void a sale: mark as VOIDED and restock all items (unless already returned)."""
    sale = db.get(Sale, sale_id)
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    enforce_branch_access(user, sale.branch_id)
    if sale.status == "VOIDED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sale is already voided")
    if sale.status in ("RETURNED", "PARTIALLY_RETURNED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot void a sale with returns - process a return instead")

    # Restock items that haven't been returned
    from app.models import BranchInventory, StockMovement
    from decimal import Decimal

    variant_ids = sorted({si.variant_id for si in sale.items if si.returned_quantity < si.quantity})
    if variant_ids:
        inv_rows = {
            row.variant_id: row
            for row in db.execute(
                for_update(
                    select(BranchInventory)
                    .options(lazyload("*"))  # plain row lock; eager joins are not allowed with FOR UPDATE
                    .where(
                        BranchInventory.branch_id == sale.branch_id,
                        BranchInventory.variant_id.in_(variant_ids),
                    )
                    .order_by(BranchInventory.variant_id)
                )
            ).scalars()
        }
        for si in sale.items:
            restock_qty = si.quantity - si.returned_quantity
            if restock_qty <= 0:
                continue
            inv = inv_rows.get(si.variant_id)
            if inv is None:
                inv = BranchInventory(branch_id=sale.branch_id, variant_id=si.variant_id, quantity=Decimal("0"))
                db.add(inv)
                db.flush()
            inv.quantity += restock_qty
            db.add(StockMovement(
                branch_id=sale.branch_id,
                variant_id=si.variant_id,
                movement_type="VOID",
                quantity_change=restock_qty,
                quantity_after=inv.quantity,
                reference_type="SALE_VOID",
                reference_id=str(sale.id),
                user_id=user.id,
            ))

    sale.status = "VOIDED"
    from app.services.audit import log_action
    log_action(
        db, user_id=user.id, action="sale.voided", entity_type="sale",
        entity_id=str(sale.id), branch_id=sale.branch_id,
        old_value={"status": "COMPLETED"}, new_value={"status": "VOIDED"},
    )
    db.commit()
    db.refresh(sale)
    return _sale_out(sale)


# ---------- Held sales ----------

@router.post("/held", response_model=HeldSaleOut, status_code=201)
def hold_sale(
    payload: HeldSaleIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.hold")),
):
    if user.branch_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User has no branch assignment")
    held = HeldSale(
        branch_id=user.branch_id,
        cashier_id=user.id,
        label=payload.label,
        cart_data=payload.cart_data,
    )
    db.add(held)
    db.commit()
    return held


@router.get("/held/mine", response_model=list[HeldSaleOut])
def my_held_sales(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.hold")),
):
    return (
        db.execute(
            select(HeldSale)
            .where(HeldSale.cashier_id == user.id)
            .order_by(HeldSale.created_at.desc())
        )
        .scalars()
        .all()
    )


@router.delete("/held/{held_id}", status_code=204)
def release_held_sale(
    held_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.hold")),
):
    held = db.get(HeldSale, held_id)
    if held is None or held.cashier_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Held sale not found")
    db.delete(held)
    db.commit()


@router.get("/export/excel")
def export_sales_excel(
    branch_id: int = Query(),
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.view")),
):
    """Export sales for a branch (optionally filtered by date) to an Excel file."""
    enforce_branch_access(user, branch_id)
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "openpyxl not installed")

    query = select(Sale).where(Sale.branch_id == branch_id, Sale.status != "VOIDED")
    if date_from:
        query = query.where(Sale.sold_at >= datetime.combine(date_from, time.min, timezone.utc))
    if date_to:
        query = query.where(Sale.sold_at <= datetime.combine(date_to, time.max, timezone.utc))
    sales = db.execute(query.order_by(Sale.sold_at.desc())).scalars().all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Sales"
    ws.append([
        "Receipt No", "Date & Time", "Cashier", "Customer", "Payment Method",
        "Product", "Variant", "SKU", "Quantity", "Unit Price", "Line Discount",
        "Line Total", "Sale Discount", "Sale Total", "Status",
    ])

    for s in sales:
        for item in s.items:
            ws.append([
                s.receipt_number,
                s.sold_at.strftime("%Y-%m-%d %H:%M"),
                s.cashier.full_name if s.cashier else "",
                s.customer.name if s.customer else "Walk-in",
                s.payment_method.replace("_", " "),
                item.product_name,
                item.variant_name,
                item.sku,
                float(item.quantity),
                float(item.unit_price),
                float(item.line_discount),
                float(item.line_total),
                float(s.discount_amount),
                float(s.total),
                s.status,
            ])

    # Auto-size columns
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"sales_branch_{branch_id}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
