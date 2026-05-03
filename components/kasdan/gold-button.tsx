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
    "border border-[oklch(0.72_0.05_78/0.28)] bg-[oklch(0.22_0.025_48)] text-[var(--kc-cream)] shadow-[0_1px_0_oklch(1_0_0/0.06)_inset,0_8px_28px_oklch(0_0_0/0.35)] hover:border-[oklch(0.78_0.06_78/0.4)] hover:bg-[oklch(0.26_0.028_48)]",
  quiet:
    "border border-transparent bg-[oklch(0.2_0.02_260/0.55)] text-[var(--kc-cream)] hover:bg-[oklch(0.24_0.022_260/0.65)]",
  outline:
    "border border-[oklch(0.72_0.04_78/0.22)] bg-transparent text-[var(--kc-cream-dim)] hover:border-[oklch(0.78_0.05_78/0.35)] hover:bg-[oklch(1_0_0/0.04)] hover:text-[var(--kc-cream)]",
};

/** Primary actions — matte surfaces, restrained metal accent */
export const GoldButton = forwardRef<HTMLButtonElement, GoldButtonProps>(
  ({ className, variant = "primary", type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(base, variants[variant], className)} {...props} />
  ),
);
GoldButton.displayName = "GoldButton";
