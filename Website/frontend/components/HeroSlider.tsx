"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteSettings } from "@/lib/api";

interface Slide {
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
}

const SLIDE_MS = 5000; // slides advance every 5 seconds

export default function HeroSlider({ settings }: { settings: SiteSettings | null }) {
  const slides: Slide[] = [
    {
      image: "/hero_chandelier.jpg",
      eyebrow: "MJ Electricals Ghana Limited",
      title: settings?.hero_title || "Elegant Lighting for Every Space",
      subtitle:
        settings?.hero_subtitle ||
        "Chandeliers, fittings and fixtures that transform any room, genuine products at fair prices.",
      ctaLabel: settings?.hero_cta_label || "Shop Lighting",
      ctaHref: "/products",
    },
    {
      image: "/hero_bulb.jpg",
      eyebrow: "MJ Electricals Ghana Limited",
      title: "Brighter Homes, Lower Bills",
      subtitle:
        "LED and energy-saving bulbs that last longer and cut your electricity costs, for homes and businesses.",
      ctaLabel: "Shop Bulbs",
      ctaHref: "/products",
    },
    // Optional third slide, the banner image the admin uploaded in POS settings.
    ...(settings?.hero_image
      ? [
          {
            image: settings.hero_image,
            eyebrow: "MJ Electricals Ghana Limited",
            title: "Powering Ghana with Quality Electricals",
            subtitle: "Cables, lighting, tools and equipment, delivered nationwide.",
            ctaLabel: "Browse Products",
            ctaHref: "/products",
          },
        ]
      : []),
  ];

  const [index, setIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback(
    (i: number) => setIndex(((i % slides.length) + slides.length) % slides.length),
    [slides.length]
  );

  // Auto-advance; pause on hover.
  useEffect(() => {
    timer.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [slides.length]);

  // touch swipe
  const touchX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) { touchX.current = e.touches[0].clientX; pause(); }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current !== null) {
      const dx = e.changedTouches[0].clientX - touchX.current;
      if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    }
    touchX.current = null;
    resume();
  }

  function pause() { if (timer.current) clearInterval(timer.current); }
  function resume() {
    pause();
    timer.current = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
  }

  return (
    <section
      className="relative flex min-h-[210px] items-center overflow-hidden bg-navy-dark sm:min-h-[380px] md:min-h-[480px]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseEnter={pause}
      onMouseLeave={resume}
      aria-roledescription="carousel"
      aria-label="Featured promotions"
    >
      {slides.map((sl, i) => (
        <div
          key={i}
          className={`absolute inset-0 transition-opacity duration-700 ${i === index ? "opacity-100" : "pointer-events-none opacity-0"}`}
          aria-hidden={i !== index}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sl.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading={i === 0 ? "eager" : "lazy"} decoding="async" fetchPriority={i === 0 ? "high" : "auto"} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
        </div>
      ))}

      {/* Slide content */}
      <div className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-20">
        {slides.map((sl, i) => (
          <div
            key={i}
            className={`max-w-xl transition-all duration-500 ${
              i === index ? "relative translate-y-0 opacity-100" : "pointer-events-none absolute inset-x-4 translate-y-3 opacity-0 sm:inset-x-6"
            }`}
            aria-hidden={i !== index}
          >
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/80 sm:mb-3 sm:text-sm sm:tracking-[0.2em]">
              {sl.eyebrow}
            </p>
            <h1 className="text-[1.6rem] font-black leading-tight text-white sm:text-4xl md:text-5xl">
              {sl.title}
            </h1>
            <p className="mt-2 line-clamp-2 max-w-md text-xs leading-relaxed text-white/80 sm:mt-4 sm:line-clamp-none sm:text-base">
              {sl.subtitle}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-8 sm:gap-3">
              <Link
                href={sl.ctaHref}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-accent/90 sm:gap-2 sm:px-6 sm:py-3 sm:text-sm"
                tabIndex={i === index ? 0 : -1}
              >
                {sl.ctaLabel}
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
              <Link
                href="/contact"
                className="hidden items-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:inline-flex"
                tabIndex={i === index ? 0 : -1}
              >
                Contact Us
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Prev / next arrows */}
      <button
        onClick={() => { go(index - 1); resume(); }}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white transition hover:bg-black/50 sm:flex"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <button
        onClick={() => { go(index + 1); resume(); }}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white transition hover:bg-black/50 sm:flex"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </button>

      {/* Dots */}
      <div className="absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 sm:bottom-5 sm:gap-2">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => { go(i); resume(); }}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all sm:h-2 ${i === index ? "w-6 bg-white sm:w-7" : "w-1.5 bg-white/40 hover:bg-white/70 sm:w-2"}`}
          />
        ))}
      </div>
    </section>
  );
}
