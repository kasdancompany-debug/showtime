"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  BranchDivider,
  ChoiceBadge,
  JoinQr,
  LeaderCountdown,
  LiveDot,
  RedRule,
  ShowtimeLockup,
  StageBackdrop,
} from "@/components/brand";
import { ScreenFullscreenButton } from "@/components/screen/screen-fullscreen-button";
import { ScreenHostedVideo } from "@/components/screen/screen-hosted-video";
import { useHostSupabaseRoomSync } from "@/hooks/use-host-supabase-room-sync";
import { useJoinBaseUrl } from "@/hooks/use-join-base-url";
import { useLocalPreviewVoteMirror } from "@/hooks/use-local-preview-vote-mirror";
import { useProjectorFullscreenLock } from "@/hooks/use-projector-fullscreen-lock";
import { useScreenSupabaseDisplay } from "@/hooks/use-screen-supabase-display";
import { useScreenSurfaceHeartbeat } from "@/hooks/use-screen-surface-heartbeat";
import { useShowtimeConnection } from "@/hooks/use-showtime-connection";
import { getJoinUrl } from "@/lib/join/get-join-url";
import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { getShowtimeSyncMode } from "@/lib/showtime/sync-mode";
import { resolvePosterImageUrl } from "@/lib/showtime/poster-image-url";
import { resolveStoryVideoUrl } from "@/lib/showtime/video-url";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { getNode } from "@/lib/story-engine/graph";
import { updateEvent } from "@/lib/supabase/event-room";
import { withPlaybackCommand } from "@/lib/supabase/playback-command";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────────
   Projector type scale. Everything is sized in vw *and* vh so a slide fits both a
   16:9 projector and a short browser window without scrolling.
   ───────────────────────────────────────────────────────────────────────────── */

const kicker =
  "sh-eyebrow !text-[clamp(0.7rem,1.3vw,1.15rem)] !tracking-[0.38em]";
const caption = "sh-caption !text-[clamp(0.65rem,1.05vw,0.95rem)]";
const heroType = "sh-display text-[clamp(2.25rem,min(6.4vw,10.5vh),6.25rem)]";
const titleType = "sh-display text-[clamp(2.5rem,min(7.6vw,12.5vh),7.75rem)]";
const leadType =
  "text-[clamp(1rem,1.9vw,1.5rem)] leading-snug text-[var(--sh-cream-dim)]";
const codeType =
  "font-mono font-medium tracking-[0.3em] text-[var(--sh-cream)]";

const stagger = (seconds: number) =>
  ({ "--d": `${seconds}s` }) as CSSProperties;

function Slide({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative z-10 flex w-full max-w-[100rem] flex-col items-center px-[clamp(1rem,4vw,5rem)] text-center",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Small lockup that signs off slates the way the brand's title cards do. */
function Signature({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "sh-rise mt-[clamp(1.25rem,4.5vh,3.25rem)] opacity-90",
        className,
      )}
      style={stagger(0.6)}
    >
      <ShowtimeLockup className="text-[clamp(1.1rem,2.1vw,2rem)]" />
    </div>
  );
}

/** "Choose A or B" panel — A is Showtime Red, B is Reel Cream, everywhere. */
function ChoicePanel({
  letter,
  label,
  state = "idle",
  footer,
}: {
  letter: "A" | "B";
  label: string;
  state?: "idle" | "winner" | "dim";
  footer?: ReactNode;
}) {
  const isA = letter === "A";
  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden border bg-[rgb(11_11_11/0.74)] px-[clamp(1rem,2.6vw,2.25rem)] pb-[clamp(1rem,3vh,2rem)] pt-[clamp(1.25rem,3.4vh,2.25rem)] text-left backdrop-blur-[2px]",
        "transition-[opacity,box-shadow,border-color] duration-700",
        state === "dim"
          ? "border-[var(--sh-line)] opacity-[0.28]"
          : "border-[var(--sh-line-strong)]",
        state === "winner" &&
          (isA
            ? "border-[var(--sh-red)] shadow-[0_0_7rem_-1.5rem_rgb(214_40_40/0.6)]"
            : "border-[var(--sh-cream)] shadow-[0_0_7rem_-1.5rem_rgb(247_241_230/0.45)]"),
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-[0.3rem]",
          isA ? "bg-[var(--sh-red)]" : "bg-[var(--sh-cream)]",
        )}
      />
      <div className="flex items-center gap-[clamp(0.75rem,1.6vw,1.5rem)]">
        <ChoiceBadge
          letter={letter}
          className="size-[clamp(2.75rem,min(5vw,8vh),4.5rem)] text-[clamp(1.4rem,min(2.6vw,4.2vh),2.4rem)]"
        />
        <p
          className={cn(
            "font-heading font-extrabold leading-[1.08] text-balance text-[var(--sh-cream)]",
            state === "winner"
              ? "text-[clamp(1.75rem,min(3.5vw,6vh),3.5rem)]"
              : "text-[clamp(1.35rem,min(2.7vw,4.6vh),2.75rem)]",
          )}
        >
          {label}
        </p>
      </div>
      {footer ? (
        <div className="mt-auto pt-[clamp(0.9rem,2.6vh,2rem)]">{footer}</div>
      ) : null}
    </div>
  );
}

