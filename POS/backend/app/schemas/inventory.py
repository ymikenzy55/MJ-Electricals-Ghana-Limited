from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class InventoryRow(BaseModel):
    variant_id: int
    product_name: str
    variant_name: str
    sku: str
    barcode: str | None
    unit: str
    quantity: Decimal
    reorder_level: Decimal
    selling_price: Decimal
    low_stock: bool
    image_url: str | None = None


class PaginatedInventory(BaseModel):
    items: list[InventoryRow]
    total: int
    page: int
    page_size: int


class AdjustmentIn(BaseModel):
    variant_id: int
    branch_id: int
    quantity_change: Decimal
    movement_type: str = Field(pattern="^(ADJUSTMENT|OPENING|DAMAGED|CORRECTION)$")
    reason: str | None = Field(default=None, max_length=255)


class StockMovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    branch_id: int
    variant_id: int
    movement_type: str
    quantity_change: Decimal
    quantity_after: Decimal
    reference_type: str | None
    reference_id: str | None
    reason: str | None
    user_id: int
    created_at: datetime


class PaginatedMovements(BaseModel):
    items: list[StockMovementOut]
    total: int
    page: int
    page_size: int
