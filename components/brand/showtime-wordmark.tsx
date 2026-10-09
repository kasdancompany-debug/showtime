import { cn } from "@/lib/utils";

import { ShowtimeSymbol, type SymbolTone } from "./showtime-symbol";

type WordmarkProps = {
  className?: string;
  /** onDark = cream letters (default). onLight = Theatre Black letters. */
  tone?: Exclude<SymbolTone, "mono">;
  /** Hide the "SHOWTIME" label from assistive tech when something else already names it. */
  decorative?: boolean;
  /** For small sizes (headers, badges): relaxes the condensing so the hairline serifs stay legible. */
  compact?: boolean;
};

/**
 * SHOWTIME with the target symbol standing in for the O. Size it with font-size
 * (e.g. `text-6xl`) — the symbol scales with the letters.
 *
 * Set in Noto Serif Display at maximum weight with the width axis pulled to ~66% — the closest
 * open match to the brand's custom tall, condensed Didone lettering.
 */
export function ShowtimeWordmark({ className, tone = "onDark", decorative = false, compact = false }: WordmarkProps) {
  return (
    <span
      className={cn("sh-wordmark", compact && "sh-wordmark--sm", tone === "onLight" && "sh-wordmark--ink", className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Showtime"}
      aria-hidden={decorative ? true : undefined}
    >
      <span aria-hidden>SH</span>
      <ShowtimeSymbol className="sh-wordmark__o" tone={tone} />
      <span aria-hidden>WTIME</span>
    </span>
  );
}

type LockupProps = WordmarkProps & {
  /** Show "THE STORY IS OURS." beneath the wordmark. */
  tagline?: boolean;
};

/**
 * Wordmark + tagline, stacked and centred — the brand's primary logo lockup.
 * The tagline is sized in `em`, so it keeps its proportion to the wordmark at any size.
 */
export function ShowtimeLockup({ className, tone = "onDark", tagline = true, decorative = false }: LockupProps) {
  return (
    <span className={cn("inline-flex flex-col items-center", className)}>
      <ShowtimeWordmark tone={tone} decorative={decorative} />
      {tagline ? (
        <span className={cn("sh-tagline", tone === "onLight" ? "text-[var(--sh-black)]" : "text-[var(--sh-cream)]")}>
          The story is ours.
        </span>
      ) : null}
    </span>
  );
}