function Tally({
  letter,
  votes,
  pct,
}: {
  letter: "A" | "B";
  votes: number;
  pct: number;
}) {
  const width = votes > 0 ? Math.max(0, Math.min(100, pct)) : 0;
  return (
    <div className="border-t border-[var(--sh-line)] pt-[clamp(0.75rem,2vh,1.25rem)]">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-heading text-[clamp(2rem,min(4.6vw,7.5vh),4.25rem)] font-black leading-none tabular-nums text-[var(--sh-cream)]">
          {votes}
        </span>
        <span className={caption}>
          {votes === 1 ? "vote" : "votes"} · {Math.round(width)}%
        </span>
      </div>
      <div className="mt-3 h-[0.4rem] bg-[var(--sh-line)]">
        <div
          className="h-full transition-[width] duration-700 ease-out"
          style={{
            width: `${width}%`,
            background: letter === "A" ? "var(--sh-red)" : "var(--sh-cream)",
          }}
        />
      </div>
    </div>
  );
}

function ChoiceGrid({
  a,
  b,
  middle,
}: {
  a: ReactNode;
  b: ReactNode;
  middle?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-[min(94vw,88rem)] grid-cols-1 items-stretch gap-[clamp(0.75rem,2.2vw,2.25rem)]",
        middle ? "md:grid-cols-[1fr_auto_1fr]" : "md:grid-cols-2",
      )}
    >
      {a}
      {middle}
      {b}
    </div>
  );
}

/* ── Slides ─────────────────────────────────────────────────────────────────── */

/** Poster in a theatre marquee: bulb-ringed red-velvet sign with a title plate across the top. */
function MarqueePoster({
  posterUrl,
  title,
}: {
  posterUrl: string;
  title: string;
}) {
  return (
    <div className="sh-marquee sh-rise" style={stagger(0.1)}>
      <div className="sh-marquee__plate">
        <p className={cn(kicker, "!text-[var(--sh-gold)]")}>
          Now showing
        </p>
        <h1 className="sh-display mt-[0.35em] text-[clamp(1.5rem,min(3.3vw,6vh),3.5rem)]">
          {title}
        </h1>
      </div>
      <div className="sh-marquee__screen">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic show asset URL, any aspect ratio */}
        <img
          src={posterUrl}
          alt=""
          draggable={false}
          className="block h-auto max-h-[min(62vh,calc(100vh-20rem),52rem)] w-auto max-w-full"
        />
      </div>
    </div>
  );
}

