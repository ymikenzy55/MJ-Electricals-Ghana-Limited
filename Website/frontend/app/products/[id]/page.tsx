import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_URL, serverApi } from "@/lib/server-api";
import ProductClient from "./ProductClient";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await serverApi.product(id);
  if (!p) return { title: "Product not found" };
  const price = p.variants.length ? Math.min(...p.variants.map((v) => parseFloat(v.selling_price))) : null;
  const description = (p.description || `${p.name} from MJ Electricals Ghana Limited.`).slice(0, 160);
  return {
    title: p.name,
    description: price ? `${description} From GH₵${price.toFixed(2)}.` : description,
    alternates: { canonical: `/products/${p.id}` },
    openGraph: { title: p.name, description, images: p.image_url ? [p.image_url] : undefined, type: "website" },
  };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [product, related] = await Promise.all([serverApi.product(id), serverApi.related(id)]);

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-7 sm:py-20 text-center">
        <h1 className="text-2xl font-black text-ink">This product isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been removed or is no longer sold online.</p>
        <Link href="/products" className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">Browse products</Link>
      </div>
    );
  }

  const prices = product.variants.map((v) => parseFloat(v.selling_price));
  const inStock = product.variants.some((v) => parseFloat(v.available_quantity) > 0);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: product.image_url ? [product.image_url, ...product.extra_images.map((e) => e.url)] : undefined,
    brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
    category: product.category || undefined,
    sku: product.variants[0]?.sku,
    ...(product.rating_count && product.rating_avg
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating_avg, reviewCount: product.rating_count } }
      : {}),
    offers: prices.length
      ? {
          "@type": "AggregateOffer", priceCurrency: "GHS", lowPrice: Math.min(...prices), highPrice: Math.max(...prices),
          offerCount: prices.length, url: `${SITE_URL}/products/${product.id}`,
          availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        }
      : undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ProductClient product={product} related={related ?? []} />
    </>
  );
}
