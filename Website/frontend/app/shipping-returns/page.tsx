import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Shipping & Returns", description: "Delivery, branch pickup, cancellations, returns and refunds at MJ Electricals Ghana Limited." };

export default function Page() {
  return (
    <PolicyPage title="Shipping & Returns" updated="1 January 2026">
      <section><h2>Delivery</h2><p>We deliver across Ghana. The delivery fee is shown at checkout before you place your order, and may be waived when your order passes the free delivery amount. Delivery times depend on your location, our team will confirm a time when we call to confirm your order.</p></section>
      <section><h2>Branch pickup</h2><p>Choose <strong>Branch Pickup</strong> at checkout to collect your order free of charge from any of our <Link href="/branches">branches</Link>. We&apos;ll let you know when it is ready. Please bring your order number and a valid ID.</p></section>
      <section><h2>Payment</h2><p>Orders are confirmed by our team. You can pay by mobile money, bank transfer, or cash on delivery / pickup. We never ask for card or PIN details over the website.</p></section>
      <section><h2>Cancelling an order</h2><p>You can cancel from <Link href="/account">My Account</Link> until we start preparing your order. After that, please <Link href="/contact">contact us</Link>. Items you cancel go straight back into stock and any payment is refunded.</p></section>
      <section><h2>Returns &amp; refunds</h2>
        <ul>
          <li>Faulty, damaged or incorrect items can be returned within 7 days of receipt with your order number.</li>
          <li>Electrical items must be unused, in original packaging, unless they are faulty.</li>
          <li>Items that were specially ordered or cut to length cannot be returned unless faulty.</li>
          <li>Approved refunds are made to the original payment method within 7 working days.</li>
        </ul>
      </section>
      <section><h2>Need help?</h2><p>Reach out on the <Link href="/contact">contact page</Link> and we&apos;ll sort it out.</p></section>
    </PolicyPage>
  );
}
