"use client";

import Link from "next/link";
import { useSettings } from "@/lib/settings";
import Logo from "./Logo";

export default function Footer() {
  const s = useSettings();
  return (
    <footer className="mt-auto bg-navy-dark text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-6 px-4 py-7 sm:gap-10 sm:px-6 sm:py-12 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <Logo light />
          <p className="mt-3 text-[13px] leading-relaxed text-white/60 sm:mt-4 sm:text-sm">
            {s?.site_tagline || "Quality electrical products, tools and equipment across Ghana."}
          </p>
        </div>
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50">Shop</h4>
          <ul className="space-y-1.5 text-[13px] text-white/75 sm:space-y-2 sm:text-sm">
            <li><Link href="/products" className="hover:text-white">All Products</Link></li>
            <li><Link href="/products" className="hover:text-white">Categories</Link></li>
            <li><Link href="/cart" className="hover:text-white">Cart</Link></li>
            <li><Link href="/account" className="hover:text-white">My Orders</Link></li>
            <li><Link href="/track" className="hover:text-white">Track an Order</Link></li>
            <li><Link href="/wishlist" className="hover:text-white">Wishlist</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50">Company</h4>
          <ul className="space-y-1.5 text-[13px] text-white/75 sm:space-y-2 sm:text-sm">
            <li><Link href="/about" className="hover:text-white">About Us</Link></li>
            <li><Link href="/services" className="hover:text-white">Services</Link></li>
            <li><Link href="/branches" className="hover:text-white">Find us on the map</Link></li>
            <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
            <li><Link href="/faq" className="hover:text-white">FAQ</Link></li>
            <li><Link href="/shipping-returns" className="hover:text-white">Shipping &amp; Returns</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50">Contact</h4>
          <ul className="space-y-1.5 text-[13px] text-white/75 sm:space-y-2 sm:text-sm">
            {s?.contact_phone && <li>{s.contact_phone}</li>}
            {s?.contact_email && <li>{s.contact_email}</li>}
            {s?.contact_address && <li>{s.contact_address}</li>}
          </ul>
          <div className="mt-4 flex gap-2">
            {s?.social_facebook && (
              <a href={s.social_facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>
              </a>
            )}
            {s?.social_instagram && (
              <a href={s.social_instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
              </a>
            )}
            {s?.social_twitter && (
              <a href={s.social_twitter} target="_blank" rel="noopener noreferrer" aria-label="Twitter"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" /></svg>
              </a>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-1 px-4 py-3 text-center text-[11px] text-white/40 sm:flex-row sm:py-4 sm:text-left sm:text-xs sm:px-6">
          <span>© {new Date().getFullYear()} {s?.site_name || "MJ Electricals Ghana Limited"}. All rights reserved.</span>
          <span className="flex gap-4"><Link href="/terms" className="hover:text-white">Terms</Link><Link href="/privacy" className="hover:text-white">Privacy</Link></span>
        </div>
      </div>
    </footer>
  );
}
