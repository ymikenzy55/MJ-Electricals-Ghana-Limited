"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, cedi, type CatalogProduct } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import Logo from "./Logo";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/services", label: "Services" },
  { href: "/branches", label: "Branches" },
  { href: "/track", label: "Track Order" },
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact" },
];

const I = {
  search: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",
  cart: "M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6M9 21a1 1 0 100-2 1 1 0 000 2zM20 21a1 1 0 100-2 1 1 0 000 2z",
  user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  home: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  heart: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  pin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 13a3 3 0 100-6 3 3 0 000 6z",
  phone: "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z",
};

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Header() {
  const { count } = useCart();
  const { user } = useAuth();
  const settings = useSettings();
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<CatalogProduct[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const desktopBox = useRef<HTMLDivElement>(null);
  const mobileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { setMenuOpen(false); setMobileSearch(false); setSuggestOpen(false); }, [pathname]);
  useEffect(() => {
    const load = () => api.categories().then(setCategories).catch(() => {});
    load();
    window.addEventListener("mj:data-changed", load);
    return () => window.removeEventListener("mj:data-changed", load);
  }, []);
  useEffect(() => { if (mobileSearch) mobileInput.current?.focus(); }, [mobileSearch]);
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);
  // the bottom-nav "Search" button opens the mobile search row
  useEffect(() => {
    const open = () => { setMobileSearch(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
    window.addEventListener("mj:open-search", open);
    return () => window.removeEventListener("mj:open-search", open);
  }, []);

  useEffect(() => {
    if (!q.trim()) { setSuggestions([]); setSuggestOpen(false); return; }
    const t = setTimeout(() => {
      api.productsPage({ q: q.trim(), page_size: 6 })
        .then((r) => { setSuggestions(r.items); setSuggestOpen(true); })
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!suggestOpen) return;
    const onClick = (e: MouseEvent) => {
      if (desktopBox.current && !desktopBox.current.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [suggestOpen]);

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    router.push(`/products?q=${encodeURIComponent(q.trim())}`);
    setSuggestOpen(false); setMobileSearch(false); setQ("");
  }

  const matchingCats = q.trim() ? categories.filter((c) => c.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 3) : [];

  const suggestBox = suggestOpen && (suggestions.length > 0 || matchingCats.length > 0) && (
    <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-white shadow-xl md:left-auto md:w-80">
      {matchingCats.map((c) => (
        <Link key={c} href={`/categories/${encodeURIComponent(c)}`} onClick={() => { setSuggestOpen(false); setQ(""); }}
          className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-[13px] font-medium text-primary hover:bg-surface">
          <Icon d={I.grid} className="h-3.5 w-3.5" /> {c} <span className="text-xs font-normal text-faint">category</span>
        </Link>
      ))}
      {suggestions.map((p) => (
        <Link key={p.id} href={`/products/${p.id}`} onClick={() => { setSuggestOpen(false); setQ(""); }}
          className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-0 hover:bg-surface">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-surface">
            {p.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-ink">{p.name}</div>
            <div className="truncate text-[11px] text-faint">{p.category ?? "Uncategorised"}</div>
          </div>
          <span className="text-xs font-semibold text-ink">{p.variants[0] ? cedi(p.variants[0].selling_price) : ""}</span>
        </Link>
      ))}
      <button onClick={() => submitSearch()} className="block w-full bg-surface px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-border">
        See all results for “{q.trim()}”
      </button>
    </div>
  );

  return (
    <header className="sticky top-0 z-40">
      {/* Top bar */}
      <div className="bg-black text-white">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-2 px-3 sm:h-14 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-1 sm:gap-5">
            <button className="-ml-1 rounded p-2 text-white hover:bg-white/10 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
              <Icon d={I.menu} />
            </button>
            <Link href="/" aria-label="MJ Electricals home" className="shrink-0 origin-left scale-90 sm:scale-100"><Logo light /></Link>
            {settings?.contact_phone && (
              <a href={`tel:${settings.contact_phone.replace(/\s/g, "")}`} className="hidden items-center gap-2 text-sm font-bold tracking-wide text-white hover:text-white/80 md:flex">
                <Icon d={I.phone} className="h-4 w-4 text-accent" />
                {settings.contact_phone}
              </a>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-4">
            <button className="rounded p-2 text-white hover:bg-white/10 md:hidden" onClick={() => setMobileSearch((v) => !v)} aria-label="Search products" aria-expanded={mobileSearch}>
              <Icon d={mobileSearch ? I.close : I.search} />
            </button>
            <Link href="/wishlist" className="hidden text-white hover:text-white/80 sm:block" aria-label="Wishlist"><Icon d={I.heart} /></Link>
            <Link href="/cart" className="relative rounded p-2 text-white hover:bg-white/10 sm:p-0 sm:hover:bg-transparent" aria-label={`Cart, ${count} items`}>
              <Icon d={I.cart} />
              {count > 0 && (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white sm:-right-2 sm:-top-2">{count}</span>
              )}
            </Link>
            <Link href={user ? "/account" : "/login"} className="hidden items-center gap-1.5 text-sm font-medium text-white hover:text-white/80 sm:flex">
              <Icon d={I.user} /><span>{user ? "Account" : "Sign In"}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile search row */}
      {mobileSearch && (
        <div className="relative border-b border-border bg-white px-3 py-2 md:hidden">
          <form onSubmit={submitSearch} role="search">
            <input
              ref={mobileInput} value={q} onChange={(e) => setQ(e.target.value)} type="search" enterKeyHint="search"
              placeholder="Search products…" aria-label="Search products"
              className="h-10 w-full rounded-full border border-border bg-surface px-4 text-sm outline-none focus:border-primary focus:bg-white"
            />
          </form>
          {suggestBox}
        </div>
      )}

      {/* Desktop / tablet nav + search */}
      <div className="hidden border-b border-border bg-white md:block">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between gap-4 px-6">
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {NAV.slice(0, 2).map((n) => (
              <Link key={n.href} href={n.href}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${(n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)) ? "bg-primary text-white" : "text-ink hover:bg-surface"}`}>
                {n.label}
              </Link>
            ))}
            <div className="group relative">
              <button className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${pathname.startsWith("/categories") ? "bg-primary text-white" : "text-ink hover:bg-surface"}`} aria-haspopup="true">
                Categories
                <svg className="h-3 w-3 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <div className="invisible absolute left-0 top-full z-50 w-56 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="overflow-hidden rounded-xl border border-border bg-white py-1.5 shadow-xl">
                  {categories.length === 0 ? <p className="px-4 py-3 text-xs text-faint">No categories yet</p> : categories.map((c) => (
                    <Link key={c} href={`/categories/${encodeURIComponent(c)}`} className="block px-4 py-2 text-[13px] font-medium text-ink hover:bg-surface hover:text-primary">{c}</Link>
                  ))}
                  <Link href="/products" className="block border-t border-border px-4 py-2 text-[13px] font-semibold text-primary hover:bg-surface">View all products</Link>
                </div>
              </div>
            </div>
            {NAV.slice(2).map((n) => (
              <Link key={n.href} href={n.href}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${pathname.startsWith(n.href) ? "bg-primary text-white" : "text-ink hover:bg-surface"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-1 items-center justify-end gap-2">
            <div ref={desktopBox} className="relative">
              <form onSubmit={submitSearch} role="search">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products"
                  className="h-9 w-56 rounded-full border border-border bg-surface px-4 text-sm outline-none transition-all focus:w-72 focus:border-primary focus:bg-white"
                  onFocus={() => { if (suggestions.length) setSuggestOpen(true); }} />
              </form>
              {suggestBox}
            </div>
            <Link href="/branches" className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface xl:flex">
              <Icon d={I.pin} className="h-4 w-4" /> Find a Branch
            </Link>
          </div>
        </div>
      </div>

      {settings?.announcement && !settings.is_maintenance_mode && (
        <div className="bg-primary px-3 py-1.5 text-center text-[11px] font-medium text-white sm:text-xs">{settings.announcement}</div>
      )}

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-white shadow-2xl">
            <div className="flex h-12 items-center justify-between bg-black px-3">
              <Logo light />
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded p-2 text-white hover:bg-white/10"><Icon d={I.close} /></button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2" aria-label="Mobile">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href}
                  className={`block rounded-lg px-3 py-2.5 text-sm font-semibold ${(n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)) ? "bg-primary text-white" : "text-ink hover:bg-surface"}`}>
                  {n.label}
                </Link>
              ))}
              <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-faint">Categories</p>
              {categories.map((c) => (
                <Link key={c} href={`/categories/${encodeURIComponent(c)}`} className="block rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface">{c}</Link>
              ))}
            </nav>
            <div className="border-t border-border p-3 text-xs text-muted">
              {settings?.contact_phone && <a href={`tel:${settings.contact_phone.replace(/\s/g, "")}`} className="block py-1 font-semibold text-ink">{settings.contact_phone}</a>}
              <Link href={user ? "/account" : "/login"} className="mt-1 block rounded-full bg-primary py-2 text-center text-xs font-bold text-white">{user ? "My Account" : "Sign In / Register"}</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/** Fixed bottom navigation for phones (thumb-reachable primary actions). */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { count } = useCart();
  const { user } = useAuth();
  const item = (active: boolean) => `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${active ? "text-primary" : "text-muted"}`;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Quick navigation">
      <div className="mx-auto flex max-w-md">
        <Link href="/" className={item(pathname === "/")}><Icon d={I.home} />Home</Link>
        <Link href="/products" className={item(pathname.startsWith("/products") || pathname.startsWith("/categories"))}><Icon d={I.grid} />Shop</Link>
        <button onClick={() => window.dispatchEvent(new Event("mj:open-search"))} className={item(false)}><Icon d={I.search} />Search</button>
        <Link href="/cart" className={item(pathname.startsWith("/cart") || pathname.startsWith("/checkout"))}>
          <Icon d={I.cart} />Cart
          {count > 0 && <span className="absolute right-[26%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">{count}</span>}
        </Link>
        <Link href={user ? "/account" : "/login"} className={item(pathname.startsWith("/account") || pathname === "/login")}><Icon d={I.user} />{user ? "Account" : "Sign in"}</Link>
      </div>
    </nav>
  );
}
