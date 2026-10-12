import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About Us" };

const VALUES = [
  { title: "Genuine Products", desc: "Every item we sell is sourced from trusted manufacturers and distributors, no counterfeits, ever." },
  { title: "Fair Pricing", desc: "Transparent, competitive pricing for contractors, businesses and households across Ghana." },
  { title: "Expert Advice", desc: "Our team understands electrical work. We help you choose the right product for the job." },
  { title: "Nationwide Reach", desc: "With branches and delivery across Ghana, quality electricals are never far away." },
];

export default function AboutPage() {
  return (
    <div>
      <section className="bg-navy-dark px-4 py-7 sm:py-20 text-center sm:px-6">
        <h1 className="text-2xl sm:text-4xl font-black text-white">About MJ Electricals</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/70">
          MJ Electricals Ghana Limited is a trusted supplier of electrical products, tools and
          equipment, serving contractors, businesses and homes across Ghana with genuine
          products and dependable service.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-6 sm:py-16 sm:px-6">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-black text-ink">Who We Are</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              From cables and breakers to lighting, switches and industrial equipment, we stock
              the materials that keep Ghana powered. Whether you&apos;re wiring a new building,
              maintaining a facility, or tackling a home project, our shelves and our team are
              ready.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Order online for nationwide delivery, or visit any of our branches for personal
              service and same-day pickup.
            </p>
            <Link href="/products" className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">
              Browse Products
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {VALUES.map((v) => (
              <div key={v.title} className="rounded-xl border border-border bg-white p-5">
                <h3 className="text-sm font-bold text-ink">{v.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
