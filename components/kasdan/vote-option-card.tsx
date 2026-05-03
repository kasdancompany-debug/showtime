"use client";

import { motion } from "framer-motion";

import type { VoteChoice } from "@/types";
import { cn } from "@/lib/utils";

type EnergyPhase = "idle" | "rise" | "finale";

type Props = {
  side: VoteChoice;
  label: string;
  disabled?: boolean;
  onPick: () => void;
  variant?: "default" | "hero";
  cinematicActive?: boolean;
  energyPhase?: EnergyPhase;
  isLeading?: boolean;
  neckAndNeck?: boolean;
  pickFlash?: boolean;
  reduceMotion?: boolean;
};

/** Audience premiere tiles — live pulse / glow for game-show energy */
export function VoteOptionCard({
  side,
  label,
  disabled,
  onPick,
  variant = "default",
  cinematicActive = false,
  energyPhase = "idle",
  isLeading = false,
  neckAndNeck = false,
  pickFlash = false,
  reduceMotion = false,
}: Props) {
  const warm = side === "A";
  const hero = variant === "hero";
  const motionSafe = Boolean(reduceMotion);
  const finale = energyPhase === "finale";
  const rise = energyPhase === "rise";

  const shakeParent =
    !motionSafe && finale && cinematicActive && !disabled
      ? { x: [0, -2.5, 2.5, -1.5, 1.5, 0] }
      : {};

  const glowCycle =
    cinematicActive && !disabled && !motionSafe
      ? finale
        ? [
            "0 0 0 0 oklch(0.78 0.12 78 / 0)",
            "0 0 40px 6px oklch(0.82 0.15 78 / 0.58)",
            "0 0 0 0 oklch(0.78 0.12 78 / 0)",
          ]
        : rise || neckAndNeck
          ? [
              "0 0 0 0 oklch(0.72 0.1 82 / 0)",
              "0 0 26px 4px oklch(0.74 0.12 82 / 0.42)",
              "0 0 0 0 oklch(0.72 0.1 82 / 0)",
            ]
          : [
              "0 0 0 0 oklch(0.62 0.08 78 / 0)",
              "0 0 20px 3px oklch(0.68 0.1 78 / 0.32)",
              "0 0 0 0 oklch(0.62 0.08 78 / 0)",
            ]
      : null;

  const button = (
    <motion.button
      type="button"
      disabled={disabled}
      layout
      whileTap={disabled ? {} : { scale: 0.985 }}
      animate={{
        boxShadow: glowCycle ?? "0 16px 48px oklch(0 0 0 / 0.38)",
        scale: pickFlash ? 1.035 : 1,
      }}
      transition={
        glowCycle
          ? {
              boxShadow: {
                duration: finale ? 0.72 : neckAndNeck || rise ? 1 : 1.45,
                repeat: Infinity,
                ease: "easeInOut",
              },
              scale: { type: "spring", stiffness: 440, damping: 24 },
            }
          : { duration: 0.28 }
      }
      onClick={onPick}
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col justify-between overflow-hidden border border-[oklch(1_0_0/0.12)] bg-[oklch(0.1_0.022_260/0.72)] text-left [touch-action:manipulation]",
        hero
          ? "gap-5 rounded-2xl px-5 py-7 sm:px-7 sm:py-9"
          : "rounded-md p-6 py-8 sm:min-h-56",
        hero ? "min-h-[min(40vh,20rem)] sm:min-h-[min(36vh,18rem)]" : "min-h-[44vw] max-h-[72vh]",
        warm ? "border-l-[5px] border-l-[oklch(0.62_0.1_48/0.85)]" : "border-l-[5px] border-l-[oklch(0.52_0.09_200/0.75)]",
        isLeading && !disabled && "ring-2 ring-amber-400/50 ring-offset-2 ring-offset-[oklch(0.06_0.02_260)]",
        !disabled && "active:bg-[oklch(0.14_0.025_48/0.62)] md:hover:bg-[oklch(0.13_0.024_48/0.55)]",
        disabled && "pointer-events-none opacity-[0.42]",
      )}
    >
      {!motionSafe && cinematicActive && !disabled ? (
        <span
          className={cn(
            "pointer-events-none absolute inset-0 opacity-[0.16]",
            finale && "opacity-[0.22]",
          )}
          style={{
            background: warm
              ? "radial-gradient(circle at 28% 18%, oklch(0.72 0.12 48 / 0.45), transparent 58%)"
              : "radial-gradient(circle at 28% 18%, oklch(0.58 0.11 200 / 0.45), transparent 58%)",
          }}
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "relative z-[1] font-mono font-bold uppercase tracking-[0.22em] text-[var(--kc-champagne)]",
          hero ? "text-[clamp(0.72rem,3.2vw,0.95rem)]" : "kc-eyebrow",
          finale && !motionSafe && "text-amber-100",
        )}
      >
        Option {side}
      </span>
      <span
        className={cn(
          "relative z-[1] font-heading font-semibold leading-[1.08] tracking-tight text-[var(--kc-cream)] drop-shadow-[0_4px_28px_oklch(0_0_0/0.48)] [overflow-wrap:anywhere]",
          hero ? "mt-2 text-[clamp(1.45rem,6.8vw,2.35rem)] sm:text-[clamp(1.55rem,5.5vw,2.05rem)]" : "mt-4 text-2xl sm:text-3xl",
        )}
      >
        {label}
      </span>
    </motion.button>
  );

  if (Object.keys(shakeParent).length === 0) return button;

  return (
    <motion.div
      className={cn("h-full min-h-0 w-full", hero && "min-h-[min(40vh,20rem)] sm:min-h-[min(36vh,18rem)]")}
      animate={shakeParent}
      transition={{ duration: 0.38, repeat: Infinity, ease: "easeInOut" }}
    >
      {button}
    </motion.div>
  );
}
