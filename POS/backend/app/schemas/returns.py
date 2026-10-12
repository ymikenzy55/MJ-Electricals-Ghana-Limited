from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ReturnItemIn(BaseModel):
    sale_item_id: int
    quantity: Decimal = Field(gt=0)
    restock: bool = True


class ReturnCreate(BaseModel):
    sale_id: int
    reason: str = Field(min_length=3, max_length=500)
    items: list[ReturnItemIn] = Field(min_length=1, max_length=200)


class ReturnItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sale_item_id: int
    quantity: Decimal
    refund_amount: Decimal
    restock: bool


class ReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    return_number: str
    sale_id: int
    branch_id: int
    processed_by: int
    reason: str
    total_refund: Decimal
    created_at: datetime
    items: list[ReturnItemOut]


class TransferItemIn(BaseModel):
    variant_id: int
    quantity: Decimal = Field(gt=0)


class TransferCreate(BaseModel):
    from_branch_id: int
    to_branch_id: int
    notes: str | None = Field(default=None, max_length=500)
    items: list[TransferItemIn] = Field(min_length=1, max_length=200)


class TransferItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    variant_id: int
    quantity: Decimal


class TransferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    transfer_number: str
    from_branch_id: int
    to_branch_id: int
    status: str
    requested_by: int
    approved_by: int | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    items: list[TransferItemOut]


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    phone: str | None
    email: str | None
    address: str | None
    notes: str | None
    is_active: bool
    created_at: datetime


class SupplierCreate(BaseModel):
    name: str = Field(min_length=2)
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    notes: str | None = None


class PurchaseItemIn(BaseModel):
    variant_id: int
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)


class PurchaseCreate(BaseModel):
    supplier_id: int | None = None
    branch_id: int
    notes: str | None = Field(default=None, max_length=500)
    items: list[PurchaseItemIn] = Field(min_length=1, max_length=200)


class PurchaseItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    purchase_id: int
    variant_id: int
    quantity: Decimal
    unit_cost: Decimal


class PurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    purchase_number: str
    supplier_id: int | None
    branch_id: int
    received_by: int
    status: str
    total_cost: Decimal
    notes: str | None
    created_at: datetime
    items: list[PurchaseItemOut]


class DashboardOut(BaseModel):
    today_sales_count: int
    today_revenue: Decimal
    today_returns_count: int
    low_stock_count: int
    total_products: int
    total_customers: int
    held_sales_count: int
    recent_sales: list[dict]


class SalesReport(BaseModel):
    total_sales: int
    total_revenue: Decimal
    total_discount: Decimal
    by_branch: list[dict]
    by_cashier: list[dict]
    by_product: list[dict]
    by_category: list[dict]
