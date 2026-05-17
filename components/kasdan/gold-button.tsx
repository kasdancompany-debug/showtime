"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type GoldButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "outline";
};

const base =
  "relative inline-flex min-h-11 min-w-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[0.9375rem] font-medium tracking-wide transition-[transform,box-shadow,background-color,border-color,color] duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(0.78_0.06_78/0.5)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40";

const variants: Record<NonNullable<GoldButtonProps["variant"]>, string> = {
  primary:
    "border border-[color-mix(in_oklch,var(--kc-gold)_30%,transparent)] bg-[color-mix(in_oklch,var(--kc-panel-elevated)_88%,var(--kc-piano))] text-[var(--kc-cream)] shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] hover:border-[color-mix(in_oklch,var(--kc-gold-bright)_38%,transparent)] hover:bg-[color-mix(in_oklch,var(--kc-panel-elevated)_94%,var(--kc-piano))]",
  quiet:
    "border border-transparent bg-[color-mix(in_oklch,var(--kc-piano)_55%,var(--kc-panel))] text-[var(--kc-cream)] hover:bg-[color-mix(in_oklch,var(--kc-panel)_70%,transparent)]",
  outline:
    "border border-[color-mix(in_oklch,var(--kc-gold)_22%,transparent)] bg-transparent text-[var(--kc-champagne)] hover:border-[color-mix(in_oklch,var(--kc-gold)_35%,transparent)] hover:bg-[color-mix(in_oklch,var(--kc-gold)_6%,transparent)] hover:text-[var(--kc-cream)]",
};

/** Primary actions — matte surfaces, restrained metal accent */
export const GoldButton = forwardRef<HTMLButtonElement, GoldButtonProps>(
  ({ className, variant = "primary", type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(base, variants[variant], className)} {...props} />
  ),
);
GoldButton.displayName = "GoldButton";
