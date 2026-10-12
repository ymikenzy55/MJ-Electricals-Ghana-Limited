# MJ Electricals Website

Company website for MJ Electricals Ghana Limited. Managed entirely from the POS
admin panel — the POS is the control plane for products, orders, customers,
and site settings.

## Layout

```
Website/
├── backend/          FastAPI backend (port 8001) — IMPLEMENTED
│   ├── app/
│   │   ├── core/         config, database, security
│   │   ├── models/       website_users, website_orders, website_order_items,
│   │   │                 website_settings
│   │   ├── schemas/      Pydantic request/response models
│   │   ├── routers/      catalog, auth, checkout, admin
│   │   └── services/     catalog (reads POS tables), orders
│   ├── requirements.txt
│   └── .env
└── frontend/         Next.js frontend (port 3001) — placeholder, not built yet
```

## Architecture: shared database

The website backend **shares the same PostgreSQL database** as the POS backend:

- **Reads** the POS `products`, `product_variants`, `categories`, and
  `branch_inventory` tables directly — products marked
  `is_published_to_website = true` in the POS appear on the website instantly.
  No data duplication.
- **Writes** to its own tables (`website_*`), which it creates automatically on
  startup (idempotent `create_all`, only for website-owned tables).

## How the POS manages the website

In the POS sidebar under **Administration → Website Management** (visible to
users with `users.manage` permission):

- **Dashboard** — order/customer/product counts and paid revenue.
- **Orders** — list with status filter + pagination, order detail view, status
  changes (PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED, or
  CANCELLED). Badge shows pending-order count, refreshed every 30s.
- **Customers** — registered website users; click for details + order history.
- **Settings** — site name, hero text, contact info, social links, shipping
  fee, maintenance mode, announcement banner.

When creating a product in the POS, the **"Publish to Website"** checkbox
controls `is_published_to_website`.

## Auth

- **Website customers** register/login at `/api/v1/auth/*` (JWT).
- **POS → website admin API** uses a shared secret in the `X-Admin-Key` header
  (currently the `SECRET_KEY` from `.env` — change for production).

## Public API (website frontend)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/v1/catalog/products` | none | Published products + variants + stock |
| `GET /api/v1/catalog/categories` | none | Categories |
| `POST /api/v1/auth/register` | none | Customer signup |
| `POST /api/v1/auth/login` | none | Customer login → JWT |
| `POST /api/v1/checkout/order` | optional | Place order (guest or logged-in) |
| `GET /api/v1/health` | none | Health check |

Guest checkout requires: `guest_name`, `guest_email`, `guest_phone`, and
`guest_address` (for delivery orders). Pickup orders need `branch_id`.

## Running

```bash
# Backend (port 8001)
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001

# Frontend (port 3001) — not built yet
cd frontend && npm install && npm run dev
```

## TODO (frontend build)

- Home page, catalog browse/search, product detail, cart, checkout (guest +
  account), order tracking, account page.
- Match the approved design style; mobile responsive.