/** Admission-ticket stub with the scan-to-join code. */
function JoinTicket({
  joinUrl,
  code,
  joinHost,
}: {
  joinUrl: string;
  code: string;
  joinHost: string;
}) {
  return (
    <div
      className="sh-ticket sh-rise mx-auto flex w-full max-w-[24rem] flex-col items-center px-[clamp(1rem,1.6vw,1.5rem)] pb-[clamp(1rem,2.4vh,1.75rem)] pt-[clamp(2.25rem,4.4vh,3rem)] text-center"
      style={stagger(0.5)}
    >
      <span className="sh-caption absolute left-1/2 top-[clamp(0.7rem,1.6vh,1rem)] -translate-x-1/2 !text-[0.62rem] !tracking-[0.34em] !text-[var(--sh-gold)]">
        Admit one
      </span>
      <p className={kicker}>Scan to join</p>
      {joinUrl ? (
        <JoinQr
          url={joinUrl}
          className="mt-[clamp(0.6rem,1.6vh,1rem)] w-full max-w-[min(100%,16rem)]"
        />
      ) : null}
      <p
        className={cn(
          codeType,
          "mt-[clamp(0.6rem,1.8vh,1.25rem)] text-[clamp(1.4rem,min(2.6vw,5vh),2.75rem)]",
        )}
      >
        {code}
      </p>
      {joinHost ? (
        <p className={cn(caption, "mt-2 normal-case !tracking-[0.08em]")}>
          {joinHost}/join
        </p>
      ) : null}
    </div>
  );
}

export function LobbySlide({
  title,
  code,
  posterUrl,
  joinUrl,
}: {
  title: string;
  code: string;
  posterUrl: string | null;
  joinUrl: string;
}) {
  let joinHost = "";
  try {
    joinHost = joinUrl ? new URL(joinUrl).host : "";
  } catch {
    joinHost = "";
  }

  if (posterUrl) {
    return (
      <Slide className="max-w-[120rem]">
        <div className="grid w-full items-center gap-[clamp(1.25rem,3vw,3.5rem)] md:grid-cols-[minmax(0,1fr)_clamp(13rem,21vw,22rem)]">
          <div className="flex min-w-0 justify-center">
            <MarqueePoster posterUrl={posterUrl} title={title} />
          </div>
          <div className="flex flex-col items-center">
            <JoinTicket joinUrl={joinUrl} code={code} joinHost={joinHost} />
            <Signature />
          </div>
        </div>
      </Slide>
    );
  }

  return (
    <Slide>
      <p className={cn(kicker, "sh-rise")} style={stagger(0.2)}>
        Kasdan Showtime presents
      </p>
      <h1
        className={cn(titleType, "sh-rise mt-[clamp(0.75rem,2vh,1.5rem)]")}
        style={stagger(0.3)}
      >
        {title}
      </h1>
      <RedRule center delay={0.8} className="mt-[clamp(1rem,2.6vh,1.75rem)]" />
      <div
        className="sh-rise mt-[clamp(1.25rem,3.6vh,2.5rem)] flex items-center justify-center gap-[clamp(1rem,2.2vw,2rem)]"
        style={stagger(1)}
      >
        {joinUrl ? (
          <JoinQr
            url={joinUrl}
            className="w-[clamp(7rem,min(15vw,25vh),14rem)] shrink-0"
          />
        ) : null}
        <div className="flex flex-col items-start text-left">
          <p className={kicker}>Scan to join</p>
          <p
            className={cn(
              codeType,
              "mt-2 text-[clamp(1.4rem,min(3.4vw,6vh),3.25rem)]",
            )}
          >
            {code}
          </p>
          {joinHost ? (
            <p className={cn(caption, "mt-2 normal-case !tracking-[0.1em]")}>
              {joinHost}/join
            </p>
          ) : null}
        </div>
      </div>
      <Signature />
    </Slide>
  );
}

/** The beat just ended — preview what the audience is about to decide. */
export function StoryContinuesSlide({
  question,
  a,
  b,
}: {
  question: string;
  a: string;
  b: string;
}) {
  return (
    <Slide>
      <p className={cn(kicker, "sh-rise")}>The story continues</p>
      <h1
        className={cn(
          heroType,
          "sh-rise mt-[clamp(0.9rem,2.6vh,2rem)] max-w-[90vw]",
        )}
        style={stagger(0.15)}
      >
        {question}
      </h1>
      <RedRule center delay={0.7} className="mt-[clamp(1rem,2.6vh,1.75rem)]" />
      <div
        className="sh-rise mt-[clamp(1.25rem,4vh,3rem)] w-full"
        style={stagger(0.5)}
      >
        <ChoiceGrid
          a={<ChoicePanel letter="A" label={a} />}
          b={<ChoicePanel letter="B" label={b} />}
        />
      </div>
      <p
        className={cn(leadType, "sh-rise mt-[clamp(1rem,3vh,2rem)]")}
        style={stagger(0.9)}
      >
        Voting opens in a moment — get your phone ready.
      </p>
    </Slide>
  );
}

