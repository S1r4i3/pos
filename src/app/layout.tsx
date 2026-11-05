import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RestoPOS", template: "%s · RestoPOS" },
  description: "Restaurant billing, KOT, inventory and reports",
  applicationName: "RestoPOS",
  appleWebApp: { capable: true, title: "RestoPOS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#EA580C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh bg-background text-text antialiased">{children}</body>
    </html>
  );
}
