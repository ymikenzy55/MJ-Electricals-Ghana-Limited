import type { ReactNode } from "react";

export default function PolicyPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-7 sm:py-12 sm:px-6">
      <h1 className="text-2xl sm:text-3xl font-black text-ink">{title}</h1>
      <p className="mt-1 text-xs text-faint">Last updated {updated}</p>
      <div className="mt-5 sm:mt-8 space-y-6 text-sm leading-relaxed text-muted [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:font-semibold [&_a]:text-primary [&_a:hover]:underline">
        {children}
      </div>
    </article>
  );
}
