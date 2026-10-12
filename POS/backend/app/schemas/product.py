from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    parent_id: int | None
    is_active: bool


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    parent_id: int | None = None


class BrandOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    is_active: bool


class BrandCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)


class VariantCreate(BaseModel):
    variant_name: str
    sku: str
    barcode: str | None = None
    attributes: dict = Field(default_factory=dict)
    unit: str = "pcs"
    cost_price: Decimal | None = None
    selling_price: Decimal = Field(ge=0)
    reorder_level: Decimal = Field(default=Decimal("0"), ge=0)


class VariantUpdate(BaseModel):
    variant_name: str | None = None
    barcode: str | None = None
    attributes: dict | None = None
    unit: str | None = None
    cost_price: Decimal | None = None
    selling_price: Decimal | None = Field(default=None, ge=0)
    reorder_level: Decimal | None = Field(default=None, ge=0)
    is_active: bool | None = None


class VariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_id: int
    variant_name: str
    sku: str
    barcode: str | None
    attributes: dict
    unit: str
    cost_price: Decimal | None
    selling_price: Decimal
    reorder_level: Decimal
    is_active: bool
    stock_quantity: Decimal | None = None


class ExtraImage(BaseModel):
    url: str = Field(max_length=512)
    label: str | None = Field(default=None, max_length=100)


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    category_id: int | None = None
    brand_id: int | None = None
    description: str | None = Field(default=None, max_length=2000)
    image_url: str | None = Field(default=None, max_length=512)
    extra_images: list[ExtraImage] = Field(default_factory=list, max_length=5)
    is_published_to_website: bool = False
    variants: list[VariantCreate] = Field(default_factory=list, max_length=100)
    initial_stock: Decimal | None = Field(default=None, ge=0)
    stock_branch_id: int | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    category_id: int | None = None
    brand_id: int | None = None
    description: str | None = None
    image_url: str | None = None
    extra_images: list[ExtraImage] | None = Field(default=None, max_length=5)
    is_active: bool | None = None
    is_published_to_website: bool | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    category_id: int | None
    brand_id: int | None
    category_name: str | None = None
    brand_name: str | None = None
    description: str | None
    image_url: str | None = None
    extra_images: list[ExtraImage] = []
    is_active: bool
    is_published_to_website: bool = False
    variants: list[VariantOut]


class VariantLookupOut(BaseModel):
    """Optimized payload for POS barcode/SKU scanning."""

    variant_id: int
    product_id: int
    product_name: str
    variant_name: str
    sku: str
    barcode: str | None
    unit: str
    selling_price: Decimal
    available_quantity: Decimal
    image_url: str | None = None


class PaginatedProducts(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    page_size: int


class PaginatedVariants(BaseModel):
    items: list[VariantLookupOut]
    total: int
    page: int
    page_size: int
