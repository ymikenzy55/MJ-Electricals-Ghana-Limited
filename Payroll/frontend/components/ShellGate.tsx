"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AppShell from "./AppShell";

/** Renders the admin shell for app routes; bare pages for /login and /kiosk. */
export default function ShellGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const bare =
    pathname.startsWith("/login") ||
    pathname.startsWith("/kiosk") ||
    pathname.startsWith("/worker") ||
    pathname.startsWith("/sso");
  if (bare) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
