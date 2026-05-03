"use client";

import { RefreshCw, RotateCcw, Stethoscope } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RealtimeProbeStatus } from "@/hooks/use-event-room-realtime-probe";
import { showtimeSyncModeDescription, showtimeSyncModeLabel, type ShowtimeSyncMode } from "@/lib/showtime/sync-mode";
import { cn } from "@/lib/utils";

function realtimeStatusLabel(s: RealtimeProbeStatus, supabaseConfigured: boolean) {
  if (!supabaseConfigured) {
    return "Local channel (BroadcastChannel / same origin)";
  }
  switch (s) {
    case "unsupported":
      return "Unsupported";
    case "idle":
      return "Idle";
    case "connecting":
      return "Connecting…";
    case "subscribed":
      return "Connected";
    case "error":
      return "Disconnected or error";
    default:
      return s;
  }
}

function Row({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-1 border-b border-[var(--bn-line)]/80 text-xs last:border-b-0 sm:grid-cols-[11rem_1fr] sm:items-start sm:gap-3",
        compact ? "py-1.5" : "py-2.5",
      )}
    >
      <span className="font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0 font-mono text-[0.65rem] leading-relaxed text-foreground/90 break-all">{children}</div>
    </div>
  );
}

export type HostSystemCheckProps = {
  /** When true, render only inner diagnostics (parent supplies collapsible chrome). */
  embedded?: boolean;
  /** Tighter rows/padding inside embedded diagnostics (operator desk drawer). */
  embeddedCompact?: boolean;
  syncMode: ShowtimeSyncMode;
  supabaseUrlPresent: boolean;
  supabaseAnonPresent: boolean;
  joinOriginEnvRaw: string;
  joinOriginEnvDisplay: string;
  windowOrigin: string;
  joinOriginSource: "" | "env" | "window";
  joinBaseUrl: string;
  joinUrl: string;
  loopbackJoinWarning: boolean;
  eventCode: string;
  eventId: string;
  realtimeStatus: RealtimeProbeStatus;
  supabaseClientConfigured: boolean;
  lastScreenHeartbeatAt: number | null;
  screenLikelyConnected: boolean;
  audienceConnected: number;
  votePhase: string;
  enginePhase: string;
  currentNodeId: string;
  currentNodeTitle: string;
  remoteEventLookup: string;
  remoteEventError: string | null;
  bumpRealtimeProbe: () => void;
  onResetEvent: () => void;
  onResyncScreen: () => void;
  /** Clears join session + wipes loaded film / graph in this browser (see reset-local-show-data). */
  onResetLocalShowData: () => void;
};

