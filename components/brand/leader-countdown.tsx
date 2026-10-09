import { cn } from "@/lib/utils";

type Props = {
  /** Whole seconds remaining */
  seconds: number;
  /** Starting value, so the ring can drain proportionally. Defaults to the larger of `seconds` and 10. */
  total?: number;
  className?: string;
  /** Caption under the dial (e.g. "Choose now"). Omit for the dial alone. */
  label?: string;
};

/**
 * Film-leader countdown (guide Board 07, "Branded Countdown"): a ringed disc with crosshairs and a
 * big serif numeral. The ring drains in Showtime Red; in the last three seconds the numeral and
 * glow turn red as well.
 */
export function LeaderCountdown({ seconds, total, className, label }: Props) {
  const safe = Math.max(0, Math.round(seconds));
  const span = Math.max(1, total ?? Math.max(safe, 10));
  const fraction = Math.min(1, safe / span);
  const urgent = safe > 0 && safe <= 3;
  const r = 106;
  const c = 2 * Math.PI * r;

  return (
    <div className={cn("flex flex-col items-center gap-[0.7em]", className)} role="timer" aria-live="off" aria-label={`${safe} seconds remaining`}>
      <svg viewBox="0 0 240 240" className="block aspect-square w-full" fill="none" aria-hidden focusable="false">
        <defs>
          <radialGradient id="sh-leader-disc" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor={urgent ? "#3a1111" : "#262320"} />
            <stop offset="100%" stopColor="#0b0b0b" />
          </radialGradient>
        </defs>
        <circle cx="120" cy="120" r="112" fill="url(#sh-leader-disc)" />
        {/* crosshairs, running edge to edge behind the numeral */}
        <path d="M120 2V238M2 120H238" stroke="#f7f1e6" strokeOpacity="0.22" strokeWidth="1" />
        <circle cx="120" cy="120" r="112" stroke="#f7f1e6" strokeOpacity="0.55" strokeWidth="1.5" />
        <circle cx="120" cy="120" r="98" stroke="#f7f1e6" strokeOpacity="0.2" strokeWidth="1" />
        {/* time remaining */}
        <circle
          cx="120"
          cy="120"
          r={r}
          stroke="#d62828"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          transform="rotate(-90 120 120)"
          style={{ transition: "stroke-dashoffset 0.9s linear" }}
        />
        {/* clear the crosshair behind the numeral so it reads cleanly */}
        <circle cx="120" cy="120" r="56" fill={urgent ? "#1d0b0b" : "#0f0e0d"} fillOpacity="0.92" />
        <text
          x="120"
          y="124"
          textAnchor="middle"
          dominantBaseline="central"
          fill={urgent ? "#ef5b54" : "#f7f1e6"}
          fontSize={safe >= 100 ? 58 : safe >= 10 ? 76 : 104}
          style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontVariantNumeric: "tabular-nums" }}
        >
          {safe}
        </text>
      </svg>
      {label ? <span className="sh-eyebrow !text-[0.38em] !tracking-[0.42em]">{label}</span> : null}
    </div>
  );
}
