import type { Metadata } from "next";
import { Suspense } from "react";
import { serverApi } from "@/lib/server-api";
import CatalogBrowser from "@/components/CatalogBrowser";

export const metadata: Metadata = {
  title: "Products",
  description: "Browse genuine electrical products, tools and equipment from MJ Electricals Ghana Limited.",
  alternates: { canonical: "/products" },
};

export default async function ProductsPage() {
  const [res, categories] = await Promise.all([
    serverApi.products("?page_size=100&sort=featured"),
    serverApi.categories(),
  ]);
  return (
    <div>
      <section className="bg-primary">
        <div className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-10">
          <h1 className="text-xl font-black text-white sm:text-4xl">Products</h1>
          <p className="mt-0.5 text-xs text-white/70 sm:mt-2 sm:text-sm">Genuine electrical products, tools and equipment.</p>
        </div>
      </section>
      <Suspense fallback={null}>
        <CatalogBrowser initial={res?.items} categories={categories ?? []} />
      </Suspense>
    </div>
  );
}
