// Root layout for the onboarding domain (/ and /onboarding). The dashboard has its own root layout
// in (dashboard), so each product gets its own <html>, fonts and stylesheet, and moving between them
// is a full page load. Carried over from the pakka-onboarding export.
import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "@/styles/onboarding.css";

const archivo = Archivo({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "600", "800"],
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Pakka — Start your free trial",
  description: "Set up your WhatsApp assistant in a few minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="bg-background text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
