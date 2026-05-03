"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  lit?: boolean;
};

export function MarqueeCard({ children, className, lit = true }: Props) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-[oklch(0.72_0.04_78/0.14)] bg-[oklch(0.14_0.02_48/0.55)] backdrop-blur-md",
        "shadow-[0_16px_48px_oklch(0_0_0/0.35)]",
        lit && "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,oklch(0.82_0.04_82/0.15),transparent)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-15%,oklch(0.75_0.05_78/0.04),transparent_60%)]" />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
