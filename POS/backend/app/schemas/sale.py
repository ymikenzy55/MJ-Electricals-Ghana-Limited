import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SaleItemIn(BaseModel):
    variant_id: int
    quantity: Decimal = Field(gt=0)
    line_discount: Decimal = Field(default=Decimal("0"), ge=0)


PAYMENT_METHODS = "^(CASH|MOBILE_MONEY|CARD|BANK_TRANSFER)$"


class SalePaymentIn(BaseModel):
    method: str = Field(pattern=PAYMENT_METHODS)
    amount: Decimal = Field(gt=0)
    reference: str | None = Field(default=None, max_length=64)


class SaleCreate(BaseModel):
    transaction_id: uuid.UUID
    branch_id: int
    customer_id: int | None = None
    items: list[SaleItemIn] = Field(min_length=1, max_length=200)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    payment_method: str = Field(default="CASH", pattern=PAYMENT_METHODS)
    # Optional split payments. When supplied the amounts must cover the sale
    # total; payment_method is then recorded as the dominant tender.
    payments: list[SalePaymentIn] | None = Field(default=None, max_length=10)
    is_offline: bool = False
    sold_at: datetime | None = None


class SalePaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    method: str
    amount: Decimal
    reference: str | None


class SaleItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    variant_id: int
    product_name: str
    variant_name: str
    sku: str
    quantity: Decimal
    unit_price: Decimal
    line_discount: Decimal
    line_total: Decimal
    returned_quantity: Decimal


class SaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    transaction_id: uuid.UUID
    receipt_number: str
    branch_id: int
    branch_name: str | None = None
    cashier_id: int
    cashier_name: str | None = None
    customer_id: int | None
    customer_name: str | None = None
    customer_phone: str | None = None
    status: str
    subtotal: Decimal
    discount_amount: Decimal
    tax_rate: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    total: Decimal
    payment_method: str
    is_offline: bool
    sold_at: datetime
    items: list[SaleItemOut]
    payments: list[SalePaymentOut] = []


class PaginatedSales(BaseModel):
    items: list[SaleOut]
    total: int
    page: int
    page_size: int


class CustomerCreate(BaseModel):
    name: str = Field(min_length=2)
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    customer_type: str = Field(default="INDIVIDUAL", pattern="^(INDIVIDUAL|CONTRACTOR|BUSINESS|OTHER)$")


class CustomerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    customer_type: str | None = None
    is_active: bool | None = None


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    phone: str | None
    email: str | None
    address: str | None
    customer_type: str
    is_active: bool
    created_at: datetime


class HeldSaleIn(BaseModel):
    label: str | None = None
    cart_data: dict


class HeldSaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    label: str | None
    cart_data: dict
    created_at: datetime
