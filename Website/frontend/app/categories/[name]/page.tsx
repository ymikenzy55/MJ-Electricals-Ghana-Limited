import type { Metadata } from "next";
import { Suspense } from "react";
import { serverApi } from "@/lib/server-api";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import CatalogBrowser from "@/components/CatalogBrowser";

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = decodeURIComponent((await params).name);
  return {
    title: category,
    description: `Shop ${category} at MJ Electricals Ghana Limited, genuine products, delivery or branch pickup.`,
    alternates: { canonical: `/categories/${encodeURIComponent(category)}` },
  };
}

export default async function CategoryPage({ params }: Props) {
  const category = decodeURIComponent((await params).name);
  const [res, categories] = await Promise.all([
    serverApi.products(`?page_size=100&category=${encodeURIComponent(category)}`),
    serverApi.categories(),
  ]);
  return (
    <div>
      <Breadcrumbs items={[{ label: "Products", href: "/products" }, { label: category }]} />
      <section className="bg-primary">
        <div className="mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-10">
          
          <h1 className="mt-1.5 text-xl font-black text-white sm:mt-3 sm:text-4xl">{category}</h1>
        </div>
      </section>
      <Suspense fallback={null}>
        <CatalogBrowser initial={res?.items ?? []} categories={categories ?? []} fixedCategory={category} />
      </Suspense>
    </div>
  );
}
