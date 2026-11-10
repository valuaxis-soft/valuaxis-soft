import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Fraunces, Geist, Geist_Mono, IBM_Plex_Sans } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NONCE_HEADER } from "@/security/headers/security-headers";
import { SITE_DESCRIPTION, SITE_NAME, SITE_THEME_COLOR, SITE_TITLE, getSiteUrl } from "./_lib/site";
import "./globals.css";

// next/font downloads the files at build time and serves them from our own
// origin, so the CSP needs no font host. See docs/DISENO.md.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

// The appraisal document keeps Geist so its pages never move with the interface.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});


export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "software de avalúos",
    "avalúos inmobiliarios",
    "valuación",
    "dictamen de avalúo",
    "avalúo de maquinaria",
    "homologación de comparables",
    "perito valuador",
    "México",
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  category: "business",
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: SITE_THEME_COLOR,
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading request headers renders every page per request, which the CSP
  // nonce requires: a page built ahead of time would carry no nonce.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  // The root layout stays neutral so pages scroll normally. Routes that need a
  // fixed, non-scrolling shell (the valuation workspace) set it in their own layout.
  return (
    // The theme script sets the `dark` class before hydration.
    <html lang="es-MX" className={`${plexSans.variable} ${fraunces.variable} ${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground">
        <ThemeProvider nonce={nonce}>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
