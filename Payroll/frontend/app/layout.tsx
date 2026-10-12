import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import ShellGate from "@/components/ShellGate";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Payroll & Attendance", template: "%s | MJ Electricals Payroll" },
  icons: { icon: "/MJ_Logo.jpg", apple: "/MJ_Logo.jpg" },
};

export const viewport: Viewport = { themeColor: "#061161", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        <AuthProvider>
          <ShellGate>{children}</ShellGate>
        </AuthProvider>
      </body>
    </html>
  );
}
