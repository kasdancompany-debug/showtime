"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, ExternalLink } from "lucide-react";

import { HostDeskStatusBar } from "@/components/host/host-desk-status-bar";
import { HostRehearsalPanel } from "@/components/host/host-rehearsal-panel";
import { HostStoryTimeline } from "@/components/host/host-story-timeline";
import { HostSystemCheck } from "@/components/host/host-system-check";
import { JoinQrTestPanel } from "@/components/host/join-qr-test-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useEventRoomPlaybackSync } from "@/hooks/use-event-room-playback-sync";
import { useRoomStoryInboundSync, useRoomStoryLeaderSync } from "@/hooks/use-room-story-sync";
import { useAudienceVoteIngest, useVoteStateBroadcaster } from "@/hooks/use-room-vote-sync";
import { useShowtimeHostDiagnostics } from "@/hooks/use-showtime-host-diagnostics";
import { LOOPBACK_WARNING } from "@/lib/join/get-join-url";
import { branchOutlookFromNode } from "@/lib/showtime/host-story-path";
import {
  getSavedFilm,
  listSavedFilms,
  SAVED_FILMS_CHANGED_EVENT,
  SAVED_FILMS_STORAGE_KEY,
  type SavedFilm,
} from "@/lib/showtime/saved-films";
import { resetLocalShowData } from "@/lib/showtime/reset-local-show-data";
import {
  deriveOperatorEventState,
  getNextOperatorAction,
  type OperatorActionHandlers,
} from "@/lib/showtime/operator-next-action";
import { getNode, nextClipForVoteWinner, validateGraph } from "@/lib/story-engine";
import { getEffectiveWinner, needsHostChoice } from "@/lib/story-engine/engine";
import type { LiveShowStatus } from "@/lib/store/mock-event-store";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { selectVoteDisplayNode } from "@/lib/store/presentation";
import type { StoryGraph, StoryNodeId } from "@/types";
import { cn } from "@/lib/utils";