export function VoteSlide({
  question,
  a,
  b,
  tallies,
  pctA,
  pctB,
  showCounts,
  countdown,
  countdownTotal,
  code,
}: {
  question: string;
  a: string;
  b: string;
  tallies: { a: number; b: number };
  pctA: number;
  pctB: number;
  showCounts: boolean;
  countdown: number | null;
  countdownTotal: number;
  code?: string;
}) {
  const dial =
    countdown != null ? (
      <div className="flex items-center justify-center py-2 md:px-[clamp(0.25rem,1vw,1rem)]">
        <LeaderCountdown
          seconds={countdown}
          total={countdownTotal || undefined}
          className="w-[clamp(7rem,min(14vw,24vh),13rem)] text-[clamp(1.2rem,2.2vw,2rem)]"
        />
      </div>
    ) : undefined;

  return (
    <Slide>
      <p className={cn(kicker, "inline-flex items-center gap-3")}>
        <LiveDot status="live" />
        Choose now
      </p>
      <h1
        className={cn(
          heroType,
          "mt-[clamp(0.75rem,2.2vh,1.75rem)] max-w-[90vw]",
        )}
      >
        {question}
      </h1>
      <RedRule center className="mt-[clamp(0.9rem,2.4vh,1.5rem)]" />
      <div className="mt-[clamp(1.25rem,4vh,3rem)] w-full">
        <ChoiceGrid
          middle={dial}
          a={
            <ChoicePanel
              letter="A"
              label={a}
              footer={
                showCounts ? (
                  <Tally letter="A" votes={tallies.a} pct={pctA} />
                ) : null
              }
            />
          }
          b={
            <ChoicePanel
              letter="B"
              label={b}
              footer={
                showCounts ? (
                  <Tally letter="B" votes={tallies.b} pct={pctB} />
                ) : null
              }
            />
          }
        />
      </div>
      {code ? (
        <p className={cn(caption, "mt-[clamp(0.9rem,2.6vh,1.75rem)]")}>
          Join code ·{" "}
          <span className="font-medium text-[var(--sh-cream)]">{code}</span>
        </p>
      ) : null}
    </Slide>
  );
}

function ClosedTally({
  letter,
  votes,
  pct,
}: {
  letter: "A" | "B";
  votes: number;
  pct: number;
}) {
  return (
    <div className="border border-[var(--sh-line-strong)] bg-[rgb(11_11_11/0.74)] px-[clamp(1rem,2.6vw,2.25rem)] py-[clamp(1rem,3vh,2rem)] text-left">
      <ChoiceBadge
        letter={letter}
        className="mb-4 size-[clamp(2rem,3.4vw,3rem)] text-[clamp(1rem,1.8vw,1.6rem)]"
      />
      <Tally letter={letter} votes={votes} pct={pct} />
    </div>
  );
}

export function ClosedSlide({
  tallies,
  pctA,
  pctB,
}: {
  tallies: { a: number; b: number } | null;
  pctA: number;
  pctB: number;
}) {
  return (
    <Slide>
      <p className={cn(kicker, "sh-rise")}>Ballots are sealed</p>
      <h1
        className={cn(titleType, "sh-rise mt-[clamp(0.9rem,2.6vh,2rem)]")}
        style={stagger(0.15)}
      >
        Voting is closed<span className="sh-accent">.</span>
      </h1>
      <RedRule center delay={0.7} className="mt-[clamp(1rem,2.6vh,1.75rem)]" />
      {tallies ? (
        <div
          className="sh-rise mt-[clamp(1.25rem,4vh,3rem)] w-full"
          style={stagger(0.5)}
        >
          <ChoiceGrid
            a={<ClosedTally letter="A" votes={tallies.a} pct={pctA} />}
            b={<ClosedTally letter="B" votes={tallies.b} pct={pctB} />}
          />
        </div>
      ) : (
        <p
          className={cn(leadType, "sh-rise mt-[clamp(1.25rem,4vh,3rem)]")}
          style={stagger(0.5)}
        >
          Counting every vote — the reveal is coming.
        </p>
      )}
    </Slide>
  );
}

