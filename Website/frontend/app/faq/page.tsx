import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "FAQ", description: "Answers to common questions about ordering, payment, delivery and returns." };

const QA: [string, string][] = [
  ["Do I need an account to order?", "No. You can check out as a guest. An account lets you see your order history, save your address and review products you've bought."],
  ["How do I pay?", "Choose mobile money, bank transfer or cash on delivery / pickup at checkout. Our team confirms your order and shares payment details where needed."],
  ["Can I collect my order myself?", "Yes, pick Branch Pickup at checkout and collect it free from the branch you choose."],
  ["How do I track my order?", "Use the Track Order page with your order number and the email or phone number you gave us, or sign in to see all your orders."],
  ["Can I change or cancel an order?", "You can cancel from My Account until we start preparing it. Otherwise contact us as soon as possible."],
  ["What if an item arrives faulty?", "Contact us within 7 days with your order number and we'll repair, replace or refund it."],
  ["Are the products genuine?", "Yes. We supply certified electrical materials from trusted manufacturers."],
];

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: QA.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  return (
    <PolicyPage title="Frequently asked questions" updated="1 January 2026">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {QA.map(([q, a]) => (
        <details key={q} className="group rounded-xl border border-border bg-white p-4 open:shadow-sm">
          <summary className="cursor-pointer text-sm font-bold text-ink">{q}</summary>
          <p className="mt-2">{a}</p>
        </details>
      ))}
      <p>Still stuck? <Link href="/contact">Contact us</Link> or <Link href="/track">track an order</Link>.</p>
    </PolicyPage>
  );
}
