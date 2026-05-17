"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  /** Extra inset for projector-safe margins inside the frame */
  padded?: boolean;
  /** Tighter inset when the room UI must fit a short fullscreen viewport */
  paddingDensity?: "comfortable" | "compact" | "dense";
  /** When false, only corner brackets render — no full inner rectangle (avoids vertical rules through wide titles). */
  showInnerRule?: boolean;
};

/** Golden Art Deco frame — title-card corners + inner rule; stays quiet so type stays legible */
export function ScreenTitleCardFrame({
  children,
  className,
  padded = true,
  paddingDensity = "comfortable",
  showInnerRule = false,
}: Props) {
  const comfortable = "px-8 py-12 sm:px-12 sm:py-14 md:px-16 md:py-16 lg:px-20";
  const compactInset = "px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6 lg:px-8 lg:py-7";
  const denseInset = "px-2 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-4 lg:px-5 lg:py-5";
  const inset =
    !padded ? "" : paddingDensity === "dense" ? denseInset : paddingDensity === "compact" ? compactInset : comfortable;

  const tight = paddingDensity === "dense";
  /** L-bracket corners sit in the outer ring; inner rule stays fully inside them (no overlapping lines). */
  const cornerOuter = tight ? "left-1.5 top-1.5 h-7 w-7 md:left-2 md:top-2 md:h-8 md:w-8" : "left-2 top-2 h-9 w-9 md:left-3 md:top-3 md:h-11 md:w-11";
  const innerRule1 = tight ? "inset-[14px] md:inset-[18px]" : "inset-[22px] md:inset-[28px]";

  return (
    <div className={cn("relative", inset, className)}>
      <span
        className={cn(
          "pointer-events-none absolute border-l-2 border-t-2 border-[color-mix(in_oklch,var(--kc-gold-bright)_55%,transparent)]",
          cornerOuter,
        )}
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute border-r-2 border-t-2 border-[color-mix(in_oklch,var(--kc-gold-bright)_55%,transparent)]",
          cornerOuter.replace("left-", "right-"),
        )}
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute border-b-2 border-l-2 border-[color-mix(in_oklch,var(--kc-gold-bright)_55%,transparent)]",
          cornerOuter.replace("top-", "bottom-"),
        )}
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute border-b-2 border-r-2 border-[color-mix(in_oklch,var(--kc-gold-bright)_55%,transparent)]",
          cornerOuter.replace("left-", "right-").replace("top-", "bottom-"),
        )}
        aria-hidden
      />
      {showInnerRule ? (
        <div
          className={cn(
            "pointer-events-none absolute rounded-[2px] border border-[color-mix(in_oklch,var(--kc-gold-line)_88%,transparent)]",
            innerRule1,
          )}
          aria-hidden
        />
      ) : null}
      {children}
    </div>
  );
}
