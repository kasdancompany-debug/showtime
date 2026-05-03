"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children?: ReactNode;
  className?: string;
  /** Heavier layers (projection / host); subtle for refined surfaces */
  intensity?: "subtle" | "standard";
  /** Slow drape + house-light drift — use on big-screen surfaces only */
  animated?: boolean;
};

/** Layered theatre depth; optional motion reads as velvet catching light (not illustration) */
export function TheatreCurtainBackground({ children, className, intensity = "standard", animated = false }: Props) {
  const soft = intensity === "subtle";

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_90%_65%_at_50%_-8%,oklch(0.72_0.04_78/0.06),transparent_58%)]"
        aria-hidden
      />
      {!soft ? (
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_75%_45%_at_85%_95%,oklch(0.28_0.06_25/0.14),transparent_55%)]"
          aria-hidden
        />
      ) : null}
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_55%_40%_at_12%_88%,oklch(0.2_0.03_48/0.22),transparent_52%)]"
        aria-hidden
      />

      {animated ? (
        <>
          <div
            className="kc-drape-left-motion absolute inset-y-0 left-0 w-[min(44%,420px)] bg-gradient-to-r from-[oklch(0.26_0.1_22/0.58)] via-[oklch(0.18_0.06_28/0.18)] to-transparent"
            aria-hidden
          />
          <div
            className="kc-drape-right-motion absolute inset-y-0 right-0 w-[min(44%,420px)] bg-gradient-to-l from-[oklch(0.14_0.06_260/0.52)] via-[oklch(0.1_0.03_260/0.12)] to-transparent"
            aria-hidden
          />
          <div
            className="kc-house-spot-motion absolute inset-0 bg-[radial-gradient(ellipse_48%_38%_at_50%_42%,oklch(0.62_0.06_78/0.07),transparent_72%)]"
            aria-hidden
          />
        </>
      ) : null}

      <div
        className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(0.85_0.03_82/0.12),transparent)]"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,oklch(0.35_0.02_260/0.35),transparent)]"
        aria-hidden
      />
      {children}
    </div>
  );
}
