"use client";

import type { ReactNode } from "react";
import { Monitor, Radio, Users } from "lucide-react";

import type { RealtimeProbeStatus } from "@/hooks/use-event-room-realtime-probe";
import type { ShowtimeSyncMode } from "@/lib/showtime/sync-mode";
import { showtimeSyncModeLabel } from "@/lib/showtime/sync-mode";
import type { LiveShowStatus } from "@/lib/store/mock-event-store";
import { cn } from "@/lib/utils";

function realtimeHuman(syncMode: ShowtimeSyncMode, status: RealtimeProbeStatus, short: boolean): string {
  if (syncMode === "local_preview") {
    if (short) return status === "unsupported" ? "Tabs" : "Browser";
    return status === "unsupported" ? "Tabs only" : "Browser sync";
  }
  if (short) {
    switch (status) {
      case "subscribed":
        return "OK";
      case "connecting":
        return "…";
      case "error":
        return "Error";
      case "idle":
        return "Idle";
      default:
        return "—";
    }
  }
  switch (status) {
    case "subscribed":
      return "Realtime OK";
    case "connecting":
      return "Connecting…";
    case "error":
      return "Realtime error";
    case "idle":
      return "Realtime idle";
    default:
      return "—";
  }
}

const statusHue: Record<LiveShowStatus, string> = {
  draft: "bg-[oklch(0.55_0.02_265)]",
  waiting: "bg-[oklch(0.62_0.06_78)]",
  playing: "bg-[oklch(0.72_0.09_78)]",
  voting: "bg-[oklch(0.58_0.11_175)]",
  revealing: "bg-[oklch(0.74_0.08_78)]",
  ended: "bg-[oklch(0.42_0.02_265)]",
};

type Props = {
  eventTitle: string;
  eventCode: string;
  syncMode: ShowtimeSyncMode;
  screenConnected: boolean;
  audienceCount: number;
  realtimeStatus: RealtimeProbeStatus;
  liveStatus: LiveShowStatus;
  liveStatusLabel: string;
  voteOpen: boolean;
  /** Right-side actions (e.g. Open /screen). */
  actions?: ReactNode;
  /** Tighter bar for laptop viewports. */
  density?: "default" | "compact";
};

