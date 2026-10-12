"use client";

import Link from "next/link";
import { cedi, type CatalogProduct } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";

export function ProductImage({ src, alt, className, priority = false, width = 800 }: { src: string | null; alt: string; className?: string; priority?: boolean; width?: number }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-surface ${className || ""}`}>
        <svg className="h-10 w-10 text-faint" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path d="M13 2L4.5 13.5H11L9.5 22 19.5 10H13L13 2z" />
        </svg>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={optimise(src, width)} alt={alt} className={`object-cover ${className || ""}`}
      loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"}
    />
  );
}

/** Ask Cloudinary for a right-sized, auto-format image instead of the original upload. */
export function optimise(src: string, width = 800): string {
  const marker = "/image/upload/";
  if (src.includes("res.cloudinary.com") && src.includes(marker) && !/\/upload\/[a-z]_/.test(src)) {
    return src.replace(marker, `${marker}f_auto,q_auto,w_${width}/`);
  }
  return src;
}

export function Stars({ value, count, size = "h-3.5 w-3.5" }: { value: number | null | undefined; count?: number; size?: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${value} out of 5 stars`}>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <svg key={n} className={`${size} ${n <= Math.round(value) ? "text-amber-400" : "text-border"}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.8 4.8 17.6l1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
          </svg>
        ))}
      </span>
      {count !== undefined && <span className="text-[11px] text-faint">({count})</span>}
    </span>
  );
}

export function WishlistButton({ id, className = "" }: { id: number; className?: string }) {
  const { has, toggle } = useWishlist();
  const on = has(id);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(id); }}
      aria-pressed={on}
      aria-label={on ? "Remove from wishlist" : "Save to wishlist"}
      className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:scale-110 ${className}`}
    >
      <svg className={`h-4 w-4 ${on ? "fill-accent text-accent" : "fill-none text-muted"}`} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}

export function productPrice(p: CatalogProduct): { price: number; inStock: boolean } {
  const prices = p.variants.map((v) => parseFloat(v.selling_price));
  const stock = p.variants.reduce((s, v) => s + parseFloat(v.available_quantity || "0"), 0);
  return { price: prices.length ? Math.min(...prices) : 0, inStock: stock > 0 };
}

export function ProductCard({ product, priority = false }: { product: CatalogProduct; priority?: boolean }) {
  const { price, inStock } = productPrice(product);
  const multi = product.variants.length > 1;
  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-white transition hover:border-primary/30 hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-surface">
        <ProductImage
          src={product.image_url}
          alt={product.name}
          className="h-full w-full transition duration-300 group-hover:scale-105"
          width={420}
          priority={priority}
        />
        <WishlistButton id={product.id} className="absolute bottom-2 right-2" />
        {!inStock && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-error px-2 py-0.5 text-[10px] font-bold text-white sm:left-2 sm:top-2 sm:text-[11px]">
            Sold out
          </span>
        )}
        {product.category && (
          <span className="absolute right-1.5 top-1.5 hidden max-w-[70%] truncate rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-muted backdrop-blur sm:right-2 sm:top-2 sm:block sm:text-[11px]">
            {product.category}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink group-hover:text-primary sm:text-sm">{product.name}</h3>
        <Stars value={product.rating_avg} count={product.rating_count} />
        <div className="mt-auto flex items-center justify-between pt-2 sm:pt-3">
          <span className="text-sm font-bold text-primary sm:text-base">
            {cedi(price)}
            {multi && <span className="ml-1 text-[11px] font-normal text-faint">from</span>}
          </span>
          <span className="hidden rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100 md:inline">
            View
          </span>
        </div>
      </div>
    </Link>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning",
  CONFIRMED: "bg-info/10 text-info",
  PROCESSING: "bg-info/10 text-info",
  SHIPPED: "bg-primary/10 text-primary",
  DELIVERED: "bg-success/10 text-success",
  CANCELLED: "bg-error/10 text-error",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLES[status] || "bg-surface text-muted"}`}>
      {status}
    </span>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-6 sm:py-16 text-sm text-faint">
      <svg className="h-5 w-5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
      </svg>
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-center">
      <p className="text-sm font-medium text-error">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-full bg-error px-4 py-1.5 text-xs font-semibold text-white hover:bg-error/90">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, actionHref, actionLabel }: { title: string; hint?: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6 sm:p-12 text-center">
      <svg className="mx-auto h-10 w-10 text-faint" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path d="M20 7h-9M14 17H5M17 3v18M3 21h18" strokeLinecap="round" />
      </svg>
      <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {actionHref && (
        <Link href={actionHref} className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
          {actionLabel || "Browse products"}
        </Link>
      )}
    </div>
  );
}
