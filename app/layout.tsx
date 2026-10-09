import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Noto_Serif_Display, Playfair_Display } from "next/font/google";

import "./globals.css";

import { KasdanHollywoodTheme } from "@/components/kasdan/kasdan-hollywood-theme";
import { SHOWTIME_CANONICAL_ORIGIN } from "@/lib/showtime/canonical-origin";

/**
 * Brand identity — primary typeface is Playfair Display (guide Board 05). Used for ordinary
 * headings, card titles and numerals.
 */
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["700", "800", "900"],
  display: "swap",
});

/**
 * The guide's hero headlines and the SHOWTIME logotype are tall, condensed, hairline-serif
 * capitals — a custom cut that Playfair Display doesn't have (its narrowest setting is still
 * wide). Noto Serif Display is a high-contrast display serif with a real width axis, so pulling
 * it to ~66% gives the same poster-condensed Didone look. Used only for the wordmark and
 * `.sh-display` headlines.
 */
const condensed = Noto_Serif_Display({
  subsets: ["latin"],
  variable: "--font-condensed",
  weight: "variable",
  axes: ["wdth"],
  display: "swap",
});

/**
 * Secondary typeface is Helvetica Neue in the brand guide. It isn't a web font, so the stack in
 * globals.css prefers the real thing where it exists (Apple devices) and falls back to Inter —
 * the closest open grotesque — everywhere else, so phones and projectors look the same.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

/** Captions, labels, codes and the tracked-out tagline. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TAGLINE = "The story is ours.";

export const metadata: Metadata = {
  metadataBase: new URL(SHOWTIME_CANONICAL_ORIGIN),
  applicationName: "Showtime",
  title: {
    default: `Showtime — ${TAGLINE}`,
    template: "%s · Showtime",
  },
  description:
    "Showtime turns a traditional movie into a shared, interactive experience. The audience chooses the key moments and shapes the story in real time.",
  openGraph: {
    type: "website",
    siteName: "Showtime",
    title: `Showtime — ${TAGLINE}`,
    description: "Same screen. A different story. Scan, choose, and watch together.",
  },
  twitter: {
    card: "summary_large_image",
    title: `Showtime — ${TAGLINE}`,
    description: "Same screen. A different story. Scan, choose, and watch together.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0B",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${condensed.variable} ${inter.variable} ${geistMono.variable} dark showtime h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col overflow-x-hidden supports-[min-height:100dvh]:min-h-[100dvh]">
        <KasdanHollywoodTheme>{children}</KasdanHollywoodTheme>
      </body>
    </html>
  );
}