function HostSystemCheckInner(props: HostSystemCheckProps) {
  const modeLabel = showtimeSyncModeLabel(props.syncMode);
  const modeDesc = showtimeSyncModeDescription(props.syncMode);
  const ec = props.embeddedCompact && props.embedded;

  const voteStatus = `${props.votePhase} · engine ${props.enginePhase}`;

  const screenHb =
    props.lastScreenHeartbeatAt != null
      ? `${new Date(props.lastScreenHeartbeatAt).toLocaleTimeString()} (${props.screenLikelyConnected ? "recent" : "stale / none"})`
      : "— (no heartbeat yet)";

  return (
    <>
        <Card className="border-[var(--bn-line)] bg-card/60 backdrop-blur-xl">
          <CardHeader className={cn("border-b border-[var(--bn-line)]", ec ? "pb-2 pt-2" : "pb-3")}>
            <CardTitle className={cn("font-heading font-normal", ec ? "text-sm" : "text-base")}>Diagnostics</CardTitle>
            <CardDescription className={cn("leading-relaxed", ec ? "text-[0.65rem]" : "text-xs")}>{modeDesc}</CardDescription>
          </CardHeader>
          <CardContent className={cn(ec ? "space-y-0 pt-1.5 pb-2" : "space-y-1 pt-2")}>
            <Row label="Sync mode" compact={ec}>
              {modeLabel}
            </Row>
            <Row label="Supabase URL present" compact={ec}>
              {props.supabaseUrlPresent ? "yes" : "no"}
            </Row>
            <Row label="Supabase anon key present" compact={ec}>
              {props.supabaseAnonPresent ? "yes" : "no"}
            </Row>
            <Row label="Join origin (env)" compact={ec}>
              {props.joinOriginEnvRaw ? props.joinOriginEnvRaw : <span className="text-muted-foreground">{props.joinOriginEnvDisplay}</span>}
            </Row>
            <Row label="window.location.origin" compact={ec}>
              {props.windowOrigin || "—"}
            </Row>
            <Row label="Resolved join base" compact={ec}>
              {props.joinBaseUrl || "—"}
              {props.joinOriginSource ? (
                <span className="mt-1 block text-[0.6rem] text-muted-foreground">
                  Source: {props.joinOriginSource === "env" ? "env override" : "page origin"}
                </span>
              ) : null}
            </Row>
            <Row label="Final QR / join URL" compact={ec}>
              {props.joinUrl || "—"}
            </Row>
            {props.loopbackJoinWarning ? (
              <Row label="QR reachability" compact={ec}>
                <span className="text-amber-300">localhost / loopback — phones usually cannot open this URL.</span>
              </Row>
            ) : null}
            <Row label="Event code" compact={ec}>
              {props.eventCode}
            </Row>
            <Row label="Event id" compact={ec}>
              {props.eventId}
            </Row>
            <Row label="Realtime status" compact={ec}>
              <span
                className={cn(
                  props.realtimeStatus === "subscribed" && props.supabaseClientConfigured && "text-emerald-400",
                  props.realtimeStatus === "error" && props.supabaseClientConfigured && "text-red-400",
                  props.realtimeStatus === "connecting" && props.supabaseClientConfigured && "text-amber-300",
                )}
              >
                {realtimeStatusLabel(props.realtimeStatus, props.supabaseClientConfigured)}
              </span>
              {props.supabaseClientConfigured ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-8 rounded-lg font-mono text-[0.65rem]"
                  onClick={() => props.bumpRealtimeProbe()}
                >
                  Retry realtime connection
                </Button>
              ) : null}
            </Row>
            <Row label="/screen heartbeat" compact={ec}>
              {screenHb}
            </Row>
            <Row label="Active audience count" compact={ec}>
              {props.audienceConnected}
            </Row>
            <Row label="Vote / engine status" compact={ec}>
              {voteStatus}
            </Row>
            <Row label="Current node" compact={ec}>
              {props.currentNodeTitle}{" "}
              <span className="block text-[0.6rem] text-muted-foreground">{props.currentNodeId}</span>
            </Row>
            <Row label="Remote event row (Supabase)" compact={ec}>
              {props.remoteEventLookup}
              {props.remoteEventError ? (
                <span className="mt-1 block text-red-300/90">{props.remoteEventError}</span>
              ) : null}
            </Row>
          </CardContent>
        </Card>

        <div className={cn("flex flex-wrap gap-2", ec ? "mt-2 gap-1.5" : "mt-4")}>
          <Button type="button" variant="outline" className="rounded-xl border-[var(--bn-line)]" onClick={() => props.onResyncScreen()}>
            <RefreshCw className="mr-2 size-4" />
            Re-sync screen
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-amber-500/40 text-amber-100 hover:bg-amber-950/40"
            onClick={() => props.onResetLocalShowData()}
          >
            <RotateCcw className="mr-2 size-4" />
            Reset local show data…
          </Button>
          <Button type="button" variant="destructive" className="rounded-xl" onClick={() => props.onResetEvent()}>
            <RotateCcw className="mr-2 size-4" />
            Reset live event…
          </Button>
          <Link href="/screen" className={cn(buttonVariants({ variant: "secondary", size: "default" }), "rounded-xl")}>
            Open /screen
          </Link>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "ghost", size: "default" }), "rounded-xl text-muted-foreground")}
          >
            Supabase dashboard
          </a>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Add both <code className="rounded bg-black/30 px-1 py-px font-mono text-[0.65rem]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-black/30 px-1 py-px font-mono text-[0.65rem]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> for Live Supabase. Set{" "}
          <code className="rounded bg-black/30 px-1 py-px font-mono text-[0.65rem]">NEXT_PUBLIC_JOIN_ORIGIN</code> so QR codes use a reachable URL.
        </p>
    </>
  );
}

export function HostSystemCheck(props: HostSystemCheckProps) {
  const modeLabel = showtimeSyncModeLabel(props.syncMode);
  if (props.embedded) {
    return (
      <div className={cn(props.embeddedCompact ? "px-2 pb-2 pt-0.5" : "px-3 pb-3 pt-1")}>
        <HostSystemCheckInner {...props} />
      </div>
    );
  }
  return (
    <details className="group rounded-2xl border border-[var(--bn-line)] bg-black/20 backdrop-blur-xl [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground">
        <Stethoscope className="size-4 text-primary" aria-hidden />
        <span className="flex-1 text-left">System Check</span>
        <Badge
          variant={props.syncMode === "live_supabase" ? "default" : "secondary"}
          className="rounded-full font-mono text-[0.6rem] normal-case tracking-normal"
        >
          {modeLabel}
        </Badge>
        <span className="text-primary transition group-open:rotate-90">▸</span>
      </summary>

      <div className="border-t border-[var(--bn-line)] px-4 pb-4 pt-2">
        <HostSystemCheckInner {...props} />
      </div>
    </details>
  );
}
