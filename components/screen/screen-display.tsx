"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Expand, MoreHorizontal, X } from "lucide-react";

import { FilmGrain } from "@/components/cinematic/film-grain";
import {
  CountdownMedallion,
  FilmReelDivider,
  StudioBadge,
  TheatreCurtainBackground,
} from "@/components/kasdan";
import { MarqueeLightBar } from "@/components/screen/marquee-light-bar";
import { ScreenTitleCardFrame } from "@/components/screen/screen-title-card-frame";
import { useEventRoomPlaybackSync } from "@/hooks/use-event-room-playback-sync";
import { useRoomStoryInboundSync } from "@/hooks/use-room-story-sync";
import { useScreenChannelStatus } from "@/hooks/use-screen-channel-status";
import { useScreenSurfaceHeartbeat } from "@/hooks/use-screen-surface-heartbeat";
import { useAudienceVoteIngest, useVoteStateBroadcaster } from "@/hooks/use-room-vote-sync";
import { kcCopy } from "@/lib/design/kasdan-hollywood-tokens";
import { getEffectiveWinner, isAtEndingNode, needsHostChoice } from "@/lib/story-engine/engine";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { selectVoteDisplayNode } from "@/lib/store/presentation";
import { getNode } from "@/lib/story-engine/graph";
import type { VoteChoice } from "@/types";
import { cn } from "@/lib/utils";

/** Short descending sting when the operator timer seals the ballot (projection surface). */
function playPollCloseSting() {
  if (typeof window === "undefined") return;
  try {
    const ACtx = window.AudioContext;
    const webkit = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const Ctor = ACtx ?? webkit;
    if (!Ctor) return;
    const ctx = new Ctor();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.setValueAtTime(720, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(196, ctx.currentTime + 0.32);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.48);
    void ctx.resume().catch(() => {});
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.5);
    window.setTimeout(() => void ctx.close().catch(() => {}), 700);
  } catch {
    /* ignore — autoplay or missing AudioContext */
  }
}

type DisplayMode =
  | "pre_show"
  | "segment"
  | "vote_countdown"
  | "vote_open"
  | "vote_closed"
  | "reveal"
  | "fin"
  | "curtain";

function deriveMode(
  eventStarted: boolean,
  showEnded: boolean,
  votePhase: string,
  enginePhase: string,
  isEnding: boolean,
  endingComplete: boolean,
): DisplayMode {
  if (showEnded) return "curtain";
  if (!eventStarted) return "pre_show";
  if (votePhase === "reveal") return "reveal";
  if (votePhase === "countdown") return "vote_countdown";
  if (votePhase === "open") return "vote_open";
  if (votePhase === "closed") return "vote_closed";
  if (votePhase === "idle" && isEnding && enginePhase === "idle" && endingComplete) return "fin";
  return "segment";
}

/** Wall dwell after winner is revealed, then auto-advance playhead into the winning branch (must be separate from auto-reveal timers). */
/** After engine is `revealed`, wait long enough for on-screen reveal choreography to finish before rolling the next beat. */
const SCREEN_REVEAL_HOLD_MS = 6000;
const SCREEN_AUTO_REVEAL_MS = 650;

