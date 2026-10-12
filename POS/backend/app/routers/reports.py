import csv
import io
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import enforce_branch_access, require_permission
from app.models import (
    Branch,
    BranchInventory,
    Category,
    Customer,
    HeldSale,
    Product,
    ProductVariant,
    Return,
    Role,
    Sale,
    SaleItem,
    SalePayment,
    User,
)
from app.schemas.returns import DashboardOut, SalesReport

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    # Branch-scoped users are locked to their own branch.
    # Branchless users (admins) can view any branch or all branches.
    if user.branch_id is not None:
        branch_id = user.branch_id
    elif branch_id is not None:
        enforce_branch_access(user, branch_id)

    today_start = datetime.combine(date.today(), time.min, timezone.utc)
    today_end = datetime.combine(date.today(), time.max, timezone.utc)

    # Use SQL aggregates instead of loading all rows.
    sale_q = select(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0)).where(
        Sale.sold_at >= today_start, Sale.sold_at <= today_end, Sale.status != "VOIDED"
    )
    if branch_id is not None:
        sale_q = sale_q.where(Sale.branch_id == branch_id)
    sale_count, sale_revenue = db.execute(sale_q).one()

    return_q = select(func.count(Return.id)).where(Return.created_at >= today_start)
    if branch_id is not None:
        return_q = return_q.where(Return.branch_id == branch_id)
    return_count = db.execute(return_q).scalar_one()

    low_stock_q = select(func.count()).select_from(
        select(BranchInventory)
        .join(ProductVariant, BranchInventory.variant_id == ProductVariant.id)
        .where(BranchInventory.quantity <= ProductVariant.reorder_level)
    )
    if branch_id is not None:
        low_stock_q = low_stock_q.where(BranchInventory.branch_id == branch_id)
    low_stock_count = db.execute(low_stock_q).scalar_one()

    total_products = db.execute(select(func.count(Product.id)).where(Product.is_active)).scalar_one()
    total_customers = db.execute(select(func.count(Customer.id)).where(Customer.is_active)).scalar_one()

    held_q = select(func.count(HeldSale.id))
    if branch_id is not None:
        held_q = held_q.where(HeldSale.branch_id == branch_id)
    held_count = db.execute(held_q).scalar_one()

    recent = db.execute(
        select(
            Sale.receipt_number,
            Sale.total,
            Sale.sold_at,
            User.full_name.label("cashier_name"),
        )
        .outerjoin(User, Sale.cashier_id == User.id)
        .where(Sale.status != "VOIDED")
        .order_by(Sale.sold_at.desc())
        .limit(5)
    ).all()
    recent_sales = [
        {
            "receipt_number": r.receipt_number,
            "total": str(r.total),
            "sold_at": r.sold_at.isoformat(),
            "cashier_name": r.cashier_name,
        }
        for r in recent
    ]

    return DashboardOut(
        today_sales_count=sale_count,
        today_revenue=sale_revenue,
        today_returns_count=return_count,
        low_stock_count=low_stock_count,
        total_products=total_products,
        total_customers=total_customers,
        held_sales_count=held_count,
        recent_sales=recent_sales,
    )


