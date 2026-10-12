export interface UserInfo {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  role_name: string;
  permissions: string[];
  branch_id: number | null;
  branch_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserInfo;
}

export interface VariantLookup {
  variant_id: number;
  product_id: number;
  product_name: string;
  variant_name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  selling_price: string;
  available_quantity: string;
  image_url: string | null;
}

export interface CartLine {
  variant_id: number;
  product_name: string;
  variant_name: string;
  sku: string;
  unit: string;
  unit_price: number;
  quantity: number;
  available: number;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  customer_type: string;
  is_active: boolean;
}

export interface SaleItem {
  id: number;
  variant_id: number;
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: string;
  unit_price: string;
  line_discount: string;
  line_total: string;
  returned_quantity: string;
}

export interface SalePayment {
  id: number;
  method: string;
  amount: string;
  reference: string | null;
}

export interface Sale {
  id: number;
  transaction_id: string;
  receipt_number: string;
  branch_id: number;
  branch_name: string | null;
  cashier_id: number;
  cashier_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  subtotal: string;
  discount_amount: string;
  tax_rate?: string;
  tax_amount?: string;
  total: string;
  payment_method: string;
  is_offline?: boolean;
  sold_at: string;
  items: SaleItem[];
  payments?: SalePayment[];
}

export interface Shift {
  id: number;
  branch_id: number;
  user_id: number;
  user_name: string | null;
  status: string;
  opening_float: string;
  counted_cash: string | null;
  expected_cash: string | null;
  variance: string | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  sales_count: number;
  sales_total: string;
  cash_taken: string;
  cash_expenses?: string;
}

export interface PosConfig {
  company_name: string;
  company_tin: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  receipt_footer?: string;
  return_window_days?: number;
  tax_rate: number;
  tax_inclusive: boolean;
  currency: string;
  currency_symbol: string;
}

export interface TrendPoint {
  date: string;
  sales: number;
  revenue: string;
  discount: string;
  tax: string;
}

export interface TopProduct {
  product_name: string;
  quantity: string;
  revenue: string;
}

export interface PaymentMixItem {
  method: string;
  count: number;
  amount: string;
}

export interface LowStockItem {
  variant_id: number;
  product_name: string;
  variant_name: string;
  sku: string;
  unit: string;
  quantity: string;
  reorder_level: string;
}

/** A sale captured on-device while offline, awaiting sync. */
export interface QueuedSale {
  transaction_id: string;
  branch_id: number;
  customer_id: number | null;
  items: { variant_id: number; quantity: string }[];
  discount_amount: string;
  payment_method: string;
  payments?: { method: string; amount: string; reference?: string | null }[];
  is_offline: true;
  sold_at: string;
  /** Local-only display data so the receipt can be shown without the server. */
  local: {
    lines: { product_name: string; variant_name: string; quantity: number; unit_price: number }[];
    total: number;
    customer_name: string | null;
    customer_phone: string | null;
  };
  queued_at: string;
  attempts: number;
  last_error?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  is_active: boolean;
}

export interface Brand {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Variant {
  id: number;
  product_id: number;
  variant_name: string;
  sku: string;
  barcode: string | null;
  attributes: Record<string, string>;
  unit: string;
  cost_price: string | null;
  selling_price: string;
  reorder_level: string;
  is_active: boolean;
  stock_quantity: string | null;
}

export interface ExtraImage {
  url: string;
  label: string | null;
}

export interface Product {
  id: number;
  name: string;
  category_id: number | null;
  brand_id: number | null;
  category_name: string | null;
  brand_name: string | null;
  description: string | null;
  image_url: string | null;
  extra_images: ExtraImage[];
  is_active: boolean;
  is_published_to_website: boolean;
  variants: Variant[];
}

export interface InventoryRow {
  variant_id: number;
  product_name: string;
  variant_name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  quantity: string;
  reorder_level: string;
  selling_price: string;
  low_stock: boolean;
  image_url: string | null;
}

export interface Branch {
  id: number;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
}

export interface UserManage {
  id: number;
  username: string;
  full_name: string;
  email: string | null;
  role_name: string;
  permissions: string[];
  branch_id: number | null;
  branch_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
}