function useNowTicker(active: boolean, intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

export function HostControlDesk() {
  const diagnostics = useShowtimeHostDiagnostics();
  useRoomStoryLeaderSync();
  useRoomStoryInboundSync();
  const { sendPlaybackResync } = useEventRoomPlaybackSync("host");
  useVoteStateBroadcaster();
  useAudienceVoteIngest();

  const engine = useMockEventStore((s) => s.engine);
  const eventTitle = useMockEventStore((s) => s.eventTitle);
  const eventCode = useMockEventStore((s) => s.eventCode);
  const eventId = useMockEventStore((s) => s.eventId);
  const eventStarted = useMockEventStore((s) => s.eventStarted);
  const showEnded = useMockEventStore((s) => s.showEnded);
  const audienceConnected = useMockEventStore((s) => s.audienceConnected);
  const votePhase = useMockEventStore((s) => s.votePhase);
  const voteEndsAt = useMockEventStore((s) => s.voteEndsAt);
  const countdownSec = useMockEventStore((s) => s.countdownSec);
  const votesA = useMockEventStore((s) => s.votesA);
  const votesB = useMockEventStore((s) => s.votesB);
  const graph = useMockEventStore((s) => s.graph);
  const currentNodeId = useMockEventStore((s) => s.currentNodeId);
  const revealedWinner = useMockEventStore((s) => s.revealedWinner);

  const startEvent = useMockEventStore((s) => s.startEvent);
  const endShow = useMockEventStore((s) => s.endShow);
  const openVoteImmediate = useMockEventStore((s) => s.openVoteImmediate);
  const tickCountdown = useMockEventStore((s) => s.tickCountdown);
  const closeVote = useMockEventStore((s) => s.closeVote);
  const revealWinnerToRoom = useMockEventStore((s) => s.revealWinnerToRoom);
  const advanceToWinningBranch = useMockEventStore((s) => s.advanceToWinningBranch);
  const hostOverrideA = useMockEventStore((s) => s.hostOverrideA);
  const hostOverrideB = useMockEventStore((s) => s.hostOverrideB);
  const resolveTieA = useMockEventStore((s) => s.resolveTieA);
  const resolveTieB = useMockEventStore((s) => s.resolveTieB);
  const loadStoryGraph = useMockEventStore((s) => s.loadStoryGraph);
  const resetLiveEvent = useMockEventStore((s) => s.resetLiveEvent);
  const allowAnonymousQuickJoin = useMockEventStore((s) => s.allowAnonymousQuickJoin);
  const setAllowAnonymousQuickJoin = useMockEventStore((s) => s.setAllowAnonymousQuickJoin);
  const dryRunMode = useMockEventStore((s) => s.dryRunMode);
  const setDryRunMode = useMockEventStore((s) => s.setDryRunMode);
  const [copiedJoinUrl, setCopiedJoinUrl] = useState(false);
  const [copiedEventCode, setCopiedEventCode] = useState(false);
  const [savedFilms, setSavedFilms] = useState<SavedFilm[]>(() => listSavedFilms());
  const [savedFilmPick, setSavedFilmPick] = useState("");

  const liveStatus = useMockEventStore((s) => s.liveStatus);
  const liveStatusLabel = useMemo(() => {
    const m: Record<LiveShowStatus, string> = {
      draft: "Draft — event not started",
      waiting: "Waiting",
      playing: "Playing",
      voting: "Voting",
      revealing: "Reveal phase",
      ended: "Show ended",
    };
    return m[liveStatus];
  }, [liveStatus]);

  useEffect(() => {
    const sync = () => {
      const { activeSavedFilmId, clearActiveFilm } = useMockEventStore.getState();
      if (activeSavedFilmId && !getSavedFilm(activeSavedFilmId)) {
        clearActiveFilm();
      }
    };
    sync();
    window.addEventListener(SAVED_FILMS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(SAVED_FILMS_CHANGED_EVENT, sync);
  }, []);

  const node = useMemo(() => getNode(graph, currentNodeId), [graph, currentNodeId]);
  const voteNode = useMemo(() => selectVoteDisplayNode(engine), [engine]);

  const productionValidation = useMemo(() => validateGraph(graph), [graph]);

  const voteable =
    Boolean(node?.question?.trim()) &&
    Boolean(node?.optionA?.nextNodeId?.trim()) &&
    Boolean(node?.optionB?.nextNodeId?.trim());

  const tieActive = needsHostChoice(engine);
  const effectiveWinner = useMemo(() => {
    if (votePhase === "reveal") return revealedWinner ?? getEffectiveWinner(engine);
    if (engine.phase === "open" && votesA !== votesB) return votesA > votesB ? "A" : "B";
    return null;
  }, [votePhase, revealedWinner, engine, votesA, votesB]);

  const now = useNowTicker(votePhase === "open" || votePhase === "countdown", 400);
  const voteSecondsLeft =
    votePhase === "open" && voteEndsAt ? Math.max(0, Math.ceil((voteEndsAt - now) / 1000)) : null;

  useEffect(() => {
    if (votePhase !== "countdown") return;
    const id = window.setInterval(() => tickCountdown(), 1000);
    return () => window.clearInterval(id);
  }, [votePhase, tickCountdown]);

  useEffect(() => {
    const refresh = () => {
      const next = listSavedFilms();
      setSavedFilms(next);
      setSavedFilmPick((prev) => (prev && next.some((f) => f.id === prev) ? prev : ""));
    };
    refresh();
    window.addEventListener(SAVED_FILMS_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SAVED_FILMS_STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SAVED_FILMS_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const qrSrc =
    diagnostics.joinUrl && diagnostics.joinBaseUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(diagnostics.joinUrl)}`
      : "";

  const resyncProjector = useCallback(() => {
    sendPlaybackResync();
  }, [sendPlaybackResync]);

  const noopTransport = useCallback(() => {}, []);

  const operatorPlayThisNext = useMemo(() => {
    if (engine.phase !== "awaiting_reveal" && engine.phase !== "revealed") return null;
    if (!engine.voteNodeId || !engine.winner) return null;
    return nextClipForVoteWinner(graph, engine.voteNodeId, engine.winner);
  }, [engine.phase, engine.voteNodeId, engine.winner, graph]);

  const confirmedCloseVote = useCallback(() => {
    const st = useMockEventStore.getState();
    if (st.votePhase === "open") {
      const left =
        st.voteEndsAt != null ? Math.max(0, Math.ceil((st.voteEndsAt - Date.now()) / 1000)) : null;
      const msg =
        left != null && left > 0
          ? `Close voting now with ${left}s left? The tally locks immediately.`
          : "Close voting and lock the tally?";
      if (!window.confirm(msg)) return;
    }
    closeVote();
  }, [closeVote]);

  const confirmResetLiveEvent = useCallback(() => {
    if (
      !window.confirm(
        "Reset this room to draft at the opening beat? Votes clear and audience count resets.",
      )
    )
      return;
    resetLiveEvent();
  }, [resetLiveEvent]);

  const confirmResetLocalShowData = useCallback(() => {
    if (
      !window.confirm(
        "Reset local show data? This clears the join session for this event code in this browser and resets the operator room to an empty story draft.",
      )
    )
      return;
    void resetLocalShowData()
      .then(() => {
        sendPlaybackResync();
      })
      .catch(() => {
        sendPlaybackResync();
      });
  }, [sendPlaybackResync]);

  const tryHostOverrideA = useCallback(() => {
    if (tieActive) {
      resolveTieA();
      return;
    }
    if (engine.phase === "open") {
      if (!window.confirm("Override the ballot and award Option A? Logged as operator choice.")) return;
      hostOverrideA();
    }
  }, [tieActive, engine.phase, resolveTieA, hostOverrideA]);

  const tryHostOverrideB = useCallback(() => {
    if (tieActive) {
      resolveTieB();
      return;
    }
    if (engine.phase === "open") {
      if (!window.confirm("Override the ballot and award Option B? Logged as operator choice.")) return;
      hostOverrideB();
    }
  }, [tieActive, engine.phase, resolveTieB, hostOverrideB]);

  const confirmResetVote = useCallback(() => {
    if (
      !window.confirm(
        "Reset the whole live room to draft? Use this if the ballot is broken. This clears votes and audience count.",
      )
    )
      return;
    resetLiveEvent();
  }, [resetLiveEvent]);

  const confirmEndShow = useCallback(() => {
    if (!window.confirm("End the show for everyone? Guests see the finale state.")) return;
    endShow();
  }, [endShow]);

  const copyJoinLink = useCallback(async () => {
    if (!diagnostics.joinUrl) return;
    try {
      await navigator.clipboard.writeText(diagnostics.joinUrl);
      setCopiedJoinUrl(true);
      window.setTimeout(() => setCopiedJoinUrl(false), 2000);
    } catch {
      /* ignore */
    }
  }, [diagnostics.joinUrl]);

  const copyEventCodeCb = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(eventCode);
      setCopiedEventCode(true);
      window.setTimeout(() => setCopiedEventCode(false), 2000);
    } catch {
      /* ignore */
    }
  }, [eventCode]);

  const voteStateHeadline = useMemo(() => {
    if (votePhase === "countdown") return "Countdown";
    if (votePhase === "open") return "Voting open";
    if (votePhase === "closed") return tieActive ? "Tie — pick winner" : "Voting closed";
    if (votePhase === "reveal") return "Winner revealed";
    return "Idle";
  }, [votePhase, tieActive]);

  const branchSummary = useMemo(() => {
    const o = branchOutlookFromNode(graph, currentNodeId);
    if (o.kind === "end") return "Ending beat — no branches.";
    if (o.kind === "leaf") return "Wire Option A / B in Story builder.";
    const parts: string[] = [];
    if (o.a) parts.push(`A → ${o.a.beatTitle}`);
    if (o.b) parts.push(`B → ${o.b.beatTitle}`);
    return parts.join(" · ") || "—";
  }, [graph, currentNodeId]);

  const isBlankOperatorStory = useMemo(() => {
    const ids = Object.keys(graph.nodes);
    if (ids.length !== 1) return false;
    const root = graph.nodes[graph.rootId];
    return Boolean(root?.isEnd && root.id === "opening");
  }, [graph]);

  const operatorState = useMemo(
    () =>
      deriveOperatorEventState({
        showEnded,
        eventStarted,
        enginePhase: engine.phase,
      }),
    [showEnded, eventStarted, engine.phase],
  );

  const operatorUi = useMemo(() => {
    const handlers: OperatorActionHandlers = {
      startEvent,
      play: noopTransport,
      pause: noopTransport,
      openVote: () => openVoteImmediate(),
      closeVote: confirmedCloseVote,
      revealWinner: () => revealWinnerToRoom(),
      advanceBranch: () => advanceToWinningBranch(),
      resetRoom: confirmResetVote,
      resetAfterEnded: confirmResetLiveEvent,
      acknowledgeProjectionFault: noopTransport,
      endShow: confirmEndShow,
      overrideA: tryHostOverrideA,
      overrideB: tryHostOverrideB,
    };
    return getNextOperatorAction(operatorState, {
      handlers,
      enginePhase: engine.phase,
      countdownSec,
      voteable,
      tieActive,
      hasPlayableMedia: true,
      productionStoryOk: productionValidation.ok,
      playbackIsPlaying: false,
    });
  }, [
    operatorState,
    engine.phase,
    countdownSec,
    voteable,
    tieActive,
    noopTransport,
    productionValidation.ok,
    startEvent,
    openVoteImmediate,
    confirmedCloseVote,
    revealWinnerToRoom,
    advanceToWinningBranch,
    confirmResetVote,
    confirmResetLiveEvent,
    confirmEndShow,
    tryHostOverrideA,
    tryHostOverrideB,
  ]);

  const primaryDisabled =
    operatorUi.primaryActionHandler == null || operatorUi.disabledReason != null;

  const canSwapSavedFilm = !eventStarted || showEnded;
  const voteOpen = votePhase === "open";

  return (
    <div className="host-operator-root showtime-functional flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-[var(--kc-cream)] antialiased">
      <HostDeskStatusBar
        eventTitle={eventTitle}
        eventCode={eventCode}
        syncMode={diagnostics.syncMode}
        screenConnected={diagnostics.screenLikelyConnected}
        audienceCount={audienceConnected}
        realtimeStatus={diagnostics.realtimeStatus}
        liveStatus={liveStatus}
        liveStatusLabel={liveStatusLabel}
        voteOpen={voteOpen}
        density="compact"
        actions={
          <Link
            href="/screen"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "host-primary-cta h-10 shrink-0 rounded-lg border-0 px-5 text-[0.9375rem] font-semibold shadow-none",
            )}
          >
            Open /screen
          </Link>
        }
      />

      {diagnostics.syncMode === "local_preview" ? (
        <div
          role="status"
          className="shrink-0 border-b border-[var(--host-divider)] bg-[oklch(0.72_0.12_78/0.08)] px-4 py-2.5 text-sm leading-snug text-[oklch(0.93_0.03_95)] ring-1 ring-[oklch(0.78_0.1_78/0.15)] ring-inset"
        >
          <p>
            <strong className="font-semibold text-[oklch(0.96_0.04_82)]">Local preview</strong> — phones need{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.7rem] text-[oklch(0.88_0.02_95)]">
              NEXT_PUBLIC_SUPABASE_URL
            </code>
            ,{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.7rem] text-[oklch(0.88_0.02_95)]">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>
            , and{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.7rem] text-[oklch(0.88_0.02_95)]">
              NEXT_PUBLIC_JOIN_ORIGIN
            </code>{" "}
            in the <strong className="font-semibold">Production</strong> build (Vercel → Settings → Environment Variables →
            redeploy). Hard-refresh this page after deploy.
          </p>
          <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.06em] text-[oklch(0.88_0.02_95)]">
            This bundle: URL {diagnostics.supabaseUrlPresent ? "ok" : "missing"} · Anon key{" "}
            {diagnostics.supabaseAnonPresent ? "ok" : "missing"} · Join origin{" "}
            {diagnostics.joinOriginEnvRaw ? "ok" : "missing"}
          </p>
        </div>
      ) : null}

      {!productionValidation.ok && !eventStarted && !showEnded ? (
        <div className="shrink-0 border-b border-[var(--host-divider)] bg-[oklch(0.72_0.12_78/0.07)] px-4 py-2.5 text-sm leading-snug text-[oklch(0.93_0.03_95)] ring-1 ring-[oklch(0.78_0.1_78/0.12)] ring-inset">
          <strong className="font-semibold text-[oklch(0.96_0.04_82)]">Story needs fixes</strong> — {productionValidation.errors[0]}
          {productionValidation.errors.length > 1 ? ` (+${productionValidation.errors.length - 1} more)` : ""}{" "}
          <Link href="/admin/story" className="font-medium text-[oklch(0.88_0.06_82)] underline underline-offset-2 hover:text-[oklch(0.93_0.05_82)]">
            Story builder
          </Link>
        </div>
      ) : null}

      {isBlankOperatorStory && !showEnded ? (
        <div
          role="status"
          className="shrink-0 border-b border-[var(--host-divider)] bg-[oklch(1_0_0/0.04)] px-4 py-3 text-base leading-snug text-[oklch(0.9_0.02_95)] ring-1 ring-[oklch(1_0_0/0.06)] ring-inset"
        >
          <strong className="font-semibold text-[var(--kc-cream)]">No story loaded.</strong>{" "}
          Build a branch map in Story builder or load a saved story from the drawer below before going live.
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Primary controls — no internal scroll; fills space above drawer strip */}
        <div className="mx-auto grid min-h-0 w-full max-w-[1680px] flex-1 grid-cols-1 gap-4 overflow-hidden p-3 md:p-4 lg:grid-cols-2 lg:gap-5">
          <section className="host-operator-panel flex min-h-0 flex-col overflow-hidden p-4 md:p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--kc-cream-dim)]">Now playing (file cue)</h2>
            <p className="mt-2 break-all font-mono text-lg font-semibold leading-snug text-[var(--kc-cream)]">
              {node?.operatorClipName?.trim() ? node.operatorClipName.trim() : "—"}
            </p>
            <p className="mt-1 truncate text-sm font-medium text-[var(--kc-cream-dim)]">{node?.title ?? "—"}</p>

            <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--kc-cream-dim)]">
              Current question
            </h3>
            <p className="mt-1.5 line-clamp-4 text-base leading-relaxed text-[oklch(0.9_0.02_95)]">
              {voteNode?.question?.trim() || node?.question?.trim() || "—"}
            </p>

            {engine.winner &&
            (engine.phase === "awaiting_reveal" || engine.phase === "tiebreak" || engine.phase === "revealed") ? (
              <p className="mt-4 rounded-lg bg-[oklch(1_0_0/0.04)] px-3 py-2.5 text-center text-sm font-semibold text-[oklch(0.9_0.03_95)] ring-1 ring-[oklch(1_0_0/0.06)]">
                Winning branch: Option {engine.winner}
              </p>
            ) : null}

            {operatorPlayThisNext ? (
              <div
                className="mt-5 rounded-xl border-2 border-[oklch(0.78_0.1_78/0.55)] bg-[oklch(0.2_0.02_265)] px-4 py-5 ring-1 ring-[oklch(0.82_0.1_78/0.25)] ring-inset"
                role="status"
              >
                <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[oklch(0.88_0.06_78)]">
                  Play this file next
                </p>
                <p className="mt-3 break-all text-center font-mono text-xl font-bold leading-snug text-[var(--kc-cream)] sm:text-2xl">
                  {operatorPlayThisNext}
                </p>
              </div>
            ) : engine.phase === "revealed" && engine.winner && engine.voteNodeId ? (
              <p className="mt-5 text-center text-sm text-[var(--kc-cream-dim)]">
                Cue the next reel in your player, then advance when ready.
              </p>
            ) : null}

            <Link
              href="/admin/story"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "mt-6 h-11 w-full rounded-lg text-[0.9375rem] font-medium text-[var(--kc-cream-dim)] hover:bg-[oklch(1_0_0/0.05)] hover:text-[var(--kc-cream)]",
              )}
            >
              <ExternalLink className="mr-2 size-4" />
              Story builder
            </Link>
          </section>

          <section className="host-operator-panel flex min-h-0 flex-col overflow-hidden p-4 md:p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--kc-cream-dim)]">Vote control</h2>

            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--kc-cream-dim)]">Next step</p>
            <p className="mt-1.5 line-clamp-4 text-base leading-relaxed text-[oklch(0.9_0.02_95)]">{operatorUi.helperText}</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[oklch(1_0_0/0.04)] px-3 py-3 ring-1 ring-[oklch(1_0_0/0.06)]">
                <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-[var(--kc-cream-dim)]">Ballot</p>
                <p className="mt-1 text-lg font-semibold leading-tight text-[oklch(0.88_0.07_78)]">{voteStateHeadline}</p>
              </div>
              <div className="rounded-lg bg-[oklch(1_0_0/0.04)] px-3 py-3 text-center ring-1 ring-[oklch(1_0_0/0.06)]">
                <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-[var(--kc-cream-dim)]">Timer</p>
                <p className="mt-1 font-sans text-3xl font-semibold tabular-nums leading-none tracking-tight text-[oklch(0.9_0.03_95)]">
                  {votePhase === "countdown"
                    ? countdownSec
                    : votePhase === "open" && voteSecondsLeft != null
                      ? voteSecondsLeft
                      : "—"}
                </p>
                <p className="mt-1 font-mono text-[10px] text-[var(--kc-cream-dim)]">seconds</p>
              </div>
            </div>

            <p className="mt-4 font-mono text-[10px] font-medium uppercase tracking-wide text-[var(--kc-cream-dim)]">Question</p>
            <p className="mt-1 line-clamp-3 text-base font-medium leading-snug text-[var(--kc-cream)]">{voteNode?.question ?? "—"}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border-l-[3px] border-l-[oklch(0.58_0.14_28)] bg-[oklch(1_0_0/0.03)] px-3 py-2.5 ring-1 ring-[oklch(1_0_0/0.05)]">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[oklch(0.72_0.12_28)]">A</p>
                <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-[var(--kc-cream)]">{voteNode?.optionA?.label ?? "—"}</p>
              </div>
              <div className="rounded-lg border-l-[3px] border-l-[oklch(0.55_0.1_175)] bg-[oklch(1_0_0/0.03)] px-3 py-2.5 ring-1 ring-[oklch(1_0_0/0.05)]">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[oklch(0.62_0.11_175)]">B</p>
                <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-[var(--kc-cream)]">{voteNode?.optionB?.label ?? "—"}</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[oklch(1_0_0/0.03)] px-3 py-2.5 text-center ring-1 ring-[oklch(1_0_0/0.05)]">
                <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-[var(--kc-cream-dim)]">Tally A</p>
                <p className="mt-1 font-sans text-2xl font-semibold tabular-nums leading-none text-[oklch(0.72_0.13_28)]">{votesA}</p>
              </div>
              <div className="rounded-lg bg-[oklch(1_0_0/0.03)] px-3 py-2.5 text-center ring-1 ring-[oklch(1_0_0/0.05)]">
                <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-[var(--kc-cream-dim)]">Tally B</p>
                <p className="mt-1 font-sans text-2xl font-semibold tabular-nums leading-none text-[oklch(0.62_0.11_175)]">{votesB}</p>
              </div>
            </div>

            {effectiveWinner ? (
              <p className="mt-3 rounded-lg bg-[oklch(0.78_0.09_78/0.14)] px-3 py-2 text-center text-sm font-semibold text-[oklch(0.93_0.04_82)] ring-1 ring-[oklch(0.82_0.1_78/0.28)]">
                Leading: Option {effectiveWinner}
              </p>
            ) : (
              <p className="mt-3 text-center text-sm text-[var(--kc-cream-dim)]">No winner yet</p>
            )}

            <Button
              type="button"
              variant="default"
              className="host-primary-cta mt-4 h-12 w-full rounded-lg border-0 text-base font-semibold shadow-none"
              disabled={primaryDisabled}
              onClick={() => operatorUi.primaryActionHandler?.()}
            >
              {operatorUi.primaryActionLabel}
            </Button>
            {primaryDisabled && operatorUi.disabledReason ? (
              <p className="mt-2 text-center text-sm leading-snug text-[var(--kc-cream-dim)]">{operatorUi.disabledReason}</p>
            ) : null}

            {operatorUi.allowedSecondaryActions.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {operatorUi.allowedSecondaryActions.map((a) => (
                  <Button
                    key={a.id}
                    type="button"
                    variant={
                      a.id === "reset_room" ? "destructive" : a.id === "end_show" ? "ghost" : "outline"
                    }
                    className={cn(
                      "h-11 rounded-lg text-[0.9375rem] font-semibold ring-1 ring-[oklch(1_0_0/0.06)]",
                      a.id === "end_show" &&
                        "font-medium text-[var(--kc-cream-dim)] hover:bg-[oklch(1_0_0/0.05)] hover:text-[var(--kc-cream)]",
                      a.id === "reset_room" && "font-semibold text-red-200 hover:bg-red-500/15",
                    )}
                    disabled={a.disabled}
                    title={a.disabledReason ?? undefined}
                    onClick={a.handler}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        {/* Secondary — only this strip scrolls */}
        <div className="shrink-0 border-t border-[var(--host-divider)] bg-[oklch(0.078_0.012_265)]">
          <div className="mx-auto max-h-[min(38vh,380px)] min-h-0 max-w-[1680px] divide-y divide-[var(--host-divider)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--kc-cream)] outline-none hover:bg-[oklch(1_0_0/0.03)] [&::-webkit-details-marker]:hidden focus-visible:bg-[oklch(1_0_0/0.04)] focus-visible:ring-2 focus-visible:ring-[oklch(0.82_0.1_78/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(0.078_0.012_265)]">
                <ChevronRight className="size-4 shrink-0 text-[var(--kc-cream-dim)] transition group-open:rotate-90" />
                Audience QR
              </summary>
              <div className="space-y-3 px-4 pb-4 pt-1">
              {diagnostics.loopbackJoinWarning ? (
                <p className="rounded-lg bg-[oklch(0.72_0.12_78/0.08)] px-3 py-2.5 text-sm leading-relaxed text-[oklch(0.93_0.03_95)] ring-1 ring-[oklch(0.78_0.1_78/0.2)]">
                  {LOOPBACK_WARNING}
                </p>
              ) : null}
              <div className="flex flex-wrap items-start gap-5">
                {qrSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrSrc} alt="" className="size-[96px] shrink-0 rounded-lg bg-white p-1 ring-1 ring-[oklch(1_0_0/0.12)]" />
                ) : null}
                <div className="min-w-0 flex-1 space-y-2">
                  <Button type="button" variant="outline" className="h-11 w-full max-w-xs rounded-lg text-[0.9375rem] font-semibold ring-1 ring-[oklch(1_0_0/0.08)]" onClick={() => void copyJoinLink()}>
                    <Copy className="mr-2 size-4" />
                    {copiedJoinUrl ? "Copied" : "Copy join link"}
                  </Button>
                  <Button type="button" variant="outline" className="h-11 w-full max-w-xs rounded-lg text-[0.9375rem] font-semibold ring-1 ring-[oklch(1_0_0/0.08)]" onClick={() => void copyEventCodeCb()}>
                    <Copy className="mr-2 size-4" />
                    {copiedEventCode ? "Copied" : "Copy event code"}
                  </Button>
                  <p className="break-all font-mono text-xs leading-relaxed text-[var(--kc-cream-dim)]">{diagnostics.joinUrl || "—"}</p>
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--kc-cream-dim)]">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 rounded border-[var(--bn-line)]"
                      checked={allowAnonymousQuickJoin}
                      onChange={(e) => setAllowAnonymousQuickJoin(e.target.checked)}
                    />
                    <span>Allow anonymous quick join on phones</span>
                  </label>
                </div>
              </div>
              <JoinQrTestPanel joinUrl={diagnostics.joinUrl} />
            </div>
          </details>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--kc-cream)] outline-none hover:bg-[oklch(1_0_0/0.03)] [&::-webkit-details-marker]:hidden focus-visible:bg-[oklch(1_0_0/0.04)] focus-visible:ring-2 focus-visible:ring-[oklch(0.82_0.1_78/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(0.078_0.012_265)]">
              <ChevronRight className="size-4 shrink-0 text-[var(--kc-cream-dim)] transition group-open:rotate-90" />
              Story path
            </summary>
            <div className="space-y-3 px-4 pb-4 pt-1">
              <p className="text-sm leading-relaxed text-[var(--kc-cream-dim)]">{branchSummary}</p>
              <HostStoryTimeline
                graph={graph}
                currentNodeId={currentNodeId as StoryNodeId}
                className="rounded-lg bg-[oklch(1_0_0/0.03)] px-3 py-3 ring-1 ring-[oklch(1_0_0/0.06)] md:px-4 md:py-3.5"
              />
              <div className="flex flex-wrap items-end gap-3 rounded-lg bg-[oklch(1_0_0/0.03)] p-3 ring-1 ring-[oklch(1_0_0/0.06)]">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="desk-saved-film" className="text-[11px] font-semibold uppercase tracking-wide text-[var(--kc-cream-dim)]">
                    Load saved film
                  </Label>
                  <select
                    id="desk-saved-film"
                    value={savedFilmPick}
                    onChange={(e) => setSavedFilmPick(e.target.value)}
                    disabled={!canSwapSavedFilm}
                    className="h-11 w-full max-w-md rounded-lg border-0 bg-[oklch(1_0_0/0.06)] px-3 text-sm text-[var(--kc-cream)] ring-1 ring-[oklch(1_0_0/0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.82_0.1_78/0.5)]"
                  >
                    <option value="">— Current graph —</option>
                    {savedFilms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-lg text-[0.9375rem] font-semibold ring-1 ring-[oklch(1_0_0/0.08)]"
                  disabled={!savedFilmPick || !canSwapSavedFilm}
                  onClick={() => {
                    const f = getSavedFilm(savedFilmPick);
                    if (!f) {
                      useMockEventStore.getState().clearActiveFilmIfSavedFilm(savedFilmPick);
                      setSavedFilms(listSavedFilms());
                      setSavedFilmPick("");
                      return;
                    }
                    loadStoryGraph(JSON.parse(JSON.stringify(f.graph)) as StoryGraph, {
                      displayName: f.name,
                      eventTitle: f.eventTitle,
                      savedFilmId: f.id,
                    });
                  }}
                >
                  Load
                </Button>
              </div>
              {!canSwapSavedFilm ? (
                <p className="text-sm text-[oklch(0.88_0.06_78)]">Finish or reset the show before loading another film.</p>
              ) : null}
            </div>
          </details>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--kc-cream)] outline-none hover:bg-[oklch(1_0_0/0.03)] [&::-webkit-details-marker]:hidden focus-visible:bg-[oklch(1_0_0/0.04)] focus-visible:ring-2 focus-visible:ring-[oklch(0.82_0.1_78/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(0.078_0.012_265)]">
              <ChevronRight className="size-4 shrink-0 text-[var(--kc-cream-dim)] transition group-open:rotate-90" />
              Rehearsal tools
            </summary>
            <div className="px-1 pb-2 pt-0.5">
              <HostRehearsalPanel embedInDesk />
            </div>
          </details>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--kc-cream)] outline-none hover:bg-[oklch(1_0_0/0.03)] [&::-webkit-details-marker]:hidden focus-visible:bg-[oklch(1_0_0/0.04)] focus-visible:ring-2 focus-visible:ring-[oklch(0.82_0.1_78/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(0.078_0.012_265)]">
              <ChevronRight className="size-4 shrink-0 text-[var(--kc-cream-dim)] transition group-open:rotate-90" />
              System check
            </summary>
            <HostSystemCheck
              embedded
              embeddedCompact
              syncMode={diagnostics.syncMode}
              supabaseUrlPresent={diagnostics.supabaseUrlPresent}
              supabaseAnonPresent={diagnostics.supabaseAnonPresent}
              joinOriginEnvRaw={diagnostics.joinOriginEnvRaw}
              joinOriginEnvDisplay={diagnostics.joinOriginEnvDisplay}
              windowOrigin={diagnostics.windowOrigin}
              joinOriginSource={diagnostics.joinOriginSource}
              joinBaseUrl={diagnostics.joinBaseUrl}
              joinUrl={diagnostics.joinUrl}
              loopbackJoinWarning={diagnostics.loopbackJoinWarning}
              eventCode={eventCode}
              eventId={eventId}
              realtimeStatus={diagnostics.realtimeStatus}
              supabaseClientConfigured={diagnostics.supabaseClientConfigured}
              lastScreenHeartbeatAt={diagnostics.lastScreenHeartbeatAt}
              screenLikelyConnected={diagnostics.screenLikelyConnected}
              audienceConnected={audienceConnected}
              votePhase={votePhase}
              enginePhase={engine.phase}
              currentNodeId={currentNodeId}
              currentNodeTitle={diagnostics.currentNodeTitle}
              remoteEventLookup={diagnostics.remoteEventLookup}
              remoteEventError={diagnostics.remoteEventError}
              bumpRealtimeProbe={diagnostics.bumpRealtimeProbe}
              onResetEvent={confirmResetLiveEvent}
              onResyncScreen={resyncProjector}
              onResetLocalShowData={confirmResetLocalShowData}
            />
            <div className="border-t border-[var(--host-divider)] px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--kc-cream-dim)]">
                <input
                  type="checkbox"
                  className="size-4 rounded border-[var(--bn-line)]"
                  checked={dryRunMode}
                  onChange={(e) => setDryRunMode(e.target.checked)}
                />
                <span>Dry run: empty polls auto-resolve when closed (rehearsal)</span>
              </label>
            </div>
          </details>
        </div>
      </div>
      </div>
    </div>
  );
}
