"use client";

import { useEffect, useState } from "react";
import { api, type CatalogProduct } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";
import { EmptyState, ProductCard, Spinner } from "@/components/ui";

export default function WishlistPage() {
  const { ids } = useWishlist();
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) { setProducts([]); return; }
    Promise.all(ids.map((id) => api.product(id).catch(() => null))).then((res) => {
      if (!cancelled) setProducts(res.filter((p): p is CatalogProduct => !!p));
    });
    return () => { cancelled = true; };
  }, [ids]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-10 sm:px-6">
      <h1 className="text-2xl sm:text-3xl font-black text-ink">Your wishlist</h1>
      <p className="mt-1 text-sm text-muted">Products you&apos;ve saved on this device.</p>
      <div className="mt-5 sm:mt-8">
        {products === null ? <Spinner label="Loading saved products…" /> : products.length === 0 ? (
          <EmptyState title="Nothing saved yet" hint="Tap the heart on any product to save it here." actionHref="/products" actionLabel="Browse products" />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
