import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { SymbolGlyph } from "./showtime-symbol";

/**
 * Brand visual language (guide Board 04): one symbol, branching lines, light & texture.
 * Everything here is pure CSS/SVG — crisp at projector resolution, no image assets, no network.
 */

type StageProps = {
  className?: string;
  /** Red velvet curtains framing the left and right edges */
  curtains?: boolean;
  /** Spotlight cone from the upper right */
  spotlight?: boolean;
  /** Red + cream rays radiating from the centre to every screen edge */
  radiant?: boolean;
  /** Warm floor-light and centre bloom */
  glow?: boolean;
  /** Darkens the edges so type always sits on black */
  vignette?: boolean;
  /** Film grain */
  grain?: boolean;
};

/**
 * The cinematic stage — drop it as the first child of any `position: relative` container.
 * It fills the container and sits behind everything that follows.
 */
export function StageBackdrop({
  className,
  curtains = true,
  spotlight = true,
  radiant = true,
  glow = true,
  vignette = true,
  grain = true,
}: StageProps) {
  return (
    <div className={cn("sh-stage", className)} aria-hidden>
      {glow ? <div className="sh-stage__glow" /> : null}
      {radiant ? (
        <div className="sh-radiant">
          <div className="sh-radiant__rays" />
        </div>
      ) : null}
      {spotlight ? <div className="sh-spotlight" /> : null}
      {curtains ? (
        <>
          <div className="sh-curtain sh-curtain--left" />
          <div className="sh-curtain sh-curtain--right" />
        </>
      ) : null}
      {vignette ? <div className="sh-vignette" /> : null}
      {grain ? <div className="sh-grain" /> : null}
    </div>
  );
}

/** The signature short red rule that sits under a headline. */
export function RedRule({
  className,
  center = false,
  delay,
}: {
  className?: string;
  center?: boolean;
  /** Seconds before the wipe-in animation starts */
  delay?: number;
}) {
  return (
    <span
      className={cn("sh-rule", center && "sh-rule--center", delay != null && "sh-wipe", className)}
      style={delay != null ? ({ "--d": `${delay}s` } as CSSProperties) : undefined}
      aria-hidden
    />
  );
}

/** Wraps content in the film-frame corner marks used in the title-sequence stills. */
export function FilmFrame({
  children,
  className,
  color,
}: {
  children: ReactNode;
  className?: string;
  /** Any CSS colour; defaults to translucent Reel Cream */
  color?: string;
}) {
  return (
    <div className={cn("sh-frame", className)} style={color ? ({ "--sh-frame-c": color } as CSSProperties) : undefined}>
      {children}
    </div>
  );
}

/**
 * Section divider: two paths — one red, one cream — that branch off either side and converge on
 * the symbol. This is the brand's "flow" composition used as a rule.
 */
export function BranchDivider({ className, tone = "onDark" }: { className?: string; tone?: "onDark" | "onLight" }) {
  const cream = tone === "onLight" ? "var(--sh-black)" : "var(--sh-cream)";
  return (
    <svg
      viewBox="0 0 400 36"
      className={cn("mx-auto block h-auto w-full max-w-[26rem]", className)}
      fill="none"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      {/* left: red climbs, cream falls, both converge on the centre line */}
      <path d="M0 8H62C96 8 104 18 138 18H187" stroke="var(--sh-red)" vectorEffect="non-scaling-stroke" />
      <path d="M0 28H62C96 28 104 18 138 18" stroke={cream} strokeOpacity="0.85" vectorEffect="non-scaling-stroke" />
      {/* right: mirrored */}
      <path d="M400 8H338C304 8 296 18 262 18H213" stroke="var(--sh-red)" vectorEffect="non-scaling-stroke" />
      <path d="M400 28H338C304 28 296 18 262 18" stroke={cream} strokeOpacity="0.85" vectorEffect="non-scaling-stroke" />
      <g transform="translate(187 5) scale(0.26)">
        <SymbolGlyph tone={tone} />
      </g>
    </svg>
  );
}

/**
 * A/B choice marker — A is Showtime Red, B is Reel Cream, everywhere (projector, phones, desk).
 * Size it with `className` (e.g. `size-16 text-3xl`).
 */
export function ChoiceBadge({ letter, className }: { letter: "A" | "B"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-heading font-black leading-none",
        letter === "A" ? "bg-[var(--sh-red)] text-[var(--sh-on-red)]" : "bg-[var(--sh-cream)] text-[var(--sh-black)]",
        className,
      )}
      style={{ fontVariationSettings: '"wdth" 100' }}
    >
      {letter}
    </span>
  );
}

export type LiveDotStatus = "live" | "connecting" | "down";

/** Realtime connection dot: red "on air" when live, Golden Hour while reconnecting, hollow grey when offline. */
export function LiveDot({ status, className }: { status: LiveDotStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "sh-live-dot",
        status === "connecting" && "sh-live-dot--connecting",
        status === "down" && "sh-live-dot--down",
        className,
      )}
    />
  );
}
