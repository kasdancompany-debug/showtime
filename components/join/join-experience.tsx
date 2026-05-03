"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Lock,
  Radio,
  RefreshCw,
  Ticket,
  Trophy,
  WifiOff,
} from "lucide-react";

import { FilmGrain } from "@/components/cinematic/film-grain";
import {
  ArtDecoFrame,
  CountdownMedallion,
  GoldButton,
  StudioBadge,
  TheatreCurtainBackground,
  VoteOptionCard,
} from "@/components/kasdan";
import { kcCopy } from "@/lib/design/kasdan-hollywood-tokens";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hapticError, hapticLight, hapticMedium, hapticSuccess } from "@/lib/join/haptics";
import { cn } from "@/lib/utils";
import { useJoinRoom } from "@/hooks/use-join-room";
import type { VoteChoice } from "@/types";

type Props = { eventCode: string };

function supabaseDismissStorageKey(code: string) {
  return `kc-join-supabase-dismiss:${code.toUpperCase()}`;
}

export function JoinExperience({ eventCode }: Props) {
  const reduceMotion = useReducedMotion();
  const room = useJoinRoom(eventCode);
  const {
    leaveRoom,
    allowAnonymousQuickJoin,
    serverVoteDuplicateHint,
    dismissDuplicateVoteHint,
    joinRealtimeDown,
    joinRealtimeBlocking,
    voteEndsAt,
    pollDurationSec,
    voteOpen,
  } = room;
  const [name, setName] = useState(() => room.persist?.displayName ?? "");
  const [table, setTable] = useState(() => room.persist?.tableNumber ?? "");
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [supabaseGateDismissed, setSupabaseGateDismissed] = useState(false);

  useEffect(() => {
    try {
      setSupabaseGateDismissed(sessionStorage.getItem(supabaseDismissStorageKey(eventCode)) === "1");
    } catch {
      setSupabaseGateDismissed(false);
    }
  }, [eventCode]);

  const dismissSupabaseGate = () => {
    try {
      sessionStorage.setItem(supabaseDismissStorageKey(eventCode), "1");
    } catch {
      /* ignore */
    }
    setSupabaseGateDismissed(true);
  };

  const showSupabaseEnvGate =
    room.hydrated &&
    room.remoteReady &&
    room.validEvent &&
    !room.realtimeConfigured &&
    !supabaseGateDismissed;

  const readyToJoin = room.readyToJoin;

  async function handleJoin() {
    const callsign =
      allowAnonymousQuickJoin && !name.trim() ? "Guest" : name.trim();
    if (!callsign) return;
    setJoinErr(null);
    setJoining(true);
    try {
      await room.joinRoom(callsign, table);
      hapticSuccess();
    } catch (e) {
      setJoinErr(e instanceof Error ? e.message : "Could not join");
      hapticLight();
    } finally {
      setJoining(false);
    }
  }

  async function handleQuickJoin() {
    if (!allowAnonymousQuickJoin) return;
    setJoinErr(null);
    setJoining(true);
    try {
      await room.joinRoom("Guest", table);
      hapticSuccess();
    } catch (e) {
      setJoinErr(e instanceof Error ? e.message : "Could not join");
      hapticLight();
    } finally {
      setJoining(false);
    }
  }

  async function handleVote(c: VoteChoice) {
    if (room.voteSubmitting || room.votedThisRound) return;
    hapticMedium();
    const result = await room.castVote(c);
    if (result === "ok") hapticSuccess();
    else if (result === "duplicate") hapticError();
    else if (result === "blocked") hapticLight();
  }

  useEffect(() => {
    if (room.screen === "vote_received") dismissDuplicateVoteHint();
  }, [room.screen, dismissDuplicateVoteHint]);

  if (!room.hydrated) {
    return (
      <JoinShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="font-mono text-sm text-muted-foreground">Loading…</p>
        </div>
      </JoinShell>
    );
  }

  if (room.realtimeConfigured && !room.remoteReady) {
    return (
      <JoinShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="text-center font-mono text-sm text-muted-foreground">Connecting to box office…</p>
        </div>
      </JoinShell>
    );
  }

  if (room.bootstrapFailed && room.fetchError) {
    return (
      <JoinShell>
        <JoinMessageCard
          title="Could not reach the box office"
          subtitle="We could not load this screening from the server. Check your connection and try again."
          detail={room.fetchError}
          actions={
            <>
              <GoldButton
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-xs uppercase tracking-[0.15em]"
                onClick={() => void room.retryRemote()}
              >
                <RefreshCw className="size-4" /> Try again
              </GoldButton>
              <Link
                href="/join"
                className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center rounded-2xl border-white/15")}
              >
                Try another code
              </Link>
              <Link
                href="/"
                className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center rounded-2xl border-white/15")}
              >
                Back home
              </Link>
            </>
          }
        />
      </JoinShell>
    );
  }

  if (room.invalidCode) {
    return (
      <JoinShell>
        <JoinMessageCard
          title="This screening was not found"
          subtitle={
            <>
              There is no active event for code{" "}
              <span className="font-mono text-foreground">{eventCode.toUpperCase()}</span>. Ask the host for the current
              QR link or double-check the event code.
            </>
          }
          actions={
            <>
              <Link
                href="/join"
                className={cn(buttonVariants({ variant: "default" }), "inline-flex w-full justify-center rounded-2xl")}
              >
                Try another code
              </Link>
              <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center rounded-2xl border-white/15")}>
                Back home
              </Link>
            </>
          }
        />
      </JoinShell>
    );
  }

  if (room.joinsClosed && room.joinsClosedReason) {
    const copy =
      room.joinsClosedReason === "draft"
        ? "The host has not opened this screening yet. Take your seat — the lobby will unlock when the show is ready."
        : "This screening has ended. Thanks for joining.";
    return (
      <JoinShell>
        <JoinMessageCard
          title={room.joinsClosedReason === "draft" ? "Not accepting guests yet" : "Show has ended"}
          subtitle={copy}
          actions={
            <>
              <Link
                href="/join"
                className={cn(buttonVariants({ variant: "default" }), "inline-flex w-full justify-center rounded-2xl")}
              >
                Enter a different code
              </Link>
              <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center rounded-2xl border-white/15")}>
                Back home
              </Link>
            </>
          }
        />
      </JoinShell>
    );
  }

  if (joinRealtimeBlocking) {
    return (
      <JoinShell>
        <JoinMessageCard
          title="Live connection dropped"
          subtitle="We could not stay connected to the live room. Check Wi‑Fi or VPN, then retry — your seat on this phone is saved once you have joined."
          actions={
            <>
              <GoldButton
                type="button"
                className="flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-2xl text-sm uppercase tracking-[0.12em] [touch-action:manipulation]"
                onClick={() => room.retryJoinTransport()}
              >
                <RefreshCw className="size-4" /> Reconnect
              </GoldButton>
              <Link
                href="/join"
                className={cn(buttonVariants({ variant: "outline" }), "inline-flex min-h-[3rem] w-full justify-center rounded-2xl border-white/15 text-base [touch-action:manipulation]")}
              >
                Try another code
              </Link>
              <Link
                href="/"
                className={cn(buttonVariants({ variant: "outline" }), "inline-flex min-h-[3rem] w-full justify-center rounded-2xl border-white/15 text-base [touch-action:manipulation]")}
              >
                Back home
              </Link>
            </>
          }
        />
      </JoinShell>
    );
  }

  if (showSupabaseEnvGate) {
    return (
      <JoinShell>
        <JoinMessageCard
          leading={<Info className="mx-auto mb-4 size-10 text-sky-400/90" />}
          title="Live voting is not configured here"
          subtitle={
            <>
              This page was built without{" "}
              <span className="font-mono text-[0.7rem] text-foreground">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
              <span className="font-mono text-[0.7rem] text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>. Phones
              cannot sync with the room until those are set on the server (for example in Vercel environment variables)
              and the app is redeployed.
            </>
          }
          actions={
            <>
              <GoldButton
                type="button"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-xs uppercase tracking-[0.15em]"
                onClick={dismissSupabaseGate}
              >
                Continue anyway (this device only)
              </GoldButton>
              <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center rounded-2xl border-white/15")}>
                Back
              </Link>
            </>
          }
        />
      </JoinShell>
    );
  }

  return (
    <JoinShell>
      {room.hydrated && !room.realtimeConfigured && (
        <div className="fixed left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-50 rounded-2xl border border-sky-500/35 bg-sky-950/90 px-4 py-3 text-sm text-sky-50 shadow-lg backdrop-blur">
          <p className="font-medium text-sky-100">Supabase env missing</p>
          <p className="mt-2 leading-relaxed text-sky-100/90">
            Cross-device voting needs{" "}
            <span className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>. You dismissed the full notice —
            only this browser can participate in demo mode.
          </p>
        </div>
      )}

      {!room.online && (
        <div
          className={cn(
            "fixed left-4 right-4 z-50 flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/92 px-4 py-3.5 text-base leading-snug text-amber-50 shadow-lg backdrop-blur",
            room.hydrated && !room.realtimeConfigured
              ? "top-[max(8.5rem,env(safe-area-inset-top))]"
              : "top-[max(1rem,env(safe-area-inset-top))]",
          )}
          role="status"
          aria-live="polite"
        >
          <WifiOff className="size-5 shrink-0" aria-hidden />
          <span>You’re offline — stay on this page; votes sync when you’re back online.</span>
        </div>
      )}

      {joinRealtimeDown && room.persist?.joined ? (
        <div
          className={cn(
            "fixed left-4 right-4 z-50 flex flex-wrap items-center gap-3 rounded-2xl border border-rose-500/40 bg-rose-950/92 px-4 py-3.5 text-base leading-snug text-rose-50 shadow-lg backdrop-blur",
            !room.online ? "top-[max(11.5rem,env(safe-area-inset-top))]" : "top-[max(1rem,env(safe-area-inset-top))]",
          )}
          role="alert"
          aria-live="assertive"
        >
          <Radio className="size-5 shrink-0 opacity-90" aria-hidden />
          <span className="min-w-0 flex-1">Reconnecting to the live room… If this lingers, check the network.</span>
          <button
            type="button"
            onClick={() => room.retryJoinTransport()}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-white/15 px-4 py-2 font-mono text-sm font-semibold uppercase tracking-wide text-white [touch-action:manipulation]"
          >
            <RefreshCw className="size-4" />
            Retry
          </button>
        </div>
      ) : null}

      {(room.fetchError || room.joinRoomError) && (
        <div
          className={cn(
            "fixed left-4 right-4 z-50 flex flex-wrap items-center gap-2 rounded-2xl border border-red-500/35 bg-red-950/85 px-4 py-3 text-sm text-red-50 backdrop-blur",
            !room.online ? "top-[max(14rem,env(safe-area-inset-top))]" : "top-[max(4.5rem,env(safe-area-inset-top))]",
          )}
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{room.joinRoomError ?? room.fetchError}</span>
          {room.fetchError ? (
            <button
              type="button"
              onClick={() => void room.retryRemote()}
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 font-mono text-xs"
            >
              <RefreshCw className="size-3" /> Retry
            </button>
          ) : null}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
        <header className="mb-8 flex flex-col gap-3 sm:mb-10">
          <div className="flex items-center justify-between gap-4">
            <StudioBadge className="shrink-0 scale-[0.92] sm:scale-95" href="/" showSeal />
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              <div className="flex items-center gap-2 rounded-full border border-[var(--kc-gold-muted)]/35 bg-[var(--kc-midnight)]/70 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.35em] text-[var(--kc-champagne)]">
                <Radio className="size-3.5 shrink-0" />
                Premiere night
              </div>
              {room.mode === "supabase" ? (
                <span className="font-mono text-[0.6rem] text-muted-foreground">Realtime</span>
              ) : null}
            </div>
          </div>
          {room.persist?.joined ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[var(--kc-cream-dim)]">
              <span>
                Saved on this phone as{" "}
                <strong className="text-[var(--kc-cream)]">{room.persist.displayName || "Guest"}</strong>
                {room.persist.tableNumber ? ` · Table ${room.persist.tableNumber}` : ""}. Refresh or revisit anytime.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 rounded-lg text-[0.65rem] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (window.confirm("Leave this screening on this device? You can scan the QR again later.")) {
                    leaveRoom();
                  }
                }}
              >
                Leave screening
              </Button>
            </div>
          ) : null}
        </header>

        <AnimatePresence mode="wait">
          {room.screen === "landing" && (
            <LandingScreen
              key="landing"
              title={room.title}
              eventCode={eventCode}
              name={name}
              table={table}
              onName={setName}
              onTable={setTable}
              onJoin={handleJoin}
              onQuickJoin={handleQuickJoin}
              joining={joining}
              joinErr={joinErr}
              canJoin={readyToJoin}
              transportConnecting={room.joinTransportConnecting}
              allowAnonymousQuickJoin={allowAnonymousQuickJoin}
            />
          )}

          {room.screen === "waiting" && (
            <WaitingScreen
              key="waiting"
              title={room.title}
              displayName={room.persist?.displayName}
              tableNumber={room.persist?.tableNumber}
              connection={
                !room.online ? "offline"
                : joinRealtimeDown ? "reconnecting"
                : "live"
              }
              reduceMotion={Boolean(reduceMotion)}
            />
          )}

          {room.screen === "voting" && (
            <VotingScreen
              key="voting"
              question={room.question ?? "Choose"}
              optionA={room.optionALabel}
              optionB={room.optionBLabel}
              onVote={handleVote}
              disabled={room.voteSubmitting || room.votedThisRound}
              duplicateHint={serverVoteDuplicateHint}
              onDismissDuplicate={dismissDuplicateVoteHint}
              voteEndsAt={voteEndsAt}
              pollDurationSec={pollDurationSec}
              voteOpen={voteOpen}
            />
          )}

          {room.screen === "vote_received" && (
            <VoteReceivedScreen
              key="received"
              choice={
                room.activeStoryNodeId && room.persist?.votesByNodeId[room.activeStoryNodeId]
                  ? room.persist.votesByNodeId[room.activeStoryNodeId]
                  : "A"
              }
            />
          )}

          {room.screen === "results" && (
            <ResultsScreen
              key="results"
              winner={room.revealedWinner}
              tie={room.revealTie}
              optionA={room.optionALabel}
              optionB={room.optionBLabel}
              reduceMotion={Boolean(reduceMotion)}
            />
          )}
        </AnimatePresence>
      </div>
    </JoinShell>
  );
}

