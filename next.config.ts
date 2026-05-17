import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Hides the floating “N” dev indicator (clean projector / house tabs). Errors still surface via overlay when needed. */
  devIndicators: false,
};

export default nextConfig;
