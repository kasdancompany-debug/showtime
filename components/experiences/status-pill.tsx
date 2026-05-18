import type { ExperienceStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const LABELS: Record<ExperienceStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  archived: "Archived",
};

export function ExperienceStatusPill({ status }: { status: ExperienceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-sm border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em]",
        status === "ready" &&
          "border-[color-mix(in_oklch,var(--kc-gold-bright)_45%,transparent)] text-[var(--kc-gold-bright)]",
        status === "draft" &&
          "border-[color-mix(in_oklch,var(--kc-champagne)_35%,transparent)] text-[var(--kc-champagne)]",
        status === "archived" && "border-white/10 text-white/40",
      )}
    >
      {LABELS[status]}
    </span>
  );
}
