"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  /** Corner ornament intensity */
  variant?: "full" | "minimal";
};

/** Restrained lobby frame — hairline brass, no corner filigree */
export function ArtDecoFrame({ children, className, variant = "full" }: Props) {
  return (
    <div
      className={cn(
        "relative rounded-[2px] border border-[color-mix(in_oklch,var(--kc-gold)_26%,transparent)] bg-[color-mix(in_oklch,var(--kc-panel)_88%,transparent)] shadow-[var(--kc-shadow-inset-gold),var(--kc-shadow-card)]",
        variant === "full" &&
          "before:pointer-events-none before:absolute before:inset-[10px] before:rounded-[1px] before:border before:border-[color-mix(in_oklch,var(--kc-gold)_14%,transparent)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
