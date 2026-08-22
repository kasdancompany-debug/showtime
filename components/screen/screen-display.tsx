"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DecoProscenium, DecoSunburst } from "@/components/kasdan/deco-motifs";
import { ScreenFullscreenButton } from "@/components/screen/screen-fullscreen-button";
import { ScreenHostedVideo } from "@/components/screen/screen-hosted-video";
import { ScreenTitleCardFrame } from "@/components/screen/screen-title-card-frame";
import { useHostSupabaseRoomSync } from "@/hooks/use-host-supabase-room-sync";
import { useLocalPreviewVoteMirror } from "@/hooks/use-local-preview-vote-mirror";
import { useProjectorFullscreenLock } from "@/hooks/use-projector-fullscreen-lock";
import { useScreenSupabaseDisplay } from "@/hooks/use-screen-supabase-display";
import { useScreenSurfaceHeartbeat } from "@/hooks/use-screen-surface-heartbeat";
import { useShowtimeConnection } from "@/hooks/use-showtime-connection";
import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { getShowtimeSyncMode } from "@/lib/showtime/sync-mode";
import { resolvePosterImageUrl } from "@/lib/showtime/poster-image-url";
import { resolveStoryVideoUrl } from "@/lib/showtime/video-url";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { getNode } from "@/lib/story-engine/graph";
import { updateEvent } from "@/lib/supabase/event-room";
import { withPlaybackCommand } from "@/lib/supabase/playback-command";
import { cn } from "@/lib/utils";

const eyebrow =
  "font-sans text-[clamp(0.5rem,1.15vw,0.72rem)] font-semibold uppercase tracking-[0.36em] text-[var(--kc-champagne)]";
const serifHero =
  "font-heading text-[clamp(1.85rem,5.2vw,4.25rem)] font-normal leading-[1.06] tracking-tight text-[var(--kc-cream)] text-balance";
const serifDisplay =
  "font-heading text-[clamp(2.4rem,7vw,5.75rem)] font-normal leading-[1.02] tracking-tight text-balance";
const bodyLarge =
  "font-sans text-[clamp(1.05rem,2.6vw,1.65rem)] font-light leading-snug text-[color-mix(in_oklch,var(--kc-cream)_88%,transparent)]";
const goldGlow = "text-[var(--kc-gold-bright)] drop-shadow-[0_0_28px_color-mix(in_oklch,var(--kc-gold-bright)_25%,transparent)]";

function ArtDecoDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full max-w-[min(90vw,36rem)] items-center gap-3", className)} aria-hidden>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--kc-gold-line)] to-[color-mix(in_oklch,var(--kc-gold-bright)_70%,transparent)]" />
      <div className="size-[5px] shrink-0 rotate-45 border border-[var(--kc-gold-bright)]/80 bg-[color-mix(in_oklch,var(--kc-gold-deep)_40%,transparent)]" />
      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[var(--kc-gold-line)] to-[color-mix(in_oklch,var(--kc-gold-bright)_70%,transparent)]" />
    </div>
  );
}

function ProjectionCard({
  children,
  className,
  showInnerRule = false,
}: {
  children: ReactNode;
  className?: string;
  /** Full inner rectangle (can draw vertical lines through wide centered type). Corners always on. */
  showInnerRule?: boolean;
}) {
  return (
    <div className={cn("flex w-full max-w-[min(96vw,76rem)] flex-col items-center px-[clamp(0.75rem,3vw,2rem)]", className)}>
      <ScreenTitleCardFrame
        paddingDensity="compact"
        showInnerRule={showInnerRule}
        className="flex w-full flex-col items-center overflow-hidden text-center"
      >
        <DecoSunburst />
        <div className="relative z-[1] flex w-full flex-col items-center">{children}</div>
      </ScreenTitleCardFrame>
    </div>
  );
}

function PreShowPresents() {
  return <p className={cn(eyebrow, "text-[var(--kc-champagne)]")}>Kasdan Co. presents</p>;
}

