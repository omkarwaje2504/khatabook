import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { BackToTop, THEME_SCRIPT, Toaster } from "./ui/feedback";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Khatabook", template: "%s · Khatabook" },
  description: "Private monthly khata: split the salary into home and savings, track home heads, savings, loans and expenses.",
  applicationName: "Khatabook",
  // A personal ledger: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-page font-sans text-stone-900">
        {/* Sets the light/dark class before the page is painted, so it never flashes. */}
        <Script id="theme" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
        <a href="#main"
          className="sr-only z-50 rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-surface focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
          Skip to content
        </a>
        {children}
        <Toaster />
        <BackToTop />
      </body>
    </html>
  );
}
