"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_URL } from "@/lib/site";

export interface Crumb { label: string; href?: string }

/** Clickable trail (Home / Products / Category …). The last item is the current page. */
export function Breadcrumbs({ items, className = "" }: { items: Crumb[]; className?: string }) {
  const all: Crumb[] = [{ label: "Home", href: "/" }, ...items];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({
      "@type": "ListItem", position: i + 1, name: c.label,
      ...(c.href ? { item: `${SITE_URL}${c.href}` } : {}),
    })),
  };
  return (
    <nav aria-label="Breadcrumb" className={`border-b border-border bg-surface ${className}`}>
      <ol className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto whitespace-nowrap px-3 py-2 text-[12px] text-muted [scrollbar-width:none] sm:px-6 sm:text-[13px] [&::-webkit-scrollbar]:hidden">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <svg className="h-3 w-3 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
              )}
              {last || !c.href ? (
                <span aria-current={last ? "page" : undefined} className="max-w-[60vw] truncate font-semibold text-ink sm:max-w-md">{c.label}</span>
              ) : (
                <Link href={c.href} className="shrink-0 rounded px-0.5 font-medium text-primary hover:underline">{c.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </nav>
  );
}

const LABELS: Record<string, string> = {
  products: "Products", categories: "Categories", cart: "Cart", checkout: "Checkout", confirmation: "Order confirmation",
  account: "My Account", orders: "Orders", track: "Track Order", wishlist: "Wishlist", login: "Sign In",
  register: "Create Account", "forgot-password": "Forgot Password", "reset-password": "Reset Password",
  about: "About Us", contact: "Contact", services: "Services", branches: "Branches", faq: "FAQ",
  terms: "Terms & Conditions", privacy: "Privacy Policy", "shipping-returns": "Shipping & Returns",
};

/** Builds the trail from the URL. Product and category pages render their own (they know the names). */
export default function AutoBreadcrumbs() {
  const pathname = usePathname() || "/";
  if (pathname === "/" || /^\/products\/\d+/.test(pathname) || pathname.startsWith("/categories/")) return null;
  const parts = pathname.split("/").filter(Boolean);
  const items: Crumb[] = parts.map((seg, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    const isId = /^\d+$/.test(seg);
    let label = LABELS[seg] ?? decodeURIComponent(seg).replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    if (isId && parts[i - 1] === "orders") label = "Order details";
    // "/account/orders" has no page of its own, link to the account page instead.
    const linkHref = seg === "orders" ? "/account" : href;
    return { label, href: i === parts.length - 1 ? undefined : linkHref };
  });
  return <Breadcrumbs items={items} />;
}
