"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Clapperboard,
  Copy,
  FastForward,
  Forward,
  Gauge,
  Info,
  Keyboard,
  Library,
  Monitor,
  Pause,
  Play,
  Power,
  Rewind,
  RotateCcw,
  Scan,
  Sparkles,
  Vote,
} from "lucide-react";

import { FilmGrain } from "@/components/cinematic/film-grain";
import { kcCopy } from "@/lib/design/kasdan-hollywood-tokens";
import { SpotlightWash } from "@/components/cinematic/spotlight";
import { YoutubeSyncPlayer } from "@/components/media/youtube-sync-player";
import { HostDeskStatusBar } from "@/components/host/host-desk-status-bar";
import { HostOperationalAlerts, type HostOperationalAlert } from "@/components/host/host-operational-alerts";
import { HostRehearsalPanel } from "@/components/host/host-rehearsal-panel";
import { HostStoryTimeline } from "@/components/host/host-story-timeline";
import { HostSystemCheck } from "@/components/host/host-system-check";
import { JoinQrTestPanel } from "@/components/host/join-qr-test-panel";
import { StudioBadge, TheatreCurtainBackground } from "@/components/kasdan";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useShowtimeHostDiagnostics } from "@/hooks/use-showtime-host-diagnostics";
import { LOOPBACK_WARNING } from "@/lib/join/get-join-url";
import { resolveVideoSource } from "@/lib/media/video-source";
import { getNode, validateGraph } from "@/lib/story-engine";
import { useEventRoomPlaybackSync } from "@/hooks/use-event-room-playback-sync";
import { useAudienceVoteIngest, useProjectionAlertIngest, useVoteStateBroadcaster } from "@/hooks/use-room-vote-sync";
import { useNodePlaybackSrc } from "@/hooks/use-node-playback-src";
import { getEffectiveWinner, needsHostChoice } from "@/lib/story-engine/engine";
import { shouldWarnRealtimeDisconnected, shouldWarnRemoteEventMissing } from "@/lib/showtime/host-health";
import { branchOutlookFromNode } from "@/lib/showtime/host-story-path";
import { nodePickerLabel } from "@/lib/showtime/node-picker-label";
import {
  getSavedFilm,
  listSavedFilms,
  SAVED_FILMS_CHANGED_EVENT,
  SAVED_FILMS_STORAGE_KEY,
  type SavedFilm,
} from "@/lib/showtime/saved-films";
import { useMockEventStore, type LiveShowStatus } from "@/lib/store/mock-event-store";
import type { StoryGraph, StoryNode, StoryNodeId } from "@/types";
import { cn } from "@/lib/utils";

const PRESETS = [15, 30, 45, 60] as const;

const statusCopy: Record<LiveShowStatus, string> = {
  draft: "Draft",
  waiting: "Stand by",
  playing: "On air",
  voting: "Voting",
  revealing: "Reveal",
  ended: "Ended",
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function StatusOrb({ status }: { status: LiveShowStatus }) {
  const hue =
    status === "voting"
      ? "shadow-[0_0_18px_oklch(0.72_0.1_185/0.55)] bg-[oklch(0.65_0.12_185)]"
      : status === "revealing"
        ? "shadow-[0_0_22px_oklch(0.78_0.12_78/0.55)] bg-[oklch(0.72_0.1_78)]"
        : status === "playing"
          ? "shadow-[0_0_18px_oklch(0.72_0.14_55/0.45)] bg-[oklch(0.62_0.12_55)]"
          : "shadow-[0_0_12px_oklch(0.85_0.05_85/0.25)] bg-[oklch(0.55_0.04_75)]";
  return (
    <motion.div
      layout
      className={cn("relative flex size-3 rounded-full ring-1 ring-[var(--kc-gold-muted)]/40", hue)}
      animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <span className="absolute inset-0 rounded-full bg-primary/40 blur-sm" />
    </motion.div>
  );
}

/** Muted desk preview — mirrors transport; direct URLs, blob URLs, and YouTube watch links. */
function OperatorPreviewVideo({ src, isPlaying }: { src: string; isPlaying: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const source = useMemo(() => resolveVideoSource(src), [src]);
  const [mediaFault, setMediaFault] = useState(false);
  const [ytRetryNonce, setYtRetryNonce] = useState(0);
  const setPlaybackPosition = useMockEventStore((s) => s.setPlaybackPosition);
  const setPlaybackDuration = useMockEventStore((s) => s.setPlaybackDuration);
  const positionSec = useMockEventStore((s) => s.playback.positionSec);
  const eventStarted = useMockEventStore((s) => s.eventStarted);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const tryPlay = useCallback(() => {
    const v = ref.current;
    if (!v || !isPlayingRef.current) return;
    void v.play().catch(() => {});
  }, []);

  useEffect(() => {
    setMediaFault(false);
    setYtRetryNonce(0);
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.load();
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isPlaying) tryPlay();
    else v.pause();
  }, [isPlaying, tryPlay, src]);

  const onLoadedMetadata = useCallback(() => {
    const v = ref.current;
    if (!v || !Number.isFinite(v.duration)) return;
    setPlaybackDuration(v.duration);
    tryPlay();
  }, [setPlaybackDuration, tryPlay]);

  const faultPanel = (detail: string) => (
    <div className="flex aspect-video max-h-[min(52vh,480px)] w-full flex-col items-center justify-center gap-4 rounded-xl border border-amber-500/45 bg-black/85 px-6 py-8 text-center">
      <p className="text-lg font-semibold text-amber-50 md:text-xl">Preview playback failed</p>
      <p className="max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">{detail}</p>
      <Button
        type="button"
        variant="secondary"
        className="rounded-xl px-6 text-base font-semibold"
        onClick={() => {
          setMediaFault(false);
          if (source?.kind === "youtube") setYtRetryNonce((n) => n + 1);
          else ref.current?.load();
        }}
      >
        Retry load
      </Button>
    </div>
  );

  if (!source) {
    return faultPanel("This beat has no playable URL. Add a video link or local file in Story builder.");
  }

  if (source.kind === "youtube") {
    if (mediaFault) {
      return faultPanel(
        "YouTube did not load (network, embed restrictions, or invalid ID). Open the watch URL in a normal browser tab to verify.",
      );
    }
    return (
      <div className="aspect-video max-h-[min(52vh,480px)] w-full overflow-hidden rounded-xl border border-[var(--bn-line)] bg-black">
        <YoutubeSyncPlayer
          key={`${source.videoId}-${ytRetryNonce}`}
          videoId={source.videoId}
          className="h-full w-full"
          muted
          showYoutubeControls
          isPlaying={isPlaying}
          eventStarted={eventStarted}
          positionSec={positionSec}
          setPlaybackPosition={setPlaybackPosition}
          setPlaybackDuration={setPlaybackDuration}
          onEnded={() => {}}
          onMediaError={() => setMediaFault(true)}
          onMediaReady={() => setMediaFault(false)}
        />
      </div>
    );
  }

  if (mediaFault) {
    return faultPanel(
      "The browser could not decode this file (bad URL, CORS, or unsupported codec). Prefer MP4/H.264 or a YouTube link.",
    );
  }

  return (
    <video
      ref={ref}
      src={source.url}
      className="aspect-video max-h-[min(52vh,480px)] w-full object-contain"
      muted
      playsInline
      controls
      preload="auto"
      onLoadedMetadata={() => {
        setMediaFault(false);
        onLoadedMetadata();
      }}
      onCanPlay={tryPlay}
      onError={() => setMediaFault(true)}
      onTimeUpdate={() => {
        const v = ref.current;
        if (v) setPlaybackPosition(v.currentTime);
      }}
    />
  );
}

function OperatorDeskPreview({ node, isPlaying }: { node: StoryNode | undefined; isPlaying: boolean }) {
  const { src, status } = useNodePlaybackSrc(node);
  if (status === "loading") {
    return (
      <p className="px-4 py-8 text-center font-mono text-sm text-muted-foreground md:text-base">
        Resolving media for this beat…
      </p>
    );
  }
  if (status === "missing") {
    return (
      <p className="px-4 py-8 text-center text-base leading-relaxed text-amber-200/90 md:text-lg">
        Local file missing from storage. Re-pick the video in Story builder on this machine, then publish again.
      </p>
    );
  }
  if (!src) {
    return (
      <p className="px-4 py-8 text-center text-base leading-relaxed text-muted-foreground md:text-lg">
        No video is attached to this beat. Wire media in Story builder before show night.
      </p>
    );
  }
  return <OperatorPreviewVideo src={src} isPlaying={isPlaying} />;
}

function BigTransport({
  label,
  icon: Icon,
  hotkey,
  disabled,
  onClick,
  variant = "secondary",
  className,
}: {
  label: string;
  icon: typeof Play;
  hotkey?: string;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "secondary" | "outline" | "destructive";
  className?: string;
}) {
  return (
    <motion.div whileTap={{ scale: disabled ? 1 : 0.98 }} className="min-w-0">
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "relative flex h-auto min-h-[5rem] w-full flex-col items-start justify-center gap-1.5 rounded-2xl border-2 border-[var(--bn-line)] px-4 py-3.5 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] sm:min-h-[5.25rem] sm:px-5 sm:py-4 active:scale-[0.99]",
          className,
        )}
      >
        <Icon className="size-6 shrink-0 opacity-90" />
        <span className="text-base font-semibold leading-tight md:text-lg">{label}</span>
        {hotkey ? (
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground md:text-sm">{hotkey}</span>
        ) : null}
      </Button>
    </motion.div>
  );
}

