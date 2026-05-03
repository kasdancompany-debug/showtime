"use client";

import { useId } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

type Props = {
  seconds: number;
  fraction?: number;
  className?: string;
  label?: string;
  /** Larger decorative ring + type for auditorium projection; `corner` is a small HUD for fullscreen ballot */
  variant?: "default" | "screen" | "corner";
};

export function CountdownMedallion({
  seconds,
  fraction = 1,
  className,
  label = "Time remaining",
  variant = "default",
}: Props) {
  const gid = useId();
  const screen = variant === "screen";
  const corner = variant === "corner";
  const r = corner ? 24 : screen ? 68 : 54;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - fraction);
  const vb = corner ? 62 : screen ? 168 : 128;
  const strokeW = corner ? 2.25 : screen ? 3.5 : 3;
  const gradId = `kc-medal-stroke-${gid.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div
      className={cn(
        corner ? "flex flex-col items-end gap-1" : "flex flex-col items-center gap-5 md:gap-6",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full",
          corner && "size-[3.6rem] sm:size-[3.85rem]",
          screen && "size-[min(22rem,72vw)] md:size-[min(26rem,52vw)]",
          !corner && !screen && "size-[7.5rem] md:size-[9rem]",
        )}
      >
        {/* Outer studio ring */}
        <div
          className={cn(
            "absolute rounded-full border border-[oklch(0.72_0.05_78/0.22)] bg-[radial-gradient(circle_at_50%_35%,oklch(0.14_0.03_48/0.5)_0%,oklch(0.08_0.02_260/0.25)_100%)] shadow-[0_0_60px_oklch(0_0_0/0.35),inset_0_1px_0_oklch(0.88_0.04_85/0.08)]",
            corner && "inset-px",
            screen && "inset-[6px]",
            !corner && !screen && "inset-0",
          )}
          aria-hidden
        />
        <div
          className={cn(
            "absolute rounded-full border border-[oklch(0.72_0.06_78/0.18)]",
            corner && "inset-[3px]",
            screen && "inset-[14px]",
            !corner && !screen && "inset-[5px]",
          )}
          aria-hidden
        />
        <svg
          className="absolute size-full -rotate-90 text-[oklch(0.72_0.06_78/0.75)]"
          viewBox={`0 0 ${vb} ${vb}`}
          aria-hidden
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="oklch(0.78 0.08 78)" stopOpacity="0.95" />
              <stop offset="55%" stopColor="oklch(0.62 0.06 72)" stopOpacity="0.85" />
              <stop offset="100%" stopColor="oklch(0.48 0.05 65)" stopOpacity="0.75" />
            </linearGradient>
          </defs>
          <circle
            cx={vb / 2}
            cy={vb / 2}
            r={r}
            fill="none"
            stroke="oklch(0.22 0.03 260 / 0.55)"
            strokeWidth={strokeW}
          />
          <motion.circle
            cx={vb / 2}
            cy={vb / 2}
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={c}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.35 }}
          />
        </svg>
        <span
          className={cn(
            "relative text-balance text-center font-heading tabular-nums leading-none tracking-tight text-[var(--kc-cream)] drop-shadow-[0_6px_36px_oklch(0_0_0/0.55)]",
            corner && "text-[1.15rem] sm:text-[1.35rem] text-[var(--kc-cream)]",
            screen && "text-[clamp(4.5rem,18vw,12rem)]",
            !corner && !screen && "text-[clamp(2.25rem,8vw,3.25rem)] md:text-[clamp(2.5rem,6vw,3.5rem)]",
          )}
        >
          {seconds}
        </span>
      </div>
      <p
        className={cn(
          "font-[family-name:var(--font-ui)] font-medium uppercase text-[oklch(0.78_0.04_85)]",
            corner &&
              "max-w-[7rem] text-right text-[0.5rem] leading-snug tracking-[0.12em] text-[oklch(0.88_0.06_82/0.95)] sm:text-[0.52rem]",
          screen && "max-w-[18rem] text-balance text-center text-[clamp(0.68rem,1.8vw,0.88rem)] tracking-[0.26em]",
          !corner && !screen && "max-w-[18rem] text-balance text-center text-[0.6875rem] tracking-[0.22em]",
        )}
      >
        {label}
      </p>
    </div>
  );
}
