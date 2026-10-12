import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MJ Electricals POS",
  description: "Point of Sale. MJ Electricals Ghana Limited",
  manifest: "/manifest.webmanifest",
  applicationName: "MJ POS",
  icons: {
    icon: "/MJ_Logo.jpg",
    apple: "/MJ_Logo.jpg",
  },
};

export const viewport: Viewport = {
  themeColor: "#061161",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          {children}
        </ToastProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
