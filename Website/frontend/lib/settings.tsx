"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type SiteSettings } from "./api";

const Ctx = createContext<SiteSettings | null>(null);

// Safe defaults so Header/HeroSlider/Checkout never render with missing data
// when the settings fetch fails.
export const DEFAULT_SETTINGS: SiteSettings = {
  site_name: "MJ Electricals Ghana Limited",
  site_tagline: "Quality Electrical Products",
  hero_title: "Welcome to MJ Electricals",
  hero_subtitle: "Your trusted electrical supplier in Ghana",
  hero_eyebrow: null,
  hero_cta_label: "Shop Products",
  hero_image: null,
  contact_phone: "",
  contact_email: "",
  contact_address: "",
  social_facebook: null,
  social_instagram: null,
  social_twitter: null,
  default_shipping_fee: "20.00",
  free_shipping_threshold: null,
  is_maintenance_mode: false,
  announcement: null,
};

/**
 * `initial` is fetched on the server (cached), so the header, footer and hero
 * render with real data in the first HTML, no flash of default content.
 */
export function SettingsProvider({ children, initial }: { children: ReactNode; initial?: SiteSettings | null }) {
  const [settings, setSettings] = useState<SiteSettings>(initial ?? DEFAULT_SETTINGS);
  // server-rendered value changes when the store updates (see LiveRefresh)
  useEffect(() => { if (initial) setSettings(initial); }, [initial]);
  useEffect(() => {
    const load = () => api.settings().then(setSettings).catch(() => {});
    load();
    window.addEventListener("mj:data-changed", load);
    return () => window.removeEventListener("mj:data-changed", load);
  }, []);
  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}

export function useSettings(): SiteSettings {
  return useContext(Ctx) ?? DEFAULT_SETTINGS;
}
