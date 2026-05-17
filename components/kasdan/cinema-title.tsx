"use client";

import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  eyebrow?: ReactNode;
  size?: "sm" | "md" | "lg" | "hero";
};

const sizes = {
  sm: "text-xl sm:text-2xl",
  md: "text-2xl sm:text-3xl md:text-4xl",
  lg: "text-3xl sm:text-4xl md:text-5xl",
  hero: "text-[clamp(2rem,6vw,4.5rem)] leading-[1.05]",
};

/** Vintage title-card headline */
export function CinemaTitle({ as: Tag = "h2", children, className, eyebrow, size = "md" }: Props) {
  return (
    <div className={cn("text-center", className)}>
      {eyebrow ? (
        <p className="kc-eyebrow mb-3 text-[var(--kc-champagne)]">{eyebrow}</p>
      ) : null}
      <Tag
        className={cn(
          "kc-display font-normal tracking-[0.02em] text-[var(--kc-cream)]",
          sizes[size],
        )}
      >
        {children}
      </Tag>
    </div>
  );
}
