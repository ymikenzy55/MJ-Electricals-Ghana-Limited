import { Suspense } from "react";
import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import CatalogBrowser from "@/components/CatalogBrowser";
import HomeSettingsHero from "@/components/HomeSettingsHero";
import FindUs from "@/components/FindUs";

const FEATURES = [
  { title: "Genuine Products", desc: "Certified materials", href: "/products", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { title: "Shop Online", desc: "Delivery or pickup", href: "/products", icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" },
  { title: "Track Order", desc: "No account needed", href: "/track", icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" },
  { title: "Find a Branch", desc: "Visit us nationwide", href: "/branches#find-us", icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" },
];

export default async function HomePage() {
  // Rendered on the server from cached API data, products are in the first HTML.
  const [productsRes, categories] = await Promise.all([
    serverApi.products("?page_size=100&sort=featured"),
    serverApi.categories(),
  ]);

  return (
    <div>
      <HomeSettingsHero />

      <section className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-3 py-2.5 [scrollbar-width:none] sm:grid sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-border sm:px-0 sm:py-0 [&::-webkit-scrollbar]:hidden">
          {FEATURES.map((f) => (
            <Link key={f.title} href={f.href} className="group flex min-w-[9.5rem] shrink-0 items-center gap-2 rounded-lg bg-surface px-3 py-2 transition hover:bg-primary/5 sm:min-w-0 sm:rounded-none sm:bg-transparent sm:px-5 sm:py-4">
              <svg className="h-5 w-5 shrink-0 text-accent sm:h-6 sm:w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={f.icon} /></svg>
              <span className="leading-tight">
                <span className="block text-xs font-bold text-ink sm:text-sm">{f.title}</span>
                <span className="block text-[10px] text-muted sm:text-xs">{f.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {productsRes === null && (
        <p className="mx-auto max-w-7xl px-4 pt-6 text-center text-sm text-muted">We couldn&apos;t load products just now, showing what we have; please refresh in a moment.</p>
      )}
      <Suspense fallback={null}>
        <CatalogBrowser initial={productsRes?.items ?? []} categories={categories ?? []} title="Shop all products" />
      </Suspense>

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-2 sm:px-6"><FindUs /></div>
    </div>
  );
}
