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
  const denseInset = "px-2 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-4 lg:px-5 lg:py-5";
  const inset =
    !padded ? "" : paddingDensity === "dense" ? denseInset : paddingDensity === "compact" ? compactInset : comfortable;

  const tight = paddingDensity === "dense";
  const cornerOuter = tight ? "left-1.5 top-1.5 h-7 w-7 md:left-2.5 md:top-2.5 md:h-9 md:w-9" : "left-2 top-2 h-10 w-10 md:left-4 md:top-4 md:h-14 md:w-14";
  const innerRule1 = tight ? "inset-[12px] md:inset-[16px]" : "inset-[18px] md:inset-[26px]";
  const innerRule2 = tight ? "inset-[17px] md:inset-[22px]" : "inset-[26px] md:inset-[36px]";

  return (
    <div className={cn("relative", inset, className)}>
      <span
        className={cn(
          "pointer-events-none absolute border-l-2 border-t-2 border-[oklch(0.76_0.07_78/0.55)]",
          cornerOuter,
        )}
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute border-r-2 border-t-2 border-[oklch(0.76_0.07_78/0.55)]",
          cornerOuter.replace("left-", "right-"),
        )}
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute border-b-2 border-l-2 border-[oklch(0.76_0.07_78/0.55)]",
          cornerOuter.replace("top-", "bottom-"),
        )}
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute border-b-2 border-r-2 border-[oklch(0.76_0.07_78/0.55)]",
          cornerOuter.replace("left-", "right-").replace("top-", "bottom-"),
        )}
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none absolute rounded-[2px] border border-[oklch(0.72_0.05_78/0.22)]",
          innerRule1,
        )}
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none absolute rounded-[2px] border border-[oklch(0.55_0.04_78/0.12)]",
          innerRule2,
        )}
        aria-hidden
      />
      {children}
    </div>
  );
}
