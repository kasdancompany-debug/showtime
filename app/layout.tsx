import type { Metadata } from "next";
import { DM_Sans, Geist_Mono, Instrument_Serif, Libre_Baskerville } from "next/font/google";

import "./globals.css";

import { KasdanHollywoodTheme } from "@/components/kasdan/kasdan-hollywood-theme";
import { SHOWTIME_CANONICAL_ORIGIN } from "@/lib/showtime/canonical-origin";

/** Display / hero titles — elegant editorial serif */
const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

/** Body copy where a warm book serif reads “lobby programme” without theatrics */
const libreBaskerville = Libre_Baskerville({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-body-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SHOWTIME_CANONICAL_ORIGIN),
  title: {
    default: "Showtime",
    template: "%s · Showtime",
  },
  description:
    "Kasdan Co. presents a live interactive picture — operator, screen, and audience in sync.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${libreBaskerville.variable} ${dmSans.variable} ${geistMono.variable} dark showtime h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col overflow-x-hidden supports-[min-height:100dvh]:min-h-[100dvh]">
        <KasdanHollywoodTheme>{children}</KasdanHollywoodTheme>
      </body>
    </html>
  );
}
