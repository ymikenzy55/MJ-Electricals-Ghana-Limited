import Link from "next/link";

export const metadata = { title: "Offline, MJ POS" };

/** Cached by the service worker and shown if a page can't be loaded. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#EDEFF9] px-6 text-center">
      <h1 className="text-2xl font-bold text-[#0B0E1A]">This page isn&apos;t available offline yet</h1>
      <p className="mt-2 max-w-md text-sm text-[#4A5060]">
        The checkout, your cached products and any sales you make keep working without internet.
        Reconnect to open other pages.
      </p>
      <Link href="/pos" className="mt-6 rounded-full bg-[#061161] px-6 py-2.5 text-sm font-semibold text-white">Go to checkout</Link>
    </main>
  );
}
