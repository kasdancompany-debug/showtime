"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  /** Extra inset for projector-safe margins inside the frame */
  padded?: boolean;
  /** Tighter inset when the room UI must fit a short fullscreen viewport */
  paddingDensity?: "comfortable" | "compact";
};

/** Golden Art Deco frame — title-card corners + inner rule; stays quiet so type stays legible */
export function ScreenTitleCardFrame({
  children,
  className,
  padded = true,
  paddingDensity = "comfortable",
}: Props) {
  const comfortable = "px-8 py-12 sm:px-12 sm:py-14 md:px-16 md:py-16 lg:px-20";
  const compactInset = "px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6 lg:px-8 lg:py-7";
  const inset = !padded ? "" : paddingDensity === "compact" ? compactInset : comfortable;

  return (
    <div className={cn("relative", inset, className)}>
      <span
        className="pointer-events-none absolute left-2 top-2 h-10 w-10 border-l-2 border-t-2 border-[oklch(0.76_0.07_78/0.55)] md:left-4 md:top-4 md:h-14 md:w-14"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute right-2 top-2 h-10 w-10 border-r-2 border-t-2 border-[oklch(0.76_0.07_78/0.55)] md:right-4 md:top-4 md:h-14 md:w-14"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute bottom-2 left-2 h-10 w-10 border-b-2 border-l-2 border-[oklch(0.76_0.07_78/0.55)] md:bottom-4 md:left-4 md:h-14 md:w-14"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute bottom-2 right-2 h-10 w-10 border-b-2 border-r-2 border-[oklch(0.76_0.07_78/0.55)] md:bottom-4 md:right-4 md:h-14 md:w-14"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-[18px] rounded-[2px] border border-[oklch(0.72_0.05_78/0.22)] md:inset-[26px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-[26px] rounded-[2px] border border-[oklch(0.55_0.04_78/0.12)] md:inset-[36px]"
        aria-hidden
      />
      {children}
    </div>
  );
}
