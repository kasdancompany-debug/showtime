"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Static grain — preferred for premium projection (no breathing motion). */
  still?: boolean;
};

export function FilmGrain({ className, still = false }: Props) {
  const style = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
    backgroundSize: "200px 200px",
  } as const;

  if (still) {
    return (
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-[1] overflow-hidden opacity-[0.035] mix-blend-overlay",
          className,
        )}
        style={style}
      />
    );
  }

  return (
    <motion.div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-[1] overflow-hidden opacity-[0.045] mix-blend-overlay",
        className,
      )}
      initial={{ opacity: 0.032 }}
      animate={{ opacity: [0.032, 0.044, 0.036] }}
      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      style={style}
    />
  );
}