export function ScreenDisplay() {
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const eventId = useMockEventStore((s) => s.eventId);
  useEventRoomPlaybackSync("screen");
  const { status: channelStatus, usesSupabase } = useScreenChannelStatus();
  useScreenSurfaceHeartbeat(eventId);
  useVoteStateBroadcaster();
  useAudienceVoteIngest();
  useRoomStoryInboundSync();

  const graph = useMockEventStore((s) => s.graph);
  const engine = useMockEventStore((s) => s.engine);
  const eventTitle = useMockEventStore((s) => s.eventTitle);
  const eventCode = useMockEventStore((s) => s.eventCode);
  const eventStarted = useMockEventStore((s) => s.eventStarted);
  const showEnded = useMockEventStore((s) => s.showEnded);
  const votePhase = useMockEventStore((s) => s.votePhase);
  const countdownSec = useMockEventStore((s) => s.countdownSec);
  const countdownPresetSec = useMockEventStore((s) => s.countdownPresetSec);
  const voteEndsAt = useMockEventStore((s) => s.voteEndsAt);
  const pollDurationSec = useMockEventStore((s) => s.pollDurationSec);
  const votesA = useMockEventStore((s) => s.votesA);
  const votesB = useMockEventStore((s) => s.votesB);
  const revealedWinner = useMockEventStore((s) => s.revealedWinner);
  const tickCountdown = useMockEventStore((s) => s.tickCountdown);
  const startEvent = useMockEventStore((s) => s.startEvent);
  const currentNodeId = useMockEventStore((s) => s.currentNodeId);
  const node = useMemo(() => getNode(graph, currentNodeId), [graph, currentNodeId]);
  const voteNode = useMemo(() => selectVoteDisplayNode(engine), [engine]);
  const endingNode = useMemo(() => isAtEndingNode(engine), [engine]);

  const autoRevealKeyRef = useRef<string | null>(null);
  const autoAdvanceKeyRef = useRef<string | null>(null);

  const [testDisplay, setTestDisplay] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (params.get("test") === "1") sessionStorage.setItem("showtime-screen-test", "1");
      setTestDisplay(sessionStorage.getItem("showtime-screen-test") === "1");
    } catch {
      setTestDisplay(false);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Escape") {
        setDockOpen(false);
        return;
      }
      if (e.code === "Backquote" && !e.repeat) {
        e.preventDefault();
        setDockOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Vote-first wall: no in-browser film; ending “fin” uses graph position only. */
  const endingComplete = true;

  const mode = deriveMode(eventStarted, showEnded, votePhase, engine.phase, endingNode, endingComplete);

  const total = votesA + votesB;
  const pctA = total ? (votesA / total) * 100 : 50;
  const pctB = total ? (votesB / total) * 100 : 50;

  const winnerChoice = votePhase === "reveal" ? revealedWinner ?? getEffectiveWinner(engine) : null;

  useEffect(() => {
    if (votePhase !== "countdown") return;
    const id = window.setInterval(() => tickCountdown(), 1000);
    return () => window.clearInterval(id);
  }, [votePhase, tickCountdown]);

  useEffect(() => {
    if (votePhase !== "open") return;
    const id = window.setInterval(() => {
      const st = useMockEventStore.getState();
      if (st.votePhase !== "open" || !st.voteEndsAt) return;
      if (Date.now() < st.voteEndsAt) return;
      st.closeVote();
    }, 250);
    return () => window.clearInterval(id);
  }, [votePhase]);

  useEffect(() => {
    if (engine.phase === "open" || engine.phase === "countdown") {
      autoRevealKeyRef.current = null;
      autoAdvanceKeyRef.current = null;
    }
  }, [engine.phase]);

  /** Auto-reveal only: advance is scheduled in a separate effect so cleanup here does not cancel the branch roll. */
  useEffect(() => {
    if (engine.phase !== "awaiting_reveal" || !engine.winner || !engine.voteNodeId) return;
    if (needsHostChoice(engine)) return;
    const key = `${engine.voteNodeId}:${engine.winner}`;
    if (autoRevealKeyRef.current === key) return;
    autoRevealKeyRef.current = key;

    const tReveal = window.setTimeout(() => {
      const st = useMockEventStore.getState();
      if (st.engine.phase !== "awaiting_reveal") return;
      st.revealWinnerToRoom();
    }, SCREEN_AUTO_REVEAL_MS);

    return () => window.clearTimeout(tReveal);
  }, [engine.phase, engine.winner, engine.voteNodeId]); // eslint-disable-line react-hooks/exhaustive-deps -- reveal timers only

  useEffect(() => {
    if (engine.phase !== "revealed" || !engine.winner || !engine.voteNodeId) return;
    const key = `adv:${engine.voteNodeId}:${engine.winner}`;
    if (autoAdvanceKeyRef.current === key) return;
    autoAdvanceKeyRef.current = key;

    const t = window.setTimeout(() => {
      const st = useMockEventStore.getState();
      if (st.engine.phase !== "revealed") return;
      st.advanceToWinningBranch();
    }, SCREEN_REVEAL_HOLD_MS);

    return () => {
      window.clearTimeout(t);
      autoAdvanceKeyRef.current = null;
    };
  }, [engine.phase, engine.winner, engine.voteNodeId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (votePhase !== "open") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [votePhase]);

  const secondsLeft =
    votePhase === "open" && voteEndsAt ? Math.max(0, Math.ceil((voteEndsAt - now) / 1000)) : null;
  /** Ring drains toward zero using the same poll length as the operator desk. */
  const ringMaxSec = Math.max(1, pollDurationSec);
  const ringFrac =
    votePhase === "open" && secondsLeft !== null
      ? Math.min(1, Math.max(0, secondsLeft / ringMaxSec))
      : 0;

  const prevVotePhaseRef = useRef(votePhase);
  const [pollCloseCue, setPollCloseCue] = useState(0);
  useEffect(() => {
    const prev = prevVotePhaseRef.current;
    prevVotePhaseRef.current = votePhase;
    if (prev === "open" && votePhase === "closed") {
      setPollCloseCue((n) => n + 1);
      if (!reduceMotion) playPollCloseSting();
    }
  }, [votePhase, reduceMotion]);

  /** True while this page’s root container is the browser fullscreen element — room chrome hidden. */
  const [programFullscreen, setProgramFullscreen] = useState(false);

  useEffect(() => {
    const syncProgramFullscreen = () => {
      const root = containerRef.current;
      const fs =
        document.fullscreenElement ??
        (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ??
        null;
      setProgramFullscreen(Boolean(root && fs === root));
    };
    document.addEventListener("fullscreenchange", syncProgramFullscreen);
    document.addEventListener("webkitfullscreenchange", syncProgramFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncProgramFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncProgramFullscreen);
    };
  }, []);

  const voteOrRevealExperience =
    mode === "vote_countdown" ||
    mode === "vote_open" ||
    mode === "vote_closed" ||
    mode === "reveal";

  /** Full-bleed during votes/reveal or true browser fullscreen. */
  const immersiveFilmShell = programFullscreen || (eventStarted && !showEnded && voteOrRevealExperience);

  const minimalShell = immersiveFilmShell;

  const voteUiFullBleed = voteOrRevealExperience && eventStarted && !showEnded;

  const enterProgramFullscreen = useCallback(() => {
    if (!showEnded) {
      startEvent();
    }
    const root = containerRef.current;
    if (!root) return;
    try {
      const anyRoot = root as unknown as {
        requestFullscreen?: () => Promise<void> | void;
        webkitRequestFullscreen?: () => void;
      };
      if (typeof anyRoot.requestFullscreen === "function") {
        void Promise.resolve(anyRoot.requestFullscreen()).catch(() => {});
      } else if (typeof anyRoot.webkitRequestFullscreen === "function") {
        anyRoot.webkitRequestFullscreen();
      }
    } catch {
      /* ignored */
    }
  }, [showEnded, startEvent]);

  const syncBanner = useMemo(() => {
    if (!usesSupabase || !eventStarted || showEnded) return null;
    if (channelStatus === "connecting") return "reconnecting" as const;
    if (channelStatus === "channel_error" || channelStatus === "timed_out" || channelStatus === "closed")
      return "disconnected" as const;
    return null;
  }, [usesSupabase, eventStarted, showEnded, channelStatus]);

  const toggleTestDisplay = useCallback(() => {
    setTestDisplay((v) => {
      const next = !v;
      try {
        sessionStorage.setItem("showtime-screen-test", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const exitProgramFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen?.();
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-black text-[var(--kc-cream)] before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:bg-[radial-gradient(ellipse_85%_55%_at_50%_18%,oklch(0.22_0.035_48/0.55),transparent_62%)]",
        voteUiFullBleed ? "overflow-x-hidden overflow-y-hidden" : "",
        minimalShell && "before:hidden",
        programFullscreen && "min-h-0",
      )}
    >
      {syncBanner ? (
        <div
          role="alert"
          aria-live="assertive"
          className={cn(
            "relative z-[120] w-full px-6 py-5 text-center font-heading font-semibold leading-tight shadow-[0_8px_40px_oklch(0_0_0/0.45)]",
            syncBanner === "disconnected"
              ? "bg-[oklch(0.28_0.08_25/0.96)] text-[oklch(0.95_0.02_85)]"
              : "bg-[oklch(0.35_0.09_75/0.96)] text-[oklch(0.98_0.02_95)]",
          )}
        >
          <p className="text-[clamp(1.35rem,4vw,2.75rem)]">
            {syncBanner === "disconnected"
              ? "Live link interrupted — reconnecting the room…"
              : "Reconnecting to the live room…"}
          </p>
          <p className="mt-3 font-mono text-[clamp(1rem,2.2vw,1.35rem)] uppercase tracking-[0.12em] opacity-90">
            Audience phones may be affected until we are back.
          </p>
        </div>
      ) : null}

      {testDisplay ? (
        <div className="relative z-[115] border-b-4 border-yellow-400 bg-yellow-500/20 py-4 text-center font-heading text-[clamp(1.35rem,3.5vw,2.25rem)] font-bold uppercase tracking-[0.18em] text-yellow-50">
          Rehearsal — test display mode
        </div>
      ) : null}
      {!minimalShell ? <TheatreCurtainBackground animated={!reduceMotion} /> : null}
      {!minimalShell ? (
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_140px_rgba(0,0,0,0.72)]" aria-hidden />
      ) : null}
      {!minimalShell ? <FilmGrain /> : null}

      {!minimalShell ? (
        <header className="relative z-[2] flex shrink-0 items-start justify-between gap-4 px-5 py-6 sm:px-10 md:items-center md:px-14 md:py-8 lg:px-20">
          <div className="max-w-[26%] shrink-0 pt-0.5 md:max-w-none md:pt-0">
            <StudioBadge className="scale-95 md:scale-100" showSeal href="/" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center px-1 text-center md:px-6">
            <div className="w-full max-w-5xl border-y border-[oklch(0.72_0.05_78/0.15)] bg-[linear-gradient(180deg,oklch(0.12_0.03_48/0.35)_0%,transparent_45%,oklch(0.08_0.02_260/0.2)_100%)] px-4 py-5 md:px-10 md:py-7">
              <p className="kc-screen-presents">{kcCopy.presents}</p>
              <h1 className="mt-4 max-w-[95%] truncate px-1 font-heading text-[clamp(1.5rem,4.2vw,3.75rem)] font-normal leading-[1.08] tracking-tight text-[var(--kc-cream)] drop-shadow-[0_8px_48px_oklch(0_0_0/0.45)]">
                {eventTitle}
              </h1>
              <p className="mt-4 font-mono text-[clamp(0.62rem,1.4vw,0.78rem)] tracking-[0.18em] text-[var(--kc-cream-dim)]">
                {kcCopy.tonightsFeature}
              </p>
              {!eventStarted ? (
                <p className="mt-3 max-w-3xl text-pretty font-mono text-[clamp(0.72rem,1.65vw,0.95rem)] leading-relaxed text-[var(--kc-cream-dim)]/80">
                  Same live room as <span className="text-[var(--kc-champagne)]/90">/host</span> — keep this display open for
                  audience voting and results while the operator runs picture from the booth.
                </p>
              ) : null}
            </div>
          </div>
          <span className="max-w-[26%] shrink-0 pt-0.5 text-right font-mono text-[clamp(0.58rem,1.2vw,0.72rem)] uppercase tracking-[0.16em] text-[var(--kc-cream-dim)] md:pt-0">
            {eventCode}
          </span>
        </header>
      ) : null}

      <main
        className={cn(
          "relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden bg-black",
          voteUiFullBleed && "min-h-0 overflow-hidden",
        )}
      >
        <div
          className={cn(
            "flex flex-1 flex-col items-center px-5 pb-[max(4rem,env(safe-area-inset-bottom))] pt-6 md:px-16 md:pb-24 md:pt-10",
            voteUiFullBleed
              ? "relative z-[14] min-h-0 w-full flex-1 justify-start overflow-hidden px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] md:px-10 md:pb-6 md:pt-4"
              : "justify-center",
          )}
        >
          <AnimatePresence mode="wait">
            {mode === "pre_show" && (
              <PreShow key="pre" title={eventTitle} />
            )}

            {mode === "segment" && (
              <SegmentCard
                key="seg"
                title={node?.title ?? "Program"}
                description={node?.subtitle}
                statusNote="The feature runs from the booth — this display only carries live votes. Stand by for the next ballot."
              />
            )}

            {mode === "vote_countdown" && (
              <VoteCountdown
                key="vcd"
                wallProjector={voteUiFullBleed}
                seconds={countdownSec}
                ringFraction={
                  countdownPresetSec > 0 ? Math.min(1, Math.max(0, countdownSec / countdownPresetSec)) : 1
                }
              />
            )}

            {(mode === "vote_open" || mode === "vote_closed") && (
              <VoteBoard
                key="vb"
                wallProjector={voteUiFullBleed}
                question={voteNode?.question ?? "Cast your vote"}
                labelA={voteNode?.optionA?.label ?? "Option A"}
                labelB={voteNode?.optionB?.label ?? "Option B"}
                votesA={votesA}
                votesB={votesB}
                pctA={pctA}
                pctB={pctB}
                open={mode === "vote_open"}
                secondsLeft={secondsLeft}
                ringFrac={ringFrac}
                closePulseKey={pollCloseCue}
                reduceMotion={Boolean(reduceMotion)}
              />
            )}

            {mode === "reveal" && winnerChoice && (
              <RevealSpectacle
                key="rev"
                winner={winnerChoice}
                labelA={voteNode?.optionA?.label ?? "Option A"}
                labelB={voteNode?.optionB?.label ?? "Option B"}
                reduceMotion={Boolean(reduceMotion)}
                wallProjector={voteUiFullBleed}
              />
            )}

            {mode === "fin" && (
              <FinCard key="fin" title={node?.title ?? "The end"} subtitle={node?.subtitle} />
            )}

            {mode === "curtain" && <Curtain key="cur" />}
          </AnimatePresence>
        </div>
      </main>

      {!minimalShell ? (
        <footer className="relative z-[2] shrink-0 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-center font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[var(--kc-cream-dim)]/85 md:text-[0.68rem]">
          {kcCopy.tagline}
        </footer>
      ) : null}

      {voteUiFullBleed && votePhase === "open" && secondsLeft !== null ? (
        <motion.div
          animate={
            !reduceMotion && secondsLeft <= 5
              ? { scale: [1, 1.06, 1], filter: ["brightness(1)", "brightness(1.25)", "brightness(1)"] }
              : { scale: 1, filter: "brightness(1)" }
          }
          transition={
            !reduceMotion && secondsLeft <= 5
              ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 }
          }
          className={cn(
            "pointer-events-none fixed top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.5rem,env(safe-area-inset-right))] z-[55] rounded-2xl border px-2.5 py-2 shadow-[0_12px_48px_oklch(0_0_0/0.55)] backdrop-blur-md",
            secondsLeft <= 5
              ? "border-amber-400/55 bg-[oklch(0.12_0.04_48/0.92)]"
              : "border-[oklch(0.72_0.05_78/0.32)] bg-[oklch(0.07_0.02_260/0.88)]",
          )}
          role="status"
          aria-live="polite"
          aria-label={`Ballot closes in ${secondsLeft} seconds`}
        >
          <CountdownMedallion variant="corner" seconds={secondsLeft} fraction={ringFrac} label="Closes in" />
        </motion.div>
      ) : null}

      {voteUiFullBleed && votePhase === "countdown" ? (
        <div
          className="pointer-events-none fixed top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.5rem,env(safe-area-inset-right))] z-[55] rounded-2xl border border-[oklch(0.72_0.05_78/0.32)] bg-[oklch(0.07_0.02_260/0.88)] px-2.5 py-2 shadow-[0_12px_48px_oklch(0_0_0/0.55)] backdrop-blur-md"
          role="status"
          aria-live="polite"
          aria-label={`Vote opens in ${countdownSec} seconds`}
        >
          <CountdownMedallion
            variant="corner"
            seconds={countdownSec}
            fraction={countdownPresetSec > 0 ? Math.min(1, Math.max(0, countdownSec / countdownPresetSec)) : 1}
            label="Opens in"
          />
        </div>
      ) : null}

      {minimalShell ? (
        <>
          {!dockOpen ? (
            <button
              type="button"
              aria-label="Open display controls"
              aria-expanded={false}
              onClick={() => setDockOpen(true)}
              className="pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[60] flex size-12 items-center justify-center rounded-full border border-[var(--kc-gold-muted)]/35 bg-[oklch(0.1_0.02_280/0.92)] text-[var(--kc-champagne)] shadow-[0_8px_32px_oklch(0_0_0/0.45)] backdrop-blur-md transition-[background-color,border-color,transform] hover:border-[var(--kc-gold-muted)]/55 hover:bg-[oklch(0.14_0.025_48/0.94)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(0.78_0.06_78/0.45)]"
            >
              <MoreHorizontal className="size-6 opacity-90" strokeWidth={2} />
            </button>
          ) : null}
          {dockOpen ? (
            <div
              role="dialog"
              aria-label="Display controls"
              className="pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[61] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-2xl border border-[var(--kc-gold-muted)]/35 bg-[oklch(0.08_0.02_260/0.94)] p-4 shadow-[0_16px_64px_oklch(0_0_0/0.55)] backdrop-blur-lg"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[oklch(0.72_0.05_78/0.15)] pb-3">
                <span className="font-heading text-[clamp(1rem,2.4vw,1.35rem)] tracking-wide text-[var(--kc-cream)]">
                  Display
                </span>
                <button
                  type="button"
                  aria-label="Close controls"
                  onClick={() => setDockOpen(false)}
                  className="rounded-full p-2 text-[var(--kc-champagne)] hover:bg-[oklch(1_0_0/0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(0.78_0.06_78/0.45)]"
                >
                  <X className="size-5" />
                </button>
              </div>
              {!programFullscreen ? (
                <button
                  type="button"
                  onClick={() => {
                    enterProgramFullscreen();
                    setDockOpen(false);
                  }}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--kc-gold-muted)]/30 bg-[oklch(0.12_0.02_280/0.55)] px-4 py-3 font-mono text-[clamp(0.85rem,2vw,1.05rem)] font-semibold uppercase tracking-[0.12em] text-[var(--kc-champagne)] hover:bg-[oklch(0.16_0.025_48/0.65)]"
                >
                  <Expand className="size-4 shrink-0 opacity-90" />
                  Fill display
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    exitProgramFullscreen();
                    setDockOpen(false);
                  }}
                  className="min-h-12 rounded-xl border border-[var(--kc-gold-muted)]/30 bg-[oklch(0.12_0.02_280/0.55)] px-4 py-3 font-mono text-[clamp(0.85rem,2vw,1.05rem)] font-semibold uppercase tracking-[0.12em] text-[var(--kc-champagne)] hover:bg-[oklch(0.16_0.025_48/0.65)]"
                >
                  Exit fullscreen
                </button>
              )}
              <button
                type="button"
                onClick={toggleTestDisplay}
                className={cn(
                  "min-h-12 rounded-xl border px-4 py-3 font-mono text-[clamp(0.85rem,2vw,1.05rem)] font-semibold uppercase tracking-[0.12em] hover:bg-[oklch(0.16_0.025_48/0.65)]",
                  testDisplay
                    ? "border-yellow-400/55 bg-yellow-500/15 text-yellow-50"
                    : "border-[var(--kc-gold-muted)]/30 bg-[oklch(0.12_0.02_280/0.55)] text-[var(--kc-champagne)]",
                )}
              >
                Test display: {testDisplay ? "On" : "Off"}
              </button>
              <p className="font-mono text-[clamp(0.85rem,1.8vw,1rem)] leading-snug tracking-[0.06em] text-[var(--kc-cream-dim)]">
                Press ` (backtick) to toggle this panel.
              </p>
            </div>
          ) : null}
        </>
      ) : !programFullscreen ? (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[60] flex flex-col gap-2">
          <button
            type="button"
            onClick={enterProgramFullscreen}
            title="Start the show and fill the display (Esc to exit fullscreen)"
            className="pointer-events-auto flex min-h-12 items-center gap-2 rounded-full border border-[var(--kc-gold-muted)]/35 bg-[oklch(0.1_0.02_280/0.88)] px-4 py-3 font-mono text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[var(--kc-champagne)] shadow-[0_8px_32px_oklch(0_0_0/0.35)] backdrop-blur-md transition-[background-color,border-color,transform] duration-200 ease-out hover:border-[var(--kc-gold-muted)]/50 hover:bg-[oklch(0.14_0.025_48/0.92)] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(0.78_0.06_78/0.45)]"
          >
            <Expand className="size-4 opacity-90" />
            Fullscreen
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PreShow({ title }: { title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[min(92vw,56rem)]"
    >
      <ScreenTitleCardFrame>
        <div
          className="mx-auto mb-10 h-px w-[min(72vw,22rem)] bg-gradient-to-r from-transparent via-[var(--kc-gold-muted)]/45 to-transparent md:mb-12 md:w-[28rem]"
          aria-hidden
        />
        <p className="kc-screen-presents text-center">{kcCopy.presents}</p>
        <h1 className="mt-10 text-center font-heading text-[clamp(2.25rem,8vw,5.25rem)] font-normal leading-[1.05] tracking-tight text-[var(--kc-cream)] drop-shadow-[0_8px_56px_oklch(0_0_0/0.55)]">
          {title}
        </h1>
        <p className="mx-auto mt-8 max-w-2xl text-pretty text-center text-[clamp(1rem,2.4vw,1.35rem)] leading-relaxed text-[var(--kc-cream-dim)]">
          {kcCopy.tonightsFeature} — house lights dim.
        </p>
      </ScreenTitleCardFrame>
    </motion.div>
  );
}

function SegmentCard({
  title,
  playing,
  eyebrow = "Program",
  description,
  statusNote,
}: {
  title: string;
  /** Omitted when this wall does not mirror transport playback. */
  playing?: boolean;
  eyebrow?: string;
  description?: string | null;
  statusNote?: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-[min(92vw,68rem)] px-2"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(52vw,420px)] w-[min(88vw,820px)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-[var(--kc-gold-muted)]/10 bg-[linear-gradient(180deg,oklch(0.88_0.04_82/0.04),transparent_55%)] opacity-90"
        aria-hidden
      />
      <ScreenTitleCardFrame>
        <div className="relative text-center">
          <p className="kc-eyebrow text-[var(--kc-champagne)]/90">{eyebrow}</p>
          <h2 className="mt-10 font-heading text-[clamp(2.1rem,6.8vw,5rem)] font-normal leading-[1.08] tracking-tight text-[var(--kc-cream)] drop-shadow-[0_8px_56px_oklch(0_0_0/0.65)]">
            {title}
          </h2>
          {statusNote ? (
            <p className="mx-auto mt-8 max-w-3xl text-pretty text-center font-mono text-[clamp(1rem,2.2vw,1.25rem)] uppercase tracking-[0.12em] text-[var(--kc-champagne)]/90">
              {statusNote}
            </p>
          ) : null}
          {description?.trim() ? (
            <p className="mx-auto mt-6 max-w-3xl text-pretty text-[clamp(1.05rem,2.4vw,1.35rem)] leading-relaxed text-[var(--kc-cream-dim)]">
              {description.trim()}
            </p>
          ) : null}
          {playing != null ? (
            <div
              className={cn(
                "relative mt-14 inline-flex items-center gap-3 rounded-full border border-[var(--kc-gold-muted)]/18 bg-[oklch(0.09_0.02_280/0.55)] px-6 py-2.5 font-mono text-[clamp(0.95rem,2vw,1.15rem)] uppercase tracking-[0.14em] text-[var(--kc-cream-dim)] transition-opacity duration-300",
                playing ? "opacity-100" : "opacity-55",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-colors duration-300",
                  playing ? "bg-[var(--kc-champagne)]/85" : "bg-[var(--kc-cream-dim)]/35",
                )}
                aria-hidden
              />
              {playing ? "Playing" : "Paused"}
            </div>
          ) : null}
        </div>
      </ScreenTitleCardFrame>
    </motion.div>
  );
}

function VoteCountdown({
  seconds,
  ringFraction,
  wallProjector,
}: {
  seconds: number;
  ringFraction: number;
  wallProjector?: boolean;
}) {
  if (wallProjector) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="flex min-h-[min(40vh,420px)] w-full flex-col items-center justify-center px-[max(1rem,3vw)] py-6 md:py-8"
      >
        <p className="max-w-[92vw] text-center font-mono text-[clamp(1.35rem,3.8vw,2.25rem)] font-semibold uppercase leading-snug tracking-[0.2em] text-[var(--kc-champagne)]">
          Vote opens in
        </p>
        <div className="mt-10">
          <CountdownMedallion variant="screen" seconds={seconds} fraction={ringFraction} label="Seconds until ballot" />
        </div>
        <p className="sr-only">Vote opens in {seconds} seconds</p>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center"
    >
      <p className="kc-eyebrow mb-3 text-[var(--kc-champagne)]/95">Vote opens in</p>
      <CountdownMedallion variant="screen" seconds={seconds} fraction={ringFraction} label="Seconds until ballot" />
    </motion.div>
  );
}

function VoteBoard({
  question,
  labelA,
  labelB,
  votesA,
  votesB,
  pctA,
  pctB,
  open,
  secondsLeft,
  ringFrac,
  closePulseKey,
  reduceMotion,
  wallProjector,
}: {
  question: string;
  labelA: string;
  labelB: string;
  votesA: number;
  votesB: number;
  pctA: number;
  pctB: number;
  open: boolean;
  secondsLeft: number | null;
  ringFrac: number;
  closePulseKey?: number;
  reduceMotion: boolean;
  wallProjector?: boolean;
}) {
  const wall = Boolean(wallProjector);
  const motionSafe = Boolean(reduceMotion);
  const totalVotes = votesA + votesB;
  const leader: "A" | "B" | "tie" | "none" =
    totalVotes === 0 ? "none" : votesA === votesB ? "tie" : votesA > votesB ? "A" : "B";
  const leadA = leader === "A";
  const leadB = leader === "B";
  const emphasisLeader = leader !== "none" && leader !== "tie";

  const [closeFlash, setCloseFlash] = useState(false);
  const prevOpenRef = useRef(open);
  const [sealedSuspense, setSealedSuspense] = useState(false);

  useEffect(() => {
    if (open) setCloseFlash(false);
  }, [open]);

  useEffect(() => {
    if (prevOpenRef.current && !open) {
      setSealedSuspense(true);
      const t = window.setTimeout(() => setSealedSuspense(false), 1600);
      prevOpenRef.current = open;
      return () => window.clearTimeout(t);
    }
    prevOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (open || !closePulseKey) return;
    setCloseFlash(true);
    const t = window.setTimeout(() => setCloseFlash(false), 950);
    return () => window.clearTimeout(t);
  }, [open, closePulseKey]);

  const finalFive = Boolean(open && secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0);
  /** During close suspense, freeze “who’s ahead” glow; after beat, emphasize winner on projector */
  const showLeaderGlow = emphasisLeader && (open || !sealedSuspense);

  const statusHeadline =
    !open && sealedSuspense
      ? "The audience has decided…"
      : !open
        ? "Poll sealed — final tally locked"
        : totalVotes === 0
          ? "Audience is choosing…"
          : "Votes are live — watch the room swing";

  const statusSub =
    !open && sealedSuspense
      ? "Hold — locking the final split across every phone in the room."
      : !open
        ? "The ballot is closed. Here’s how the house split before we reveal the winning path."
        : totalVotes === 0
          ? "Phones are waking up — first taps land any second."
          : "Every tap reshapes the marquee in real time.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative w-full transition-opacity duration-500",
        wall ? "flex max-w-[min(98vw,92rem)] min-h-0 flex-1 flex-col" : "max-w-[min(92vw,72rem)]",
        !open && "opacity-[0.97]",
      )}
    >
      <AnimatePresence>
        {closeFlash ? (
          <motion.div
            key="close-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.92, 0] }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] bg-[radial-gradient(ellipse_at_center,oklch(0.85_0.14_78/0.35)_0%,transparent_62%)]"
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <ScreenTitleCardFrame paddingDensity={wall ? "dense" : "comfortable"}>
        <div className={cn("mx-auto text-center", wall ? "max-w-[min(96vw,72rem)]" : "max-w-5xl")}>
          <motion.p
            animate={
              !motionSafe && open && totalVotes === 0
                ? { opacity: [0.65, 1, 0.65] }
                : { opacity: 1 }
            }
            transition={
              !motionSafe && open && totalVotes === 0
                ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                : { duration: 0.35 }
            }
            className={cn(
              "kc-screen-decide-line font-mono font-semibold uppercase leading-snug tracking-[0.14em]",
              wall
                ? "mb-2 text-[clamp(1.05rem,3vw,1.75rem)] text-[var(--kc-champagne)] md:mb-4"
                : "mb-6 md:mb-8",
              finalFive && "text-amber-200 drop-shadow-[0_0_22px_oklch(0.78_0.12_78/0.35)]",
            )}
          >
            {statusHeadline}
          </motion.p>
          <p
            className={cn(
              "mx-auto max-w-[min(52ch,94vw)] font-mono uppercase leading-snug tracking-[0.18em] text-[var(--kc-cream-dim)]",
              wall ? "mb-4 text-[clamp(0.82rem,2vw,1.05rem)] md:mb-5" : "mb-6 text-[clamp(0.62rem,1.45vw,0.78rem)] md:mb-8",
            )}
          >
            {statusSub}
          </p>
          <h2
            className={cn(
              "font-heading font-normal leading-[1.12] tracking-tight text-[var(--kc-cream)] drop-shadow-[0_8px_56px_oklch(0_0_0/0.55)] [overflow-wrap:anywhere]",
              wall ? "text-[clamp(1.85rem,6.2vw,4.25rem)]" : "text-[clamp(2rem,5.5vw,4.25rem)]",
            )}
          >
            {question}
          </h2>
          <p
            className={cn(
              "font-mono uppercase tracking-[0.2em] text-[var(--kc-champagne)]/85",
              wall ? "mt-3 text-[clamp(0.95rem,2.2vw,1.35rem)]" : "mt-8 text-[clamp(0.65rem,1.5vw,0.82rem)]",
            )}
          >
            {open ? kcCopy.castYourVote : kcCopy.houseSpoken}
          </p>
        </div>

        {wall ? (
          <div
            className="mx-auto my-4 h-px max-w-[min(88vw,48rem)] bg-gradient-to-r from-transparent via-[var(--kc-gold-muted)]/38 to-transparent opacity-95 md:my-5"
            aria-hidden
          />
        ) : (
          <FilmReelDivider className="my-12 opacity-[0.38] md:my-14" />
        )}

        <div className={cn("mx-auto grid md:grid-cols-2", wall ? "max-w-[min(96vw,72rem)] gap-3 md:gap-8" : "max-w-5xl gap-6 md:gap-10")}>
          <OptionTile
            label={labelA}
            side="A"
            dim={!open}
            wall={wall}
            spotlight={showLeaderGlow && leadA}
          />
          <OptionTile
            label={labelB}
            side="B"
            dim={!open}
            wall={wall}
            spotlight={showLeaderGlow && leadB}
          />
        </div>

        <div
          className={cn(
            "mx-auto w-full max-w-4xl",
            wall ? "mt-4 space-y-4 md:mt-5 md:space-y-5" : "mt-14 space-y-12 md:mt-16 md:space-y-14",
          )}
        >
          <MarqueeLightBar
            sideLabel="Option A"
            votes={votesA}
            pct={pctA}
            accent="coral"
            bulbsLit={open && !motionSafe}
            compact={!wall}
            projector={wall}
            leading={showLeaderGlow && leadA}
            reduceMotion={motionSafe}
          />
          <MarqueeLightBar
            sideLabel="Option B"
            votes={votesB}
            pct={pctB}
            accent="teal"
            bulbsLit={open && !motionSafe}
            compact={!wall}
            projector={wall}
            leading={showLeaderGlow && leadB}
            reduceMotion={motionSafe}
          />
        </div>

        <div className={cn("mx-auto flex flex-col items-center", wall ? "mt-4 md:mt-5" : "mt-14 md:mt-16")}>
          {open && secondsLeft !== null ? (
            <>
              <motion.div
                animate={
                  !motionSafe && finalFive
                    ? {
                        scale: [1, 1.05, 1],
                        filter: ["brightness(1)", "brightness(1.15)", "brightness(1)"],
                      }
                    : {}
                }
                transition={
                  !motionSafe && finalFive
                    ? { duration: 0.48, repeat: Infinity, ease: "easeInOut" }
                    : {}
                }
                className={cn(finalFive && "drop-shadow-[0_0_36px_oklch(0.78_0.14_78/0.45)]")}
              >
                <CountdownMedallion
                  variant="screen"
                  fraction={ringFrac}
                  seconds={secondsLeft}
                  label={finalFive ? "Final seconds" : "Ballot closes in"}
                />
              </motion.div>
              {!motionSafe && finalFive ? (
                <motion.p
                  aria-hidden
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 font-heading text-[clamp(1.75rem,6vw,3.25rem)] font-normal tabular-nums tracking-wide text-amber-200 drop-shadow-[0_8px_40px_oklch(0_0_0/0.45)]"
                >
                  {secondsLeft}
                </motion.p>
              ) : null}
              {wall ? (
                <p className="sr-only">Ballot closes in {secondsLeft} seconds — large timer also top corner</p>
              ) : null}
            </>
          ) : (
            <motion.div
              initial={!motionSafe ? { scale: 0.94, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              className="flex flex-col items-center gap-3"
            >
              <p
                className={cn(
                  "text-center text-[var(--kc-champagne)]",
                  wall
                    ? "font-mono text-[clamp(1.15rem,2.8vw,1.65rem)] font-semibold uppercase tracking-[0.14em]"
                    : "kc-eyebrow",
                )}
              >
                {kcCopy.houseSpoken}
              </p>
              <p className="max-w-[min(44ch,92vw)] text-center font-mono text-[clamp(0.75rem,1.8vw,0.95rem)] uppercase tracking-[0.16em] text-[var(--kc-cream-dim)]">
                A {Math.round(pctA)}% · B {Math.round(pctB)}% · {totalVotes} ballots
              </p>
            </motion.div>
          )}
        </div>
      </ScreenTitleCardFrame>
    </motion.div>
  );
}

function OptionTile({
  label,
  side,
  dim,
  wall,
  spotlight,
}: {
  label: string;
  side: "A" | "B";
  dim: boolean;
  wall?: boolean;
  spotlight?: boolean;
}) {
  const warm = side === "A";
  return (
    <motion.div
      layout
      animate={{
        boxShadow: spotlight
          ? "0 0 52px oklch(0.78 0.12 78 / 0.28)"
          : "0 12px 40px oklch(0 0 0 / 0.22)",
      }}
      transition={{ type: "spring", stiffness: 140, damping: 22 }}
      className={cn(
        "rounded-md border border-[oklch(1_0_0/0.1)] bg-[oklch(0.12_0.02_260/0.45)] text-left",
        wall ? "px-4 py-5 md:px-6 md:py-7" : "px-6 py-10 md:px-10 md:py-12",
        warm ? "border-l-[3px] border-l-[oklch(0.58_0.08_55/0.55)]" : "border-l-[3px] border-l-[oklch(0.48_0.07_195/0.48)]",
        spotlight && "border-[oklch(0.85_0.12_78/0.42)] ring-1 ring-amber-400/35",
        dim && "opacity-50 saturate-[0.85]",
      )}
    >
      <span
        className={cn(
          "font-mono font-semibold uppercase tracking-[0.18em] text-[var(--kc-champagne)]/90",
          wall ? "text-[clamp(1.1rem,2.6vw,1.5rem)]" : "kc-eyebrow",
        )}
      >
        Option {side}
      </span>
      <p
        className={cn(
          "font-heading font-normal leading-[1.15] text-[var(--kc-cream)] [overflow-wrap:anywhere]",
          wall ? "mt-4 text-[clamp(1.65rem,4.5vw,3.5rem)] md:mt-6" : "mt-6 text-[clamp(1.55rem,4.2vw,2.85rem)]",
        )}
      >
        {label}
      </p>
    </motion.div>
  );
}

type RevealPhase = "pulse" | "flash" | "tag" | "hold";

function RevealSpectacle({
  winner,
  labelA,
  labelB,
  reduceMotion,
  wallProjector,
}: {
  winner: VoteChoice;
  labelA: string;
  labelB: string;
  reduceMotion: boolean;
  wallProjector?: boolean;
}) {
  const wall = Boolean(wallProjector);
  const label = winner === "A" ? labelA : labelB;
  const [phase, setPhase] = useState<RevealPhase>("pulse");
  const [pulseDigit, setPulseDigit] = useState(3);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (reduceMotion) {
      setPhase("hold");
      return;
    }
    setPhase("pulse");
    setPulseDigit(3);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const push = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timers.current.push(id);
    };
    const pace = wall ? 0.82 : 1;
    push(() => setPulseDigit(2), Math.round(720 * pace));
    push(() => setPulseDigit(1), Math.round(1440 * pace));
    push(() => setPhase("flash"), Math.round(2280 * pace));
    push(() => setPhase("tag"), Math.round(2780 * pace));
    push(() => setPhase("hold"), Math.round(wall ? 3600 : 5100));
    return () => timers.current.forEach(clearTimeout);
  }, [winner, reduceMotion, wall]);

  return (
    <motion.div
      className={cn(
        "relative flex w-full max-w-6xl flex-col items-center justify-center text-center",
        wall ? "flex min-h-0 flex-1 flex-col py-1" : "min-h-[60vh]",
      )}
    >
      <AnimatePresence mode="wait">
        {phase === "pulse" && (
          <motion.div
            key="pulse"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            <p className="kc-eyebrow text-[var(--kc-champagne)]">Reveal</p>
            <div className="mt-10 flex min-h-[clamp(5rem,22vw,14rem)] items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.span
                  key={pulseDigit}
                  initial={{ opacity: 0, scale: 0.72, filter: "blur(14px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.08, filter: "blur(8px)" }}
                  transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  className="font-heading text-[clamp(3.25rem,16vw,10rem)] font-normal tabular-nums text-[var(--kc-cream)] drop-shadow-[0_16px_72px_oklch(0_0_0/0.45)] sm:text-[clamp(4rem,18vw,12rem)]"
                >
                  {pulseDigit}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {phase === "flash" && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,oklch(0.11_0.03_48/0.98)_0%,oklch(0.05_0.02_280)_100%)]"
          >
            <motion.div
              className="pointer-events-none absolute inset-y-[-20%] left-1/2 w-[min(42vw,520px)] max-w-none -translate-x-1/2 bg-[linear-gradient(90deg,transparent_0%,oklch(0.93_0.07_85/0.2)_45%,oklch(0.92_0.08_78/0.28)_50%,oklch(0.93_0.07_85/0.2)_55%,transparent_100%)]"
              initial={{ scaleY: 0.08, opacity: 0 }}
              animate={{ scaleY: 1, opacity: [0, 0.95, 0.25] }}
              transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden
            />
            <motion.span
              initial={{ scale: 1.45, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative font-heading text-[clamp(5.5rem,28vw,17rem)] font-normal text-[var(--kc-champagne)] drop-shadow-[0_0_100px_oklch(0.78_0.08_78/0.35)]"
            >
              {winner}
            </motion.span>
          </motion.div>
        )}

        {phase === "tag" && (
          <motion.div
            key="tag"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="max-w-4xl px-6"
          >
            <motion.p
              initial={{ letterSpacing: "0.28em", opacity: 0 }}
              animate={{ letterSpacing: "0.08em", opacity: 1 }}
              transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
              className="font-heading text-[clamp(2rem,6vw,4rem)] font-normal leading-snug text-[var(--kc-cream)] drop-shadow-[0_6px_40px_oklch(0_0_0/0.45)]"
            >
              The audience has chosen…
            </motion.p>
          </motion.div>
        )}

        {phase === "hold" && (
          <motion.div
            key="hold"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[min(94vw,72rem)] px-1 sm:px-2"
          >
            <ScreenTitleCardFrame paddingDensity={wall ? "dense" : "comfortable"}>
              <div
                className="mx-auto h-px w-[min(78vw,38rem)] bg-gradient-to-r from-transparent via-[var(--kc-gold-muted)]/55 to-transparent"
                aria-hidden
              />
              <p
                className={cn(
                  "kc-eyebrow text-center text-[var(--kc-champagne)]",
                  wall ? "mt-4 md:mt-5" : "mt-12",
                )}
              >
                {kcCopy.houseSpoken}
              </p>
              <motion.h3
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "text-center font-heading font-normal leading-[1.06] tracking-tight text-[var(--kc-cream)] drop-shadow-[0_16px_88px_oklch(0_0_0/0.55)]",
                  wall
                    ? "mt-4 text-[clamp(2.1rem,8vw,5rem)] md:mt-5"
                    : "mt-12 text-[clamp(3rem,11vw,8.5rem)]",
                )}
              >
                {label}
              </motion.h3>
              <div
                className={cn(
                  "mx-auto h-px w-[min(78vw,38rem)] bg-gradient-to-r from-transparent via-[var(--kc-gold-muted)]/38 to-transparent",
                  wall ? "mt-5 md:mt-6" : "mt-14",
                )}
                aria-hidden
              />
              <p
                className={cn(
                  "text-center font-mono uppercase tracking-[0.18em] text-[var(--kc-cream-dim)]",
                  wall ? "mt-4 text-[clamp(0.95rem,2.2vw,1.25rem)] md:mt-5" : "mt-12 text-[clamp(1.1rem,2.6vw,1.5rem)]",
                )}
              >
                Option {winner}
              </p>
              <p
                className={cn(
                  "text-center font-heading font-normal text-[var(--kc-champagne)]/90",
                  wall ? "mt-5 text-[clamp(1rem,2.4vw,1.35rem)] md:mt-6" : "mt-10 text-[clamp(1.15rem,2.8vw,1.6rem)]",
                )}
              >
                Next reel begins shortly
              </p>
            </ScreenTitleCardFrame>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FinCard({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[min(88vw,48rem)]"
    >
      <ScreenTitleCardFrame>
        <div className="mb-12 h-px w-[min(70vw,18rem)] bg-gradient-to-r from-transparent via-[var(--kc-gold-muted)]/42 to-transparent md:mb-14 md:w-[22rem]" aria-hidden />
        <p className="kc-eyebrow text-center text-[var(--kc-champagne)]/90">Fin</p>
        <h2 className="mt-10 text-center font-heading text-[clamp(2.2rem,7.5vw,5rem)] font-normal tracking-tight text-[var(--kc-cream)]">
          {title}
        </h2>
        {subtitle?.trim() ? (
          <p className="mx-auto mt-8 max-w-2xl text-center text-pretty text-[clamp(1.05rem,2.4vw,1.35rem)] leading-relaxed text-[var(--kc-cream-dim)]">
            {subtitle.trim()}
          </p>
        ) : null}
      </ScreenTitleCardFrame>
    </motion.div>
  );
}

function Curtain() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[min(88vw,52rem)]"
    >
      <ScreenTitleCardFrame>
        <div className="mb-14 h-px w-[min(72vw,20rem)] bg-gradient-to-r from-transparent via-[var(--kc-gold-muted)]/38 to-transparent md:w-[24rem]" aria-hidden />
        <h2 className="text-center font-heading text-[clamp(2.5rem,12vw,8rem)] font-normal tracking-[0.015em] text-[var(--kc-champagne)]">
          Curtain
        </h2>
        <p className="mx-auto mt-14 max-w-xl text-center font-mono text-[clamp(1rem,2.4vw,1.35rem)] uppercase leading-relaxed tracking-[0.14em] text-[var(--kc-cream-dim)]">
          Thank you — the picture fades to black.
        </p>
      </ScreenTitleCardFrame>
    </motion.div>
  );
}