function JoinMessageCard({
  title,
  subtitle,
  detail,
  actions,
  leading,
}: {
  title: string;
  subtitle: React.ReactNode;
  detail?: string;
  actions: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-16"
    >
      <div className="rounded-3xl border border-white/10 bg-black/50 p-8 text-center backdrop-blur-xl">
        {leading ?? <AlertTriangle className="mx-auto mb-4 size-10 text-amber-400/90" />}
        <p className="font-heading text-2xl leading-snug">{title}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        {detail ? (
          <p className="mt-4 break-words rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-[0.65rem] text-red-200/90">
            {detail}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3">{actions}</div>
      </div>
    </motion.div>
  );
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-hidden bg-[var(--kc-bg-deep)] text-[var(--kc-cream)] supports-[min-height:100dvh]:min-h-[100dvh]">
      <TheatreCurtainBackground intensity="subtle" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.72)]" />
      <FilmGrain />
      <div className="relative z-[2] flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function useVoteSecondsLeft(endsAt: number | null, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(id);
  }, [active, endsAt]);
  if (!active || !endsAt) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function LandingScreen({
  title,
  eventCode,
  name,
  table,
  onName,
  onTable,
  onJoin,
  onQuickJoin,
  joining,
  joinErr,
  canJoin,
  transportConnecting,
  allowAnonymousQuickJoin,
}: {
  title: string;
  eventCode: string;
  name: string;
  table: string;
  onName: (v: string) => void;
  onTable: (v: string) => void;
  onJoin: () => void;
  onQuickJoin: () => void;
  joining: boolean;
  joinErr: string | null;
  canJoin: boolean;
  transportConnecting?: boolean;
  allowAnonymousQuickJoin: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-between gap-12 sm:gap-16 lg:max-w-[min(26rem,100%)] lg:justify-center lg:gap-20"
    >
      {/* Upper “title card” — airy program credits, separate from reservation desk */}
      <div className="flex flex-col items-center px-2 pb-2 text-center sm:px-4 sm:pb-4">
        <p className="kc-eyebrow pt-2 text-[0.625rem] text-[var(--kc-champagne)]/90 tracking-[0.32em] sm:pt-3 sm:text-[0.6875rem]">
          {kcCopy.presents}
        </p>
        <div className="mt-10 sm:mt-12" aria-hidden>
          <div className="mx-auto flex items-center gap-5">
            <span className="h-px w-10 shrink-0 bg-[linear-gradient(90deg,var(--kc-gold-faint),transparent)] sm:w-14" />
            <span className="font-sans text-[0.56rem] font-medium uppercase tracking-[0.42em] text-[var(--kc-gold-muted)]">
              Feature
            </span>
            <span className="h-px w-10 shrink-0 bg-[linear-gradient(270deg,var(--kc-gold-faint),transparent)] sm:w-14" />
          </div>
        </div>
        <h1 className="kc-display mt-7 max-w-[15ch] text-balance text-[clamp(1.875rem,6.5vw,3rem)] font-normal leading-[1.08] tracking-[0.04em] text-[var(--kc-cream)] sm:mt-9 sm:max-w-[18ch]">
          {title || "Tonight’s feature"}
        </h1>
        <p className="mt-8 max-w-[26ch] font-[family-name:var(--font-body-serif)] text-base italic leading-[1.65] text-[var(--kc-cream-dim)] sm:mt-10 sm:text-lg">
          {kcCopy.tagline}
        </p>
      </div>

      {/* Lower “reservation desk” — single framed surface; ticket lintel + fields */}
      <div className="shrink-0 px-1 sm:px-0">
        <div className="relative overflow-hidden rounded-[2px] shadow-[var(--kc-shadow-marquee)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,oklch(0.82_0.04_82/0.2),transparent)]" />
          <ArtDecoFrame variant="full" className="border-[oklch(0.62_0.045_78/0.35)] bg-[oklch(0.15_0.03_48/0.72)] px-7 py-8 backdrop-blur-md sm:px-10 sm:py-11">
            <div className="relative border-b border-[oklch(0.72_0.04_78/0.14)] pb-8 text-center sm:pb-9">
              <p className="kc-eyebrow text-[0.6rem] tracking-[0.38em] text-[var(--kc-champagne)]/80">Admit one</p>
              <p className="mt-4 font-mono text-[clamp(1.125rem,3.5vw,1.35rem)] font-medium tracking-[0.28em] text-[var(--kc-champagne)]">
                {eventCode.toUpperCase()}
              </p>
              <div className="pointer-events-none absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-[linear-gradient(180deg,oklch(0.78_0.06_78/0.45),transparent)]" aria-hidden />
            </div>

            <div className="mt-8 space-y-8 sm:mt-10 sm:space-y-9">
              <div className="space-y-3">
                <Label
                  htmlFor="jn"
                  className="block font-sans text-sm font-medium uppercase tracking-[0.2em] text-[var(--kc-champagne)]/85"
                >
                  Your name{" "}
                  {allowAnonymousQuickJoin ? (
                    <span className="normal-case tracking-normal text-[var(--kc-cream-dim)]/70">(optional if you quick enter)</span>
                  ) : null}
                </Label>
                <Input
                  id="jn"
                  value={name}
                  onChange={(e) => onName(e.target.value)}
                  placeholder={allowAnonymousQuickJoin ? "Or leave blank — quick enter below" : "How we’ll call you in the room"}
                  autoComplete="name"
                  className="h-14 min-h-[3.25rem] rounded-[3px] border-[oklch(0.72_0.04_78/0.16)] bg-[oklch(0.08_0.02_48/0.55)] px-4 text-lg text-[var(--kc-cream)] placeholder:text-[var(--kc-cream-dim)]/45 focus-visible:border-[var(--kc-champagne)]/40 focus-visible:ring-[var(--kc-champagne)]/25"
                />
              </div>
              <div className="space-y-3">
                <Label
                  htmlFor="jt"
                  className="block font-sans text-sm font-medium uppercase tracking-[0.2em] text-[var(--kc-champagne)]/85"
                >
                  Table number <span className="text-[var(--kc-cream-dim)]/55">(optional)</span>
                </Label>
                <Input
                  id="jt"
                  value={table}
                  onChange={(e) => onTable(e.target.value)}
                  placeholder="e.g. 12"
                  inputMode="numeric"
                  className="h-14 min-h-[3.25rem] rounded-[3px] border-[oklch(0.72_0.04_78/0.16)] bg-[oklch(0.08_0.02_48/0.55)] px-4 text-lg text-[var(--kc-cream)] placeholder:text-[var(--kc-cream-dim)]/45 focus-visible:border-[var(--kc-champagne)]/40 focus-visible:ring-[var(--kc-champagne)]/25"
                />
              </div>
            </div>

            {joinErr ? (
              <p className="mt-6 text-center text-sm leading-relaxed text-red-400/95" role="alert">
                {joinErr}
              </p>
            ) : null}

            {transportConnecting ? (
              <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                Connecting to the live room…
              </p>
            ) : null}

            {allowAnonymousQuickJoin ? (
              <GoldButton
                type="button"
                disabled={joining || !canJoin || transportConnecting}
                className="mt-8 flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-[2px] py-3 text-[0.9375rem] font-semibold uppercase tracking-[0.14em] disabled:opacity-40 sm:mt-9 [touch-action:manipulation]"
                onClick={() => void onQuickJoin()}
              >
                {joining ? <Loader2 className="size-5 animate-spin" /> : null}
                Quick enter as guest
              </GoldButton>
            ) : null}

            <GoldButton
              type="button"
              disabled={!name.trim() || joining || !canJoin || transportConnecting}
              className={cn(
                "flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-[2px] py-3 text-[0.9375rem] font-semibold uppercase tracking-[0.14em] disabled:opacity-40 [touch-action:manipulation]",
                allowAnonymousQuickJoin ? "mt-3 sm:mt-4" : "mt-10 sm:mt-11",
              )}
              onClick={() => void onJoin()}
            >
              {joining ? <Loader2 className="size-5 animate-spin" /> : null}
              {allowAnonymousQuickJoin ? "Join with your name" : "Join the screening"}
            </GoldButton>

            <Link
              href="/join"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-3 text-base font-medium text-[var(--kc-cream)] [touch-action:manipulation] hover:bg-white/[0.07] hover:text-[var(--kc-cream)]",
              )}
            >
              <Ticket className="size-5 text-[var(--kc-champagne)]" aria-hidden />
              Enter a different event code
            </Link>
          </ArtDecoFrame>
        </div>
      </div>
    </motion.section>
  );
}

