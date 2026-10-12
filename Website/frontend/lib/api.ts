export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null; cache?: RequestCache } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      // Public GETs may be reused by the browser for a few seconds (the API
      // sends Cache-Control); anything with a token or body is never cached.
      cache: opts.cache ?? (opts.token || opts.body !== undefined || opts.method ? "no-store" : "default"),
    });
  } catch {
    throw new ApiError(0, "Can't reach the store right now. Check your connection and try again.");
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") msg = data.detail;
      else if (Array.isArray(data?.detail)) msg = data.detail.map((d: { msg?: string }) => (d.msg || "").replace(/^Value error, /, "")).join(", ");
    } catch {}
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ------------------------------- Types -------------------------------- */

export interface CatalogVariant {
  id: number;
  variant_name: string;
  sku: string;
  unit: string;
  selling_price: string;
  available_quantity: string;
  attributes: Record<string, string>;
}

export interface ExtraImage {
  url: string;
  label: string;
}

export interface CatalogProduct {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string | null;
  brand: string | null;
  extra_images: ExtraImage[];
  variants: CatalogVariant[];
  rating_avg?: number | null;
  rating_count?: number;
}

export interface PaginatedCatalogResponse {
  items: CatalogProduct[];
  total: number;
  page: number;
  page_size: number;
}

export interface SiteSettings {
  site_name: string;
  site_tagline: string;
  hero_title: string;
  hero_subtitle: string;
  hero_eyebrow: string | null;
  hero_cta_label: string | null;
  hero_image: string | null;
  contact_phone: string;
  contact_email: string;
  contact_address: string;
  social_facebook: string | null;
  social_instagram: string | null;
  social_twitter: string | null;
  default_shipping_fee: string;
  free_shipping_threshold?: string | null;
  is_maintenance_mode: boolean;
  announcement: string | null;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
}

