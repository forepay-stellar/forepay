import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SmoothScroll } from "@/components/SmoothScroll";
import { HEAD_SCRIPT } from "@/lib/intro";
import "lenis/dist/lenis.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Forepay, get paid early on your AdSense revenue";
const description =
  "Prove three months of AdSense revenue without sharing your Google password and get up to 100 USDC. Live on Stellar testnet.";

// The share image is app/opengraph-image.png; metadataBase turns its path into a full URL.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title,
  description,
  openGraph: { title, description, type: "website", siteName: "Forepay" },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The intro script may set data-intro on <html> before React hydrates it.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-canvas text-fg">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