function WaitingScreen({
  title,
  displayName,
  tableNumber,
  connection,
  reduceMotion,
}: {
  title: string;
  displayName?: string;
  tableNumber?: string;
  connection: "live" | "offline" | "reconnecting";
  reduceMotion: boolean;
}) {
  const status =
    connection === "offline"
      ? "You’re offline — we’ll pick up the moment you reconnect."
      : connection === "reconnecting"
        ? "Reconnecting to the live room…"
        : "You’re in sync — we’ll open the ballot when the host does.";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-1 py-10 text-center"
    >
      {reduceMotion ? (
        <div
          className="relative mx-auto mb-12 size-36 rounded-full border-2 border-[var(--kc-gold-muted)]/35 bg-[radial-gradient(circle_at_50%_35%,oklch(0.35_0.06_78/0.25),transparent_65%)]"
          aria-hidden
        />
      ) : (
        <div className="relative mx-auto mb-12 size-44 sm:size-48" aria-hidden>
          <motion.div
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_38%,oklch(0.62_0.1_78/0.35),transparent_62%)] blur-[2px]"
            animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.9, 0.55] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-2 rounded-full border border-[var(--kc-champagne)]/25"
            animate={{ rotate: 360 }}
            transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-6 rounded-full border border-[oklch(0.55_0.08_195/0.35)]"
            animate={{ rotate: -360 }}
            transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-t-[3px] border-t-[var(--kc-champagne)]/70"
            animate={{ rotate: 360 }}
            transition={{ duration: 4.2, repeat: Infinity, ease: "linear" }}
          />
        </div>
      )}

      <p className="font-mono text-[clamp(0.72rem,3vw,0.85rem)] font-semibold uppercase tracking-[0.28em] text-[var(--kc-champagne)]">
        Kasdan Co. presents
      </p>
      <h2 className="mt-5 font-heading text-[clamp(1.5rem,6vw,2.25rem)] font-normal leading-tight tracking-tight text-[var(--kc-cream)]">
        {title}
      </h2>
      <p className="mx-auto mt-8 max-w-[min(34ch,92vw)] text-pretty text-[clamp(1.05rem,4.2vw,1.3rem)] leading-relaxed text-[var(--kc-cream-dim)]">
        The house lights hold… Sit tight — when it’s time to choose, your ballot will appear here.
      </p>
      <p
        className={cn(
          "mx-auto mt-6 max-w-[min(36ch,94vw)] text-[clamp(0.95rem,3.8vw,1.15rem)] leading-snug",
          connection === "live" ? "text-[var(--kc-champagne)]/90" : "text-amber-200/95",
        )}
      >
        {status}
      </p>
      {displayName ? (
        <p className="mt-10 rounded-full border border-white/12 bg-white/[0.06] px-6 py-3 font-mono text-[clamp(0.85rem,3.5vw,1rem)] text-[var(--kc-cream)]">
          <span className="text-[var(--kc-champagne)]">You · </span>
          {displayName}
          {tableNumber ? ` · Table ${tableNumber}` : ""}
        </p>
      ) : null}
      {!reduceMotion ? <WaitingDots /> : null}
    </motion.section>
  );
}

