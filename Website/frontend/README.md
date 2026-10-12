# MJ Electricals Website — Frontend

Next.js frontend for the MJ Electricals Ghana public website.

## Status

**Placeholder.** Per project plan, the public website frontend is intentionally
not built yet. Only the FastAPI backend (in `../backend`) has been implemented.

## When building the frontend

- Dev server runs on **port 3001** (`npm run dev`) to avoid conflicting with
  the POS frontend on port 3000.
- Set `NEXT_PUBLIC_API_URL=http://127.0.0.1:8001` in `.env.local` — the website
  backend (public catalog + checkout endpoints).
- Public endpoints available:
  - `GET /api/v1/catalog/products?category=&q=` — published products
  - `GET /api/v1/catalog/categories` — categories with published products
  - `POST /api/v1/auth/register` / `POST /api/v1/auth/login` — customer accounts
  - `POST /api/v1/checkout/order` — place an order (guest or authenticated)
- Styling should match the approved design (dark navy `#172235`, primary blue
  `#2F7DBD`, light workspace `#F5F7FA`) and be mobile-responsive.
