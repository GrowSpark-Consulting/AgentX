// Root layout for the dashboard domain (/dashboard). Separate from the (onboarding) root layout so
// the dashboard keeps its no-Preflight stylesheet and self-hosted Archivo. Carried over from the
// pakka-app export.
import type { Metadata, Viewport } from "next";
import "@/styles/dashboard.css";

export const metadata: Metadata = {
  title: "Pakka App First Round (Copy)",
  description: "Pakka — WhatsApp AI assistant dashboard for local businesses",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
