import type { Metadata } from "next";
import Link from "next/link";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Privacy Policy", description: "How MJ Electricals Ghana Limited collects, uses and protects your personal data." };

export default function Page() {
  return (
    <PolicyPage title="Privacy Policy" updated="1 January 2026">
      <section><h2>What we collect</h2>
        <ul>
          <li>Details you give us: name, phone number, email, delivery address and order notes.</li>
          <li>Your order history and, if you create an account, your login email and an encrypted password.</li>
          <li>Messages you send through the contact form.</li>
        </ul>
      </section>
      <section><h2>How we use it</h2><p>To process and deliver your orders, tell you about their progress, provide customer support, prevent fraud and meet legal obligations. We do not sell your personal data.</p></section>
      <section><h2>Who sees it</h2><p>Our staff who process orders, and delivery or payment partners only to the extent needed to complete your order.</p></section>
      <section><h2>Security</h2><p>Passwords are stored as one-way hashes, connections are encrypted, and access to order data is limited to authorised staff.</p></section>
      <section><h2>Storage on your device</h2><p>We save your cart, wishlist and sign-in session in your browser so the site works between visits. We don&apos;t use advertising trackers.</p></section>
      <section><h2>Your rights</h2><p>Under Ghana&apos;s Data Protection Act, 2012 you can ask to see, correct or delete your personal data. <Link href="/contact">Contact us</Link> and we&apos;ll respond promptly.</p></section>
    </PolicyPage>
  );
}
