"use client";

import HeroSlider from "@/components/HeroSlider";
import { useSettings } from "@/lib/settings";

/** Bridges the client-side settings context into the server-rendered home page. */
export default function HomeSettingsHero() {
  return <HeroSlider settings={useSettings()} />;
}