export interface WebsiteUser {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TokenOut {
  access_token: string;
  token_type: string;
  user: WebsiteUser;
}

export interface OrderItem {
  id: number;
  variant_id: number;
  product_name: string;
  variant_name: string;
  sku: string;
  option_label: string | null;
  image_url: string | null;
  unit_price: string;
  quantity: string;
  line_total: string;
}

export interface Order {
  id: number;
  order_number: string;
  status: string;
  fulfilment_type: string;
  branch_id: number | null;
  subtotal: string;
  discount_amount?: string;
  coupon_code?: string | null;
  shipping_fee: string;
  total: string;
  payment_method: string;
  payment_status: string;
  payment_reference?: string | null;
  notes: string | null;
  cancel_reason?: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_address: string | null;
  created_at: string;
  items: OrderItem[];
}

export interface OrderListItem {
  id: number;
  order_number: string;
  status: string;
  total: string;
  payment_status: string;
  created_at: string;
  items_count: number;
}

export interface CheckoutPayload {
  items: { variant_id: number; quantity: number; option_label?: string }[];
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  guest_address?: string;
  fulfilment_type: "DELIVERY" | "PICKUP";
  branch_id?: number;
  payment_method: string;
  coupon_code?: string;
  notes?: string;
}

export interface Quote {
  subtotal: string;
  discount: string;
  shipping_fee: string;
  total: string;
  coupon_code: string | null;
  coupon_message: string | null;
  free_shipping_threshold: string | null;
}

export interface Review {
  id: number;
  product_id: number;
  author_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
}

export interface ReviewSummary {
  average: number | null;
  count: number;
  can_review: boolean;
  already_reviewed: boolean;
  reviews: Review[];
}

export interface ProductQuery {
  category?: string;
  q?: string;
  brand?: string;
  sort?: string;
  in_stock?: boolean;
  min_price?: number;
  max_price?: number;
  page?: number;
  page_size?: number;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== false) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/* ------------------------------ API calls ----------------------------- */

export const api = {
  /** One page of products (server-side search / filter / sort). */
  productsPage: (params: ProductQuery = {}) =>
    request<PaginatedCatalogResponse>(`/api/v1/catalog/products${qs({ ...params })}`),

  /** Every matching product, pages of 100 fetched in parallel after the first. */
  products: async (params: Omit<ProductQuery, "page" | "page_size"> = {}): Promise<CatalogProduct[]> => {
    const first = await request<PaginatedCatalogResponse>(`/api/v1/catalog/products${qs({ ...params, page: 1, page_size: 100 })}`);
    const pages = Math.min(Math.ceil(first.total / 100), 20);
    if (pages <= 1) return first.items;
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        request<PaginatedCatalogResponse>(`/api/v1/catalog/products${qs({ ...params, page: i + 2, page_size: 100 })}`)
      )
    );
    return [first, ...rest].flatMap((p) => p.items);
  },
  product: (id: number | string) => request<CatalogProduct>(`/api/v1/catalog/products/${id}`),
  related: (id: number | string, limit = 8) => request<CatalogProduct[]>(`/api/v1/catalog/products/${id}/related?limit=${limit}`),
  categories: () => request<string[]>("/api/v1/catalog/categories"),
  brands: () => request<string[]>("/api/v1/catalog/brands"),
  branches: () => request<Branch[]>("/api/v1/catalog/branches"),
  settings: () => request<SiteSettings>("/api/v1/catalog/site-settings"),

  register: (body: { full_name: string; email: string; phone: string; password: string; address?: string }) =>
    request<TokenOut>("/api/v1/auth/register", { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    request<TokenOut>("/api/v1/auth/login", { method: "POST", body }),
  requestPasswordReset: (email: string) =>
    request<{ message: string }>("/api/v1/auth/password-reset/request", { method: "POST", body: { email } }),
  resetPassword: (body: { token: string; password: string }) =>
    request<{ message: string }>("/api/v1/auth/password-reset/confirm", { method: "POST", body }),
  me: (token: string) => request<WebsiteUser>("/api/v1/auth/me", { token }),
  updateProfile: (token: string, body: { full_name?: string; phone?: string; address?: string }) =>
    request<WebsiteUser>("/api/v1/auth/me", { method: "PATCH", body, token }),
  changePassword: (token: string, body: { current_password: string; new_password: string }) =>
    request<TokenOut>("/api/v1/auth/change-password", { method: "POST", body, token }),

  quote: (body: { subtotal: number; fulfilment_type: string; coupon_code?: string }) =>
    request<Quote>("/api/v1/checkout/quote", { method: "POST", body }),
  checkout: (body: CheckoutPayload, token?: string | null) =>
    request<Order>("/api/v1/checkout/order", { method: "POST", body, token }),
  trackOrder: (body: { order_number: string; contact: string }) =>
    request<Order>("/api/v1/checkout/track", { method: "POST", body }),
  myOrders: (token: string) => request<OrderListItem[]>("/api/v1/checkout/my-orders", { token }),
  myOrder: (id: number | string, token: string) =>
    request<Order>(`/api/v1/checkout/my-orders/${id}`, { token }),
  myOrderByNumber: (orderNumber: string, token: string) =>
    request<Order>(`/api/v1/checkout/my-orders/by-number/${encodeURIComponent(orderNumber)}`, { token }),
  cancelOrder: (id: number | string, token: string) =>
    request<Order>(`/api/v1/checkout/my-orders/${id}/cancel`, { method: "POST", token }),

  reviews: (productId: number | string, token?: string | null) =>
    request<ReviewSummary>(`/api/v1/products/${productId}/reviews`, { token: token ?? undefined, cache: "no-store" }),
  addReview: (productId: number | string, token: string, body: { rating: number; title?: string; body?: string }) =>
    request<Review>(`/api/v1/products/${productId}/reviews`, { method: "POST", body, token }),
  contact: (body: { name: string; email: string; phone?: string; subject?: string; message: string; website?: string }) =>
    request<{ message: string }>("/api/v1/contact", { method: "POST", body }),
};

/* ------------------------------ Formatting ----------------------------- */

export function cedi(v: string | number): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "₵0.00";
  return `₵${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${fmtDate(iso)}, ${d.toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

export const PAYMENT_LABELS: Record<string, string> = {
  MOBILE_MONEY: "Mobile Money",
  CASH_ON_DELIVERY: "Cash on delivery / pickup",
  BANK_TRANSFER: "Bank transfer",
};
