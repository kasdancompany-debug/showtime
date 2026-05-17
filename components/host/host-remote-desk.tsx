"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, Monitor, Radio, Users } from "lucide-react";

import { ScreenPosterUploadZone } from "@/components/admin/screen-poster-upload-zone";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useJoinBaseUrl } from "@/hooks/use-join-base-url";
import { useOperatorSupabaseRoom } from "@/hooks/use-operator-supabase-room";
import { useShowtimeConnection } from "@/hooks/use-showtime-connection";
import { useShowtimeHostDiagnostics } from "@/hooks/use-showtime-host-diagnostics";
import { LOOPBACK_WARNING } from "@/lib/join/get-join-url";
import { getJoinUrl } from "@/lib/join/get-join-url";
import { openOrFocusProjector } from "@/lib/showtime/projector-arm";
import { showtimeSyncModeLabel } from "@/lib/showtime/sync-mode";
import { hasStoryVideoUrl } from "@/lib/showtime/video-url";
import type { StoryNodeRow } from "@/lib/supabase/event-room";
import type { ShowtimeEventStatus } from "@/lib/supabase/database.types";
import type { RealtimeProbeStatus } from "@/hooks/use-event-room-realtime-probe";
import { cn } from "@/lib/utils";

/** File name (last path segment) for display, from the stored video field or a resolved URL. */
function videoFilenameFromSource(videoUrl: string): string {
  const t = videoUrl.trim();
  if (!t) return "";
  const noq = t.split(/[?#]/)[0] ?? t;
  const segs = noq.split("/").filter(Boolean);
  return segs.length ? (segs[segs.length - 1] ?? t) : t;
}

function footerCurrentReelLine(node: StoryNodeRow | null): string {
  if (!node) return "No beat is active in this room yet.";
  if (hasStoryVideoUrl(node.video_url)) return videoFilenameFromSource(node.video_url);
  return "No video on this beat";
}

function footerNextIfWins(node: StoryNodeRow | null, which: "A" | "B", byKey: Map<string, StoryNodeRow>): string {
  if (!node) return "Load a show to see branch previews.";
  if (node.is_ending) return "This beat ends the show; there is no branch after it.";
  const key = which === "A" ? node.option_a_next_node_key : node.option_b_next_node_key;
  const k = key?.trim() ?? "";
  if (!k) {
    return which === "A"
      ? "Option A is not linked to a next beat yet. Fix it in Show builder."
      : "Option B is not linked to a next beat yet. Fix it in Show builder.";
  }
  const next = byKey.get(k) ?? null;
  if (!next) {
    return "The linked next beat is missing from this show. Reload or fix it in Show builder.";
  }
  const beatTitle = next.title?.trim() || "Untitled beat";
  const reel = hasStoryVideoUrl(next.video_url)
    ? videoFilenameFromSource(next.video_url)
    : "no reel assigned yet";
  return `Goes to “${beatTitle}” · ${reel}`;
}

function realtimeLabel(syncMode: string, status: RealtimeProbeStatus): string {
  if (syncMode === "local_preview") return status === "unsupported" ? "Broadcast" : "Browser";
  switch (status) {
    case "subscribed":
      return "Realtime OK";
    case "connecting":
      return "Connecting…";
    case "error":
      return "Realtime error";
    case "idle":
      return "Idle";
    default:
      return status;
  }
}

function voteStatusLabel(st: ShowtimeEventStatus | undefined): "Closed" | "Open" | "Revealed" | "Not voting" {
  if (!st) return "Not voting";
  if (st === "voting_open") return "Open";
  if (st === "voting_closed") return "Closed";
  if (st === "winner_revealed" || st === "ended") return "Revealed";
  return "Not voting";
}

function winnerSummaryLine(
  event: { status: ShowtimeEventStatus; winner: string | null } | null | undefined,
): string {
  if (!event) return "—";
  if (event.winner === "A" || event.winner === "B") return `Option ${event.winner}`;
  if (event.status === "winner_revealed" || event.status === "ended") return "Not recorded";
  return "—";
}

type Drawer = null | "qr" | "story" | "system" | "rehearsal";
type ConfirmKind = null | "reset" | "endShow" | "forceA" | "forceB";

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="host-confirm-title"
    >
      <div className="kc-palace-corners w-full max-w-md rounded-2xl border border-[color-mix(in_oklch,var(--kc-gold)_18%,transparent)] bg-[var(--kc-panel)] p-6 shadow-2xl ring-1 ring-[var(--kc-gold-line)]">
        <h2 id="host-confirm-title" className="text-lg font-semibold text-[var(--kc-cream)]">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--kc-cream-dim)]">{description}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={danger ? "destructive" : "default"}
            className={cn("rounded-lg", !danger && "host-primary-cta border-0 shadow-none")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * `/host` — venue operator desk: live status board and discrete controls for `/screen`.
 */
export function HostRemoteDesk() {
  const { snapshot: connection, reachability, reachabilityDetail } = useShowtimeConnection();
  const diagnostics = useShowtimeHostDiagnostics();
  const joinBase = useJoinBaseUrl();
  const op = useOperatorSupabaseRoom();

  const [drawer, setDrawer] = useState<Drawer>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [copiedJoin, setCopiedJoin] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [screenTestNotice, setScreenTestNotice] = useState<string | null>(null);
  const [rehearsalChecked, setRehearsalChecked] = useState<Record<string, boolean>>({});

  const joinUrl =
    joinBase.joinBaseUrl && op.event?.code ? getJoinUrl(op.event.code, joinBase.joinBaseUrl) : "";
  const qrSrc = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(joinUrl)}`
    : "";

  const [idlePosterDraft, setIdlePosterDraft] = useState("");

  useEffect(() => {
    setIdlePosterDraft(op.event?.screen_idle_poster_url?.trim() ?? "");
  }, [op.event?.id, op.event?.screen_idle_poster_url]);

  const joinSiteMismatch = useMemo(() => {
    const ju = diagnostics.joinUrl;
    const wo = diagnostics.windowOrigin;
    if (!ju || !wo) return null;
    try {
      const joinHost = new URL(ju).host;
      const hereHost = new URL(wo).host;
      if (joinHost === hereHost) return null;
      return { joinHost, hereHost };
    } catch {
      return null;
    }
  }, [diagnostics.joinUrl, diagnostics.windowOrigin]);

  const screenOk = diagnostics.screenLikelyConnected;
  const rt = diagnostics.realtimeStatus;
  const rtOk =
    diagnostics.syncMode === "local_preview" ? rt !== "unsupported" : rt === "subscribed" && diagnostics.supabaseClientConfigured;

  const current = op.currentNode;
  const vote = op.voteNode;
  const displayQuestion = vote ?? current;
  const rawVideoSource = current?.video_url?.trim() ?? "";
  const hasAssignedVideo = Boolean(current && hasStoryVideoUrl(current.video_url));
  const videoFileLabel = hasAssignedVideo ? videoFilenameFromSource(rawVideoSource) : "";
  const beatTitle = current?.title?.trim() || "Untitled beat";
  const st = op.event?.status;
  const votePhase = voteStatusLabel(st);
  const displayCode = op.event?.code ?? op.eventCode;

  const sortedStory = useMemo(() => {
    return [...op.nodes].sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key));
  }, [op.nodes]);

  const canLoad = Boolean(
    op.event &&
      st !== "ended" &&
      (st === "setup" || (current && (st === "ready" || st === "playing" || st === "paused" || st === "video_ended")))
  );
  const canPlay = Boolean(op.event && hasAssignedVideo && (st === "ready" || st === "paused"));
  const canPause = st === "playing";
  const canRestart = st === "playing" || st === "paused";
  const canMarkEnded = st === "playing" || st === "paused";

  const canOpenVoting = Boolean(op.event && st === "video_ended" && op.currentBeatVoteable);
  const canCloseVoting = st === "voting_open";
  const canRevealWinner = st === "voting_closed";
  const canAdvanceWinningBranch = Boolean(
    op.event && st === "winner_revealed" && op.event.winner && op.event.current_node_id && !op.primary.disabled,
  );

  const testScreenConnection = useCallback(() => {
    openOrFocusProjector(false);
    setScreenTestNotice(
      diagnostics.screenLikelyConnected
        ? "Opened /screen in a new tab. This room is already receiving projector heartbeats."
        : "Opened /screen in a new tab. Keep that tab open on the projector; the status board should show Screen connected within a few seconds.",
    );
    window.setTimeout(() => setScreenTestNotice(null), 10_000);
  }, [diagnostics.screenLikelyConnected]);

  const copyJoin = useCallback(async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopiedJoin(true);
      window.setTimeout(() => setCopiedJoin(false), 2000);
    } catch {
      /* ignore */
    }
  }, [joinUrl]);

  const copyCode = useCallback(async () => {
    const c = op.event?.code ?? op.eventCode;
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      /* ignore */
    }
  }, [op.event?.code, op.eventCode]);

  const runPrimaryConfirmed = useCallback(async () => {
    try {
      await op.runPrimary();
    } finally {
      setConfirm(null);
    }
  }, [op]);

  const onPrimaryClick = useCallback(() => {
    op.clearActionError();
    if (!op.event) return;
    if (op.event.status === "ended") {
      setConfirm("reset");
      return;
    }
    if (op.advanceEndsShow) {
      setConfirm("endShow");
      return;
    }
    void op.runPrimary();
  }, [op]);

  const runVotePhaseAction = useCallback(() => {
    op.clearActionError();
    void op.runPrimary();
  }, [op]);

  const onForce = useCallback((which: "A" | "B") => {
    op.clearActionError();
    setConfirm(which === "A" ? "forceA" : "forceB");
  }, [op]);

  const toggleDrawer = useCallback((d: Exclude<Drawer, null>) => {
    setDrawer((prev) => (prev === d ? null : d));
  }, []);

  const toggleRehearsalItem = useCallback((id: string) => {
    setRehearsalChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const panelClass =
    "host-operator-panel kc-palace-corners host-operator-glow rounded-xl border border-[color-mix(in_oklch,var(--kc-gold)_14%,transparent)] bg-[color-mix(in_oklch,var(--kc-panel)_88%,black)] shadow-[var(--kc-shadow-inset-gold)]";

  const statLabel = "text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--kc-champagne)]";
  const statValue = "mt-0.5 text-sm font-medium leading-snug text-[var(--kc-cream)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[var(--host-bg)]">
      <ConfirmDialog
        open={confirm === "reset"}
        title="Reset this show?"
        description="Clears audience seats and all votes, and returns to the first beat."
        confirmLabel="Yes, reset show"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          void op.resetEventToStart().finally(() => setConfirm(null));
        }}
      />
      <ConfirmDialog
        open={confirm === "endShow"}
        title="End the show?"
        description="The next beat is an ending. The room will move to show ended."
        confirmLabel="End show and advance"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runPrimaryConfirmed()}
      />
      <ConfirmDialog
        open={confirm === "forceA" || confirm === "forceB"}
        title={confirm === "forceA" ? "Force advance to A branch?" : "Force advance to B branch?"}
        description="Locks this branch as the winner for the room. If voting is open, the poll closes immediately. Use only when the audience vote cannot decide (tie, outage, or creative override)."
        confirmLabel={confirm === "forceA" ? "Force Option A" : "Force Option B"}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const w = confirm === "forceA" ? "A" : "B";
          void op.forceWinner(w).finally(() => setConfirm(null));
        }}
      />

      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--host-divider)] bg-[color-mix(in_oklch,var(--kc-panel)_55%,black)] px-4 py-3 md:px-5">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--kc-gold-bright)]">Operator desk</p>
          <div className="kc-gold-rule max-w-[min(100%,14rem)] opacity-90" aria-hidden />
          <h1 className="truncate text-sm font-semibold text-[var(--kc-cream)] md:text-base">
            {op.event?.title ?? "Venue live control"}
          </h1>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_22%,transparent)] text-[var(--kc-cream)]"
          onClick={() => openOrFocusProjector(false)}
        >
          Open /screen
        </Button>
      </header>

      {joinSiteMismatch ? (
        <div role="alert" className="kc-showtime-banner kc-showtime-banner--danger shrink-0 text-[10px] leading-snug md:text-xs">
          <span className="font-semibold">Join link host mismatch.</span> Join uses{" "}
          <code className="rounded bg-black/35 px-1 font-mono">{joinSiteMismatch.joinHost}</code> but this page is{" "}
          <code className="rounded bg-black/35 px-1 font-mono">{joinSiteMismatch.hereHost}</code>. Set{" "}
          <code className="rounded bg-black/35 px-1 font-mono">NEXT_PUBLIC_JOIN_ORIGIN</code> to match where guests scan QR.
        </div>
      ) : null}

      {connection.warnings.length ? (
        <div className="shrink-0 divide-y divide-[color-mix(in_oklch,var(--kc-gold-line)_40%,transparent)]">
          {connection.warnings.map((w) => (
            <div key={w.id} role="status" className="kc-showtime-banner kc-showtime-banner--warn">
              <span className="font-semibold">{w.title}.</span> {w.nextStep}
            </div>
          ))}
        </div>
      ) : null}

      {reachability === "unreachable" && reachabilityDetail ? (
        <div role="alert" className="kc-showtime-banner kc-showtime-banner--danger shrink-0 text-[10px] md:text-xs">
          <span className="font-semibold">Cannot reach the live room server.</span> {reachabilityDetail} Check Supabase URLs
          and network, then reload this page.
        </div>
      ) : null}

      {op.bootError ? (
        <div role="alert" className="kc-showtime-banner kc-showtime-banner--danger shrink-0 text-xs md:text-sm">
          <span className="font-semibold">Desk could not finish loading.</span> {op.bootError}
        </div>
      ) : null}

      {op.actionError ? (
        <div className="kc-showtime-banner kc-showtime-banner--action shrink-0 text-xs md:text-sm">
          <span className="min-w-0 leading-snug">{op.actionError}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_28%,transparent)] text-[var(--kc-cream)]"
            onClick={op.clearActionError}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {/* Status board */}
      <section className={cn("mx-3 mt-3 shrink-0 p-3 md:mx-4 md:p-4", panelClass)}>
        <div className="grid gap-4 md:grid-cols-12 md:gap-3">
          <div className="md:col-span-4 md:border-r md:border-[var(--host-divider)] md:pr-4">
            <p className={statLabel}>Event code</p>
            <div className="mt-1 flex flex-wrap items-end gap-2">
              <p className="font-mono text-2xl font-bold tracking-wide text-[var(--kc-gold-bright)] tabular-nums md:text-3xl">
                {displayCode || "— — — —"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_25%,transparent)] text-xs"
                disabled={!displayCode}
                onClick={() => void copyCode()}
              >
                <Copy className="mr-1 size-3" />
                {copiedCode ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              <p className={statLabel}>Connection</p>
              <p className={statValue}>{showtimeSyncModeLabel(diagnostics.syncMode)}</p>
              <div className="flex flex-wrap gap-1.5">
                <span
                  className={cn(
                    "kc-status-pill max-w-full items-center gap-1 text-[10px] md:text-xs",
                    reachability !== "unreachable" ? "kc-status-pill--ok" : "kc-status-pill--bad",
                  )}
                >
                  <Radio className="size-3 shrink-0 opacity-90" aria-hidden />
                  {connection.badgeLabel}
                </span>
                <span
                  className={cn(
                    "kc-status-pill max-w-[11rem] items-center gap-1 truncate text-[10px] md:max-w-[14rem] md:text-xs",
                    reachability === "unreachable"
                      ? "kc-status-pill--bad"
                      : rtOk
                        ? "kc-status-pill--ok"
                        : diagnostics.realtimeStatus === "connecting"
                          ? "kc-status-pill--idle"
                          : "kc-status-pill--bad",
                  )}
                  title={showtimeSyncModeLabel(diagnostics.syncMode)}
                >
                  {realtimeLabel(diagnostics.syncMode, diagnostics.realtimeStatus)}
                </span>
              </div>
            </div>
            <div className="mt-4">
              <p className={statLabel}>Screen connection</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "kc-status-pill items-center gap-1 text-[10px] md:text-xs",
                    screenOk ? "kc-status-pill--ok" : "kc-status-pill--idle",
                  )}
                >
                  <Monitor className="size-3 shrink-0 opacity-90" aria-hidden />
                  {screenOk ? "Connected" : "No heartbeat yet"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_22%,transparent)] text-[11px] text-[var(--kc-cream)]"
                  onClick={testScreenConnection}
                >
                  Test screen
                </Button>
              </div>
              {screenTestNotice ? (
                <p className="mt-2 text-[11px] leading-snug text-[var(--kc-cream-dim)]" role="status">
                  {screenTestNotice}
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Users className="size-4 text-[var(--kc-champagne)]" aria-hidden />
              <span className={statLabel}>Audience in room</span>
              <span className="text-lg font-bold tabular-nums text-[var(--kc-cream)]">{op.audienceCount}</span>
            </div>
          </div>

          <div className="md:col-span-4 md:border-r md:border-[var(--host-divider)] md:pr-4">
            <p className={statLabel}>Current beat</p>
            <p className="mt-1 text-base font-semibold text-[var(--kc-cream)]">{op.event ? beatTitle : "—"}</p>
            {current?.node_key ? (
              <p className="mt-0.5 font-mono text-xs text-[var(--kc-cream-dim)]">{current.node_key}</p>
            ) : null}
            <p className={`${statLabel} mt-4`}>Room status</p>
            <p className={statValue}>{op.event ? op.statusLabel : "Load an event to begin."}</p>
            <p className={`${statLabel} mt-4`}>Video / reel file</p>
            <p className={cn(statValue, "break-all font-mono text-xs")}>
              {op.event && current ? (hasAssignedVideo ? videoFileLabel : "No reel on this beat") : "—"}
            </p>
            {rawVideoSource ? (
              <p className="mt-1 break-all font-mono text-[10px] leading-snug text-[var(--kc-cream-dim)]">{rawVideoSource}</p>
            ) : null}
            {current?.operator_notes?.trim() ? (
              <div className="mt-3 rounded-lg border border-[var(--host-divider)] bg-black/20 p-2">
                <p className={statLabel}>Show builder notes</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-snug text-[var(--kc-cream-dim)]">{current.operator_notes.trim()}</p>
              </div>
            ) : null}
          </div>

          <div className="md:col-span-4">
            <p className={statLabel}>Audience question</p>
            <p className="mt-1 min-h-0 text-sm leading-snug text-[var(--kc-cream)]">
              {displayQuestion?.question?.trim() || (op.event ? "No question on this beat." : "—")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-[color-mix(in_oklch,var(--kc-velvet)_25%,transparent)] bg-black/15 p-2">
                <p className="text-[10px] font-semibold uppercase text-rose-200/90">Option A</p>
                <p className="mt-0.5 line-clamp-2 font-medium text-[var(--kc-cream)]">
                  {displayQuestion?.option_a_label?.trim() || "—"}
                </p>
              </div>
              <div className="rounded-lg border border-[color-mix(in_oklch,var(--kc-teal-theatre)_22%,transparent)] bg-black/15 p-2">
                <p className="text-[10px] font-semibold uppercase text-sky-200/90">Option B</p>
                <p className="mt-0.5 line-clamp-2 font-medium text-[var(--kc-cream)]">
                  {displayQuestion?.option_b_label?.trim() || "—"}
                </p>
              </div>
            </div>
            <p className={`${statLabel} mt-4`}>Vote status</p>
            <span
              className={cn(
                "kc-status-pill mt-2 inline-flex px-2.5 py-1 text-sm font-semibold tracking-wide normal-case",
                votePhase === "Open" ? "kc-status-pill--ok" : "kc-status-pill--idle",
              )}
            >
              {votePhase}
            </span>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-black/25 py-2 text-center ring-1 ring-[var(--kc-gold-line)]">
                <p className="text-[9px] font-medium uppercase text-[var(--kc-champagne)]">Votes A</p>
                <p className="text-2xl font-bold tabular-nums text-rose-200">{op.tallies.a}</p>
              </div>
              <div className="rounded-lg bg-black/25 py-2 text-center ring-1 ring-[var(--kc-gold-line)]">
                <p className="text-[9px] font-medium uppercase text-[var(--kc-champagne)]">Votes B</p>
                <p className="text-2xl font-bold tabular-nums text-sky-200">{op.tallies.b}</p>
              </div>
            </div>
            <p className={`${statLabel} mt-4`}>Winner</p>
            <p className="mt-1 text-base font-semibold text-[var(--kc-cream)]">{winnerSummaryLine(op.event)}</p>
            {op.winnerDisplay ? <p className="mt-1 text-xs text-[var(--kc-cream-dim)]">{op.winnerDisplay}</p> : null}

            {op.showForce ? (
              <div className="mt-4 rounded-lg border border-[color-mix(in_oklch,var(--kc-danger)_38%,transparent)] bg-[color-mix(in_oklch,var(--kc-danger)_10%,black)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100/95">Override vote</p>
                <p className="mt-1 text-[10px] leading-snug text-[var(--kc-cream-dim)]">
                  Pick a branch if there are no phones, a tie, or you need a creative override. Confirms before applying.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 flex-1 rounded-lg border-rose-500/50 text-xs text-rose-50 sm:flex-none sm:min-w-[7.5rem]"
                    disabled={op.busy || !op.event}
                    onClick={() => onForce("A")}
                  >
                    Force A
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 flex-1 rounded-lg border-sky-500/50 text-xs text-sky-50 sm:flex-none sm:min-w-[7.5rem]"
                    disabled={op.busy || !op.event}
                    onClick={() => onForce("B")}
                  >
                    Force B
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--host-divider)] pt-4">
          <div className="kc-gold-rule mb-3 max-w-[min(100%,12rem)] opacity-80" aria-hidden />
          <p className={statLabel}>Next action (recommended)</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--kc-cream)]">{op.nextInstruction}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={op.primary.disabled || op.busy || op.loading || !op.event}
              className="host-primary-cta rounded-lg border-0 text-sm font-semibold shadow-none"
              onClick={onPrimaryClick}
            >
              {op.loading ? "Working…" : op.primary.label}
            </Button>
            {op.primary.disabled && op.primary.reason ? (
              <p className="w-full text-xs text-[var(--kc-cream-dim)]">{op.primary.reason}</p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Discrete controls — scroll is on the desk root so this section stays reachable when the status board is tall */}
      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2 lg:gap-4 lg:p-4">
        <Card
          data-host-card
          size="sm"
          className="flex min-h-0 flex-col gap-2 border-[color-mix(in_oklch,var(--kc-gold)_12%,transparent)] bg-[color-mix(in_oklch,var(--kc-panel)_90%,black)] py-3 shadow-none"
        >
          <CardHeader className="shrink-0 space-y-0.5 px-3 pb-0 pt-0">
            <CardTitle className="text-sm font-semibold text-[var(--kc-cream)]">Projector (changes the screen)</CardTitle>
            <CardDescription className="text-[10px] leading-snug text-[var(--kc-cream-dim)]">
              Output is sent to <span className="font-mono">/screen</span> in this room. The projector tab needs one tap on the picture per show for sound (browser policy); after that, Play on screen starts reels with audio.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-3 pb-2 pt-0">
            {op.event ? (
              <div className="mb-1 rounded-lg border border-[color-mix(in_oklch,var(--kc-gold)_14%,transparent)] bg-black/30 p-2.5">
                <p className={`${statLabel} mb-1`}>Walk-in image (optional)</p>
                <p className="text-[10px] leading-snug text-[var(--kc-cream-dim)]">
                  Full-screen on /screen before <span className="font-mono text-[var(--kc-champagne)]">Play on screen</span>. Leave empty for the text-only slate.
                </p>
                <Input
                  value={idlePosterDraft}
                  onChange={(e) => setIdlePosterDraft(e.target.value)}
                  disabled={op.busy || op.loading}
                  className="mt-2 h-8 rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_20%,transparent)] bg-black/35 font-mono text-[11px]"
                  placeholder="https://… or /screen-posters/…"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-lg text-[11px]"
                    disabled={op.busy || op.loading}
                    onClick={() => void op.setScreenIdlePosterUrl(idlePosterDraft.trim() || null)}
                  >
                    Save
                  </Button>
                  {idlePosterDraft.trim() ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg text-[11px]"
                      disabled={op.busy || op.loading}
                      onClick={() => {
                        setIdlePosterDraft("");
                        void op.setScreenIdlePosterUrl(null);
                      }}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2 border-t border-[color-mix(in_oklch,var(--kc-gold)_12%,transparent)] pt-2">
                  <ScreenPosterUploadZone
                    disabled={op.busy || op.loading}
                    onUploaded={(path) => {
                      setIdlePosterDraft(path);
                      void op.setScreenIdlePosterUrl(path);
                    }}
                  />
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-lg text-[11px]"
                disabled={op.busy || op.loading || !canLoad}
                onClick={() => void op.playbackLoadOnScreen()}
              >
                Load current beat on screen
              </Button>
              <Button
                type="button"
                className="rounded-lg text-[11px] host-primary-cta border-0"
                size="sm"
                disabled={op.busy || op.loading || !canPlay || !op.event}
                onClick={() => void op.playbackPlay()}
              >
                Play on screen
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-lg text-[11px]"
                disabled={op.busy || op.loading || !canPause || !op.event}
                onClick={() => void op.playbackPause()}
              >
                Pause screen
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-lg text-[11px]"
                disabled={op.busy || op.loading || !canRestart || !op.event}
                onClick={() => void op.playbackRestart()}
              >
                Restart screen from top
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full rounded-lg border-amber-500/40 text-[11px] text-amber-100"
              disabled={op.busy || op.loading || !canMarkEnded || !op.event}
              onClick={() => void op.markVideoEnded()}
            >
              Mark reel finished (go to vote when cued)
            </Button>
          </CardContent>
        </Card>

        <Card
          data-host-card
          size="sm"
          className="flex min-h-0 flex-col gap-2 border-[color-mix(in_oklch,var(--kc-gold)_12%,transparent)] bg-[color-mix(in_oklch,var(--kc-panel)_90%,black)] py-3 shadow-none"
        >
          <CardHeader className="shrink-0 space-y-0.5 px-3 pb-0 pt-0">
            <CardTitle className="text-sm font-semibold text-[var(--kc-cream)]">Audience vote (changes the room)</CardTitle>
            <CardDescription className="text-[10px] text-[var(--kc-cream-dim)]">
              Each step is only enabled when the room is in the right phase.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-3 pb-2 pt-0">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-lg text-[11px]"
                disabled={op.busy || op.loading || !canOpenVoting}
                onClick={runVotePhaseAction}
              >
                Open voting on phones
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-lg text-[11px]"
                disabled={op.busy || op.loading || !canCloseVoting}
                onClick={runVotePhaseAction}
              >
                Close voting (lock phones)
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-lg text-[11px]"
                disabled={op.busy || op.loading || !canRevealWinner}
                onClick={runVotePhaseAction}
              >
                Reveal winner on screen
              </Button>
              <Button
                type="button"
                className="rounded-lg text-[11px] host-primary-cta border-0"
                size="sm"
                disabled={op.busy || op.loading || !canAdvanceWinningBranch}
                onClick={() => {
                  op.clearActionError();
                  if (op.advanceEndsShow) {
                    setConfirm("endShow");
                    return;
                  }
                  void op.runPrimary();
                }}
              >
                {op.primary.label}
              </Button>
            </div>
            {op.showForce ? (
              <div className="rounded-lg border border-[color-mix(in_oklch,var(--kc-danger)_35%,transparent)] bg-[color-mix(in_oklch,var(--kc-danger)_08%,black)] p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-100/95">Override (destructive)</p>
                <p className="mt-1 text-[10px] leading-snug text-[var(--kc-cream-dim)]">
                  Skips the live tally for this beat. Confirm before use.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg border-rose-500/45 text-xs text-rose-100"
                    disabled={op.busy || !op.event}
                    onClick={() => onForce("A")}
                  >
                    Force advance to A branch
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg border-sky-500/45 text-xs text-sky-100"
                    disabled={op.busy || !op.event}
                    onClick={() => onForce("B")}
                  >
                    Force advance to B branch
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-[var(--host-divider)] bg-[color-mix(in_oklch,var(--kc-panel)_70%,black)] px-3 py-2.5 md:px-4">
        <div className="min-h-0 shrink text-[10px] leading-relaxed text-[var(--kc-champagne)] md:text-xs">
          <p className="line-clamp-2">
            <span className="text-[var(--kc-cream-dim)]">Current reel:</span>{" "}
            <span className="text-[var(--kc-cream)]">{footerCurrentReelLine(current)}</span>
          </p>
          <p className="line-clamp-2">
            <span className="text-[var(--kc-cream-dim)]">If A wins:</span>{" "}
            <span className="text-[var(--kc-cream)]">{footerNextIfWins(current, "A", op.nodesByKey)}</span>
          </p>
          <p className="line-clamp-2">
            <span className="text-[var(--kc-cream-dim)]">If B wins:</span>{" "}
            <span className="text-[var(--kc-cream)]">{footerNextIfWins(current, "B", op.nodesByKey)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-colors md:text-xs",
              drawer === "rehearsal"
                ? "bg-[color-mix(in_oklch,var(--kc-gold)_18%,black)] text-[var(--kc-cream)] ring-1 ring-[var(--kc-gold-line)]"
                : "text-[var(--kc-cream-dim)] ring-1 ring-transparent hover:bg-white/[0.06] hover:text-[var(--kc-champagne)] hover:ring-[color-mix(in_oklch,var(--kc-gold-line)_55%,transparent)]",
            )}
            onClick={() => toggleDrawer("rehearsal")}
          >
            <ChevronRight className={cn("size-3 transition", drawer === "rehearsal" && "rotate-90")} aria-hidden />
            Rehearsal checklist
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-colors md:text-xs",
              drawer === "qr"
                ? "bg-[color-mix(in_oklch,var(--kc-gold)_18%,black)] text-[var(--kc-cream)] ring-1 ring-[var(--kc-gold-line)]"
                : "text-[var(--kc-cream-dim)] ring-1 ring-transparent hover:bg-white/[0.06] hover:text-[var(--kc-champagne)] hover:ring-[color-mix(in_oklch,var(--kc-gold-line)_55%,transparent)]",
            )}
            onClick={() => toggleDrawer("qr")}
          >
            <ChevronRight className={cn("size-3 transition", drawer === "qr" && "rotate-90")} aria-hidden />
            QR & join link
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-colors md:text-xs",
              drawer === "story"
                ? "bg-[color-mix(in_oklch,var(--kc-gold)_18%,black)] text-[var(--kc-cream)] ring-1 ring-[var(--kc-gold-line)]"
                : "text-[var(--kc-cream-dim)] ring-1 ring-transparent hover:bg-white/[0.06] hover:text-[var(--kc-champagne)] hover:ring-[color-mix(in_oklch,var(--kc-gold-line)_55%,transparent)]",
            )}
            onClick={() => toggleDrawer("story")}
          >
            <ChevronRight className={cn("size-3 transition", drawer === "story" && "rotate-90")} aria-hidden />
            Beat list (order)
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition-colors md:text-xs",
              drawer === "system"
                ? "bg-[color-mix(in_oklch,var(--kc-gold)_18%,black)] text-[var(--kc-cream)] ring-1 ring-[var(--kc-gold-line)]"
                : "text-[var(--kc-cream-dim)] ring-1 ring-transparent hover:bg-white/[0.06] hover:text-[var(--kc-champagne)] hover:ring-[color-mix(in_oklch,var(--kc-gold-line)_55%,transparent)]",
            )}
            onClick={() => toggleDrawer("system")}
          >
            <ChevronRight className={cn("size-3 transition", drawer === "system" && "rotate-90")} aria-hidden />
            Diagnostics
          </button>
        </div>

        {drawer === "rehearsal" ? (
          <div className="max-h-[40vh] shrink-0 overflow-y-auto border-t border-[var(--host-divider)] pt-2 text-[10px] text-[var(--kc-cream)] md:text-xs">
            <p className="mb-2 text-[var(--kc-cream-dim)]">
              Auto items reflect this browser&apos;s view of the room. Tick the manual lines when you&apos;ve verified them
              on site.
            </p>
            <ul className="space-y-2">
              <li className="flex gap-2">
                <span className="mt-0.5 text-[var(--kc-gold-bright)]">{screenOk ? "✓" : "○"}</span>
                <span>
                  <span className="font-semibold text-[var(--kc-cream)]">Projector heartbeat</span> —{" "}
                  {screenOk ? "Receiving /screen presence." : "Open /screen on the projector and tap Test screen."}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-[var(--kc-gold-bright)]">{reachability !== "unreachable" ? "✓" : "○"}</span>
                <span>
                  <span className="font-semibold text-[var(--kc-cream)]">Supabase reachable</span> —{" "}
                  {reachability === "unreachable" ? "Fix network or env, then reload." : "API reachable from this machine."}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-[var(--kc-gold-bright)]">{rtOk ? "✓" : "○"}</span>
                <span>
                  <span className="font-semibold text-[var(--kc-cream)]">Realtime path</span> —{" "}
                  {realtimeLabel(diagnostics.syncMode, diagnostics.realtimeStatus)} for this sync mode.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-[var(--kc-gold-bright)]">{op.event ? "✓" : "○"}</span>
                <span>
                  <span className="font-semibold text-[var(--kc-cream)]">Event loaded on desk</span> — use QR drawer to
                  load by code if needed.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-[var(--kc-gold-bright)]">{hasAssignedVideo ? "✓" : "○"}</span>
                <span>
                  <span className="font-semibold text-[var(--kc-cream)]">Current beat has a reel URL</span> —{" "}
                  {hasAssignedVideo ? videoFileLabel || "OK" : "Assign in Show builder before show."}
                </span>
              </li>
              {[
                { id: "sound", label: "House sound and video levels checked with a short play." },
                { id: "phones", label: "Join URL opens on a test phone; vote UI readable from back row." },
                { id: "override", label: "Operators know where Force A / Force B is (tie or outage plan)." },
              ].map((row) => (
                <li key={row.id} className="flex gap-2">
                  <label className="flex cursor-pointer gap-2">
                    <input
                      type="checkbox"
                      className="kc-ticket-checkbox mt-0.5 size-3.5 rounded border-[var(--kc-gold-line)]"
                      checked={Boolean(rehearsalChecked[row.id])}
                      onChange={() => toggleRehearsalItem(row.id)}
                    />
                    <span>{row.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {drawer === "qr" ? (
          <div className="max-h-[36vh] shrink-0 overflow-y-auto border-t border-[var(--host-divider)] pt-2">
            <div className="flex flex-wrap gap-3">
              {qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- external QR API
                <img src={qrSrc} alt="" className="size-[100px] shrink-0 rounded-lg bg-white p-1 ring-1 ring-white/15 md:size-[120px]" />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs" disabled={!joinUrl} onClick={() => void copyJoin()}>
                    <Copy className="mr-1 size-3" />
                    {copiedJoin ? "Copied" : "Copy join"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-lg text-xs" onClick={() => void copyCode()}>
                    <Copy className="mr-1 size-3" />
                    {copiedCode ? "Copied" : "Copy code"}
                  </Button>
                  <Link href="/admin/story" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-lg text-xs no-underline")}>
                    Show builder
                  </Link>
                </div>
                <p className="break-all font-mono text-[9px] text-[var(--kc-cream-dim)]">
                  {joinUrl || "Join link appears after you load an event."}
                </p>
                {joinBase.loopbackJoinWarning ? <p className="text-[10px] text-amber-200/90">{LOOPBACK_WARNING}</p> : null}
                {op.event ? (
                  <div className="flex flex-col gap-2 text-[10px] text-[var(--kc-cream-dim)]">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="kc-ticket-checkbox mt-0.5 size-3.5 rounded border-white/20"
                        checked={op.event.screen_show_live_vote_counts !== false}
                        disabled={op.busy}
                        onChange={(e) => void op.setScreenShowLiveVoteCounts(e.target.checked)}
                      />
                      <span>Show live vote counts on /screen while poll is open</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="kc-ticket-checkbox mt-0.5 size-3.5 rounded border-white/20"
                        checked={op.event.screen_show_closed_tally === true}
                        disabled={op.busy}
                        onChange={(e) => void op.setScreenShowClosedTally(e.target.checked)}
                      />
                      <span>Show locked tallies on /screen after poll closes</span>
                    </label>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-semibold uppercase text-[var(--kc-cream-dim)]">Event code</span>
                    <Input
                      value={op.eventCode}
                      onChange={(e) => op.setEventCode(e.target.value.toUpperCase())}
                      className="h-8 w-36 max-w-full rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_18%,transparent)] bg-black/35 font-mono text-xs uppercase"
                      spellCheck={false}
                    />
                  </div>
                  <Button type="button" variant="secondary" size="sm" className="rounded-lg text-xs" onClick={() => void op.reload()} disabled={op.busy}>
                    Load show
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {drawer === "story" ? (
          <div className="max-h-[36vh] shrink-0 overflow-y-auto border-t border-[var(--host-divider)] pt-2">
            <ol className="space-y-1 text-[10px] text-[var(--kc-cream-dim)] md:text-xs">
              {sortedStory.map((n, i) => (
                <li key={n.id} className="flex min-w-0 gap-2 border-b border-[var(--host-divider)] py-1.5 last:border-0">
                  <span className="shrink-0 font-medium text-[var(--kc-champagne)]">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--kc-cream)]">{n.title?.trim() || "Untitled beat"}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {drawer === "system" ? (
          <div className="max-h-[36vh] shrink-0 overflow-y-auto border-t border-[var(--host-divider)] pt-2 text-[10px] text-[var(--kc-cream-dim)] md:text-xs">
            <ul className="space-y-1">
              <li>Supabase URL: {diagnostics.supabaseUrlPresent ? "set" : "missing"}</li>
              <li>Anon key: {diagnostics.supabaseAnonPresent ? "set" : "missing"}</li>
              <li>Join origin: {diagnostics.joinOriginEnvDisplay}</li>
              <li>Sync mode: {showtimeSyncModeLabel(diagnostics.syncMode)}</li>
              <li>Realtime channel: {realtimeLabel(diagnostics.syncMode, diagnostics.realtimeStatus)}</li>
            </ul>
            <Button type="button" variant="outline" size="sm" className="mt-2 rounded-lg text-xs" onClick={() => diagnostics.bumpRealtimeProbe()}>
              Retry realtime probe
            </Button>
            {op.event && op.event.status === "ended" ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="mt-2 rounded-lg text-xs"
                disabled={op.busy}
                onClick={() => setConfirm("reset")}
              >
                Reset event (clears votes and audience)
              </Button>
            ) : null}
          </div>
        ) : null}
      </footer>
    </div>
  );
}
