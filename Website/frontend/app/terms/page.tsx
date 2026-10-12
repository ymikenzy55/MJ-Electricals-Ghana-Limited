import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Terms & Conditions", description: "Terms of use and sale for the MJ Electricals Ghana Limited online store." };

export default function Page() {
  return (
    <PolicyPage title="Terms & Conditions" updated="1 January 2026">
      <section><h2>1. About these terms</h2><p>By placing an order on this website you agree to these terms. The store is operated by MJ Electricals Ghana Limited (&quot;we&quot;, &quot;us&quot;).</p></section>
      <section><h2>2. Products and prices</h2><p>Prices are in Ghana cedis (GH₵) and are those shown when you order. Stock is reserved when you place an order. If an item cannot be supplied we will contact you and refund anything you have paid.</p></section>
      <section><h2>3. Orders</h2><p>An order is accepted when our team confirms it. We may decline or cancel an order in cases such as a pricing error, suspected fraud or stock problems.</p></section>
      <section><h2>4. Delivery, cancellation and returns</h2><p>See our <Link href="/shipping-returns">Shipping &amp; Returns</Link> policy.</p></section>
      <section><h2>5. Your account</h2><p>Keep your password private. You are responsible for activity under your account. We may suspend accounts that are misused.</p></section>
      <section><h2>6. Liability</h2><p>Nothing in these terms limits rights you have under Ghanaian consumer law. Otherwise our liability is limited to the value of the order concerned.</p></section>
      <section><h2>7. Contact</h2><p>Questions about these terms? <Link href="/contact">Contact us</Link>. See also our <Link href="/privacy">Privacy Policy</Link>.</p></section>
    </PolicyPage>
  );
}
