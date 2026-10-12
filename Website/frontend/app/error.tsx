"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:py-24 text-center">
      <h1 className="text-2xl font-black text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">We hit a problem loading this page. Please try again.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">Try again</button>
        <Link href="/" className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-ink hover:bg-surface">Go home</Link>
      </div>
    </div>
  );
}
