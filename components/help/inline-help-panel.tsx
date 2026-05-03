"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type InlineHelpPanelProps = {
  /** Shown on the collapsed summary row (e.g. topic title). */
  summary: string;
  whatThisMeans: ReactNode;
  howToFix: ReactNode;
  commonCauses: ReactNode;
  className?: string;
  /** When true, panel starts open (e.g. next to an active error). */
  defaultOpen?: boolean;
  /** `join` = light borders on dark join UI; `host` = operator desk tokens. */
  surface?: "join" | "host";
};

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--kc-champagne)]/95">
      {children}
    </h4>
  );
}

export function HelpBulletedList({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-4 marker:text-muted-foreground/80">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Expandable in-app help — no external doc links. */
export function InlineHelpPanel({
  summary,
  whatThisMeans,
  howToFix,
  commonCauses,
  className,
  defaultOpen = false,
  surface = "join",
}: InlineHelpPanelProps) {
  const surfaceClass =
    surface === "host"
      ? "border-[var(--bn-line)] bg-black/30 text-foreground/90"
      : "border-white/10 bg-white/[0.04] text-[var(--kc-cream)]";
  const innerRule = surface === "host" ? "border-[var(--bn-line)]" : "border-white/10";

  return (
    <details
      open={defaultOpen}
      className={cn(
        "rounded-2xl border px-3 py-2.5 text-left [&_summary::-webkit-details-marker]:hidden",
        surfaceClass,
        className,
      )}
    >
      <summary className="cursor-pointer list-none font-mono text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground transition hover:text-foreground">
        {summary}
      </summary>
      <div className={cn("mt-3 space-y-4 border-t pt-3 text-sm leading-relaxed text-muted-foreground", innerRule)}
      >
        <section>
          <SectionTitle>What this means</SectionTitle>
          <div className="mt-1.5">{whatThisMeans}</div>
        </section>
        <section>
          <SectionTitle>How to fix</SectionTitle>
          <div className="mt-1.5">{howToFix}</div>
        </section>
        <section>
          <SectionTitle>Common causes</SectionTitle>
          <div className="mt-1.5">{commonCauses}</div>
        </section>
      </div>
    </details>
  );
}
