"""Excel product import — validates, previews, and safely imports.

Treats Excel files as untrusted input. Does NOT execute macros or formulas.
Returns a preview + error report before the user confirms the actual import.
"""

import io
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.auth import require_permission
from app.models import Brand, Category, Product, ProductVariant, User
from app.services.audit import log_action

try:
    from openpyxl import load_workbook
except ImportError:  # pragma: no cover
    load_workbook = None

router = APIRouter(prefix="/api/v1/imports", tags=["imports"])

REQUIRED_COLUMNS = [
    "Product Name", "SKU", "Barcode", "Category", "Brand",
    "Variant", "Unit", "Cost Price", "Selling Price", "Reorder Level",
]


@router.post("/products/preview")
async def preview_products(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.create")),
):
    if load_workbook is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "openpyxl not installed")
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only .xlsx files are supported")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 10MB)")

    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not read the Excel file")
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")

    headers = [str(h).strip() if h else "" for h in rows[0]]
    header_map = {h: i for i, h in enumerate(headers)}
    missing = [c for c in REQUIRED_COLUMNS if c not in header_map]
    if missing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Missing columns: {', '.join(missing)}")

    # Pre-load existing SKUs and barcodes for duplicate detection
    existing_skus = set(db.execute(select(ProductVariant.sku)).scalars())

    valid_rows: list[dict] = []
    errors: list[dict] = []

    for row_idx, row in enumerate(rows[1:], start=2):
        if row is None or all(c is None for c in row):
            continue
        def get(col):
            idx = header_map.get(col)
            return row[idx] if idx is not None and idx < len(row) else None

        name = get("Product Name")
        sku = get("SKU")
        barcode = get("Barcode")
        category = get("Category")
        brand = get("Brand")
        variant = get("Variant")
        unit = get("Unit") or "pcs"
        cost_price = get("Cost Price")
        selling_price = get("Selling Price")
        reorder_level = get("Reorder Level")

        row_errors: list[str] = []
        if not name:
            row_errors.append("Product Name is required")
        if not sku:
            row_errors.append("SKU is required")
        elif str(sku).strip() in existing_skus:
            row_errors.append(f"SKU '{sku}' already exists")
        if not selling_price:
            row_errors.append("Selling Price is required")
        else:
            try:
                sp = Decimal(str(selling_price))
                if sp < 0:
                    row_errors.append("Selling Price cannot be negative")
            except (InvalidOperation, ValueError):
                row_errors.append("Selling Price is not a valid number")
        if cost_price:
            try:
                Decimal(str(cost_price))
            except (InvalidOperation, ValueError):
                row_errors.append("Cost Price is not a valid number")
        if not variant:
            row_errors.append("Variant is required")

        if row_errors:
            errors.append({"row": row_idx, "errors": row_errors})
        else:
            valid_rows.append({
                "row": row_idx,
                "name": str(name).strip(),
                "sku": str(sku).strip(),
                "barcode": str(barcode).strip() if barcode else None,
                "category": str(category).strip() if category else None,
                "brand": str(brand).strip() if brand else None,
                "variant": str(variant).strip(),
                "unit": str(unit).strip() if unit else "pcs",
                "cost_price": str(cost_price) if cost_price else None,
                "selling_price": str(selling_price),
                "reorder_level": str(reorder_level) if reorder_level else "0",
            })

    wb.close()
    return {
        "total_rows": len(rows) - 1,
        "valid_rows": len(valid_rows),
        "error_rows": len(errors),
        "preview": valid_rows[:20],
        "errors": errors[:50],
    }


@router.post("/products/confirm")
async def confirm_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.create")),
):
    if load_workbook is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "openpyxl not installed")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large (max 10MB)")
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not read the Excel file")
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    headers = [str(h).strip() if h else "" for h in rows[0]]
    header_map = {h: i for i, h in enumerate(headers)}

    existing_skus = set(db.execute(select(ProductVariant.sku)).scalars())
    categories = {c.name: c for c in db.execute(select(Category)).scalars()}
    brands = {b.name: b for b in db.execute(select(Brand)).scalars()}
    products = {(p.name, p.category_id, p.brand_id): p for p in db.execute(select(Product)).scalars()}

    created_products = 0
    created_variants = 0
    skipped = 0

    for row in rows[1:]:
        if row is None or all(c is None for c in row):
            continue
        def get(col):
            idx = header_map.get(col)
            return row[idx] if idx is not None and idx < len(row) else None

        name = str(get("Product Name")).strip()
        sku = str(get("SKU")).strip()
        if sku in existing_skus:
            skipped += 1
            continue

        cat_name = str(get("Category")).strip() if get("Category") else None
        category = None
        if cat_name:
            category = categories.get(cat_name)
            if category is None:
                category = Category(name=cat_name)
                db.add(category)
                db.flush()
                categories[cat_name] = category

        brand_name = str(get("Brand")).strip() if get("Brand") else None
        brand = None
        if brand_name:
            brand = brands.get(brand_name)
            if brand is None:
                brand = Brand(name=brand_name)
                db.add(brand)
                db.flush()
                brands[brand_name] = brand

        key = (name, category.id if category else None, brand.id if brand else None)
        product = products.get(key)
        if product is None:
            product = Product(name=name, category_id=category.id if category else None, brand_id=brand.id if brand else None)
            db.add(product)
            db.flush()
            products[key] = product
            created_products += 1

        variant = ProductVariant(
            product_id=product.id,
            variant_name=str(get("Variant")).strip(),
            sku=sku,
            barcode=str(get("Barcode")).strip() if get("Barcode") else None,
            attributes={},
            unit=str(get("Unit")).strip() if get("Unit") else "pcs",
            cost_price=Decimal(str(get("Cost Price"))) if get("Cost Price") else None,
            selling_price=Decimal(str(get("Selling Price"))),
            reorder_level=Decimal(str(get("Reorder Level"))) if get("Reorder Level") else Decimal("0"),
        )
        db.add(variant)
        existing_skus.add(sku)
        created_variants += 1

    try:
        log_action(
            db, user_id=user.id, action="import.products", entity_type="import",
            new_value={"products_created": created_products, "variants_created": created_variants, "skipped": skipped},
        )
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Import failed - check for duplicate SKUs or invalid data")
    wb.close()
    return {
        "products_created": created_products,
        "variants_created": created_variants,
        "skipped_duplicates": skipped,
    }
