import type { ReactNode } from "react";
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#050508",
};

export default function JoinSegmentLayout({ children }: { children: ReactNode }) {
  return children;
}
