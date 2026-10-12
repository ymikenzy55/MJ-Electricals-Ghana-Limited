/**
 * API client for website administration.
 *
 * Calls are proxied through the POS backend (`/api/v1/website-admin/*`)
 * which enforces `website.manage` / `website.view` permissions and attaches
 * the website admin key server-side, it is never exposed to the browser.
 */

import { getToken } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export class WebsiteApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function websiteApi<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> {
  const { method = "GET", body, params } = options;
  // Callers pass the website-backend path ("/api/v1/admin/..."); strip it
  // down to the tail that the POS proxy forwards.
  const tail = path.replace(/^\/api\/v1\/admin\/?/, "");
  let url = `${API_BASE}/api/v1/website-admin/${tail}`;
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }

  const token = getToken();
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      msg = err.detail || err.message || msg;
    } catch {
      /* ignore */
    }
    throw new WebsiteApiError(msg, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Types
export interface WebsiteOrderListItem {
  id: number;
  order_number: string;
  guest_name: string | null;
  guest_email: string | null;
  status: string;
  total: string;
  payment_status: string;
  created_at: string;
  items_count: number;
}

export interface WebsiteOrderItem {
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

export interface WebsiteOrder {
  id: number;
  order_number: string;
  user_id: number | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_address: string | null;
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
  cancel_reason?: string | null;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  items: WebsiteOrderItem[];
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

export interface WebsiteDashboardStats {
  total_orders: number;
  pending_orders: number;
  total_revenue: string;
  total_customers: number;
  total_products: number;
  unread_messages?: number;
  low_stock_products?: number;
  revenue_last_30_days?: string;
  orders_last_30_days?: number;
  daily?: { day: string; orders: number; revenue: number }[];
  top_products?: { name: string; units: number; revenue: number }[];
}

export interface WebsiteCoupon {
  id: number;
  code: string;
  description: string | null;
  kind: "PERCENT" | "FIXED";
  value: string;
  min_order: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WebsiteReview {
  id: number;
  product_id: number;
  product_name: string | null;
  author_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_visible: boolean;
  created_at: string;
}

export interface WebsiteMessage {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  is_handled: boolean;
  created_at: string;
}

export interface WebsiteProduct {
  id: number;
  name: string;
  category: string | null;
  image_url: string | null;
  is_published: boolean;
  is_active: boolean;
  variants_count: number;
}

export interface WebsiteSettings {
  site_name: string;
  site_tagline: string;
  hero_title: string;
  hero_subtitle: string;
  hero_eyebrow: string | null;
  hero_cta_label: string;
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
