import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Services" };

const SERVICES = [
  {
    title: "Product Supply",
    desc: "Cables, breakers, lighting, switches, panels and tools, genuine stock for projects of every size.",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
  {
    title: "Contractor Support",
    desc: "Bulk pricing, project quotations and reliable stock availability for contractors and facility managers.",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    title: "Nationwide Delivery",
    desc: "Order online and we deliver to your site or doorstep anywhere in Ghana.",
    icon: "M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0 2 2 0 00-4 0z",
  },
  {
    title: "Branch Pickup",
    desc: "Reserve online and collect same-day at the branch nearest to you, no delivery fee.",
    icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10",
  },
  {
    title: "Technical Advice",
    desc: "Not sure what you need? Our team helps you spec the right materials for the job.",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
  {
    title: "After-Sales Support",
    desc: "Warranty handling, returns and ongoing support on everything we sell.",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  },
];

export default function ServicesPage() {
  return (
    <div>
      <section className="bg-navy-dark px-4 py-7 sm:py-20 text-center sm:px-6">
        <h1 className="text-2xl sm:text-4xl font-black text-white">Our Services</h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/70">
          More than a store, a partner for your electrical projects.
        </p>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-6 sm:py-16 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-white p-6 transition hover:border-primary/30 hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon} /></svg>
              </span>
              <h2 className="mt-4 text-base font-bold text-ink">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-2xl bg-primary p-5 sm:p-8 text-center">
          <h2 className="text-xl font-black text-white">Need a quotation for your project?</h2>
          <p className="mt-2 text-sm text-white/70">Send us your bill of quantities or give us a call.</p>
          <Link href="/contact" className="mt-5 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-bold text-primary hover:bg-white/90">
            Contact Us
          </Link>
        </div>
      </section>
    </div>
  );
}
