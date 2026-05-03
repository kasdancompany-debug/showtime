"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  /** Corner ornament intensity */
  variant?: "full" | "minimal";
};

/** Double-line Art Deco frame with corner sunburst ornaments */
export function ArtDecoFrame({ children, className, variant = "full" }: Props) {
  return (
    <div
      className={cn(
        "relative border-2 border-[var(--kc-gold-muted)] bg-[var(--kc-panel)]/55 shadow-[var(--kc-shadow-inset-gold),var(--kc-shadow-card)]",
        "before:pointer-events-none before:absolute before:inset-2 before:border before:border-[var(--kc-gold-faint)]",
        variant === "full" && "kc-art-deco-corners",
        className,
      )}
    >
      {children}
    </div>
  );
}