@router.get("/sales", response_model=SalesReport)
def sales_report(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    # Branch-scoped users are locked to their own branch.
    # Branchless users (admins) can view any branch or all branches.
    if user.branch_id is not None:
        branch_id = user.branch_id
    elif branch_id is not None:
        enforce_branch_access(user, branch_id)

    q = select(Sale).where(Sale.status != "VOIDED")
    if date_from:
        q = q.where(Sale.sold_at >= datetime.combine(date_from, time.min, timezone.utc))
    if date_to:
        q = q.where(Sale.sold_at <= datetime.combine(date_to, time.max, timezone.utc))
    if branch_id is not None:
        q = q.where(Sale.branch_id == branch_id)

    sales = db.execute(q).scalars().all()
    total_revenue = sum(s.total for s in sales)
    total_discount = sum(s.discount_amount for s in sales)

    # By branch
    by_branch: dict[int, dict] = {}
    for s in sales:
        b = by_branch.setdefault(s.branch_id, {"branch_id": s.branch_id, "sales": 0, "revenue": Decimal("0")})
        b["sales"] += 1
        b["revenue"] += s.total
    branch_names = {b.id: b.name for b in db.execute(select(Branch)).scalars().all()}
    for v in by_branch.values():
        v["branch_name"] = branch_names.get(v["branch_id"], "Unknown")
        v["revenue"] = str(v["revenue"])

    # By cashier
    by_cashier: dict[int, dict] = {}
    for s in sales:
        c = by_cashier.setdefault(s.cashier_id, {"cashier_id": s.cashier_id, "sales": 0, "revenue": Decimal("0")})
        c["sales"] += 1
        c["revenue"] += s.total
    cashier_names = {u.id: u.full_name for u in db.execute(select(User)).scalars().all()}
    for v in by_cashier.values():
        v["cashier_name"] = cashier_names.get(v["cashier_id"], "Unknown")
        v["revenue"] = str(v["revenue"])

    # By product and category
    sale_ids = [s.id for s in sales]
    by_product: dict[int, dict] = {}
    by_category: dict[int, dict] = {}
    if sale_ids:
        rows = db.execute(
            select(SaleItem, ProductVariant, Product, Category)
            .join(ProductVariant, SaleItem.variant_id == ProductVariant.id)
            .join(Product, ProductVariant.product_id == Product.id)
            .outerjoin(Category, Product.category_id == Category.id)
            .where(SaleItem.sale_id.in_(sale_ids))
        ).all()
        for si, pv, p, cat in rows:
            prod = by_product.setdefault(p.id, {"product_id": p.id, "product_name": p.name, "quantity": Decimal("0"), "revenue": Decimal("0")})
            prod["quantity"] += si.quantity
            prod["revenue"] += si.line_total
            if cat:
                c = by_category.setdefault(cat.id, {"category_id": cat.id, "category_name": cat.name, "quantity": Decimal("0"), "revenue": Decimal("0")})
                c["quantity"] += si.quantity
                c["revenue"] += si.line_total

    for v in by_product.values():
        v["quantity"] = str(v["quantity"])
        v["revenue"] = str(v["revenue"])
    for v in by_category.values():
        v["quantity"] = str(v["quantity"])
        v["revenue"] = str(v["revenue"])

    return SalesReport(
        total_sales=len(sales),
        total_revenue=total_revenue,
        total_discount=total_discount,
        by_branch=list(by_branch.values()),
        by_cashier=list(by_cashier.values()),
        by_product=list(by_product.values()),
        by_category=list(by_category.values()),
    )


def _sales_detail_query(date_from, date_to, branch_id, search):
    """One flat row per sold line item — normalized so it exports to CSV cleanly."""
    q = (
        select(Sale, SaleItem)
        .join(SaleItem, SaleItem.sale_id == Sale.id)
        .order_by(Sale.sold_at.desc(), Sale.id, SaleItem.id)
    )
    if date_from:
        q = q.where(Sale.sold_at >= datetime.combine(date_from, time.min, timezone.utc))
    if date_to:
        q = q.where(Sale.sold_at <= datetime.combine(date_to, time.max, timezone.utc))
    if branch_id is not None:
        q = q.where(Sale.branch_id == branch_id)
    if search:
        q = q.where(Sale.receipt_number.ilike(f"%{search}%"))
    return q


def _sales_detail_row(sale: Sale, item: SaleItem) -> dict:
    return {
        "sale_id": sale.id,
        "receipt_number": sale.receipt_number,
        "sold_at": sale.sold_at.isoformat(),
        "branch_name": sale.branch.name if sale.branch else None,
        "cashier_name": sale.cashier.full_name if sale.cashier else None,
        "customer_name": sale.customer.name if sale.customer else "Walk-in",
        "product_name": item.product_name,
        "variant_name": item.variant_name,
        "sku": item.sku,
        "quantity": str(item.quantity),
        "unit_price": str(item.unit_price),
        "line_discount": str(item.line_discount),
        "line_total": str(item.line_total),
        "sale_subtotal": str(sale.subtotal),
        "sale_discount": str(sale.discount_amount),
        "tax_amount": str(sale.tax_amount),
        "sale_total": str(sale.total),
        "payment_method": sale.payment_method,
        "status": sale.status,
    }


def _resolve_report_branch(user: User, branch_id: int | None) -> int | None:
    if user.branch_id is not None:
        return user.branch_id
    if branch_id is not None:
        enforce_branch_access(user, branch_id)
    return branch_id


@router.get("/sales/detail")
def sales_detail_report(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    search: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    """Flat line-item report: one row per sold item with the parent sale's
    details repeated — structured so it maps directly onto CSV columns."""
    branch_id = _resolve_report_branch(user, branch_id)
    q = _sales_detail_query(date_from, date_to, branch_id, search)

    count_q = select(func.count()).select_from(q.subquery())
    total = db.execute(count_q).scalar_one()
    rows = db.execute(
        q.offset((page - 1) * page_size).limit(page_size)
    ).all()

    return {
        "items": [_sales_detail_row(s, si) for s, si in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/sales/export.csv")
def export_sales_report_csv(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    search: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    """Sales report as CSV, headed with the company name and report metadata."""
    branch_id = _resolve_report_branch(user, branch_id)
    q = _sales_detail_query(date_from, date_to, branch_id, search)
    rows = db.execute(q).all()

    branch_label = "All Branches"
    if branch_id is not None:
        b = db.get(Branch, branch_id)
        branch_label = b.name if b else f"Branch {branch_id}"

    generated = datetime.now().strftime("%Y-%m-%d %I:%M %p")
    period = f"{date_from or 'Beginning'} to {date_to or 'Present'}"

    headers = [
        "Receipt No", "Date", "Time", "Branch", "Cashier", "Customer",
        "Product", "Variant", "SKU", "Quantity", "Unit Price",
        "Line Discount", "Line Total", "Sale Subtotal", "Sale Discount",
        "Tax", "Sale Total", "Payment Method", "Status",
    ]

    def generate():
        buf = io.StringIO()
        w = csv.writer(buf)
        # Report header block — company and report identity first.
        w.writerow(["MJ Electricals Ghana Limited"])
        w.writerow(["Sales Report"])
        w.writerow(["Period:", period])
        w.writerow(["Branch:", branch_label])
        if search:
            w.writerow(["Search:", search])
        w.writerow(["Generated:", generated])
        w.writerow([])
        w.writerow(headers)
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        for sale, item in rows:
            dt = sale.sold_at
            w.writerow([
                sale.receipt_number,
                dt.strftime("%Y-%m-%d"),
                dt.strftime("%I:%M %p"),
                sale.branch.name if sale.branch else "",
                sale.cashier.full_name if sale.cashier else "",
                sale.customer.name if sale.customer else "Walk-in",
                item.product_name,
                item.variant_name,
                item.sku,
                str(item.quantity),
                str(item.unit_price),
                str(item.line_discount),
                str(item.line_total),
                str(sale.subtotal),
                str(sale.discount_amount),
                str(sale.tax_amount),
                str(sale.total),
                sale.payment_method.replace("_", " "),
                sale.status.replace("_", " "),
            ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    filename = f"sales_report_{date_from or 'all'}_{date_to or 'all'}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sales-trend")
def sales_trend(
    days: int = Query(default=30, ge=1, le=365),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    """Daily revenue/discount/tax series for the dashboard chart.

    Aggregated entirely in SQL and zero-filled in Python so the chart always
    has one point per day even on days with no sales.
    """
    if user.branch_id is not None:
        branch_id = user.branch_id
    elif branch_id is not None:
        enforce_branch_access(user, branch_id)

    end_day = date.today()
    start_day = end_day - timedelta(days=days - 1)
    start = datetime.combine(start_day, time.min, timezone.utc)
    end = datetime.combine(end_day, time.max, timezone.utc)

    day_col = func.date(Sale.sold_at).label("day")
    q = (
        select(
            day_col,
            func.count(Sale.id).label("sales"),
            func.coalesce(func.sum(Sale.total), 0).label("revenue"),
            func.coalesce(func.sum(Sale.discount_amount), 0).label("discount"),
            func.coalesce(func.sum(Sale.tax_amount), 0).label("tax"),
        )
        .where(Sale.sold_at >= start, Sale.sold_at <= end, Sale.status != "VOIDED")
        .group_by(day_col)
        .order_by(day_col)
    )
    if branch_id is not None:
        q = q.where(Sale.branch_id == branch_id)

    found = {}
    for r in db.execute(q).all():
        key = r.day.isoformat() if hasattr(r.day, "isoformat") else str(r.day)
        found[key] = {
            "sales": r.sales,
            "revenue": str(r.revenue),
            "discount": str(r.discount),
            "tax": str(r.tax),
        }

    points = []
    for i in range(days):
        d = (start_day + timedelta(days=i)).isoformat()
        row = found.get(d, {"sales": 0, "revenue": "0", "discount": "0", "tax": "0"})
        points.append({"date": d, **row})

    return {"days": days, "points": points}


@router.get("/top-products")
def top_products(
    limit: int = Query(default=10, ge=1, le=50),
    days: int = Query(default=30, ge=1, le=365),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    """Best-selling products by revenue over a trailing window."""
    if user.branch_id is not None:
        branch_id = user.branch_id
    elif branch_id is not None:
        enforce_branch_access(user, branch_id)

    start = datetime.combine(date.today() - timedelta(days=days - 1), time.min, timezone.utc)
    q = (
        select(
            SaleItem.product_name,
            func.coalesce(func.sum(SaleItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(SaleItem.line_total), 0).label("revenue"),
        )
        .join(Sale, SaleItem.sale_id == Sale.id)
        .where(Sale.sold_at >= start, Sale.status != "VOIDED")
        .group_by(SaleItem.product_name)
        .order_by(func.coalesce(func.sum(SaleItem.line_total), 0).desc())
        .limit(limit)
    )
    if branch_id is not None:
        q = q.where(Sale.branch_id == branch_id)

    return {
        "days": days,
        "items": [
            {
                "product_name": r.product_name,
                "quantity": str(r.quantity),
                "revenue": str(r.revenue),
            }
            for r in db.execute(q).all()
        ],
    }


@router.get("/payment-mix")
def payment_mix(
    days: int = Query(default=30, ge=1, le=365),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    """Revenue split by tender type, for the dashboard donut/legend."""
    if user.branch_id is not None:
        branch_id = user.branch_id
    elif branch_id is not None:
        enforce_branch_access(user, branch_id)

    start = datetime.combine(date.today() - timedelta(days=days - 1), time.min, timezone.utc)
    q = (
        select(
            SalePayment.method,
            func.count(SalePayment.id).label("count"),
            func.coalesce(func.sum(SalePayment.amount), 0).label("amount"),
        )
        .join(Sale, SalePayment.sale_id == Sale.id)
        .where(Sale.sold_at >= start, Sale.status != "VOIDED")
        .group_by(SalePayment.method)
        .order_by(func.coalesce(func.sum(SalePayment.amount), 0).desc())
    )
    if branch_id is not None:
        q = q.where(Sale.branch_id == branch_id)

    return {
        "days": days,
        "items": [
            {"method": r.method, "count": r.count, "amount": str(r.amount)}
            for r in db.execute(q).all()
        ],
    }


@router.get("/low-stock")
def low_stock(
    limit: int = Query(default=20, ge=1, le=100),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.view")),
):
    """Items at or below their reorder level, worst first."""
    if user.branch_id is not None:
        branch_id = user.branch_id
    elif branch_id is not None:
        enforce_branch_access(user, branch_id)

    qty = func.coalesce(BranchInventory.quantity, 0)
    q = (
        select(
            ProductVariant.id.label("variant_id"),
            Product.name.label("product_name"),
            ProductVariant.variant_name,
            ProductVariant.sku,
            ProductVariant.unit,
            qty.label("quantity"),
            ProductVariant.reorder_level,
        )
        .join(Product, ProductVariant.product_id == Product.id)
        .outerjoin(BranchInventory, BranchInventory.variant_id == ProductVariant.id)
        .where(ProductVariant.is_active, Product.is_active, qty <= ProductVariant.reorder_level)
        .order_by((ProductVariant.reorder_level - qty).desc())
        .limit(limit)
    )
    if branch_id is not None:
        q = q.where(BranchInventory.branch_id == branch_id)

    return {
        "items": [
            {
                "variant_id": r.variant_id,
                "product_name": r.product_name,
                "variant_name": r.variant_name,
                "sku": r.sku,
                "unit": r.unit,
                "quantity": str(r.quantity),
                "reorder_level": str(r.reorder_level),
            }
            for r in db.execute(q).all()
        ]
    }


@router.get("/daily-summary")
def daily_summary(
    date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.view")),
):
    """Daily sales summary broken down by branch and cashier.

    Branch-scoped users only see their own branch.
    Branchless users (admins) see all branches.
    Uses SQL aggregates for performance instead of loading all sales.
    """
    from datetime import date as date_cls
    target_date = date or date_cls.today()
    day_start = datetime.combine(target_date, time.min, timezone.utc)
    day_end = datetime.combine(target_date, time.max, timezone.utc)

    base_filter = [Sale.sold_at >= day_start, Sale.sold_at <= day_end, Sale.status != "VOIDED"]
    if user.branch_id is not None:
        base_filter.append(Sale.branch_id == user.branch_id)

    # Aggregate totals in SQL
    totals = db.execute(
        select(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0), func.coalesce(func.sum(Sale.discount_amount), 0))
        .where(*base_filter)
    ).one()
    total_sales, total_revenue, total_discount = totals

    # Aggregate by branch and cashier in SQL
    branch_q = (
        select(
            Sale.branch_id,
            Branch.name.label("branch_name"),
            func.count(Sale.id).label("total_sales"),
            func.coalesce(func.sum(Sale.total), 0).label("total_revenue"),
            func.coalesce(func.sum(Sale.discount_amount), 0).label("total_discount"),
        )
        .join(Branch, Sale.branch_id == Branch.id)
        .where(*base_filter)
        .group_by(Sale.branch_id, Branch.name)
    )
    branch_rows = db.execute(branch_q).all()

    # Aggregate by cashier in SQL
    cashier_q = (
        select(
            Sale.branch_id,
            Sale.cashier_id,
            User.full_name.label("cashier_name"),
            Role.name.label("role_name"),
            func.count(Sale.id).label("sales_count"),
            func.coalesce(func.sum(Sale.total), 0).label("revenue"),
        )
        .join(User, Sale.cashier_id == User.id)
        .outerjoin(Role, User.role_id == Role.id)
        .where(*base_filter)
        .group_by(Sale.branch_id, Sale.cashier_id, User.full_name, Role.name)
    )
    cashier_rows = db.execute(cashier_q).all()

    # Assemble branch list with cashiers
    branch_map: dict[int, dict] = {}
    for r in branch_rows:
        branch_map[r.branch_id] = {
            "branch_id": r.branch_id,
            "branch_name": r.branch_name,
            "total_sales": r.total_sales,
            "total_revenue": str(r.total_revenue),
            "total_discount": str(r.total_discount),
            "cashiers": [],
        }
    for r in cashier_rows:
        b = branch_map.get(r.branch_id)
        if b is not None:
            b["cashiers"].append({
                "cashier_id": r.cashier_id,
                "cashier_name": r.cashier_name or "Unknown",
                "role_name": r.role_name or "Unknown",
                "sales_count": r.sales_count,
                "revenue": str(r.revenue),
            })

    return {
        "date": target_date.isoformat(),
        "total_sales": total_sales,
        "total_revenue": str(total_revenue),
        "total_discount": str(total_discount),
        "branches": list(branch_map.values()),
    }
