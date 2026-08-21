import { cn } from "@/lib/utils";

/**
 * Reusable Hollywood Golden Age / Art Deco ornament primitives, built on the existing
 * `kasdan-hollywood` gold/piano/velvet token system (see app/globals.css). Kept as small,
 * composable pieces so each surface can opt into only the ornament it needs.
 */

/** Stepped-fan corner ornament used by DecoProscenium and anywhere a single corner accent is wanted. */
function DecoCornerMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <path d="M2 20 V4 H18" stroke="currentColor" strokeWidth="2" />
      <path d="M2 28 V44 H18" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <path d="M8 4 L8 12 L16 12" stroke="currentColor" strokeWidth="1.2" opacity="0.75" />
      <circle cx="8" cy="20" r="1.6" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

/**
 * Proscenium frame — thin double-gold-rule border with stepped corner ornaments, echoing a
 * movie-palace screen surround. Wrap the video stage (or any hero rectangle) with this;
 * the wrapped element must fill its own box (frame is layered via ::before, see globals.css).
 */
export function DecoProscenium({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("kc-proscenium", className)}>
      {children}
      <div className="kc-proscenium__corner kc-proscenium__corner--tl text-[var(--kc-gold-bright)]">
        <DecoCornerMark />
      </div>
      <div className="kc-proscenium__corner kc-proscenium__corner--tr text-[var(--kc-gold-bright)]">
        <DecoCornerMark />
      </div>
      <div className="kc-proscenium__corner kc-proscenium__corner--bl text-[var(--kc-gold-bright)]">
        <DecoCornerMark />
      </div>
      <div className="kc-proscenium__corner kc-proscenium__corner--br text-[var(--kc-gold-bright)]">
        <DecoCornerMark />
      </div>
    </div>
  );
}

/**
 * Stepped-fan corner flourish without the proscenium's full border — for cards that already
 * have their own border/shell (e.g. the join ballot) and just want the corner accent upgraded
 * from a plain L-bracket to the Deco fan mark.
 */
export function DecoCorners({ className }: { className?: string }) {
  return (
    <div className={cn("kc-deco-corners", className)} aria-hidden>
      <div className="kc-proscenium__corner kc-proscenium__corner--tl text-[var(--kc-gold-bright)]">
        <DecoCornerMark />
      </div>
      <div className="kc-proscenium__corner kc-proscenium__corner--tr text-[var(--kc-gold-bright)]">
        <DecoCornerMark />
      </div>
      <div className="kc-proscenium__corner kc-proscenium__corner--bl text-[var(--kc-gold-bright)]">
        <DecoCornerMark />
      </div>
      <div className="kc-proscenium__corner kc-proscenium__corner--br text-[var(--kc-gold-bright)]">
        <DecoCornerMark />
      </div>
    </div>
  );
}

/**
 * Radial sunburst field, low-opacity, meant to sit behind a hero title. Parent must be
 * `position: relative` (or a stacking context) with overflow hidden; this renders absolute,
 * z-index 0, so give hero text `position: relative; z-index: 1`.
 */
export function DecoSunburst({ className }: { className?: string }) {
  return (
    <div className={cn("kc-sunburst", className)} aria-hidden>
      <div className="kc-sunburst__rays" />
    </div>
  );
}

/** Chevron / zigzag divider — alternative to the diamond-rule divider for section breaks. */
export function DecoChevronDivider({ className }: { className?: string }) {
  return (
    <div className={cn("kc-chevron-divider", className)} aria-hidden>
      <span className="kc-chevron-divider__line" />
      <span className="kc-chevron-divider__marks">
        <svg viewBox="0 0 11 7" fill="none">
          <path d="M1 1 L5.5 6 L10 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg viewBox="0 0 11 7" fill="none">
          <path d="M1 1 L5.5 6 L10 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg viewBox="0 0 11 7" fill="none">
          <path d="M1 1 L5.5 6 L10 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="kc-chevron-divider__line" />
    </div>
  );
}

export type LiveDotStatus = "live" | "connecting" | "down";

/** Small glanceable realtime connection dot for a persistent status readout (not just an error banner). */
export function LiveDot({ status, className }: { status: LiveDotStatus; className?: string }) {
  return (
    <span
      className={cn(
        "kc-live-dot",
        status === "connecting" && "kc-live-dot--connecting",
        status === "down" && "kc-live-dot--down",
        className,
      )}
      aria-hidden
    />
  );
}