export function HostDeskStatusBar({
  eventTitle,
  eventCode,
  syncMode,
  screenConnected,
  audienceCount,
  realtimeStatus,
  liveStatus,
  liveStatusLabel,
  voteOpen,
  actions,
  density = "default",
}: Props) {
  const compact = density === "compact";
  return (
    <header
      className={cn(
        "sticky top-0 z-50 shrink-0 border-b border-[var(--host-divider,oklch(1_0_0/0.07))] bg-[oklch(0.091_0.012_265)]",
        compact ? "px-3 py-2.5" : "px-4 py-3 md:px-6",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-[1600px] flex-col lg:flex-row lg:items-center lg:justify-between",
          compact ? "gap-2 lg:gap-4" : "gap-3 lg:gap-6",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "size-2.5 shrink-0 rounded-full ring-2 ring-[oklch(1_0_0/0.12)]",
                statusHue[liveStatus],
              )}
              title={liveStatusLabel}
            />
            <h1
              className={cn(
                "truncate font-sans font-semibold tracking-tight text-[var(--kc-cream)]",
                compact ? "text-[1.05rem] sm:text-lg" : "text-xl md:text-2xl",
              )}
            >
              {eventTitle}
            </h1>
          </div>
          <p
            className={cn(
              "mt-1 font-mono tabular-nums text-[var(--kc-cream-dim)]",
              compact ? "text-[0.8rem] sm:text-sm" : "text-sm md:text-base",
            )}
          >
            Code{" "}
            <span className="font-semibold text-[oklch(0.88_0.06_82)]">{eventCode}</span>
            {voteOpen ? (
              <span
                className={cn(
                  "ml-2 inline-flex items-center rounded-md bg-[oklch(0.78_0.09_78/0.22)] px-2 py-0.5 font-sans font-semibold text-[oklch(0.93_0.04_82)] ring-1 ring-[oklch(0.82_0.1_78/0.35)]",
                  compact ? "text-[0.65rem]" : "text-xs md:text-sm",
                )}
              >
                {compact ? "Vote live" : "Voting live"}
              </span>
            ) : null}
          </p>
        </div>

        <div className={cn("flex flex-wrap items-stretch gap-1.5 sm:gap-2", compact && "md:max-w-[58%] lg:max-w-none")}>
          <StatusChip
            label="Mode"
            value={showtimeSyncModeLabel(syncMode)}
            emphasize={syncMode === "live_supabase"}
            compact={compact}
          />
          <StatusChip
            label="Screen"
            value={screenConnected ? (compact ? "OK" : "Connected") : compact ? "—" : "Not seen"}
            variant={screenConnected ? "ok" : "warn"}
            icon={<Monitor className={cn("shrink-0 opacity-90", compact ? "size-3.5" : "size-5")} />}
            compact={compact}
          />
          <StatusChip
            label={compact ? "Aud" : "Audience"}
            value={String(audienceCount)}
            icon={<Users className={cn("shrink-0 opacity-90", compact ? "size-3.5" : "size-5")} />}
            compact={compact}
          />
          <StatusChip
            label={compact ? "RT" : "Realtime"}
            value={realtimeHuman(syncMode, realtimeStatus, compact)}
            variant={realtimeStatus === "subscribed" || syncMode === "local_preview" ? "ok" : realtimeStatus === "error" ? "bad" : "neutral"}
            icon={<Radio className={cn("shrink-0 opacity-90", compact ? "size-3.5" : "size-5")} />}
            compact={compact}
          />
          {actions ? <div className="flex shrink-0 items-center justify-end pl-1">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}

function StatusChip({
  label,
  value,
  variant = "neutral",
  emphasize,
  icon,
  compact = false,
}: {
  label: string;
  value: string;
  variant?: "neutral" | "ok" | "warn" | "bad";
  emphasize?: boolean;
  icon?: ReactNode;
  compact?: boolean;
}) {
  const surface =
    variant === "ok"
      ? "bg-[oklch(0.62_0.11_175/0.12)] ring-1 ring-[oklch(0.62_0.11_175/0.28)]"
      : variant === "warn"
        ? "bg-[oklch(0.72_0.12_78/0.08)] ring-1 ring-[oklch(0.78_0.1_78/0.22)]"
        : variant === "bad"
          ? "bg-red-500/10 ring-1 ring-red-500/35"
          : "bg-[oklch(1_0_0/0.04)] ring-1 ring-[oklch(1_0_0/0.06)]";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col justify-center rounded-lg",
        compact ? "min-h-[2.5rem] px-2 py-1.5 sm:min-w-[4.5rem]" : "min-h-[3.25rem] min-w-[6.75rem] px-3 py-2 sm:min-w-[7.75rem] md:px-3.5",
        surface,
        emphasize && "bg-[oklch(0.78_0.09_78/0.14)] ring-[oklch(0.82_0.1_78/0.38)]",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {icon}
        <p
          className={cn(
            "font-mono font-medium uppercase tracking-wide text-[var(--kc-cream-dim)]",
            compact ? "text-[0.6rem]" : "text-[0.65rem]",
          )}
        >
          {label}
        </p>
      </div>
      <p
        className={cn(
          "truncate font-sans font-semibold tabular-nums leading-tight tracking-tight text-[var(--kc-cream)]",
          variant === "ok" && "text-[oklch(0.88_0.06_165)]",
          variant === "bad" && "text-red-200",
          compact ? "mt-0.5 text-[0.8rem] sm:text-sm" : "mt-0.5 text-base md:text-lg",
        )}
      >
        {value}
      </p>
    </div>
  );
}
