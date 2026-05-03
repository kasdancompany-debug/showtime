"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

type Accent = "coral" | "teal";

type Props = {
  sideLabel: string;
  votes: number;
  pct: number;
  accent: Accent;
  /** Twinkle bulb strip while polls are open */
  bulbsLit?: boolean;
  /** Shorter bars and type for fullscreen ballot without scrolling */
  compact?: boolean;
  /** Wall projection: never shrink type below readable distance */
  projector?: boolean;
  /** Game-show emphasis on the current leader */
  leading?: boolean;
  /** Softer motion for reduced-motion users */
  reduceMotion?: boolean;
};

const fillWarm =
  "bg-[linear-gradient(180deg,oklch(0.82_0.1_82)_0%,oklch(0.58_0.12_48)_38%,oklch(0.42_0.1_35)_100%)]";
const fillCool =
  "bg-[linear-gradient(180deg,oklch(0.72_0.09_185)_0%,oklch(0.48_0.1_200)_42%,oklch(0.32_0.07_230)_100%)]";

/** Illuminated marquee strip — bulb texture reads from distance without clutter */
export function MarqueeLightBar({
  sideLabel,
  votes,
  pct,
  accent,
  bulbsLit,
  compact,
  projector,
  leading,
  reduceMotion,
}: Props) {
  const warm = accent === "coral";
  const fill = warm ? fillWarm : fillCool;
  const wall = Boolean(projector);
  const motionSafe = Boolean(reduceMotion);

  return (
    <div
      className={cn(
        "rounded-[1.25rem] transition-[box-shadow,transform] duration-500 ease-out",
        leading &&
          "shadow-[0_0_48px_oklch(0.78_0.12_78/0.22),0_0_0_2px_oklch(0.85_0.12_78/0.45)] ring-2 ring-amber-400/35 ring-offset-2 ring-offset-[oklch(0.06_0.02_260)]",
        leading && wall && "-mx-1 px-1 pb-1 pt-0.5 md:-mx-2 md:px-2",
      )}
    >
      <div className={cn("flex items-end justify-between", compact && !wall ? "mb-1.5 gap-3" : "mb-4 gap-6")}>
        <span
          className={cn(
            "font-mono uppercase tracking-[0.18em] text-[var(--kc-cream-dim)]",
            wall
              ? "text-[clamp(1rem,2.4vw,1.35rem)] tracking-[0.14em]"
              : compact
                ? "text-[0.58rem] tracking-[0.12em]"
                : "text-[clamp(0.72rem,1.8vw,0.95rem)]",
            leading && "font-semibold text-[var(--kc-champagne)]",
          )}
        >
          {sideLabel}
          {leading ? <span className="ml-2 text-amber-200/95">● LIVE LEAD</span> : null}
        </span>
        <div className="flex flex-col items-end gap-1">
          <motion.span
            key={votes}
            initial={motionSafe ? false : { scale: 1.04, opacity: 0.88 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className={cn(
              "font-heading tabular-nums leading-none text-[var(--kc-cream)] drop-shadow-[0_4px_24px_oklch(0_0_0/0.45)]",
              wall ? "text-[clamp(2.75rem,8vw,5rem)]" : compact ? "text-xl sm:text-2xl" : "text-[clamp(2.25rem,6vw,4rem)]",
            )}
          >
            {votes}
          </motion.span>
          <motion.span
            className={cn(
              "font-mono tabular-nums tracking-[0.12em] text-[var(--kc-champagne)]/90",
              wall ? "text-[clamp(1rem,2.6vw,1.45rem)]" : "text-[clamp(0.65rem,1.6vw,0.85rem)]",
            )}
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
          >
            {pct < 10 ? pct.toFixed(1) : Math.round(pct)}%
          </motion.span>
        </div>
      </div>
      <div
        className={cn(
          "relative overflow-hidden rounded-full border border-[oklch(0.72_0.05_78/0.28)] bg-[oklch(0.05_0.02_260)] shadow-[inset_0_3px_12px_oklch(0_0_0/0.65)]",
          wall ? "h-[clamp(1.25rem,4vw,2.75rem)]" : compact ? "h-2 sm:h-2.5" : "h-[clamp(1.35rem,3.2vw,2rem)]",
          leading && "border-amber-400/40",
        )}
      >
        {/* Dark raceway + bulb sockets */}
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              oklch(0.08 0.02 260) 0px,
              oklch(0.08 0.02 260) 9px,
              oklch(0.14 0.02 260) 9px,
              oklch(0.14 0.02 260) 18px
            )`,
          }}
          aria-hidden
        />
        {/* Twinkling bulb highlights along strip */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 mix-blend-screen",
            bulbsLit && "kc-marquee-bulbs-motion opacity-60",
            !bulbsLit && "opacity-35",
          )}
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent 0px,
              transparent 7px,
              oklch(0.92 0.05 85 / 0.14) 7px,
              oklch(0.92 0.05 85 / 0.14) 10px
            )`,
          }}
          aria-hidden
        />
        <motion.div
          className={cn(
            "relative z-[1] h-full rounded-full shadow-[0_0_24px_oklch(0.85_0.08_82/0.35),inset_0_2px_6px_oklch(1_0_0/0.22)]",
            fill,
            leading && "brightness-[1.08]",
          )}
          initial={false}
          animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          transition={
            motionSafe
              ? { type: "tween", duration: 0.4, ease: [0.22, 1, 0.36, 1] }
              : wall
                ? { type: "spring", stiffness: 96, damping: 26, mass: 1 }
                : { type: "spring", stiffness: 72, damping: 20, mass: 0.85 }
          }
        />
      </div>
    </div>
  );
}
