"use client";

import { motion } from "framer-motion";

import type { VoteChoice } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  side: VoteChoice;
  label: string;
  disabled?: boolean;
  onPick: () => void;
  /** Full-width phone ballot — taller targets and larger type */
  variant?: "default" | "hero";
};

/** Audience-sized premiere vote tiles */
export function VoteOptionCard({ side, label, disabled, onPick, variant = "default" }: Props) {
  const warm = side === "A";
  const hero = variant === "hero";
  return (
    <motion.button
      type="button"
      disabled={disabled}
      whileTap={disabled ? {} : { scale: 0.988 }}
      onClick={onPick}
      className={cn(
        "relative flex flex-col justify-between border border-[oklch(1_0_0/0.1)] bg-[oklch(0.12_0.02_260/0.45)] text-left shadow-[0_12px_40px_oklch(0_0_0/0.25)] transition [touch-action:manipulation]",
        hero
          ? "min-h-[min(42vh,22rem)] w-full gap-6 rounded-2xl px-6 py-8 sm:min-h-[min(38vh,20rem)] sm:px-8 sm:py-10"
          : "min-h-[44vw] max-h-[72vh] overflow-hidden rounded-md p-6 py-8 sm:min-h-56",
        warm ? "border-l-[4px] border-l-[oklch(0.58_0.08_55/0.65)]" : "border-l-[4px] border-l-[oklch(0.48_0.07_195/0.55)]",
        !disabled && "active:bg-[oklch(0.14_0.022_48/0.55)] md:hover:bg-[oklch(0.15_0.022_48/0.5)]",
        disabled && "pointer-events-none opacity-45",
        !hero && "overflow-hidden rounded-md",
      )}
    >
      <span
        className={cn(
          "font-mono font-semibold uppercase tracking-[0.2em] text-[var(--kc-champagne)]/90",
          hero ? "text-[clamp(0.8rem,3.5vw,1rem)]" : "kc-eyebrow",
        )}
      >
        Option {side}
      </span>
      <span
        className={cn(
          "kc-display leading-[1.12] text-[var(--kc-cream)] [overflow-wrap:anywhere]",
          hero ? "mt-2 text-[clamp(1.35rem,6vw,2.25rem)] sm:text-[clamp(1.5rem,5vw,2rem)]" : "mt-4 text-2xl sm:text-3xl",
        )}
      >
        {label}
      </span>
    </motion.button>
  );
}