export function RevealSlide({
  winner,
  a,
  b,
  nextCue,
}: {
  winner: string;
  a: string;
  b: string;
  nextCue?: string | null;
}) {
  return (
    <Slide>
      <p className={cn(kicker, "sh-rise")}>The audience has chosen</p>
      <RedRule center delay={0.4} className="mt-[clamp(0.9rem,2.4vh,1.5rem)]" />
      <div
        className="sh-rise mt-[clamp(1.25rem,4.5vh,3.5rem)] w-full"
        style={stagger(0.5)}
      >
        <ChoiceGrid
          a={
            <ChoicePanel
              letter="A"
              label={a}
              state={winner === "A" ? "winner" : "dim"}
            />
          }
          b={
            <ChoicePanel
              letter="B"
              label={b}
              state={winner === "B" ? "winner" : "dim"}
            />
          }
        />
      </div>
      <div
        className="sh-rise mt-[clamp(1.25rem,4vh,3rem)] w-full"
        style={stagger(1.1)}
      >
        <BranchDivider className="max-w-[min(70vw,24rem)]" />
        <p className="sh-display mt-[clamp(0.75rem,2vh,1.25rem)] text-[clamp(1.6rem,min(3.4vw,6vh),3.25rem)]">
          The story continues<span className="sh-accent">.</span>
        </p>
        {nextCue ? (
          <p
            className={cn(
              caption,
              "mt-4 normal-case !tracking-[0.1em] opacity-70",
            )}
          >
            Next cue file · {nextCue}
          </p>
        ) : null}
      </div>
    </Slide>
  );
}

export function EndSlide({ code }: { code?: string }) {
  return (
    <Slide>
      <h1 className="sh-display sh-rise text-[clamp(3.5rem,min(13vw,22vh),14rem)]">
        The end<span className="sh-accent">.</span>
      </h1>
      <RedRule center delay={0.8} className="mt-[clamp(1rem,3vh,2rem)]" />
      <p
        className={cn(leadType, "sh-rise mt-[clamp(1rem,3vh,2rem)]")}
        style={stagger(0.9)}
      >
        Thank you for sharing the picture.
      </p>
      {code ? (
        <p
          className={cn(
            codeType,
            "sh-rise mt-6 text-[clamp(1rem,2.2vw,1.75rem)]",
          )}
          style={stagger(1.1)}
        >
          {code}
        </p>
      ) : null}
      <Signature />
    </Slide>
  );
}

/** Pre-roll, waiting, loading and error states — one calm, branded notice. */
export function NoticeSlide({
  eyebrow,
  title,
  children,
  alert = false,
  code,
  pulse = false,
}: {
  eyebrow: ReactNode;
  title: string;
  children?: ReactNode;
  alert?: boolean;
  code?: string;
  pulse?: boolean;
}) {
  return (
    <Slide>
      <p
        className={cn(
          kicker,
          "sh-rise",
          alert && "!text-[var(--sh-red-hot)]",
          pulse && "animate-pulse",
        )}
      >
        {eyebrow}
      </p>
      <h1
        className={cn(titleType, "sh-rise mt-[clamp(0.9rem,2.6vh,2rem)]")}
        style={stagger(0.15)}
      >
        {title}
      </h1>
      <RedRule center delay={0.7} className="mt-[clamp(1rem,2.6vh,1.75rem)]" />
      {children ? (
        <div
          className={cn(
            leadType,
            "sh-rise mt-[clamp(1rem,3vh,2rem)] max-w-3xl",
          )}
          style={stagger(0.9)}
        >
          {children}
        </div>
      ) : null}
      {code ? (
        <p className={cn(codeType, "mt-6 text-[clamp(1rem,2.2vw,1.75rem)]")}>
          {code}
        </p>
      ) : null}
      <Signature />
    </Slide>
  );
}

