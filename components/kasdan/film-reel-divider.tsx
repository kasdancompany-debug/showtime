"use client";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function FilmReelDivider({ className }: Props) {
  return (
    <div
      className={cn("relative flex h-8 w-full items-center justify-center gap-3 opacity-60", className)}
      role="separator"
      aria-hidden
    >
      <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,oklch(0.65_0.03_78/0.35),transparent)]" />
      <div className="flex gap-1 opacity-70">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="size-[5px] rounded-[1px] border border-[oklch(0.55_0.02_260/0.4)] bg-[oklch(0.12_0.02_260/0.5)]"
          />
        ))}
      </div>
      <div className="h-px flex-1 bg-[linear-gradient(90deg,transparent,oklch(0.65_0.03_78/0.35),transparent)]" />
    </div>
  );
}
