"""Idempotent seed: permissions, roles, main branch, admin user, and sample catalog.

Run:  python -m app.utils.seed
"""

import os

from decimal import Decimal

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.permissions import PERMISSIONS, ROLE_PERMISSIONS
from app.core.security import hash_password
from app.models import (
    Branch,
    BranchInventory,
    Brand,
    Category,
    Permission,
    Product,
    ProductVariant,
    Role,
    StockMovement,
    User,
)

SAMPLE_PRODUCTS = [
    {
        "name": "Electrical Cable",
        "category": "Cables",
        "brand": "Tropical Cables",
        "variants": [
            {"variant_name": "1.5mm x 100m Red", "sku": "CBL-15-100-RED", "barcode": "6001010000011",
             "attributes": {"size": "1.5mm", "length": "100m", "color": "Red"},
             "unit": "roll", "cost_price": "380.00", "selling_price": "450.00", "reorder_level": "5", "stock": "40"},
            {"variant_name": "2.5mm x 100m Blue", "sku": "CBL-25-100-BLU", "barcode": "6001010000028",
             "attributes": {"size": "2.5mm", "length": "100m", "color": "Blue"},
             "unit": "roll", "cost_price": "560.00", "selling_price": "650.00", "reorder_level": "5", "stock": "25"},
        ],
    },
    {
        "name": "LED Bulb",
        "category": "Lighting",
        "brand": "Philips",
        "variants": [
            {"variant_name": "12W Cool White E27", "sku": "BLB-12W-CW", "barcode": "6001020000017",
             "attributes": {"wattage": "12W", "voltage": "220V", "color": "Cool White", "base": "E27"},
             "unit": "pcs", "cost_price": "12.00", "selling_price": "18.00", "reorder_level": "20", "stock": "200"},
            {"variant_name": "9W Warm White E27", "sku": "BLB-9W-WW", "barcode": "6001020000024",
             "attributes": {"wattage": "9W", "voltage": "220V", "color": "Warm White", "base": "E27"},
             "unit": "pcs", "cost_price": "9.00", "selling_price": "14.00", "reorder_level": "20", "stock": "150"},
        ],
    },
    {
        "name": "Wall Socket",
        "category": "Sockets & Switches",
        "brand": "MK",
        "variants": [
            {"variant_name": "13A Double Switched", "sku": "SKT-13A-DBL", "barcode": "6001030000013",
             "attributes": {"rating": "13A", "gang": "2", "type": "Switched"},
             "unit": "pcs", "cost_price": "22.00", "selling_price": "35.00", "reorder_level": "10", "stock": "80"},
        ],
    },
    {
        "name": "Circuit Breaker",
        "category": "Protection",
        "brand": "Schneider",
        "variants": [
            {"variant_name": "20A Single Pole MCB", "sku": "MCB-20A-SP", "barcode": "6001040000019",
             "attributes": {"rating": "20A", "poles": "1", "curve": "C"},
             "unit": "pcs", "cost_price": "28.00", "selling_price": "45.00", "reorder_level": "10", "stock": "60"},
            {"variant_name": "32A Single Pole MCB", "sku": "MCB-32A-SP", "barcode": "6001040000026",
             "attributes": {"rating": "32A", "poles": "1", "curve": "C"},
             "unit": "pcs", "cost_price": "30.00", "selling_price": "48.00", "reorder_level": "10", "stock": "3"},
        ],
    },
]


def seed() -> None:
    db = SessionLocal()
    try:
        # Permissions
        existing = {p.code: p for p in db.execute(select(Permission)).scalars()}
        for code, description in PERMISSIONS.items():
            if code not in existing:
                p = Permission(code=code, description=description)
                db.add(p)
                existing[code] = p
        db.flush()

        # Roles
        roles = {r.name: r for r in db.execute(select(Role)).scalars()}
        for name, perm_codes in ROLE_PERMISSIONS.items():
            role = roles.get(name)
            if role is None:
                role = Role(name=name)
                db.add(role)
                roles[name] = role
            role.permissions = [existing[c] for c in perm_codes]
        db.flush()

        # Main branch
        branch = db.execute(select(Branch).where(Branch.code == "ACC-01")).scalar_one_or_none()
        if branch is None:
            branch = Branch(code="ACC-01", name="Accra Main Branch", address="Accra, Ghana")
            db.add(branch)
            db.flush()

        # Users
        def ensure_user(username, full_name, password, role_name, branch_id=None):
            user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
            if user is None:
                db.add(User(
                    username=username, full_name=full_name,
                    password_hash=hash_password(password),
                    role_id=roles[role_name].id, branch_id=branch_id,
                ))

        ensure_user("admin", "System Administrator", os.environ.get("SEED_ADMIN_PASSWORD", os.environ.get("SUPER_ADMIN_PASSWORD", "Admin@1234")), "Administrator")
        ensure_user("manager1", "Kofi Mensah", os.environ.get("SEED_MANAGER_PASSWORD", "Manager@1234"), "Manager", branch.id)
        ensure_user("cashier1", "Ama Serwaa", os.environ.get("SEED_CASHIER_PASSWORD", "Cashier@1234"), "Cashier", branch.id)
        db.flush()

        admin = db.execute(select(User).where(User.username == "admin")).scalar_one()

        # Sample catalog + opening stock
        for entry in SAMPLE_PRODUCTS:
            category = db.execute(select(Category).where(Category.name == entry["category"])).scalar_one_or_none()
            if category is None:
                category = Category(name=entry["category"])
                db.add(category)
                db.flush()
            brand = db.execute(select(Brand).where(Brand.name == entry["brand"])).scalar_one_or_none()
            if brand is None:
                brand = Brand(name=entry["brand"])
                db.add(brand)
                db.flush()
            product = db.execute(select(Product).where(Product.name == entry["name"])).scalar_one_or_none()
            if product is None:
                product = Product(name=entry["name"], category_id=category.id, brand_id=brand.id)
                db.add(product)
                db.flush()
            for v in entry["variants"]:
                variant = db.execute(
                    select(ProductVariant).where(ProductVariant.sku == v["sku"])
                ).scalar_one_or_none()
                if variant is not None:
                    continue
                stock = Decimal(v.pop("stock"))
                variant = ProductVariant(
                    product_id=product.id,
                    variant_name=v["variant_name"],
                    sku=v["sku"],
                    barcode=v["barcode"],
                    attributes=v["attributes"],
                    unit=v["unit"],
                    cost_price=Decimal(v["cost_price"]),
                    selling_price=Decimal(v["selling_price"]),
                    reorder_level=Decimal(v["reorder_level"]),
                )
                db.add(variant)
                db.flush()
                db.add(BranchInventory(branch_id=branch.id, variant_id=variant.id, quantity=stock))
                db.add(StockMovement(
                    branch_id=branch.id, variant_id=variant.id, movement_type="OPENING",
                    quantity_change=stock, quantity_after=stock,
                    reason="Opening stock (seed)", user_id=admin.id,
                ))

        db.commit()
        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
