"use client";

import type { ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import Logo from "./Logo";

/** Renders a maintenance screen instead of the site when the flag is on. */
export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const settings = useSettings();
  if (!settings?.is_maintenance_mode) return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-dark px-6 text-center">
      <Logo light />
      <h1 className="mt-5 sm:mt-8 text-2xl sm:text-3xl font-black text-white">We&apos;ll be right back</h1>
      <p className="mt-3 max-w-md text-sm text-white/60">
        {settings.announcement || "Our store is undergoing scheduled maintenance. Please check back soon."}
      </p>
      {settings.contact_phone && (
        <a href={`tel:${settings.contact_phone.replace(/\s/g, "")}`} className="mt-6 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent/90">
          Call {settings.contact_phone}
        </a>
      )}
    </div>
  );
}