export function HostConsole() {
  const diagnostics = useShowtimeHostDiagnostics();
  const [copiedJoinUrl, setCopiedJoinUrl] = useState(false);
  const [copiedEventCode, setCopiedEventCode] = useState(false);
  const { sendPlaybackCommand, sendPlaybackResync } = useEventRoomPlaybackSync("host");
  useVoteStateBroadcaster();
  useAudienceVoteIngest();
  useProjectionAlertIngest();
  const engine = useMockEventStore((s) => s.engine);
  const eventTitle = useMockEventStore((s) => s.eventTitle);
  const eventCode = useMockEventStore((s) => s.eventCode);
  const eventId = useMockEventStore((s) => s.eventId);
  const liveStatus = useMockEventStore((s) => s.liveStatus);
  const eventStarted = useMockEventStore((s) => s.eventStarted);
  const showEnded = useMockEventStore((s) => s.showEnded);
  const playback = useMockEventStore((s) => s.playback);
  const countdownPresetSec = useMockEventStore((s) => s.countdownPresetSec);
  const pollDurationSec = useMockEventStore((s) => s.pollDurationSec);
  const audienceConnected = useMockEventStore((s) => s.audienceConnected);
  const projectionSurfaceFault = useMockEventStore((s) => s.projectionSurfaceFault);
  const setProjectionSurfaceFault = useMockEventStore((s) => s.setProjectionSurfaceFault);
  const activityLog = useMockEventStore((s) => s.activityLog);
  const votePhase = useMockEventStore((s) => s.votePhase);
  const voteEndsAt = useMockEventStore((s) => s.voteEndsAt);
  const countdownSec = useMockEventStore((s) => s.countdownSec);
  const votesA = useMockEventStore((s) => s.votesA);
  const votesB = useMockEventStore((s) => s.votesB);
  const graph = useMockEventStore((s) => s.graph);
  const currentNodeId = useMockEventStore((s) => s.currentNodeId);
  const productionValidation = useMemo(() => validateGraph(graph, { requireMedia: true }), [graph]);

  const startEvent = useMockEventStore((s) => s.startEvent);
  const endShow = useMockEventStore((s) => s.endShow);
  const togglePlay = useMockEventStore((s) => s.togglePlay);
  const restartSegment = useMockEventStore((s) => s.restartSegment);
  const seekRelative = useMockEventStore((s) => s.seekRelative);
  const setCountdownPreset = useMockEventStore((s) => s.setCountdownPreset);
  const setPollDuration = useMockEventStore((s) => s.setPollDuration);
  const openVoteRunway = useMockEventStore((s) => s.openVoteRunway);
  const openVoteImmediate = useMockEventStore((s) => s.openVoteImmediate);
  const tickCountdown = useMockEventStore((s) => s.tickCountdown);
  const closeVote = useMockEventStore((s) => s.closeVote);
  const revealWinnerToRoom = useMockEventStore((s) => s.revealWinnerToRoom);
  const advanceToWinningBranch = useMockEventStore((s) => s.advanceToWinningBranch);
  const hostOverrideA = useMockEventStore((s) => s.hostOverrideA);
  const hostOverrideB = useMockEventStore((s) => s.hostOverrideB);
  const resolveTieA = useMockEventStore((s) => s.resolveTieA);
  const resolveTieB = useMockEventStore((s) => s.resolveTieB);
  const setCurrentNodeId = useMockEventStore((s) => s.setCurrentNodeId);
  const loadStoryGraph = useMockEventStore((s) => s.loadStoryGraph);
  const pulseDemoVotes = useMockEventStore((s) => s.pulseDemoVotes);
  const setAudienceConnected = useMockEventStore((s) => s.setAudienceConnected);
  const resetLiveEvent = useMockEventStore((s) => s.resetLiveEvent);
  const allowAnonymousQuickJoin = useMockEventStore((s) => s.allowAnonymousQuickJoin);
  const setAllowAnonymousQuickJoin = useMockEventStore((s) => s.setAllowAnonymousQuickJoin);

  const [savedFilms, setSavedFilms] = useState<SavedFilm[]>(() => listSavedFilms());
  const [savedFilmPick, setSavedFilmPick] = useState("");

  const cmdToggle = useCallback(() => {
    const wasPlaying = useMockEventStore.getState().playback.isPlaying;
    togglePlay();
    sendPlaybackCommand(wasPlaying ? "pause" : "play");
  }, [togglePlay, sendPlaybackCommand]);

  const cmdSeek = useCallback(
    (delta: number) => {
      seekRelative(delta);
      sendPlaybackCommand("seek", delta);
    },
    [seekRelative, sendPlaybackCommand],
  );

  const cmdRestart = useCallback(() => {
    restartSegment();
    sendPlaybackCommand("restart");
  }, [restartSegment, sendPlaybackCommand]);

  const node = useMemo(() => getNode(graph, currentNodeId), [graph, currentNodeId]);
  const voteNode = useMemo(
    () => (engine.voteNodeId ? getNode(graph, engine.voteNodeId) : node),
    [engine.voteNodeId, graph, node],
  );
  const nodeIds = useMemo(() => Object.keys(graph.nodes), [graph.nodes]);

  const tieActive = needsHostChoice(engine);
  const draftRoom = !eventStarted && !showEnded;
  const noAudience = audienceConnected === 0 && eventStarted && !showEnded;
  const voteLive = votePhase === "open" || votePhase === "countdown" || engine.phase === "tiebreak";
  const canSwapSavedFilm = !eventStarted || showEnded;

  const now = useNowTicker(votePhase === "open", 400);
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
      ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(diagnostics.joinUrl)}`
      : "";

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

  const copyEventCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(eventCode);
      setCopiedEventCode(true);
      window.setTimeout(() => setCopiedEventCode(false), 2000);
    } catch {
      /* ignore */
    }
  }, [eventCode]);

  const confirmResetLiveEvent = useCallback(() => {
    if (
      !window.confirm(
        "Reset this room to draft at the opening beat? Playback stops, votes clear, audience headcount resets, and remote vote receipts reset.",
      )
    )
      return;
    resetLiveEvent();
  }, [resetLiveEvent]);

  const tryHostOverrideA = useCallback(() => {
    if (tieActive) {
      resolveTieA();
      return;
    }
    if (engine.phase === "open") {
      if (
        !window.confirm(
          "Override the live ballot and award Option A? The room records this as an operator decision, not the audience tally.",
        )
      )
        return;
      hostOverrideA();
    }
  }, [tieActive, engine.phase, resolveTieA, hostOverrideA]);

  const tryHostOverrideB = useCallback(() => {
    if (tieActive) {
      resolveTieB();
      return;
    }
    if (engine.phase === "open") {
      if (
        !window.confirm(
          "Override the live ballot and award Option B? The room records this as an operator decision, not the audience tally.",
        )
      )
        return;
      hostOverrideB();
    }
  }, [tieActive, engine.phase, resolveTieB, hostOverrideB]);

  const confirmedCloseVote = useCallback(() => {
    const st = useMockEventStore.getState();
    if (st.votePhase === "open") {
      const left =
        st.voteEndsAt != null ? Math.max(0, Math.ceil((st.voteEndsAt - Date.now()) / 1000)) : null;
      const msg =
        left != null && left > 0
          ? `Close voting now with ${left}s left on the clock? The tally locks immediately and guests lose remaining time.`
          : "Close voting now and lock the tally?";
      if (!window.confirm(msg)) return;
    }
    closeVote();
  }, [closeVote]);

  const confirmedEndShow = useCallback(() => {
    if (!window.confirm("End the show for everyone? Playback stops, guests see the finale state, and you cannot reopen this run."))
      return;
    endShow();
  }, [endShow]);

  const jumpToNode = useCallback(
    (id: StoryNodeId) => {
      if (id === currentNodeId) return;
      if (eventStarted && !showEnded) {
        if (
          !window.confirm(
            `Jump to beat “${nodePickerLabel(graph, id)}”? The projector cuts to this node immediately.`,
          )
        )
          return;
      }
      setCurrentNodeId(id);
    },
    [currentNodeId, eventStarted, showEnded, graph, setCurrentNodeId],
  );

  const safeStartEvent = useCallback(() => {
    const v = validateGraph(graph, { requireMedia: true });
    if (!v.ok) {
      const preview = v.errors.slice(0, 6).join("\n• ");
      const more =
        v.errors.length > 6 ? `\n… and ${v.errors.length - 6} more — fix them in Story builder.` : "";
      if (
        !window.confirm(
          `Story did not pass production checks:\n\n• ${preview}${more}\n\nStart anyway? Only do this for rehearsal — a paying audience expects every beat wired with media.`,
        )
      )
        return;
    }
    startEvent();
  }, [graph, startEvent]);

  const resyncProjector = useCallback(() => {
    sendPlaybackResync();
  }, [sendPlaybackResync]);

  const operationalAlerts = useMemo((): HostOperationalAlert[] => {
    const partialEnv = diagnostics.supabaseUrlPresent !== diagnostics.supabaseAnonPresent;
    const rows: HostOperationalAlert[] = [];

    if (projectionSurfaceFault) {
      rows.push({
        id: "projection-media-fault",
        variant: "danger",
        title: "Projection paused — media fault on /screen",
        description: projectionSurfaceFault,
        actions: (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-lg text-xs"
              onClick={() => setProjectionSurfaceFault(null)}
            >
              Acknowledge
            </Button>
            <Link href="/screen" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-lg text-xs")}>
              Open /screen
            </Link>
            <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs" onClick={resyncProjector}>
              Resync projector
            </Button>
          </>
        ),
      });
    }

    if (diagnostics.loopbackJoinWarning) {
      rows.push({
        id: "loopback-qr",
        variant: "warning",
        title: "Join URL is not phone-safe",
        description: `${LOOPBACK_WARNING} Set NEXT_PUBLIC_JOIN_ORIGIN, restart the app, and refresh /host.`,
      });
    }

    if (partialEnv) {
      rows.push({
        id: "partial-supabase",
        variant: "danger",
        title: "Incomplete Supabase configuration",
        description:
          "Both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set for Live Supabase. Fix .env.local and restart the dev server.",
      });
    } else if (!diagnostics.supabaseUrlPresent && !diagnostics.supabaseAnonPresent) {
      rows.push({
        id: "no-supabase",
        variant: "warning",
        title: "Supabase environment variables are not set",
        description:
          "You are in Local Preview: sync uses BroadcastChannel across tabs on this browser only. Add Supabase keys so phones on other devices can join reliably.",
        actions: (
          <a
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "rounded-lg text-xs")}
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
          >
            Open Supabase dashboard
          </a>
        ),
      });
    }

    if (diagnostics.remoteEventLookup === "error") {
      rows.push({
        id: "remote-event-error",
        variant: "danger",
        title: "Could not verify this event code in Supabase",
        description: diagnostics.remoteEventError ?? "Check network and Supabase project status.",
        actions: (
          <Button type="button" size="sm" variant="secondary" className="rounded-lg text-xs" onClick={() => diagnostics.bumpRealtimeProbe()}>
            Retry connection checks
          </Button>
        ),
      });
    } else if (shouldWarnRemoteEventMissing(diagnostics.remoteEventLookup, eventCode)) {
      rows.push({
        id: "remote-event-missing",
        variant: "warning",
        title: "No event row found for this code",
        description:
          "Create or publish an event with this code in Supabase, or use the built-in demo code, before inviting a remote audience.",
      });
    }

    if (shouldWarnRealtimeDisconnected(diagnostics.syncMode, diagnostics.realtimeStatus)) {
      rows.push({
        id: "realtime-down",
        variant: "danger",
        title: "Realtime is disconnected",
        description:
          "The host probe channel hit an error. Host, screen, and phones may not stay in sync until Realtime reconnects.",
        actions: (
          <Button type="button" size="sm" variant="secondary" className="rounded-lg text-xs" onClick={() => diagnostics.bumpRealtimeProbe()}>
            Retry realtime
          </Button>
        ),
      });
    }

    if (eventStarted && !showEnded && !diagnostics.screenLikelyConnected) {
      rows.push({
        id: "no-screen",
        variant: "warning",
        title: "No projector tab detected",
        description:
          "Open /screen on this machine (same origin). The projector sends a heartbeat every few seconds so we know it is listening.",
        actions: (
          <Link href="/screen" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "rounded-lg text-xs")}>
            Open /screen
          </Link>
        ),
      });
    }

    if (eventStarted && !showEnded && audienceConnected === 0) {
      rows.push({
        id: "no-audience",
        variant: "info",
        title: "No audience in the headcount",
        description:
          "Playback still runs; vote tallies stay at zero until phones join or you add demo headcount for rehearsal.",
        actions: (
          <>
            <Button type="button" size="sm" variant="secondary" className="rounded-lg text-xs" onClick={() => setAudienceConnected(3)}>
              Add +3 demo
            </Button>
            {diagnostics.joinUrl ? (
              <Link
                href={diagnostics.joinUrl}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-lg text-xs")}
              >
                Open join link
              </Link>
            ) : null}
          </>
        ),
      });
    }

    if (!eventStarted && !showEnded && !productionValidation.ok) {
      rows.push({
        id: "production-graph-validation",
        variant: "warning",
        title: "Story fails production validation",
        description: `${productionValidation.errors.slice(0, 3).join(" · ")}${
          productionValidation.errors.length > 3 ? ` (+${productionValidation.errors.length - 3} more)` : ""
        }`,
        actions: (
          <Link href="/admin/story" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "rounded-lg text-xs")}>
            Open Story builder
          </Link>
        ),
      });
    }

    return rows;
  }, [
    diagnostics,
    eventCode,
    eventStarted,
    showEnded,
    audienceConnected,
    setAudienceConnected,
    projectionSurfaceFault,
    setProjectionSurfaceFault,
    resyncProjector,
    productionValidation,
  ]);

  const total = votesA + votesB;
  const pctA = total ? Math.round((votesA / total) * 100) : 0;
  const pctB = total ? Math.round((votesB / total) * 100) : 0;

  const effectiveWinner = getEffectiveWinner(engine);

  const progressDen = playback.durationSec && playback.durationSec > 0 ? playback.durationSec : 120;
  const progressPct = Math.min(100, progressDen > 0 ? (playback.positionSec / progressDen) * 100 : 0);

  const operatorNextAction = useMemo(() => {
    if (showEnded) return "Load another saved film from Story builder or publish a fresh graph for the next screening.";
    if (!eventStarted)
      return "Start the show when projection is live (E). Keep /screen open on the wall — audience scans QR from here.";
    if (tieActive) return "Break the tie from the coral banner — Choose A / B (keyboard A / B).";
    if (votePhase === "countdown") return "Stand by; the ballot opens automatically when countdown reaches zero.";
    if (votePhase === "open") return "Close the ballot when time expires (C), then reveal to the room (R).";
    if (votePhase === "closed")
      return engine.phase === "awaiting_reveal"
        ? "Reveal the audience choice (R), then advance the story (N or G)."
        : "Waiting on tally — check vote state, then reveal when ready (R).";
    if (votePhase === "reveal") return "Advance into the winning beat when the room has read the result (N or G).";
    return "Drive playback from transport; open a ballot with V when the picture branches.";
  }, [showEnded, eventStarted, tieActive, votePhase, engine.phase]);

  const nextBeatSummary = useMemo(() => {
    const outlook = branchOutlookFromNode(graph, currentNodeId);
    if (outlook.kind === "end") return "This beat ends the story.";
    if (outlook.kind === "leaf") return "Wire Option A/B in Story builder to preview forks.";
    const parts: string[] = [];
    if (outlook.a) parts.push(`${outlook.a.branchLabel} → ${outlook.a.beatTitle}`);
    if (outlook.b) parts.push(`${outlook.b.branchLabel} → ${outlook.b.beatTitle}`);
    return parts.join(" · ");
  }, [graph, currentNodeId]);

  const hotkeyAction = useCallback(
    (key: string, ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      const k = key.toLowerCase();
      if (k === "e") {
        ev.preventDefault();
        safeStartEvent();
      }
      if (k === " ") {
        ev.preventDefault();
        cmdToggle();
      }
      if (ev.key === "Home") {
        ev.preventDefault();
        cmdRestart();
      }
      if ((ev.key === "v" || ev.key === "V") && ev.shiftKey) {
        ev.preventDefault();
        openVoteRunway();
      } else if (ev.key === "v" || ev.key === "V") {
        ev.preventDefault();
        openVoteImmediate();
      }
      if (k === "c") {
        ev.preventDefault();
        confirmedCloseVote();
      }
      if (k === "r") {
        ev.preventDefault();
        revealWinnerToRoom();
      }
      if (k === "g" || k === "n") {
        ev.preventDefault();
        advanceToWinningBranch();
      }
      if (k === "a" || k === "1") {
        ev.preventDefault();
        tryHostOverrideA();
      }
      if (k === "b" || k === "2") {
        ev.preventDefault();
        tryHostOverrideB();
      }
    },
    [
      advanceToWinningBranch,
      confirmedCloseVote,
      openVoteImmediate,
      openVoteRunway,
      revealWinnerToRoom,
      safeStartEvent,
      tryHostOverrideA,
      tryHostOverrideB,
      cmdToggle,
      cmdRestart,
    ],
  );

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => hotkeyAction(ev.key, ev);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeyAction]);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--kc-bg-deep)] text-foreground">
      <TheatreCurtainBackground className="opacity-[0.92]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(880px_480px_at_50%_0%,rgba(212,175,120,0.05),transparent)]" />
      <SpotlightWash />
      <FilmGrain />

      <HostDeskStatusBar
        eventTitle={eventTitle}
        eventCode={eventCode}
        syncMode={diagnostics.syncMode}
        screenConnected={diagnostics.screenLikelyConnected}
        audienceCount={audienceConnected}
        realtimeStatus={diagnostics.realtimeStatus}
        liveStatus={liveStatus}
        liveStatusLabel={statusCopy[liveStatus]}
        voteOpen={votePhase === "open" || votePhase === "countdown"}
      />

      {diagnostics.syncMode === "local_preview" ? (
        <div
          role="status"
          className="relative z-[3] shrink-0 border-b border-amber-500/45 bg-amber-950/92 px-4 py-3.5 text-center text-base leading-snug text-amber-50 md:px-8 md:py-4 md:text-lg"
        >
          <strong className="font-semibold text-amber-100">Local preview mode.</strong> Other phones and tablets cannot
          sync into this room until Supabase env vars and{" "}
          <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-sm">NEXT_PUBLIC_JOIN_ORIGIN</code> point at a
          reachable URL. For a dry run on one machine, use multiple tabs on this browser.
        </div>
      ) : null}

      <div className="relative z-[2] mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain px-4 pb-[max(3rem,env(safe-area-inset-bottom))] pt-3 md:gap-5 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bn-line)]/70 pb-4">
          <StudioBadge showSeal href="/" />
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 rounded-xl px-4 text-sm font-semibold md:min-h-14 md:px-5 md:text-base"
              onClick={() => setAudienceConnected(audienceConnected + 3)}
            >
              Audience +3 demo
            </Button>
            <Link
              href="/screen"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "min-h-12 rounded-xl px-5 text-sm font-semibold md:min-h-14 md:text-base",
              )}
            >
              Open /screen
            </Link>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 rounded-xl px-4 text-sm font-semibold md:min-h-14 md:text-base"
              onClick={resyncProjector}
            >
              Resync projector
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-stretch">
          <div className="rounded-2xl border-2 border-primary/35 bg-primary/12 px-5 py-5 shadow-[0_0_48px_oklch(0.55_0.12_78/0.12)] md:px-7 md:py-6">
            <div className="flex flex-wrap items-center gap-3">
              <StatusOrb status={liveStatus} />
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary md:text-sm">Next action</p>
              <Badge variant="outline" className="rounded-full border-[var(--bn-line)] font-mono text-xs md:text-sm">
                {statusCopy[liveStatus]}
              </Badge>
              <Badge variant="outline" className="rounded-full border-[var(--bn-line)] font-mono text-xs md:text-sm">
                Engine {engine.phase}
              </Badge>
              <Badge variant="outline" className="rounded-full border-[var(--bn-line)] font-mono text-xs md:text-sm">
                Ballot {votePhase}
              </Badge>
            </div>
            <p className="mt-3 text-pretty text-lg font-medium leading-snug text-foreground md:text-2xl">{operatorNextAction}</p>
          </div>
          <details className="group min-w-[min(100%,16rem)] rounded-2xl border-2 border-[var(--bn-line)] bg-card/70 backdrop-blur open:bg-card/85 lg:shrink-0">
            <summary className="flex min-h-[4.5rem] cursor-pointer list-none items-center gap-2 px-4 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
              <Keyboard className="size-5 shrink-0 text-primary" />
              Shortcuts
              <span className="ml-auto text-[0.65rem] opacity-70 transition group-open:rotate-90">▸</span>
            </summary>
            <div className="max-w-sm border-t border-[var(--bn-line)] px-4 pb-4 pt-3 font-mono text-sm leading-relaxed text-muted-foreground">
              <span className="text-primary">Space</span> play/pause · <span className="text-primary">Home</span> restart ·{" "}
              <span className="text-primary">V</span> open vote · <span className="text-primary">⇧V</span> runway ·{" "}
              <span className="text-primary">C</span> close · <span className="text-primary">R</span> reveal ·{" "}
              <span className="text-primary">N</span>/<span className="text-primary">G</span> advance ·{" "}
              <span className="text-primary">A</span>/<span className="text-primary">B</span> override / tie ·{" "}
              <span className="text-primary">E</span> start
            </div>
          </details>
        </div>

        <HostOperationalAlerts alerts={operationalAlerts} />

        <HostRehearsalPanel />

        <details className="group rounded-2xl border-2 border-[var(--bn-line)] bg-card/50 backdrop-blur-md open:bg-card/70">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
            <Info className="size-5 shrink-0 text-primary" />
            Room setup & diagnostics
            <span className="ml-auto text-xs opacity-70 transition group-open:rotate-90">▸</span>
          </summary>
          <div className="space-y-5 border-t border-[var(--bn-line)] px-4 py-5 md:px-5">
          <HostSystemCheck
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
          />

          <Card className="border-[var(--bn-line)] bg-card/75 backdrop-blur-xl">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="flex items-center gap-2 font-heading text-lg font-normal">
                <Library className="size-4 text-primary" />
                Saved films
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Films you saved in Story builder on this browser. Loading resets the night to the opening beat and clears
                voting — use before you press Start event, or after the show ends.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="saved-film-select" className="text-xs uppercase tracking-wider text-muted-foreground">
                  Library
                </Label>
                <select
                  id="saved-film-select"
                  value={savedFilmPick}
                  onChange={(e) => setSavedFilmPick(e.target.value)}
                  disabled={!canSwapSavedFilm}
                  className="h-10 w-full max-w-xl rounded-xl border border-[var(--bn-line)] bg-background/60 px-3 text-sm outline-none ring-ring/40 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">— Current room graph —</option>
                  {savedFilms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                className="rounded-xl sm:shrink-0"
                disabled={!savedFilmPick || !canSwapSavedFilm}
                onClick={() => {
                  const f = getSavedFilm(savedFilmPick);
                  if (!f) return;
                  loadStoryGraph(JSON.parse(JSON.stringify(f.graph)) as StoryGraph, {
                    displayName: f.name,
                    eventTitle: f.eventTitle,
                  });
                }}
              >
                Load film
              </Button>
            </CardContent>
            {!canSwapSavedFilm ? (
              <CardContent className="border-t border-[var(--bn-line)] pt-0">
                <p className="text-xs leading-relaxed text-amber-200/95">
                  Finish or reset the live night before loading another saved film (keeps the room from mixing two
                  stories mid-show).
                </p>
              </CardContent>
            ) : null}
          </Card>
          </div>
        </details>

        <AnimatePresence>
          {draftRoom && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden rounded-2xl border border-[var(--kc-gold-muted)]/35 bg-[oklch(0.28_0.04_48/0.45)] px-4 py-3 text-sm leading-relaxed text-[var(--kc-cream)]"
            >
              <strong className="font-medium text-primary">Stand by — unlock the desk first.</strong>{" "}
              Press <kbd className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-xs">Start event</kbd> or{" "}
              <kbd className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-xs">E</kbd>: playback and voting buttons stay inactive until then (by design).
            </motion.div>
          )}
          {noAudience && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={cn(
                "mt-4 overflow-hidden rounded-2xl border px-4 py-3 text-sm leading-relaxed",
                voteLive
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                  : "border-[var(--bn-line)] bg-card/60 text-muted-foreground",
              )}
            >
              <div className="flex items-start gap-2">
                {voteLive ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-primary/80" />
                )}
                <span>
                  {voteLive ? (
                    <>
                      No audience in the headcount yet — vote tallies stay at zero until phones join or you press{" "}
                      <strong className="text-amber-50">+3 demo</strong>.
                    </>
                  ) : (
                    <>
                      Audience headcount is <strong className="text-foreground">0</strong> — that does{" "}
                      <strong className="text-foreground">not</strong> stop playback. Open{" "}
                      <Link
                        href="/screen"
                        className={cn(buttonVariants({ variant: "link" }), "inline h-auto p-0 text-primary underline-offset-4")}
                      >
                        Room screen
                      </Link>{" "}
                      to see picture; use <strong className="text-foreground">+3 demo</strong> when you want fake phones for tallies.
                    </>
                  )}
                </span>
              </div>
            </motion.div>
          )}
          {tieActive && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden rounded-2xl border border-[var(--bn-coral)]/35 bg-[var(--bn-coral)]/10 px-4 py-3 text-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-[var(--bn-coral)]" />
                  <span>
                    <strong className="text-foreground">Tie or empty tally</strong> — pick the branch live on stage.
                    Hotkeys <kbd className="rounded bg-background/80 px-1 font-mono">A</kbd> /{" "}
                    <kbd className="rounded bg-background/80 px-1 font-mono">B</kbd> while this banner shows.
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button type="button" className="min-h-14 rounded-xl px-8 text-lg font-bold bg-[var(--bn-coral)] text-white" onClick={resolveTieA}>
                    Choose A
                  </Button>
                  <Button
                    type="button"
                    className="min-h-14 rounded-xl px-8 text-lg font-bold bg-[var(--bn-teal)] text-[var(--bn-void)]"
                    onClick={resolveTieB}
                  >
                    Choose B
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6 grid min-h-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
          {/* Left: projection + transport */}
          <div className="flex min-h-0 flex-col gap-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <Card className="border-2 border-[var(--bn-line)] bg-card/80 backdrop-blur-xl">
                <CardHeader className="space-y-2 border-b border-[var(--bn-line)] bg-black/15 pb-4">
                  <CardTitle className="flex flex-wrap items-center gap-2 font-heading text-2xl font-normal md:text-3xl">
                    <Monitor className="size-7 shrink-0 text-primary" aria-hidden />
                    {kcCopy.nowProjecting}
                  </CardTitle>
                  <CardDescription className="text-sm md:text-base">
                    Picture airs on{" "}
                    <Link
                      href="/screen"
                      className={cn(buttonVariants({ variant: "link" }), "inline h-auto min-h-0 p-0 text-base text-primary underline-offset-4")}
                    >
                      /screen
                    </Link>
                    . Local preview + transport only — audience sees the wall.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 pt-6">
                  <div>
                    <p className="font-mono text-[0.7rem] uppercase tracking-[0.28em] text-muted-foreground">Current beat</p>
                    <p className="mt-1 font-heading text-3xl font-normal leading-tight md:text-4xl">{node?.title ?? "—"}</p>
                    {node?.subtitle?.trim() ? (
                      <p className="mt-2 text-lg text-muted-foreground">{node.subtitle.trim()}</p>
                    ) : null}
                    <p className="mt-2 font-mono text-sm text-muted-foreground">{currentNodeId}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--kc-gold-muted)]/35 bg-[var(--kc-gold-muted)]/10 px-4 py-3">
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-[var(--kc-champagne)]">Branch outlook</p>
                    <p className="mt-2 text-base leading-snug md:text-lg">{nextBeatSummary}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[0.7rem] uppercase tracking-[0.28em] text-muted-foreground">Media</p>
                    <p className="mt-2 max-h-28 overflow-auto break-all rounded-xl border border-[var(--bn-line)] bg-black/25 p-4 font-mono text-sm text-muted-foreground">
                      {node?.localVideoKey ? `Local file (${node.localVideoKey})` : (node?.videoUrl ?? "—")}
                    </p>
                  </div>
                  {node?.videoUrl?.trim() || node?.localVideoKey?.trim() ? (
                    <div className="overflow-hidden rounded-xl border-2 border-[var(--bn-line)] bg-black">
                      <p className="border-b border-[var(--bn-line)] bg-black/40 px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Desk preview (muted)
                      </p>
                      <OperatorDeskPreview node={node} isPlaying={playback.isPlaying} />
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-16 gap-2 rounded-2xl px-5 text-base font-semibold"
                      onClick={() => cmdSeek(-10)}
                    >
                      <Rewind className="size-6" />
                      −10s
                    </Button>
                    <Button
                      type="button"
                      className="min-h-16 min-w-[8.5rem] gap-2 rounded-2xl px-6 text-lg font-bold"
                      onClick={cmdToggle}
                    >
                      {playback.isPlaying ? <Pause className="size-7" /> : <Play className="size-7" />}
                      {playback.isPlaying ? "Pause" : "Play"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-16 gap-2 rounded-2xl px-5 text-base font-semibold"
                      onClick={() => cmdSeek(10)}
                    >
                      <FastForward className="size-6" />
                      +10s
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-16 gap-2 rounded-2xl px-6 text-base font-semibold"
                      onClick={cmdRestart}
                      title="Restart segment (Home)"
                    >
                      <RotateCcw className="size-5" />
                      Restart
                    </Button>
                  </div>
                  <div>
                    <div className="flex justify-between font-mono text-sm text-muted-foreground">
                      <span>Program time</span>
                      <span>{formatTime(playback.positionSec)}</span>
                    </div>
                    <Progress value={progressPct} className="mt-2 h-2" />
                  </div>
                  <details className="rounded-xl border border-[var(--bn-line)] bg-black/20 open:bg-black/30">
                    <summary className="cursor-pointer list-none p-4 font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
                      Jump to beat (confirms)
                    </summary>
                    <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto border-t border-[var(--bn-line)] p-4">
                      {nodeIds.map((id) => (
                        <Button
                          key={id}
                          type="button"
                          size="lg"
                          variant={id === currentNodeId ? "default" : "outline"}
                          title={id}
                          className={cn(
                            "max-w-[14rem] truncate rounded-xl text-base",
                            id !== currentNodeId && "border-[var(--bn-line)]",
                          )}
                          onClick={() => jumpToNode(id as StoryNodeId)}
                        >
                          {nodePickerLabel(graph, id as StoryNodeId)}
                        </Button>
                      ))}
                    </div>
                  </details>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right: ballot + controls */}
          <div className="flex min-h-0 flex-col gap-6">
            <Card
              className={cn(
                "border-2 bg-card/90 backdrop-blur-xl shadow-[0_0_60px_oklch(0_0_0/0.25)]",
                votePhase === "open"
                  ? "border-emerald-500/45"
                  : votePhase === "countdown"
                    ? "border-sky-500/40"
                    : "border-[var(--bn-line)]",
              )}
            >
              <CardHeader className="border-b border-[var(--bn-line)]/80 pb-4">
                <CardTitle className="flex items-center gap-2 font-heading text-2xl font-normal md:text-3xl">
                  <Vote className="size-7 text-primary" />
                  Current vote
                </CardTitle>
                <CardDescription className="text-base">Live ballot mirrors phones and /screen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 pt-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-[0.7rem] uppercase tracking-[0.28em] text-muted-foreground">Ballot state</p>
                    <p className="mt-1 font-heading text-3xl font-semibold md:text-4xl">
                      {votePhase === "open"
                        ? "OPEN"
                        : votePhase === "countdown"
                          ? "COUNTDOWN"
                          : votePhase === "closed"
                            ? "CLOSED"
                            : votePhase === "reveal"
                              ? "REVEAL"
                              : "IDLE"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground md:text-sm">Timer</p>
                    <p className="mt-1 font-heading text-5xl tabular-nums leading-none text-primary md:text-6xl">
                      {votePhase === "countdown"
                        ? countdownSec
                        : votePhase === "open" && voteSecondsLeft != null
                          ? voteSecondsLeft
                          : "—"}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">seconds</p>
                  </div>
                </div>
                  <div className="rounded-xl border border-[var(--bn-line)] bg-black/20 px-4 py-4">
                  <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground md:text-sm">Question</p>
                  <p className="mt-2 text-pretty text-xl font-medium leading-snug md:text-2xl">
                    {voteNode?.question ?? "No vote armed — play the beat, then open a ballot when you reach a fork."}
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-[var(--bn-coral)]/35 bg-[var(--bn-coral)]/10 px-3 py-2">
                      <p className="font-mono text-xs uppercase tracking-wider text-[var(--bn-coral)] md:text-sm">Option A</p>
                      <p className="mt-1 text-lg font-semibold">{voteNode?.optionA?.label ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--bn-teal)]/35 bg-[var(--bn-teal)]/10 px-3 py-2">
                      <p className="font-mono text-xs uppercase tracking-wider text-[var(--bn-teal)] md:text-sm">Option B</p>
                      <p className="mt-1 text-lg font-semibold">{voteNode?.optionB?.label ?? "—"}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <motion.div layout className="rounded-2xl border-2 border-[var(--bn-coral)]/45 bg-gradient-to-br from-[var(--bn-coral)]/14 to-transparent p-6 shadow-[0_0_48px_rgba(232,90,90,0.14)]">
                <p className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--bn-coral)]">Tally A</p>
                <motion.p
                  key={votesA}
                  initial={{ scale: 1.04, opacity: 0.7 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mt-2 font-heading text-6xl tabular-nums md:text-7xl"
                >
                  {votesA}
                </motion.p>
                <Progress value={pctA} className="mt-4 h-3 bg-white/10 [&>div]:bg-[var(--bn-coral)]" />
                <p className="mt-2 text-right font-mono text-sm text-muted-foreground">{pctA}% share</p>
              </motion.div>
              <motion.div layout className="rounded-2xl border-2 border-[var(--bn-teal)]/45 bg-gradient-to-br from-[var(--bn-teal)]/12 to-transparent p-6 shadow-[0_0_48px_rgba(45,212,191,0.12)]">
                <p className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--bn-teal)]">Tally B</p>
                <motion.p
                  key={votesB}
                  initial={{ scale: 1.04, opacity: 0.7 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mt-2 font-heading text-6xl tabular-nums md:text-7xl"
                >
                  {votesB}
                </motion.p>
                <Progress value={pctB} className="mt-4 h-3 bg-white/10 [&>div]:bg-[var(--bn-teal)]" />
                <p className="mt-2 text-right font-mono text-sm text-muted-foreground">{pctB}% share</p>
              </motion.div>
            </div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 }}>
              <Card className="border-2 border-[var(--bn-line)] bg-card/85 shadow-[0_0_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <CardHeader className="border-b border-[var(--bn-line)] bg-black/15 pb-4">
                  <CardTitle className="flex items-center gap-2 font-heading text-2xl font-normal md:text-3xl">
                    <Gauge className="size-7 text-primary" />
                    Operator actions
                  </CardTitle>
                  <CardDescription className="text-base">Large tap targets — vote controls only (playback is on the left)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <BigTransport
                      label="Start event"
                      icon={Sparkles}
                      hotkey="E"
                      disabled={eventStarted && !showEnded}
                      onClick={safeStartEvent}
                      className="border-primary/30 bg-primary/10"
                    />
                    <BigTransport
                      label="Open vote (now)"
                      icon={Vote}
                      hotkey="V"
                      disabled={!eventStarted || showEnded}
                      onClick={openVoteImmediate}
                      variant="default"
                      className="border-primary/40 bg-primary/90 text-primary-foreground hover:bg-primary/80"
                    />
                    <BigTransport
                      label="Open vote (runway)"
                      icon={Forward}
                      hotkey="⇧ V"
                      disabled={!eventStarted || showEnded}
                      onClick={openVoteRunway}
                    />
                    <BigTransport
                      label="Close vote"
                      icon={Scan}
                      hotkey="C"
                      disabled={votePhase !== "open"}
                      onClick={confirmedCloseVote}
                    />
                    <BigTransport
                      label="Reveal winner"
                      icon={Sparkles}
                      hotkey="R"
                      disabled={engine.phase !== "awaiting_reveal"}
                      onClick={revealWinnerToRoom}
                    />
                    <BigTransport
                      label="Advance branch"
                      icon={Clapperboard}
                      hotkey="N / G"
                      disabled={engine.phase !== "awaiting_reveal" && engine.phase !== "revealed"}
                      onClick={advanceToWinningBranch}
                    />
                    <BigTransport
                      label="End show"
                      icon={Power}
                      disabled={showEnded}
                      onClick={confirmedEndShow}
                      variant="destructive"
                      className="sm:col-span-2"
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--bn-line)] bg-black/20 p-4">
                      <p className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">Countdown preset</p>
                      <div className="grid grid-cols-4 gap-2">
                        {PRESETS.map((sec) => (
                          <Button
                            key={sec}
                            type="button"
                            size="sm"
                            variant={countdownPresetSec === sec ? "default" : "outline"}
                            className={cn("rounded-xl font-mono", countdownPresetSec !== sec && "border-[var(--bn-line)]")}
                            onClick={() => setCountdownPreset(sec)}
                          >
                            {sec}s
                          </Button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Used by “Open vote (runway)” before the poll opens.</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--bn-line)] bg-black/20 p-4">
                      <p className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">Poll duration</p>
                      <div className="grid grid-cols-4 gap-2">
                        {PRESETS.map((sec) => (
                          <Button
                            key={`p-${sec}`}
                            type="button"
                            size="sm"
                            variant={pollDurationSec === sec ? "default" : "outline"}
                            className={cn("rounded-xl font-mono", pollDurationSec !== sec && "border-[var(--bn-line)]")}
                            onClick={() => setPollDuration(sec)}
                          >
                            {sec}s
                          </Button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">How long phones stay live once voting opens.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Button
                      type="button"
                      className="min-h-16 rounded-2xl bg-[var(--bn-coral)] text-lg font-bold text-white shadow-[0_0_32px_rgba(232,90,90,0.25)] hover:bg-[var(--bn-coral)]/90"
                      disabled={!tieActive && engine.phase !== "open"}
                      onClick={tryHostOverrideA}
                    >
                      Override → A <span className="ml-2 font-mono text-sm opacity-80">A</span>
                    </Button>
                    <Button
                      type="button"
                      className="min-h-16 rounded-2xl bg-[var(--bn-teal)] text-lg font-bold text-[var(--bn-void)] shadow-[0_0_32px_rgba(45,212,191,0.2)] hover:bg-[var(--bn-teal)]/90"
                      disabled={!tieActive && engine.phase !== "open"}
                      onClick={tryHostOverrideB}
                    >
                      Override → B <span className="ml-2 font-mono text-sm opacity-80">B</span>
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12 w-full rounded-xl text-base text-muted-foreground"
                    onClick={pulseDemoVotes}
                  >
                    Simulate incoming votes (stress test)
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {effectiveWinner && engine.phase !== "idle" ? (
              <p className="rounded-xl border border-[var(--bn-line)] bg-card/50 py-3 text-center font-mono text-sm text-muted-foreground">
                Winning branch: <span className="text-lg font-semibold text-primary">{effectiveWinner}</span> ·{" "}
                {engine.resolutionSource ?? "—"}
              </p>
            ) : null}
          </div>
        </div>

        <HostStoryTimeline graph={graph} currentNodeId={currentNodeId} className="mt-2" />

        <Card className="mt-4 border-2 border-[var(--bn-line)] bg-card/75 backdrop-blur-xl">
          <CardHeader className="border-b border-[var(--bn-line)] bg-black/15 pb-4">
            <CardTitle className="flex items-center gap-2 font-heading text-2xl font-normal">
              <Scan className="size-6 text-primary" />
              Audience QR & join
            </CardTitle>
            <CardDescription className="text-base leading-relaxed">
              Phones must load a <strong className="text-foreground">phone-safe HTTPS URL</strong> — see warnings below. Same QR encodes the join link.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 pt-6 lg:flex-row lg:items-start">
            <div className="flex shrink-0 flex-col items-center gap-4 lg:items-start">
              <div className="rounded-2xl border-2 border-[var(--bn-line)] bg-white p-3 shadow-[0_0_48px_rgba(212,175,55,0.18)]">
                {qrSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external QR data URL service
                  <img src={qrSrc} alt="QR code to join this show" width={260} height={260} className="rounded-lg" />
                ) : (
                  <div className="flex size-[260px] items-center justify-center font-mono text-sm text-muted-foreground">QR…</div>
                )}
              </div>
              <div className="flex w-full max-w-[16rem] flex-col gap-3">
                <Button
                  type="button"
                  variant="default"
                  className="min-h-14 w-full rounded-xl text-base font-semibold"
                  disabled={!diagnostics.joinUrl}
                  onClick={() => void copyJoinLink()}
                >
                  <Copy className="mr-2 size-5 opacity-90" />
                  {copiedJoinUrl ? "Join link copied" : "Copy join link"}
                </Button>
                <Button type="button" variant="outline" className="min-h-14 w-full rounded-xl text-base font-semibold" onClick={() => void copyEventCode()}>
                  <Copy className="mr-2 size-5 opacity-90" />
                  {copiedEventCode ? "Event code copied" : "Copy event code"}
                </Button>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.35em] text-muted-foreground">Event code</p>
                <p className="mt-1 font-mono text-4xl tracking-[0.15em] text-primary">{eventCode}</p>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  Manual path:{" "}
                  <Link href="/join" className={cn(buttonVariants({ variant: "link" }), "inline h-auto p-0 text-base text-primary underline-offset-4")}>
                    /join
                  </Link>{" "}
                  or{" "}
                  <span className="font-mono text-sm text-foreground/90">{diagnostics.joinBaseUrl || "…"}/join/{eventCode}</span>
                </p>
              </div>
              <p className="break-all rounded-xl border border-[var(--bn-line)] bg-black/20 p-4 font-mono text-sm text-muted-foreground">
                {diagnostics.joinUrl || "…"}
              </p>
              {diagnostics.loopbackJoinWarning ? (
                <p className="rounded-xl border-2 border-amber-500/50 bg-amber-500/15 px-4 py-3 text-base leading-relaxed text-amber-50">
                  <strong className="text-amber-100">Phone safety:</strong> {LOOPBACK_WARNING} Set{" "}
                  <code className="rounded bg-black/35 px-1.5 py-0.5 font-mono text-sm">NEXT_PUBLIC_JOIN_ORIGIN</code> to a reachable HTTPS origin,
                  restart dev, refresh /host, then rescan.
                </p>
              ) : (
                <p className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-base leading-relaxed text-emerald-50">
                  Join URL passes basic phone checks — still verify on a real handset before doors open.
                </p>
              )}
              <label className="flex cursor-pointer items-start gap-4 rounded-xl border border-[var(--bn-line)] bg-card/40 px-4 py-4 text-base leading-relaxed text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-1 size-5 shrink-0 rounded border-[var(--bn-line)]"
                  checked={allowAnonymousQuickJoin}
                  onChange={(e) => setAllowAnonymousQuickJoin(e.target.checked)}
                />
                <span>
                  <strong className="text-foreground">Allow anonymous quick join</strong> — guests can use Quick enter without a callsign when the room allows it.
                </span>
              </label>
              <JoinQrTestPanel joinUrl={diagnostics.joinUrl} className="text-base" />
            </div>
          </CardContent>
        </Card>

        <details className="mt-4 rounded-2xl border-2 border-[var(--bn-line)] bg-card/50 backdrop-blur-md open:bg-card/65">
          <summary className="cursor-pointer list-none px-5 py-4 font-mono text-sm font-semibold uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
            Activity log ▸
          </summary>
          <Card className="border-0 bg-transparent shadow-none">
            <CardContent className="p-0 pt-2">
              <ScrollArea className="h-72 px-5 pb-5">
                <ul className="space-y-2 pr-4">
                  {activityLog.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex gap-3 border-b border-[var(--bn-line)]/60 py-2 font-mono text-sm text-muted-foreground last:border-0"
                    >
                      <time className="w-28 shrink-0 text-xs text-muted-foreground/80">
                        {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </time>
                      <span className="text-foreground/90">{entry.message}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        </details>
      </div>
    </div>
  );
}

function useNowTicker(active: boolean, intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}