/** Rehearsal-only status in the corner, so the projection itself stays clean. */
function PreviewStatus({
  label,
  issues,
}: {
  label: string;
  issues: { id: string; title: string; nextStep: string }[];
}) {
  return (
    <div className="absolute left-[clamp(0.75rem,2.4vw,2rem)] top-[clamp(0.75rem,2.4vh,2rem)] z-30 max-w-md text-left">
      <span className="kc-status-pill">{label}</span>
      {issues.length ? (
        <div className="mt-3 space-y-1.5 text-[0.82rem] leading-relaxed text-[var(--sh-red-hot)]">
          {issues.map((i) => (
            <p key={i.id}>
              <span className="font-semibold">{i.title}.</span> {i.nextStep}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Highest countdown seen for this vote — the ring drains proportionally to it. */
function useCountdownTotal(seconds: number | null, key: string) {
  const [state, setState] = useState({ key, total: seconds ?? 0 });
  if (state.key !== key) {
    setState({ key, total: seconds ?? 0 });
  } else if (seconds != null && seconds > state.total) {
    setState({ key, total: seconds });
  }
  return state.total;
}

/**
 * `/screen` — projector-facing title cards and vote theatre (not a dashboard).
 */
export function ScreenDisplay() {
  useHostSupabaseRoomSync();
  const storeEventId = useMockEventStore((s) => s.eventId);
  const screen = useScreenSupabaseDisplay();
  useScreenSurfaceHeartbeat(screen.event?.id ?? storeEventId);

  const { snapshot: connection } = useShowtimeConnection();
  const { windowOrigin } = useJoinBaseUrl();
  const voteMirror = useLocalPreviewVoteMirror();
  const graph = useMockEventStore((s) => s.graph);
  const currentNodeId = useMockEventStore((s) => s.currentNodeId);
  const eventTitle = useMockEventStore((s) => s.eventTitle);
  const eventCode = useMockEventStore((s) => s.eventCode);
  const eventStarted = useMockEventStore((s) => s.eventStarted);
  const localVotesA = useMockEventStore((s) => s.votesA);
  const localVotesB = useMockEventStore((s) => s.votesB);
  const localPhase = useMockEventStore((s) => s.votePhase);

  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  const syncMode = useMemo(() => getShowtimeSyncMode(), []);
  const rehearsalProjection = syncMode === "local_preview";

  const st = screen.event?.status;
  const code = screen.roomCode || screen.event?.code;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const onVideoEnded = useCallback(async () => {
    const supabase = screen.supabase;
    const ev = screen.event;
    const node = screen.currentNode;
    if (!supabase || !ev?.id || !node) return;
    if (ev.status !== "playing") return;
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) return;
      if (node.is_ending) {
        await updateEvent(supabase, ev.id, {
          status: "ended",
          winner: null,
          vote_ends_at: null,
          ...withPlaybackCommand("load", { playback_position_seconds: 0 }),
        });
      } else {
        await updateEvent(supabase, ev.id, {
          status: "video_ended",
          vote_ends_at: null,
          ...withPlaybackCommand("pause"),
        });
      }
    } catch {
      /* ignore */
    }
  }, [screen.supabase, screen.event, screen.currentNode]);

  const resolvedSrc = useMemo(() => {
    if (!screen.currentNode) return null;
    return resolveStoryVideoUrl(screen.currentNode.video_url, origin);
  }, [screen.currentNode, origin]);

  const localPreview = !screen.supabaseConfigured;

  const blockingLoad =
    !localPreview &&
    ((screen.loading && !screen.event) ||
      (Boolean(screen.error) && !screen.event));
  const disconnected =
    (Boolean(screen.error) && !screen.event) ||
    (!online && !screen.event && !screen.loading && !localPreview);

  const mountVideoStage = Boolean(
    !blockingLoad &&
    !disconnected &&
    screen.event?.id &&
    screen.currentNode &&
    resolvedSrc &&
    st &&
    [
      "ready",
      "playing",
      "paused",
      "video_ended",
      "voting_open",
      "voting_closed",
      "winner_revealed",
    ].includes(st),
  );

  const hideMainForPurePlayback = Boolean(
    mountVideoStage && resolvedSrc && (st === "playing" || st === "paused"),
  );

  const isPreShowLobby = st === "setup" || st === "ready";

  useProjectorFullscreenLock([
    st,
    screen.currentNode?.id,
    resolvedSrc,
    mountVideoStage,
    hideMainForPurePlayback,
    screen.event?.playback_command_id,
  ]);

  const roomStatus: "ready" | "playing" | "paused" =
    st === "ready" || st === "playing" || st === "paused" ? st : "ready";

  const countdownTotal = useCountdownTotal(
    screen.countdownSec ?? null,
    `${screen.event?.id ?? ""}:${screen.currentNode?.id ?? ""}:${screen.event?.vote_ends_at ?? ""}`,
  );

  const localNode = useMemo(
    () => getNode(graph, currentNodeId),
    [graph, currentNodeId],
  );
  const localPhaseResolved = voteMirror?.phase ?? localPhase;
  const localTotals = voteMirror?.totals ?? { a: localVotesA, b: localVotesB };
  const localPctA = useMemo(() => {
    const t = localTotals.a + localTotals.b;
    if (voteMirror?.pctA != null) return voteMirror.pctA;
    if (!t) return 50;
    return (localTotals.a / t) * 100;
  }, [voteMirror, localTotals.a, localTotals.b]);
  const localPctB = useMemo(() => {
    const t = localTotals.a + localTotals.b;
    if (voteMirror?.pctB != null) return voteMirror.pctB;
    if (!t) return 50;
    return (localTotals.b / t) * 100;
  }, [voteMirror, localTotals.a, localTotals.b]);
  const localQuestion =
    (voteMirror?.question ?? localNode?.question)?.trim() || "—";
  const localA =
    voteMirror?.optionALabel ?? localNode?.optionA?.label ?? "Option A";
  const localB =
    voteMirror?.optionBLabel ?? localNode?.optionB?.label ?? "Option B";
  const localTitle = voteMirror?.eventTitle ?? eventTitle;
  const localWinner = voteMirror?.revealedWinner;

  const showLiveVoteCounts = screen.event
    ? screen.event.screen_show_live_vote_counts !== false
    : true;

  const joinUrlFor = (c: string | undefined) =>
    c && windowOrigin ? getJoinUrl(c, windowOrigin) : "";

  let body: ReactNode;

  if (localPreview) {
    body = (
      <>
        <PreviewStatus
          label={connection.badgeLabel}
          issues={connection.blockingIssues}
        />
        {!eventStarted ? (
          <LobbySlide
            title={localTitle}
            code={eventCode}
            posterUrl={null}
            joinUrl={joinUrlFor(eventCode)}
          />
        ) : localPhaseResolved === "open" ? (
          <VoteSlide
            question={localQuestion}
            a={localA}
            b={localB}
            tallies={localTotals}
            pctA={localPctA}
            pctB={localPctB}
            showCounts
            countdown={null}
            countdownTotal={0}
            code={eventCode}
          />
        ) : localPhaseResolved === "closed" ? (
          <ClosedSlide tallies={null} pctA={localPctA} pctB={localPctB} />
        ) : localPhaseResolved === "reveal" && localWinner ? (
          <RevealSlide winner={localWinner} a={localA} b={localB} />
        ) : (
          <NoticeSlide
            eyebrow="A quiet moment"
            title="Stand by"
            code={eventCode}
          >
            Before the next reel. When the story moves, the picture fills the
            screen.
          </NoticeSlide>
        )}
      </>
    );
  } else if (disconnected) {
    body = (
      <NoticeSlide
        alert
        eyebrow="Signal interrupted"
        title={
          !online ? "This display is offline" : "This room could not be loaded"
        }
      >
        {screen.error ??
          "Check the network cable or Wi‑Fi, then reload. This screen must stay connected to the room."}
      </NoticeSlide>
    );
  } else if (screen.loading && !screen.event) {
    body = <NoticeSlide pulse eyebrow="Receiving show" title="Stand by" />;
  } else if (!screen.event || !code) {
    body = (
      <NoticeSlide
        eyebrow={
          <Link
            href="/"
            className="inline-block hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sh-red)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--sh-black)]"
            aria-label="Showtime home"
          >
            Kasdan Showtime presents
          </Link>
        }
        title="Waiting for show"
      >
        The big screen wakes when a show begins in this room. Nothing is playing
        here yet.
      </NoticeSlide>
    );
  } else if ((st === "playing" || st === "paused") && !resolvedSrc) {
    body = (
      <NoticeSlide
        alert
        eyebrow="Projection check"
        title="No reel on this beat"
        code={code}
      >
        The next reel is being cued for the screen.
      </NoticeSlide>
    );
  } else if (st === "video_ended" && screen.currentNode) {
    const n = screen.currentNode;
    body = (
      <StoryContinuesSlide
        question={n.question?.trim() || "—"}
        a={n.option_a_label?.trim() || "Option A"}
        b={n.option_b_label?.trim() || "Option B"}
      />
    );
  } else if (isPreShowLobby) {
    const idlePosterRaw = screen.event.screen_idle_poster_url?.trim() ?? "";
    const idlePosterResolved = idlePosterRaw
      ? resolvePosterImageUrl(idlePosterRaw, origin)
      : null;
    body = (
      <LobbySlide
        title={screen.event.title}
        code={code}
        posterUrl={idlePosterResolved}
        joinUrl={joinUrlFor(code)}
      />
    );
  } else if (st === "voting_open") {
    body = (
      <VoteSlide
        question={screen.currentNode?.question?.trim() || "—"}
        a={screen.currentNode?.option_a_label?.trim() || "Option A"}
        b={screen.currentNode?.option_b_label?.trim() || "Option B"}
        tallies={screen.tallies}
        pctA={screen.pctA}
        pctB={screen.pctB}
        showCounts={showLiveVoteCounts}
        countdown={screen.countdownSec ?? null}
        countdownTotal={countdownTotal}
        code={code}
      />
    );
  } else if (st === "voting_closed") {
    body = (
      <ClosedSlide
        tallies={
          screen.event.screen_show_closed_tally === true ? screen.tallies : null
        }
        pctA={screen.pctA}
        pctB={screen.pctB}
      />
    );
  } else if (st === "winner_revealed" && screen.event.winner) {
    body = (
      <RevealSlide
        winner={screen.event.winner}
        a={screen.currentNode?.option_a_label?.trim() || "Option A"}
        b={screen.currentNode?.option_b_label?.trim() || "Option B"}
        nextCue={rehearsalProjection ? screen.nextCueFilename : null}
      />
    );
  } else if (st === "ended") {
    body = <EndSlide code={code} />;
  } else {
    body = (
      <NoticeSlide eyebrow="House notice" title="Stand by" code={code}>
        A brief pause in the story. We’ll continue shortly.
      </NoticeSlide>
    );
  }

  const ev = screen.event;

  const videoBehindSlate = Boolean(
    mountVideoStage &&
    ev &&
    resolvedSrc &&
    screen.currentNode &&
    st !== "playing" &&
    st !== "paused",
  );

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden overscroll-none bg-[var(--sh-black)] text-[var(--sh-cream)]",
        "select-none [-webkit-user-select:none] [touch-action:none]",
      )}
    >
      {!blockingLoad && !disconnected ? <ScreenFullscreenButton /> : null}

      {/* Full-viewport stage (curtains, spotlight, rays) — reaches every screen edge, including fullscreen.
          Dropped during pure playback so the picture runs edge to edge with nothing in front of it. */}
      {!hideMainForPurePlayback ? <StageBackdrop /> : null}

      {mountVideoStage && ev && resolvedSrc && screen.currentNode ? (
        // While a slate is up the video stays mounted (priming/preloading keeps running) but hidden.
        <div className="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col">
          <ScreenHostedVideo
            eventId={ev.id}
            mediaInstanceId={screen.currentNode.id}
            src={resolvedSrc}
            prefetchSrcs={screen.prefetchReelSrcs}
            operatorVideoRef={screen.currentNode.video_url ?? ""}
            roomStatus={roomStatus}
            playbackCommand={ev.playback_command}
            playbackCommandId={ev.playback_command_id}
            startPositionSeconds={ev.playback_position_seconds ?? 0}
            visuallyObscured={videoBehindSlate}
            onEnded={onVideoEnded}
            className="min-h-0 flex-1"
          />
        </div>
      ) : null}

      {!hideMainForPurePlayback ? (
        <main className="relative z-20 flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden px-2 pt-[clamp(0.75rem,2vh,1.25rem)] [padding-bottom:max(4.25rem,env(safe-area-inset-bottom))]">
          {body}
        </main>
      ) : null}
    </div>
  );
}