function PreShowJoinCode({ code }: { code: string }) {
  return (
    <div className="mt-10 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2">
      <span className={cn(eyebrow, "text-[var(--kc-champagne)]")}>Join code</span>
      <span className="font-mono text-[clamp(1.1rem,3vw,1.85rem)] font-medium tracking-[0.28em] text-[var(--kc-gold-bright)]">
        {code}
      </span>
    </div>
  );
}

function CinematicChoiceCard({
  letter,
  label,
  dim,
  footer,
}: {
  letter: string;
  label: string;
  dim?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col rounded-sm border bg-[color-mix(in_oklch,var(--kc-piano)_40%,black)] px-[clamp(1rem,3vw,2rem)] py-[clamp(1.25rem,3.5vh,2.25rem)] text-left shadow-[inset_0_1px_0_color-mix(in_oklch,var(--kc-gold-bright)_12%,transparent)]",
        dim
          ? "border-[color-mix(in_oklch,var(--kc-gold)_8%,transparent)] opacity-[0.38]"
          : "border-[color-mix(in_oklch,var(--kc-gold-bright)_28%,transparent)]",
      )}
    >
      <p className={cn(eyebrow, dim && "text-[var(--kc-cream-dim)]")}>{letter}</p>
      <p className={cn(serifHero, "mt-3 text-left", dim ? "text-[var(--kc-cream-dim)]" : "text-[var(--kc-cream)]")}>{label}</p>
      {footer ? <div className="mt-auto pt-8">{footer}</div> : null}
    </div>
  );
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
  const voteMirror = useLocalPreviewVoteMirror();
  const graph = useMockEventStore((s) => s.graph);
  const currentNodeId = useMockEventStore((s) => s.currentNodeId);
  const eventTitle = useMockEventStore((s) => s.eventTitle);
  const eventCode = useMockEventStore((s) => s.eventCode);
  const eventStarted = useMockEventStore((s) => s.eventStarted);
  const localVotesA = useMockEventStore((s) => s.votesA);
  const localVotesB = useMockEventStore((s) => s.votesB);
  const localPhase = useMockEventStore((s) => s.votePhase);

  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
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

  const blockingLoad = !localPreview && ((screen.loading && !screen.event) || (Boolean(screen.error) && !screen.event));
  const disconnected =
    (Boolean(screen.error) && !screen.event) || (!online && !screen.event && !screen.loading && !localPreview);

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

  const localNode = useMemo(() => getNode(graph, currentNodeId), [graph, currentNodeId]);
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
  const localQuestion = (voteMirror?.question ?? localNode?.question)?.trim() || "—";
  const localA = voteMirror?.optionALabel ?? localNode?.optionA?.label ?? "Option A";
  const localB = voteMirror?.optionBLabel ?? localNode?.optionB?.label ?? "Option B";
  const localTitle = voteMirror?.eventTitle ?? eventTitle;
  const localWinner = voteMirror?.revealedWinner;

  const showLiveVoteCounts = screen.event ? screen.event.screen_show_live_vote_counts !== false : true;

  const choiceVoteFooter = (votes: number, sharePct: number, show: boolean, tone: "a" | "b") =>
    show ? (
      <div className="w-full border-t border-[color-mix(in_oklch,var(--kc-gold)_15%,transparent)] pt-6">
        <p className="font-mono text-[clamp(1.75rem,5vw,3.25rem)] font-light tabular-nums text-[var(--kc-cream)]">
          {votes}
        </p>
        <p className={cn(eyebrow, "mt-2 text-[var(--kc-cream-dim)]")}>{votes === 1 ? "vote" : "votes"}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/50">
          <div
            className={cn(
              "h-full transition-[width] duration-500",
              tone === "a"
                ? "bg-[color-mix(in_oklch,var(--kc-gold-bright)_55%,var(--kc-piano))]"
                : "bg-[color-mix(in_oklch,var(--kc-champagne)_35%,var(--kc-piano))]",
            )}
            style={{ width: `${sharePct}%` }}
          />
        </div>
      </div>
    ) : null;

  let body: ReactNode;

  if (localPreview) {
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <p className={eyebrow}>
          <span className="rounded-sm border border-[color-mix(in_oklch,var(--kc-gold)_22%,transparent)] px-2 py-0.5 text-[var(--kc-champagne)]">
            {connection.badgeLabel}
          </span>
        </p>
        {connection.blockingIssues.length ? (
          <div className="mt-8 max-w-xl text-left text-[clamp(0.95rem,2vw,1.2rem)] leading-relaxed text-[color-mix(in_oklch,var(--kc-velvet)_65%,var(--kc-cream))]">
            {connection.blockingIssues.map((i) => (
              <p key={i.id} className="mt-2">
                <span className="font-semibold">{i.title}.</span> {i.nextStep}
              </p>
            ))}
          </div>
        ) : null}
        <p className={cn(serifDisplay, "mt-10 text-[var(--kc-cream)]")}>{localTitle}</p>
        <p className="mt-4 font-mono text-[clamp(1.1rem,3vw,2rem)] tracking-[0.35em] text-[var(--kc-gold-bright)]">{eventCode}</p>
        <ArtDecoDivider className="mt-10" />
        {!eventStarted ? (
          <p className={cn(bodyLarge, "mt-12 max-w-2xl")}>
            The curtain is still down. The picture will begin when this room is called to life.
          </p>
        ) : localPhaseResolved === "open" ? (
          <div className="mt-12 flex w-full max-w-[min(94vw,72rem)] flex-col items-stretch gap-[clamp(1.25rem,4vh,2.5rem)]">
            <p className={cn(serifHero, "max-w-[90vw] text-balance")}>{localQuestion}</p>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-[clamp(1rem,2.5vw,1.75rem)] md:grid-cols-2">
              <CinematicChoiceCard
                letter="Option A"
                label={localA}
                footer={choiceVoteFooter(localTotals.a, localPctA, true, "a")}
              />
              <CinematicChoiceCard
                letter="Option B"
                label={localB}
                footer={choiceVoteFooter(localTotals.b, localPctB, true, "b")}
              />
            </div>
          </div>
        ) : localPhaseResolved === "closed" ? (
          <div className="mt-14 flex max-w-3xl flex-col items-center gap-6">
            <p className={eyebrow}>Ballots are sealed</p>
            <p className={cn(serifDisplay, "text-[var(--kc-cream)]")}>Voting is closed</p>
            <p className={cn(bodyLarge, "max-w-xl opacity-90")}>The house will reveal what you chose together.</p>
          </div>
        ) : localPhaseResolved === "reveal" && localWinner ? (
          <div className="mt-12 flex w-full max-w-[min(96vw,52rem)] flex-col items-center gap-10 md:mt-14">
            <p className={cn(eyebrow, "w-full text-center")}>The audience has chosen…</p>
            <div className="grid w-full grid-cols-1 gap-10 md:grid-cols-2 md:gap-x-14 md:gap-y-8 lg:gap-x-16">
              <div className="flex flex-col items-center text-center">
                <p className={eyebrow}>Option A</p>
                <p
                  className={cn(
                    serifDisplay,
                    "mt-3 max-w-[min(90vw,20rem)] text-balance md:mt-4",
                    localWinner === "A" ? goldGlow : "text-[var(--kc-cream-dim)] opacity-[0.35]",
                  )}
                >
                  {localA}
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <p className={eyebrow}>Option B</p>
                <p
                  className={cn(
                    serifDisplay,
                    "mt-3 max-w-[min(90vw,20rem)] text-balance md:mt-4",
                    localWinner === "B" ? goldGlow : "text-[var(--kc-cream-dim)] opacity-[0.35]",
                  )}
                >
                  {localB}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className={cn(bodyLarge, "mt-12 max-w-2xl opacity-90")}>
            A quiet moment before the next reel. When the story moves, the picture fills the screen.
          </p>
        )}
      </ProjectionCard>
    );
  } else if (disconnected) {
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <p className={cn(eyebrow, "text-[color-mix(in_oklch,var(--kc-velvet)_55%,var(--kc-champagne))]")}>Signal interrupted</p>
        <p className={cn(serifDisplay, "mt-8 text-[color-mix(in_oklch,var(--kc-cream)_92%,var(--kc-velvet))]")}>
          {!online ? "This display is offline" : "This room could not be loaded"}
        </p>
        <p className={cn(bodyLarge, "mt-6 max-w-2xl text-[color-mix(in_oklch,var(--kc-cream)_75%,var(--kc-velvet))]")}>
          {screen.error ?? "Check the network cable or Wi‑Fi, then reload. This screen must stay connected to the room."}
        </p>
        <ArtDecoDivider className="mt-12" />
      </ProjectionCard>
    );
  } else if (screen.loading && !screen.event) {
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <p className={cn(eyebrow, "animate-pulse")}>Receiving show</p>
        <p className={cn(serifDisplay, "mt-10 text-[var(--kc-cream)]")}>Stand by</p>
        <ArtDecoDivider className="mt-12" />
      </ProjectionCard>
    );
  } else if (!screen.event || !code) {
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <Link
          href="/"
          className={cn(
            eyebrow,
            "inline-block hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--kc-gold-line)_65%,transparent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--kc-piano)]",
          )}
          aria-label="Showtime home"
        >
          Kasdan Co. presents
        </Link>
        <p className={cn(serifDisplay, "mt-10 text-[var(--kc-cream)]")}>Waiting for show</p>
        <p className={cn(bodyLarge, "mt-8 max-w-2xl opacity-90")}>
          The big screen wakes when a show begins in this room. Nothing is playing here yet.
        </p>
        <ArtDecoDivider className="mt-12" />
      </ProjectionCard>
    );
  } else if ((st === "playing" || st === "paused") && !resolvedSrc) {
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <p className={cn(eyebrow, "text-[color-mix(in_oklch,var(--kc-velvet)_50%,var(--kc-champagne))]")}>Projection check</p>
        <p className={cn(serifDisplay, "mt-8")}>No reel on this beat</p>
        <p className={cn(bodyLarge, "mt-6 max-w-2xl")}>The next reel is being cued for the screen.</p>
        <p className="mt-10 font-mono text-[clamp(1rem,2.5vw,1.5rem)] tracking-[0.28em] text-[var(--kc-gold-bright)]">{code}</p>
        <ArtDecoDivider className="mt-12" />
      </ProjectionCard>
    );
  } else if (st === "video_ended" && screen.currentNode) {
    const n = screen.currentNode;
    const q = n.question?.trim() || "—";
    const a = n.option_a_label?.trim() || "Option A";
    const b = n.option_b_label?.trim() || "Option B";
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <p className={eyebrow}>The story continues</p>
        <p className={cn(serifHero, "mt-8 max-w-[90vw] text-balance")}>{q}</p>
        <p className={cn(bodyLarge, "mt-6 max-w-2xl opacity-90")}>
          Your phones will shape what happens next. Voting opens in a moment — stay with us.
        </p>
        <div className="mt-12 grid w-full max-w-[min(94vw,56rem)] grid-cols-1 gap-6 md:grid-cols-2">
          <CinematicChoiceCard letter="Option A" label={a} />
          <CinematicChoiceCard letter="Option B" label={b} />
        </div>
        <ArtDecoDivider className="mt-12" />
      </ProjectionCard>
    );
  } else if (isPreShowLobby) {
    const idlePosterRaw = screen.event!.screen_idle_poster_url?.trim() ?? "";
    const idlePosterResolved = idlePosterRaw ? resolvePosterImageUrl(idlePosterRaw, origin) : null;
    const showPosterHero = Boolean(idlePosterResolved);
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-8" />
        {showPosterHero ? (
          <div className="relative mb-8 flex max-h-[42vh] w-full max-w-[min(94vw,50rem)] items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic show asset URL, any aspect ratio */}
            <img
              src={idlePosterResolved!}
              alt=""
              draggable={false}
              className="max-h-[42vh] w-auto max-w-full object-contain"
              style={{
                maskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 74%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 74%, transparent 100%)",
              }}
            />
          </div>
        ) : null}
        <PreShowPresents />
        <p className={cn(serifDisplay, showPosterHero ? "mt-6" : "mt-8", "text-[var(--kc-cream)]")}>
          {screen.event!.title}
        </p>
        <PreShowJoinCode code={code} />
        <ArtDecoDivider className="mt-10" />
      </ProjectionCard>
    );
  } else if (st === "voting_open") {
    const q = screen.currentNode?.question?.trim() || "—";
    const a = screen.currentNode?.option_a_label?.trim() || "Option A";
    const b = screen.currentNode?.option_b_label?.trim() || "Option B";
    body = (
      <div className="flex w-full max-w-[min(96vw,76rem)] flex-col items-stretch px-[clamp(0.75rem,3vw,2rem)]">
        <ScreenTitleCardFrame
          paddingDensity="compact"
          className="relative flex w-full flex-col items-center overflow-hidden py-[clamp(1rem,3vh,2rem)]"
        >
          <DecoSunburst />
          <div className="relative z-[1] flex w-full flex-col items-center">
            <ArtDecoDivider className="mb-8" />
            <p className={cn(serifHero, "max-w-[92vw] text-balance text-center")}>{q}</p>
            {screen.countdownSec != null ? (
              <p className="mt-6 font-mono text-[clamp(2rem,6vw,4rem)] font-light tabular-nums text-[var(--kc-gold-bright)]">
                {screen.countdownSec}
                <span className="text-[0.45em] tracking-normal text-[var(--kc-champagne)]">s</span>
              </p>
            ) : null}
            <div className="mt-10 grid w-full min-h-0 flex-1 grid-cols-1 gap-[clamp(0.75rem,2vw,1.5rem)] md:grid-cols-2">
              <CinematicChoiceCard
                letter="Option A"
                label={a}
                footer={choiceVoteFooter(screen.tallies.a, screen.pctA, showLiveVoteCounts, "a")}
              />
              <CinematicChoiceCard
                letter="Option B"
                label={b}
                footer={choiceVoteFooter(screen.tallies.b, screen.pctB, showLiveVoteCounts, "b")}
              />
            </div>
            <ArtDecoDivider className="mt-10" />
          </div>
        </ScreenTitleCardFrame>
      </div>
    );
  } else if (st === "voting_closed") {
    const showTally = screen.event.screen_show_closed_tally === true;
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <p className={eyebrow}>Ballots are sealed</p>
        <p className={cn(serifDisplay, "mt-8 text-[var(--kc-cream)]")}>Voting is closed</p>
        {showTally ? (
          <div className="mt-10 grid w-full max-w-3xl grid-cols-2 gap-6 px-2">
            <div className="rounded-sm border border-[color-mix(in_oklch,var(--kc-gold)_18%,transparent)] bg-black/30 px-4 py-8">
              <p className={eyebrow}>Option A</p>
              <p className="mt-4 font-mono text-[clamp(2.2rem,6vw,4rem)] font-light tabular-nums text-[var(--kc-cream)]">
                {screen.tallies.a}
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/50">
                <div
                  className="h-full bg-[color-mix(in_oklch,var(--kc-gold-bright)_50%,transparent)]"
                  style={{ width: `${screen.pctA}%` }}
                />
              </div>
            </div>
            <div className="rounded-sm border border-[color-mix(in_oklch,var(--kc-gold)_18%,transparent)] bg-black/30 px-4 py-8">
              <p className={eyebrow}>Option B</p>
              <p className="mt-4 font-mono text-[clamp(2.2rem,6vw,4rem)] font-light tabular-nums text-[var(--kc-cream)]">
                {screen.tallies.b}
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/50">
                <div
                  className="h-full bg-[color-mix(in_oklch,var(--kc-champagne)_40%,transparent)]"
                  style={{ width: `${screen.pctB}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className={cn(bodyLarge, "mt-8 max-w-2xl opacity-90")}>The reveal is coming — stay with us.</p>
        )}
        <ArtDecoDivider className="mt-12" />
      </ProjectionCard>
    );
  } else if (st === "winner_revealed" && screen.event.winner) {
    const w = screen.event.winner;
    const aLab = screen.currentNode?.option_a_label?.trim() || "Option A";
    const bLab = screen.currentNode?.option_b_label?.trim() || "Option B";
    const nextName = screen.nextCueFilename;
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <div className="flex w-full max-w-[min(96vw,52rem)] flex-col items-center">
          <p className={cn(eyebrow, "text-center")}>The audience has chosen…</p>
          <div className="mt-10 grid w-full grid-cols-1 gap-10 md:grid-cols-2 md:gap-x-14 md:gap-y-8 lg:gap-x-16">
            <div className="flex flex-col items-center text-center">
              <p className={eyebrow}>Option A</p>
              <p
                className={cn(
                  serifDisplay,
                  "mt-3 max-w-[min(90vw,20rem)] text-balance md:mt-4",
                  w === "A" ? goldGlow : "text-[var(--kc-cream-dim)] opacity-[0.35]",
                )}
              >
                {aLab}
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <p className={eyebrow}>Option B</p>
              <p
                className={cn(
                  serifDisplay,
                  "mt-3 max-w-[min(90vw,20rem)] text-balance md:mt-4",
                  w === "B" ? goldGlow : "text-[var(--kc-cream-dim)] opacity-[0.35]",
                )}
              >
                {bLab}
              </p>
            </div>
          </div>
        </div>
        <p className={cn(bodyLarge, "mt-12 max-w-2xl text-center opacity-80 md:mt-14")}>
          When the house is ready, the next reel will roll.
        </p>
        {rehearsalProjection && nextName ? (
          <p className="mt-6 font-mono text-[clamp(0.65rem,1.2vw,0.8rem)] tracking-wide text-[var(--kc-cream-dim)] opacity-70">
            Next cue file · {nextName}
          </p>
        ) : null}
        <ArtDecoDivider className="mt-12" />
      </ProjectionCard>
    );
  } else if (st === "ended") {
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <p className={cn(serifDisplay, "text-[color-mix(in_oklch,var(--kc-velvet)_35%,var(--kc-cream))]")}>The End</p>
        <p className={cn(bodyLarge, "mt-8 max-w-xl opacity-90")}>Thank you for sharing the picture.</p>
        <p className="mt-10 font-mono text-[clamp(1rem,2.5vw,1.5rem)] tracking-[0.28em] text-[var(--kc-gold-bright)]">{code}</p>
        <ArtDecoDivider className="mt-12" />
      </ProjectionCard>
    );
  } else {
    body = (
      <ProjectionCard>
        <ArtDecoDivider className="mb-10" />
        <p className={cn(eyebrow, "text-[color-mix(in_oklch,var(--kc-velvet)_45%,var(--kc-champagne))]")}>House notice</p>
        <p className={cn(serifDisplay, "mt-8")}>Stand by</p>
        <p className={cn(bodyLarge, "mt-6 max-w-2xl")}>A brief pause in the story. We’ll continue shortly.</p>
        <p className="mt-8 font-mono text-[var(--kc-gold-bright)]">{code}</p>
        <ArtDecoDivider className="mt-12" />
      </ProjectionCard>
    );
  }

  const ev = screen.event;

  const videoBehindSlate = Boolean(
    mountVideoStage && ev && resolvedSrc && screen.currentNode && st !== "playing" && st !== "paused",
  );

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden overscroll-none bg-[var(--kc-piano)] text-[var(--kc-cream)]",
        "select-none [-webkit-user-select:none] [touch-action:none]",
      )}
    >
      {!blockingLoad && !disconnected ? <ScreenFullscreenButton /> : null}

      {mountVideoStage && ev && resolvedSrc && screen.currentNode
        ? (() => {
            const videoEl = (
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
            );
            // Video intentionally hidden behind a title slate (pre-show, between beats) —
            // priming/preloading still runs, but the proscenium frame has nothing to frame yet,
            // so skip the decoration rather than show gold corners floating under the slate.
            return videoBehindSlate ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col">{videoEl}</div>
            ) : (
              <DecoProscenium className="pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col">
                {videoEl}
              </DecoProscenium>
            );
          })()
        : null}

      {!hideMainForPurePlayback ? (
        <main className="relative z-20 flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden px-2 pt-[clamp(0.75rem,2vh,1.25rem)] [padding-bottom:max(4.25rem,env(safe-area-inset-bottom))]">
          {body}
        </main>
      ) : null}
    </div>
  );
}
