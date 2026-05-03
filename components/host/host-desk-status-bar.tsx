"use client";

import type { ReactNode } from "react";
import { Monitor, Radio, Users } from "lucide-react";

import type { RealtimeProbeStatus } from "@/hooks/use-event-room-realtime-probe";
import type { ShowtimeSyncMode } from "@/lib/showtime/sync-mode";
import { showtimeSyncModeLabel } from "@/lib/showtime/sync-mode";
import type { LiveShowStatus } from "@/lib/store/mock-event-store";
import { cn } from "@/lib/utils";

function realtimeHuman(syncMode: ShowtimeSyncMode, status: RealtimeProbeStatus): string {
  if (syncMode === "local_preview") {
    return status === "unsupported" ? "Tabs only" : "Browser sync";
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
  draft: "bg-[oklch(0.5_0.03_75)]",
  waiting: "bg-[oklch(0.58_0.06_85)]",
  playing: "bg-[oklch(0.62_0.12_55)]",
  voting: "bg-[oklch(0.62_0.12_185)]",
  revealing: "bg-[oklch(0.72_0.1_78)]",
  ended: "bg-[oklch(0.45_0.02_260)]",
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
}: Props) {
  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-[var(--bn-line)] bg-[oklch(0.09_0.02_260/0.92)] px-4 py-3 shadow-[0_8px_32px_oklch(0_0_0/0.35)] backdrop-blur-md md:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("size-3 shrink-0 rounded-full ring-2 ring-white/20", statusHue[liveStatus])} title={liveStatusLabel} />
            <h1 className="truncate font-heading text-xl font-normal tracking-tight text-foreground md:text-2xl">{eventTitle}</h1>
          </div>
          <p className="mt-1 font-mono text-base tabular-nums text-muted-foreground md:text-lg">
            Code <span className="text-[var(--kc-champagne)]">{eventCode}</span>
            {voteOpen ? (
              <span className="ml-3 inline-flex items-center rounded-md bg-[oklch(0.55_0.14_185/0.35)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-[oklch(0.92_0.05_185)] md:text-sm">
                Voting open
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-stretch gap-2 md:gap-3">
          <StatusChip label="Mode" value={showtimeSyncModeLabel(syncMode)} emphasize={syncMode === "live_supabase"} />
          <StatusChip
            label="Screen"
            value={screenConnected ? "Connected" : "Not seen"}
            variant={screenConnected ? "ok" : "warn"}
            icon={<Monitor className="size-5 shrink-0 opacity-90" />}
          />
          <StatusChip
            label="Audience"
            value={String(audienceCount)}
            icon={<Users className="size-5 shrink-0 opacity-90" />}
          />
          <StatusChip
            label="Realtime"
            value={realtimeHuman(syncMode, realtimeStatus)}
            variant={realtimeStatus === "subscribed" || syncMode === "local_preview" ? "ok" : realtimeStatus === "error" ? "bad" : "neutral"}
            icon={<Radio className="size-5 shrink-0 opacity-90" />}
          />
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
}: {
  label: string;
  value: string;
  variant?: "neutral" | "ok" | "warn" | "bad";
  emphasize?: boolean;
  icon?: ReactNode;
}) {
  const ring =
    variant === "ok"
      ? "border-emerald-500/35 bg-emerald-500/10"
      : variant === "warn"
        ? "border-amber-500/40 bg-amber-500/12"
        : variant === "bad"
          ? "border-red-500/45 bg-red-500/12"
          : "border-[var(--bn-line)] bg-card/50";
  return (
    <div
      className={cn(
        "flex min-h-[3.25rem] min-w-[6.5rem] flex-1 flex-col justify-center rounded-xl border px-3 py-2 sm:min-w-[7.5rem] md:px-4",
        ring,
        emphasize && "border-primary/40 bg-primary/15",
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-0.5 font-heading text-lg leading-tight text-foreground md:text-xl">{value}</p>
    </div>
  );
}
