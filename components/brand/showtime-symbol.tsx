import { cn } from "@/lib/utils";

export type SymbolTone = "onDark" | "onLight" | "mono";

type Props = {
  className?: string;
  /**
   * onDark  — Reel Cream ring, Showtime Red dot (the default; most surfaces are Theatre Black)
   * onLight — Theatre Black ring, Showtime Red dot (tickets, paper, light backgrounds)
   * mono    — one colour: ring and dot both take `currentColor`
   */
  tone?: SymbolTone;
  /** Accessible name. Omit when the symbol is purely decorative (it will be hidden from assistive tech). */
  title?: string;
};

function toneColors(tone: SymbolTone) {
  return {
    ring: tone === "onLight" ? "var(--sh-black)" : tone === "mono" ? "currentColor" : "var(--sh-cream)",
    dot: tone === "mono" ? "currentColor" : "var(--sh-red)",
  };
}

/**
 * The raw shapes of the symbol on a 100×100 grid, for embedding inside other SVGs
 * (dividers, countdowns, icons). Geometry is taken from the brand guide (Board 03, Standalone
 * Icon): ring r 50→32, clear gap 32→23, dot r=23, and a 3-unit slit through both sides of the
 * ring only — it never cuts the dot.
 */
export function SymbolGlyph({ tone = "onDark" }: { tone?: SymbolTone }) {
  const { ring, dot } = toneColors(tone);
  return (
    <>
      <path d="M0.02 48.5A50 50 0 0 1 99.98 48.5L81.97 48.5A32 32 0 0 0 18.03 48.5Z" fill={ring} />
      <path d="M0.02 51.5A50 50 0 0 0 99.98 51.5L81.97 51.5A32 32 0 0 1 18.03 51.5Z" fill={ring} />
      <circle cx="50" cy="50" r="23" fill={dot} />
    </>
  );
}

/** The Showtime symbol — a target "O" (see {@link SymbolGlyph} for the geometry). */
export function ShowtimeSymbol({ className, tone = "onDark", title }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("block", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <SymbolGlyph tone={tone} />
    </svg>
  );
}
