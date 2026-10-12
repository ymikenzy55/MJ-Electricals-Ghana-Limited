"use client";

import { useSettings } from "@/lib/settings";

// MJ Electricals Ghana Limited, Burase Road, Kumasi
const LAT = 6.692099;
const LNG = -1.6225974;
const NAME = "MJ Electricals Ghana Limited";

export const MAP_LINK = `https://www.google.com/maps/search/?api=1&query=${LAT},${LNG}`;
export const DIRECTIONS_LINK = `https://www.google.com/maps/dir/?api=1&destination=${LAT},${LNG}`;
const EMBED = `https://www.google.com/maps?q=${LAT},${LNG}&z=17&output=embed`;

export default function FindUs({ heading = "Find us on the map", className = "" }: { heading?: string; className?: string }) {
  const s = useSettings();
  const address = s?.contact_address || "Burase Road, Kumasi, Ghana";
  const phone = s?.contact_phone;
  return (
    <section aria-labelledby="find-us" className={`overflow-hidden rounded-2xl border border-border bg-white ${className}`}>
      <div className="grid md:grid-cols-[minmax(0,20rem)_1fr]">
        <div className="flex flex-col justify-center gap-3 p-5 sm:p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
          </span>
          <h2 id="find-us" className="text-lg font-black text-ink sm:text-xl">{heading}</h2>
          <div className="text-sm text-muted">
            <p className="font-semibold text-ink">{NAME}</p>
            <p>{address}</p>
            {phone && <p className="mt-1"><a href={`tel:${phone.replace(/\s/g, "")}`} className="font-semibold text-primary hover:underline">{phone}</a></p>}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={DIRECTIONS_LINK} target="_blank" rel="noopener noreferrer" className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">Get directions</a>
            <a href={MAP_LINK} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-ink hover:bg-surface">Open in Maps</a>
          </div>
        </div>
        <div className="relative min-h-[16rem] bg-surface md:min-h-[20rem]">
          <iframe
            title={`Map showing ${NAME}`}
            src={EMBED}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      </div>
    </section>
  );
}