function WaitingDots() {
  return (
    <div className="mt-10 flex gap-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-2 rounded-full bg-primary"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

function VotingScreen({
  question,
  optionA,
  optionB,
  onVote,
  disabled,
  duplicateHint,
  onDismissDuplicate,
  voteEndsAt,
  pollDurationSec,
  voteOpen,
}: {
  question: string;
  optionA: string;
  optionB: string;
  onVote: (c: VoteChoice) => void;
  disabled: boolean;
  duplicateHint?: string | null;
  onDismissDuplicate?: () => void;
  voteEndsAt: number | null;
  pollDurationSec: number;
  voteOpen: boolean;
}) {
  const secondsLeft = useVoteSecondsLeft(voteEndsAt, voteOpen);
  const ringMax = Math.max(8, pollDurationSec);
  const ringFrac =
    secondsLeft !== null ? Math.min(1, Math.max(0, secondsLeft / ringMax)) : 1;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex w-full max-w-xl flex-1 flex-col px-0 pb-4 pt-2"
    >
      <p className="text-center font-mono text-[clamp(0.68rem,3vw,0.8rem)] font-semibold uppercase tracking-[0.22em] text-[var(--kc-champagne)]">
        {kcCopy.castYourVote}
      </p>
      <h2 className="mx-auto mt-5 max-w-[min(22ch,92vw)] text-balance text-center font-heading text-[clamp(1.35rem,6.5vw,2rem)] font-normal leading-[1.15] text-[var(--kc-cream)]">
        {question}
      </h2>

      {secondsLeft !== null ? (
        <div className="mx-auto mt-8 flex w-full max-w-xs flex-col items-center">
          <CountdownMedallion
            variant="default"
            seconds={secondsLeft}
            fraction={ringFrac}
            label="Ballot closes in"
            className="scale-[0.92] sm:scale-100"
          />
        </div>
      ) : (
        <p className="mx-auto mt-8 max-w-sm text-center font-mono text-[clamp(0.8rem,3.2vw,0.95rem)] uppercase tracking-[0.14em] text-[var(--kc-cream-dim)]">
          Tap A or B once — your vote locks in.
        </p>
      )}

      {duplicateHint ? (
        <div className="mx-auto mt-6 w-full max-w-md rounded-2xl border border-sky-500/40 bg-sky-950/55 px-4 py-4 text-center text-[clamp(0.95rem,3.5vw,1.05rem)] leading-snug text-sky-50">
          <p>{duplicateHint}</p>
          {onDismissDuplicate ? (
            <button
              type="button"
              className="mt-4 min-h-11 rounded-full bg-white/10 px-5 py-2 font-mono text-sm font-semibold uppercase tracking-wide text-sky-100 [touch-action:manipulation]"
              onClick={onDismissDuplicate}
            >
              OK
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-10 grid w-full flex-1 grid-cols-1 gap-4 min-[480px]:grid-cols-2 min-[480px]:gap-4">
        <VoteOptionCard variant="hero" side="A" label={optionA} disabled={disabled} onPick={() => onVote("A")} />
        <VoteOptionCard variant="hero" side="B" label={optionB} disabled={disabled} onPick={() => onVote("B")} />
      </div>
    </motion.section>
  );
}

function VoteReceivedScreen({ choice }: { choice: VoteChoice }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-2 py-12 text-center"
    >
      <motion.div
        initial={{ scale: 0.85 }}
        animate={{ scale: 1 }}
        className="mb-10 flex size-[min(28vw,7.5rem)] max-h-32 min-h-[6rem] items-center justify-center rounded-full border-2 border-[var(--kc-champagne)]/45 bg-[oklch(0.14_0.03_48/0.65)] shadow-[0_0_64px_oklch(0.72_0.1_78/0.22)]"
      >
        <Lock className="size-[min(11vw,3rem)] text-[var(--kc-champagne)]" strokeWidth={2} />
      </motion.div>
      <CheckCircle2 className="mx-auto mb-5 size-14 text-[var(--kc-champagne)]" strokeWidth={1.75} />
      <h2 className="font-heading text-[clamp(1.75rem,7vw,2.5rem)] font-normal leading-tight">{kcCopy.voteCast}</h2>
      <p className="mx-auto mt-5 max-w-[min(34ch,92vw)] text-pretty text-[clamp(1.05rem,4vw,1.2rem)] leading-relaxed text-[var(--kc-cream-dim)]">
        {kcCopy.counting}
      </p>
      <p className="mt-8 rounded-2xl border border-white/12 bg-white/[0.05] px-6 py-4 text-[clamp(1rem,4vw,1.15rem)] text-[var(--kc-cream)]">
        Locked in: <span className="font-semibold text-[var(--kc-champagne)]">Option {choice}</span>
      </p>
      <p className="mx-auto mt-8 max-w-sm text-[clamp(0.95rem,3.8vw,1.05rem)] text-[var(--kc-cream-dim)]">
        The house lights hold… we’ll show you the room’s choice when the host reveals it.
      </p>
    </motion.section>
  );
}

function ResultsScreen({
  winner,
  tie,
  optionA,
  optionB,
  reduceMotion,
}: {
  winner: VoteChoice | null;
  tie: boolean;
  optionA: string;
  optionB: string;
  reduceMotion: boolean;
}) {
  const label = winner === "A" ? optionA : winner === "B" ? optionB : null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-3 py-10 text-center"
    >
      <motion.div
        animate={reduceMotion ? {} : { rotate: [0, -5, 5, 0] }}
        transition={{ duration: 2.8, repeat: reduceMotion ? 0 : Infinity, ease: "easeInOut" }}
        className="mb-8 flex size-[min(26vw,7rem)] items-center justify-center rounded-full border-2 border-[var(--kc-champagne)]/40 bg-[linear-gradient(180deg,oklch(0.22_0.05_78/0.5),transparent)] shadow-[0_0_72px_oklch(0.72_0.1_78/0.28)]"
      >
        <Trophy className="size-[min(12vw,3.25rem)] text-[var(--kc-champagne)]" strokeWidth={1.5} />
      </motion.div>
      <p className="font-mono text-[clamp(0.72rem,3vw,0.85rem)] font-semibold uppercase tracking-[0.24em] text-[var(--kc-champagne)]">
        {kcCopy.houseSpoken}
      </p>
      {tie || !winner ? (
        <>
          <h2 className="mt-6 font-heading text-[clamp(1.75rem,7vw,2.75rem)] font-normal leading-tight">Split decision</h2>
          <p className="mx-auto mt-5 max-w-[min(36ch,94vw)] text-pretty text-[clamp(1.05rem,4vw,1.25rem)] leading-relaxed text-[var(--kc-cream-dim)]">
            The tally tied — the host picks the thread on the big screen.
          </p>
        </>
      ) : (
        <>
          <motion.h2
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 font-heading text-[clamp(2.25rem,12vw,4rem)] font-normal leading-none tracking-tight text-[var(--kc-cream)]"
          >
            Option {winner}
          </motion.h2>
          <p className="mx-auto mt-6 max-w-[min(34ch,94vw)] text-pretty text-[clamp(1.15rem,4.5vw,1.5rem)] leading-snug text-[var(--kc-champagne)]">
            {label}
          </p>
        </>
      )}
      <p className="mx-auto mt-10 max-w-[min(36ch,94vw)] text-[clamp(0.95rem,3.8vw,1.1rem)] leading-relaxed text-[var(--kc-cream-dim)]">
        When this beat ends, you’ll return to the lobby automatically — keep this page open.
      </p>
    </motion.section>
  );
}
