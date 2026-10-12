import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import { AuthProvider } from "@/lib/auth";
import { SettingsProvider } from "@/lib/settings";
import { WishlistProvider } from "@/lib/wishlist";
import { serverApi, SITE_URL } from "@/lib/server-api";
import Header, { MobileBottomNav } from "@/components/Header";
import Footer from "@/components/Footer";
import LiveRefresh from "@/components/LiveRefresh";
import AutoBreadcrumbs from "@/components/Breadcrumbs";
import ContactRail from "@/components/ContactRail";
import MaintenanceGate from "@/components/MaintenanceGate";

export async function generateMetadata(): Promise<Metadata> {
  const s = await serverApi.settings();
  const name = s?.site_name || "MJ Electricals Ghana Limited";
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: name, template: `%s | ${name}` },
    description: s?.site_tagline
      ? `${s.site_tagline}, quality electrical products, tools and equipment across Ghana.`
      : "Quality electrical products, tools and equipment across Ghana.",
    icons: { icon: "/MJ_Logo.jpg", apple: "/MJ_Logo.jpg" },
    openGraph: { type: "website", siteName: name, images: ["/MJ_Logo.jpg"] },
    alternates: { canonical: "/" },
  };
}

export const viewport: Viewport = { themeColor: "#061161", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await serverApi.settings();
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary">
          Skip to content
        </a>
        <SettingsProvider initial={settings}>
          <AuthProvider>
            <CartProvider>
              <WishlistProvider>
                <MaintenanceGate>
                  <LiveRefresh />
                  <Header />
                  <AutoBreadcrumbs />
                  <main id="main" className="flex-1 pb-16 md:pb-0">{children}</main>
                  <Footer />
                  <MobileBottomNav />
                  <ContactRail />
                </MaintenanceGate>
              </WishlistProvider>
            </CartProvider>
          </AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
