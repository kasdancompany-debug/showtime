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
  Save,
  Send,
  Ticket,
  Trophy,
  WifiOff,
  Zap,
} from "lucide-react";

import { HelpBulletedList, InlineHelpPanel } from "@/components/help/inline-help-panel";
import {
  ArtDecoFrame,
  CountdownMedallion,
  GoldButton,
  StudioBadge,
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
    livePctA,
    livePctB,
    liveTotals,
    activeVoteOutboundStatus,
    retryPendingVoteSync,
  } = room;
  const [name, setName] = useState(() => room.persist?.displayName ?? "");
  const [table, setTable] = useState(() => room.persist?.tableNumber ?? "");
  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [supabaseGateDismissed, setSupabaseGateDismissed] = useState(false);
  const [votePickFlash, setVotePickFlash] = useState<VoteChoice | null>(null);

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
    setVotePickFlash(c);
    try {
      const result = await room.castVote(c);
      if (result === "ok") hapticSuccess();
      else if (result === "duplicate") hapticError();
      else if (result === "queued") hapticMedium();
      else if (result === "blocked") hapticLight();
    } finally {
      window.setTimeout(() => setVotePickFlash(null), 720);
    }
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
          subtitle={
            <span className="block space-y-4 text-left">
              <span className="block leading-relaxed">
                We could not load this screening from the server. Check your connection and try again.
              </span>
              <InlineHelpPanel
                summary="Why this failed & what to do"
                defaultOpen
                whatThisMeans={
                  <p>
                    This phone asked your Showtime deployment for the event behind your join link, and the request
                    returned an error before the room could load.
                  </p>
                }
                howToFix={
                  <HelpBulletedList
                    items={[
                      "Tap Try again after Wi‑Fi or cellular stabilizes.",
                      "If the whole room is stuck, wait a moment — the show may still be connecting.",
                      "Try a different browser or disable strict content blockers for this domain.",
                    ]}
                  />
                }
                commonCauses={
                  <HelpBulletedList
                    items={[
                      "Offline or captive portal (hotel Wi‑Fi login not completed).",
                      "Temporary outage on the venue network or our live service.",
                      "Wrong join URL or event code in the link you opened.",
                    ]}
                  />
                }
              />
            </span>
          }
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
              <span className="font-mono text-foreground">{eventCode.toUpperCase()}</span>. Check your ticket or the big
              screen for the current code, or scan the QR again.
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
      room.joinsClosedReason === "setup"
        ? "The house has not opened the doors yet. Take your seat — the lobby will unlock when the show is ready."
        : "This screening has ended. Thanks for joining.";
    return (
      <JoinShell>
        <JoinMessageCard
          title={room.joinsClosedReason === "setup" ? "Not accepting guests yet" : "Show has ended"}
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
          subtitle={
            <span className="block space-y-4 text-left">
              <span className="block leading-relaxed">
                We could not stay connected to the live room. Check Wi‑Fi or VPN, then retry — your seat on this phone
                is saved once you have joined.
              </span>
              <InlineHelpPanel
                summary="Connection dropped — details"
                defaultOpen
                whatThisMeans={
                  <p>
                    The live vote and room state stream over a websocket. If it drops, this screen blocks until you
                    reconnect or leave.
                  </p>
                }
                howToFix={
                  <HelpBulletedList
                    items={[
                      "Tap Reconnect, wait a few seconds, and stay on this tab.",
                      "Move closer to Wi‑Fi or switch to cellular if the venue network is congested.",
                      "If everyone in the room drops at once, wait a moment and try again — the show will reconnect.",
                    ]}
                  />
                }
                commonCauses={
                  <HelpBulletedList
                    items={[
                      "Phone slept the tab or low-power mode throttled background networking.",
                      "Venue firewall or VPN interrupting long-lived websocket connections.",
                    ]}
                  />
                }
              />
            </span>
          }
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
          leading={<Info className="mx-auto mb-3 size-12 text-sky-400/95 sm:mb-4 sm:size-14" />}
          title="Phones can’t sync on this site yet"
          subtitle={
            <span className="block space-y-4 text-left sm:text-center">
              <span className="block text-base font-normal leading-relaxed text-[var(--kc-cream)]/95 md:text-lg">
                Live sync isn’t ready on this site yet. Until it is, votes from this link won’t reach other guests or the
                big screen.
              </span>
              <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-sm leading-relaxed text-muted-foreground">
                If variables are already set in Vercel, run a <strong className="text-[var(--kc-cream)]">new Production deploy</strong>{" "}
                — <code className="font-mono text-xs text-sky-100/90">NEXT_PUBLIC_*</code> values are baked into the site at{" "}
                <strong className="text-[var(--kc-cream)]">build</strong> time, not when you open this page.
              </p>
              <InlineHelpPanel
                summary="For venue staff: live database setup"
                whatThisMeans={
                  <p>
                    This deployment’s JavaScript was built without both public Supabase settings, so phones cannot open a
                    shared Realtime room. There is no separate documentation site here — everything needed is in your
                    venue deployment and Supabase dashboards.
                  </p>
                }
                howToFix={
                  <HelpBulletedList
                    items={[
                      "In Vercel (or your host): Environment Variables → Production → add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` exactly as named.",
                      "In Supabase (separate browser tab): Project Settings → API → copy Project URL and anon public key.",
                      "Redeploy Production, wait for green, then hard-refresh the backstage console and this join page.",
                    ]}
                  />
                }
                commonCauses={
                  <HelpBulletedList
                    items={[
                      "Keys saved only on Preview, not Production.",
                      "Redeploy skipped after saving env — old bundles still lack variables.",
                      "Typo in `NEXT_PUBLIC_` names or accidental trailing spaces in values.",
                    ]}
                  />
                }
              />
              <InlineHelpPanel
                summary="For venue staff: join URL & QR"
                whatThisMeans={
                  <p>
                    QR codes and links use a fixed public base URL. If it is missing or points at localhost, guests open
                    a URL their phone cannot reach.
                  </p>
                }
                howToFix={
                  <HelpBulletedList
                    items={[
                      "Set `NEXT_PUBLIC_JOIN_ORIGIN` to this site’s public HTTPS URL with no trailing slash.",
                      "Redeploy Production, reopen the backstage console, and re-share or re-print the join QR.",
                    ]}
                  />
                }
                commonCauses={
                  <HelpBulletedList
                    items={[
                      "`NEXT_PUBLIC_JOIN_ORIGIN` never added alongside Supabase keys.",
                      "Using a disposable preview deployment URL instead of the stable production domain.",
                    ]}
                  />
                }
              />
            </span>
          }
          actions={
            <>
              <GoldButton
                type="button"
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold normal-case tracking-normal [touch-action:manipulation] sm:min-h-[3.75rem] sm:text-lg"
                onClick={dismissSupabaseGate}
              >
                Try on this phone only
              </GoldButton>
              <Link
                href="/"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "inline-flex min-h-14 w-full items-center justify-center rounded-2xl border-white/20 text-base [touch-action:manipulation] sm:min-h-[3.75rem]",
                )}
              >
                Back home
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
        <div className="fixed left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-50 rounded-2xl border border-sky-500/35 bg-sky-950/90 px-4 py-3.5 text-base leading-snug text-sky-50 shadow-lg backdrop-blur sm:px-5">
          <p className="font-semibold text-sky-50">Live sync is off on this site</p>
          <p className="mt-2 leading-relaxed text-sky-100/95">
            You skipped the full notice — only this browser is in demo mode. The venue still needs live sync configured
            for a real audience night.
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
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-white">Reconnecting…</span> Restoring the live room. If this lingers,
            check Wi‑Fi and tap Retry.
          </span>
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

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8">
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <div className="flex items-center gap-2 rounded-full border border-[var(--kc-gold-muted)]/35 bg-[var(--kc-midnight)]/70 px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.35em] text-[var(--kc-champagne)]">
              <Radio className="size-3.5 shrink-0" />
              Premiere night
            </div>
            {room.mode === "supabase" ? (
              <span className="font-mono text-[0.6rem] text-muted-foreground">Realtime</span>
            ) : null}
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
              disabled={room.voteSubmitting || room.votedThisRound || !voteOpen}
              duplicateHint={serverVoteDuplicateHint}
              onDismissDuplicate={dismissDuplicateVoteHint}
              voteEndsAt={voteEndsAt}
              pollDurationSec={pollDurationSec}
              voteOpen={voteOpen}
              livePctA={livePctA}
              livePctB={livePctB}
              liveTotals={liveTotals}
              reduceMotion={Boolean(reduceMotion)}
              pickFlash={votePickFlash}
              voteSubmitting={room.voteSubmitting}
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
              optionA={room.optionALabel}
              optionB={room.optionBLabel}
              livePctA={livePctA}
              livePctB={livePctB}
              liveTotals={liveTotals}
              voteEndsAt={voteEndsAt}
              pollDurationSec={pollDurationSec}
              voteOpen={voteOpen}
              reduceMotion={Boolean(reduceMotion)}
              outboundStatus={activeVoteOutboundStatus ?? "synced"}
              onRetrySync={() => retryPendingVoteSync()}
              offline={!room.online}
              realtimeDown={joinRealtimeDown}
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
              userChoice={
                room.activeStoryNodeId && room.persist?.votesByNodeId[room.activeStoryNodeId]
                  ? room.persist.votesByNodeId[room.activeStoryNodeId]
                  : null
              }
            />
          )}
          </AnimatePresence>
        </div>
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
      className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-8 sm:px-6 sm:py-10"
    >
      <div className="rounded-3xl border border-white/10 bg-black/55 p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
        {leading ?? <AlertTriangle className="mx-auto mb-3 size-11 text-amber-400/90 sm:mb-4 sm:size-12" />}
        <h1 className="font-heading text-pretty text-[clamp(1.35rem,4.8vw,1.85rem)] font-normal leading-snug tracking-tight text-[var(--kc-cream)] sm:text-3xl">
          {title}
        </h1>
        <div className="mt-4 text-base leading-relaxed text-muted-foreground md:mt-5 md:text-lg">{subtitle}</div>
        {detail ? (
          <p className="mt-4 break-words rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left font-mono text-xs text-red-200/90 sm:text-sm">
            {detail}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 md:mt-8">{actions}</div>
      </div>
    </motion.div>
  );
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-hidden bg-background text-foreground supports-[min-height:100dvh]:min-h-[100dvh]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="sticky top-0 z-40 flex shrink-0 items-center border-b border-border bg-background/95 px-4 py-3 supports-[padding:max(0px)]:pt-[max(0.65rem,env(safe-area-inset-top))]">
          <StudioBadge href="/" showSeal className="shrink-0 scale-[0.95] sm:scale-100" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
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

function voteBarSpringDamping(stiffness: number): number {
  if (stiffness >= 160) return 18;
  if (stiffness >= 110) return 20;
  return 22;
}

function LiveAudienceBars({
  pctA,
  pctB,
  optionA,
  optionB,
  compact,
  barStiffness,
  leadingSide,
  neckAndNeck,
  finaleMode,
}: {
  pctA: number;
  pctB: number;
  optionA: string;
  optionB: string;
  compact?: boolean;
  barStiffness: number;
  leadingSide: "A" | "B" | "tie" | null;
  neckAndNeck: boolean;
  finaleMode: boolean;
}) {
  const a = Math.min(100, Math.max(0, pctA));
  const b = Math.min(100, Math.max(0, pctB));
  const round = (x: number) => Math.round(x);

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-2xl border px-3 py-3 backdrop-blur-md transition-colors duration-300",
        compact ? "py-2.5" : "py-3.5",
        finaleMode
          ? "border-amber-400/45 bg-[oklch(0.09_0.03_48/0.85)] shadow-[0_0_40px_oklch(0.72_0.12_78/0.18)]"
          : neckAndNeck
            ? "border-rose-400/35 bg-black/45 shadow-[0_0_28px_oklch(0.55_0.15_25/0.12)]"
            : "border-white/12 bg-black/35",
      )}
      aria-live="polite"
      aria-label="Live audience split"
    >
      <p className="mb-2 flex items-center justify-center gap-2 text-center font-mono text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[var(--kc-champagne)]">
        <Zap className={cn("size-3.5 shrink-0", finaleMode && "text-amber-300")} aria-hidden />
        Live pulse · ~1s refresh
      </p>
      <div className={cn("space-y-2.5", compact && "space-y-2")}>
        <div
          className={cn(
            "rounded-lg px-1 py-0.5 transition-shadow duration-300",
            leadingSide === "A" && "shadow-[inset_0_0_20px_oklch(0.78_0.12_78/0.15)]",
          )}
        >
          <div className="flex justify-between gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--kc-cream)]">
            <span className="min-w-0 truncate">A · {optionA}</span>
            <span className="shrink-0 tabular-nums text-[var(--kc-champagne)]">{round(a)}%</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className={cn(
                "h-full rounded-full bg-[linear-gradient(90deg,oklch(0.62_0.13_28),oklch(0.52_0.11_35))]",
                finaleMode && "brightness-110",
              )}
              initial={false}
              animate={{ width: `${a}%` }}
              transition={{ type: "spring", stiffness: barStiffness, damping: voteBarSpringDamping(barStiffness) }}
            />
          </div>
        </div>
        <div
          className={cn(
            "rounded-lg px-1 py-0.5 transition-shadow duration-300",
            leadingSide === "B" && "shadow-[inset_0_0_20px_oklch(0.62_0.12_195/0.18)]",
          )}
        >
          <div className="flex justify-between gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--kc-cream)]">
            <span className="min-w-0 truncate">B · {optionB}</span>
            <span className="shrink-0 tabular-nums text-[oklch(0.72_0.12_195/0.95)]">{round(b)}%</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className={cn(
                "h-full rounded-full bg-[linear-gradient(90deg,oklch(0.52_0.1_200),oklch(0.42_0.09_230))]",
                finaleMode && "brightness-110",
              )}
              initial={false}
              animate={{ width: `${b}%` }}
              transition={{ type: "spring", stiffness: barStiffness, damping: voteBarSpringDamping(barStiffness) }}
            />
          </div>
        </div>
      </div>
    </div>
  );
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
        <h1 className="font-heading mt-7 max-w-[15ch] text-balance text-[clamp(1.875rem,6.5vw,3rem)] font-normal leading-[1.08] tracking-[0.03em] text-[var(--kc-cream)] sm:mt-9 sm:max-w-[18ch]">
          {title || "Tonight’s feature"}
        </h1>
        <p className="mt-8 max-w-[26ch] font-[family-name:var(--font-body-serif)] text-base italic leading-[1.65] text-[var(--kc-cream-dim)] sm:mt-10 sm:text-lg">
          {kcCopy.tagline}
        </p>
      </div>

      {/* Lower “reservation desk” — single framed surface; ticket lintel + fields */}
      <div className="shrink-0 px-1 sm:px-0">
        <div className="relative overflow-hidden rounded-[2px] shadow-[var(--kc-shadow-card)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklch,var(--kc-gold-bright)_22%,transparent),transparent)]" />
          <ArtDecoFrame variant="full" className="border-[color-mix(in_oklch,var(--kc-gold)_28%,transparent)] bg-[color-mix(in_oklch,var(--kc-panel)_82%,transparent)] px-7 py-8 sm:px-10 sm:py-11">
            <div className="relative border-b border-[color-mix(in_oklch,var(--kc-gold)_16%,transparent)] pb-8 text-center sm:pb-9">
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
              <p className="mt-6 text-center text-sm leading-relaxed text-[color-mix(in_oklch,var(--kc-danger)_78%,var(--kc-ivory))]" role="alert">
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
        : "You’re in sync — we’ll open the ballot when voting begins.";

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

      <Link
        href="/"
        className="font-mono text-[clamp(0.72rem,3vw,0.85rem)] font-semibold uppercase tracking-[0.28em] text-[var(--kc-champagne)] no-underline transition-opacity hover:opacity-90 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--kc-gold-line)_70%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kc-piano)]"
        aria-label="Showtime home"
      >
        Kasdan Showtime presents
      </Link>
      <h2 className="mt-5 font-heading text-[clamp(1.5rem,6vw,2.25rem)] font-normal leading-tight tracking-tight text-[var(--kc-cream)]">
        {title}
      </h2>
      <p className="mx-auto mt-6 max-w-[min(36ch,92vw)] text-pretty text-[clamp(1.15rem,4.5vw,1.45rem)] font-semibold leading-snug text-[var(--kc-cream)]">
        Waiting for the next decision…
      </p>
      <p className="mx-auto mt-4 max-w-[min(34ch,92vw)] text-pretty text-[clamp(0.98rem,3.9vw,1.15rem)] leading-relaxed text-[var(--kc-cream-dim)]">
        Keep this page open. When voting opens, your ballot appears automatically — nothing else to tap.
      </p>
      <p
        className={cn(
          "mx-auto mt-5 max-w-[min(36ch,94vw)] text-[clamp(0.9rem,3.6vw,1.05rem)] leading-snug",
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
  livePctA,
  livePctB,
  liveTotals,
  reduceMotion,
  pickFlash,
  voteSubmitting,
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
  livePctA: number;
  livePctB: number;
  liveTotals: { a: number; b: number };
  reduceMotion: boolean;
  pickFlash: VoteChoice | null;
  voteSubmitting: boolean;
}) {
  const motionSafe = Boolean(reduceMotion);
  const [fallbackEndsAt, setFallbackEndsAt] = useState<number | null>(null);
  useEffect(() => {
    if (!voteOpen || voteEndsAt != null) {
      setFallbackEndsAt(null);
      return;
    }
    const id = window.setTimeout(() => setFallbackEndsAt(Date.now() + Math.max(5, pollDurationSec) * 1000), 0);
    return () => window.clearTimeout(id);
  }, [voteOpen, voteEndsAt, pollDurationSec]);

  const countdownEnd = voteEndsAt ?? fallbackEndsAt;
  const secondsLeft = useVoteSecondsLeft(countdownEnd, voteOpen);
  const ringMax = Math.max(8, pollDurationSec);
  const ringFrac =
    secondsLeft !== null ? Math.min(1, Math.max(0, secondsLeft / ringMax)) : 1;
  const displaySeconds = secondsLeft ?? (voteOpen ? Math.max(0, pollDurationSec) : null);

  const finalFive = Boolean(secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0 && voteOpen);
  const energyRise = Boolean(secondsLeft !== null && secondsLeft <= 12 && secondsLeft > 5 && voteOpen);
  const totalCast = liveTotals.a + liveTotals.b;
  const neckAndNeck =
    totalCast >= 6 && Math.abs(livePctA - livePctB) <= 10 && livePctA > 0 && livePctB > 0;

  let leadingSide: "A" | "B" | "tie" | null = null;
  if (totalCast > 0) {
    if (Math.abs(livePctA - livePctB) < 0.55) leadingSide = "tie";
    else leadingSide = livePctA > livePctB ? "A" : "B";
  }

  const barStiffness = motionSafe ? 220 : finalFive ? 175 : energyRise || neckAndNeck ? 125 : 85;

  const energyPhase =
    finalFive ? ("finale" as const) : energyRise || neckAndNeck ? ("rise" as const) : ("idle" as const);

  const spreadPct = Math.abs(livePctA - livePctB);
  /** Honest social proof: clear lean from live counts only; hide when the race is tight */
  const showSocialProofLean =
    voteOpen &&
    totalCast >= 8 &&
    leadingSide !== null &&
    leadingSide !== "tie" &&
    !neckAndNeck &&
    spreadPct >= 12;
  const leanLetter = leadingSide === "A" ? "A" : leadingSide === "B" ? "B" : "";
  const softTension =
    voteOpen &&
    totalCast >= 6 &&
    !neckAndNeck &&
    spreadPct > 10 &&
    spreadPct <= 18 &&
    livePctA > 0 &&
    livePctB > 0;

  return (
    <motion.section
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{
        opacity: 1,
        scale: 1,
        ...(motionSafe || !finalFive ? {} : { x: [0, -1.5, 1.5, -1, 1, 0] }),
      }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.35 } }}
      transition={{
        duration: 0.22,
        ease: [0.22, 1, 0.36, 1],
        x: finalFive ? { duration: 0.42, repeat: Infinity, ease: "easeInOut" } : undefined,
      }}
      className="relative mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col overflow-hidden px-0 pb-1 pt-0"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[45%] bg-[radial-gradient(ellipse_at_50%_0%,oklch(0.55_0.08_78/0.14),transparent_62%)] opacity-90" aria-hidden />

      <div className="relative z-[1] flex flex-col items-center px-1">
        <motion.div
          layoutId="join-live-vote-badge"
          className="inline-flex items-center gap-2 rounded-full border border-amber-400/45 bg-[oklch(0.12_0.03_48/0.88)] px-4 py-1.5 font-mono text-[0.58rem] font-bold uppercase tracking-[0.32em] text-amber-100 shadow-[0_0_24px_oklch(0.72_0.12_78/0.25)]"
          animate={
            motionSafe
              ? {}
              : {
                  boxShadow: [
                    "0 0 12px oklch(0.72 0.12 78 / 0.15)",
                    "0 0 28px oklch(0.78 0.14 78 / 0.38)",
                    "0 0 12px oklch(0.72 0.12 78 / 0.15)",
                  ],
                }
          }
          transition={{ duration: finalFive ? 0.55 : 1.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500/70 opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
          Live vote
        </motion.div>

        <p className="mx-auto mt-2 max-w-[min(36ch,94vw)] text-center font-mono text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-[var(--kc-cream-dim)]/92">
          The audience is deciding…
        </p>

        <motion.h2
          layout="position"
          className="mx-auto mt-2 max-w-[min(26ch,94vw)] text-balance text-center font-heading text-[clamp(1.45rem,7vw,2.35rem)] font-semibold leading-[1.08] tracking-tight text-[var(--kc-cream)] drop-shadow-[0_6px_36px_oklch(0_0_0/0.55)]"
          initial={false}
          animate={motionSafe ? {} : finalFive ? { scale: [1, 1.02, 1] } : {}}
          transition={{ duration: 0.55, repeat: finalFive ? Infinity : 0, ease: "easeInOut" }}
        >
          {question}
        </motion.h2>

        <p className="mx-auto mt-2 max-w-[min(34ch,94vw)] text-center text-[clamp(0.82rem,3.5vw,0.98rem)] font-medium leading-snug text-[var(--kc-champagne)]/95">
          Your pick steers the story — choose now.
        </p>

        {neckAndNeck && voteOpen ? (
          <div className="mx-auto mt-2 max-w-[min(38ch,94vw)] space-y-1.5 text-center">
            <motion.p
              animate={motionSafe ? {} : { opacity: [1, 0.65, 1] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              className="text-[clamp(0.78rem,3.2vw,0.92rem)] font-semibold uppercase tracking-[0.14em] text-rose-200/95"
            >
              Too close to call — every tap shifts the room
            </motion.p>
            <p className="text-[clamp(0.74rem,3vw,0.88rem)] leading-snug text-[var(--kc-cream-dim)]/95">
              Neither path owns the night yet — the next votes could flip it either way.
            </p>
          </div>
        ) : softTension ? (
          <p className="mx-auto mt-2 max-w-[min(36ch,94vw)] text-center text-[clamp(0.76rem,3.1vw,0.9rem)] leading-snug text-[var(--kc-champagne)]/88">
            Still a live contest — the lean could narrow before the ballot closes.
          </p>
        ) : null}

        {displaySeconds !== null ? (
          <div className="mx-auto mt-2 flex w-full flex-col items-center">
            {finalFive ? (
              <motion.div
                className="flex flex-col items-center"
                animate={motionSafe ? {} : { scale: [1, 1.06, 1] }}
                transition={{ duration: 0.45, repeat: Infinity, ease: "easeInOut" }}
              >
                <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.38em] text-amber-200">
                  Final seconds
                </p>
                <span
                  className={cn(
                    "mt-1 font-heading tabular-nums leading-none tracking-tight drop-shadow-[0_8px_40px_oklch(0_0_0/0.5)]",
                    "text-[clamp(4rem,18vw,7rem)] text-amber-100",
                  )}
                  aria-hidden
                >
                  {displaySeconds}
                </span>
              </motion.div>
            ) : null}
            <div className={cn(finalFive ? "mt-2 opacity-95" : "mt-1")}>
              <CountdownMedallion
                variant="default"
                seconds={displaySeconds}
                fraction={secondsLeft !== null ? ringFrac : 1}
                label={finalFive ? "Room closes in" : secondsLeft !== null ? "Decision closes in" : "Decision window"}
                className={cn(finalFive ? "scale-[0.72] opacity-90 sm:scale-[0.78]" : "scale-[0.88] sm:scale-[0.95]")}
              />
            </div>
          </div>
        ) : null}

        {!finalFive && secondsLeft !== null && secondsLeft <= 10 && secondsLeft > 0 && !disabled && voteOpen ? (
          <motion.p
            animate={motionSafe ? {} : { opacity: [1, 0.45, 1] }}
            transition={{ duration: 0.75, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto mt-2 max-w-[min(34ch,94vw)] text-center text-[clamp(0.92rem,4vw,1.08rem)] font-semibold leading-snug text-amber-200"
            role="status"
          >
            Decision closing — tap A or B
          </motion.p>
        ) : null}
      </div>

      <div className="relative z-[1] mx-auto mt-2 w-full min-w-0 max-w-md shrink-0 px-0">
        <LiveAudienceBars
          pctA={livePctA}
          pctB={livePctB}
          optionA={optionA}
          optionB={optionB}
          compact
          barStiffness={barStiffness}
          leadingSide={leadingSide}
          neckAndNeck={neckAndNeck}
          finaleMode={finalFive}
        />
        {showSocialProofLean ? (
          <p className="mt-2 text-pretty text-center text-[clamp(0.72rem,3.1vw,0.84rem)] leading-snug text-[var(--kc-cream-dim)]/90">
            <span className="font-medium text-[var(--kc-cream)]/85">Most ballots here lean toward Option {leanLetter}</span>
            <span className="text-[var(--kc-cream-dim)]"> — live counts only; yours still shifts the story.</span>
          </p>
        ) : null}
        <p className="mt-1.5 text-center font-mono text-[0.58rem] uppercase tracking-[0.14em] text-[var(--kc-cream-dim)]/90">
          Ballots in this room: {totalCast}
          {voteSubmitting ? <span className="text-[var(--kc-champagne)]"> · Locking yours…</span> : null}
        </p>
      </div>

      {duplicateHint ? (
        <div className="relative z-[1] mx-auto mt-2 w-full max-w-md rounded-2xl border border-sky-500/40 bg-sky-950/55 px-3 py-3 text-center text-[clamp(0.9rem,3.4vw,1rem)] leading-snug text-sky-50">
          <p>{duplicateHint}</p>
          {onDismissDuplicate ? (
            <button
              type="button"
              className="mt-3 min-h-11 rounded-full bg-white/10 px-5 py-2 font-mono text-sm font-semibold uppercase tracking-wide text-sky-100 [touch-action:manipulation]"
              onClick={onDismissDuplicate}
            >
              OK
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="relative z-[1] mt-auto grid min-h-0 w-full flex-1 grid-cols-2 gap-2.5 px-0.5 pt-2 [grid-auto-rows:minmax(7.25rem,1fr)] sm:gap-3">
        <VoteOptionCard
          variant="hero"
          side="A"
          label={optionA}
          disabled={disabled}
          onPick={() => onVote("A")}
          cinematicActive={voteOpen && !disabled}
          energyPhase={energyPhase}
          isLeading={leadingSide === "A"}
          neckAndNeck={neckAndNeck}
          pickFlash={pickFlash === "A"}
          reduceMotion={motionSafe}
        />
        <VoteOptionCard
          variant="hero"
          side="B"
          label={optionB}
          disabled={disabled}
          onPick={() => onVote("B")}
          cinematicActive={voteOpen && !disabled}
          energyPhase={energyPhase}
          isLeading={leadingSide === "B"}
          neckAndNeck={neckAndNeck}
          pickFlash={pickFlash === "B"}
          reduceMotion={motionSafe}
        />
      </div>
    </motion.section>
  );
}

function VoteReceivedScreen({
  choice,
  optionA,
  optionB,
  livePctA,
  livePctB,
  liveTotals,
  voteEndsAt,
  pollDurationSec,
  voteOpen,
  reduceMotion,
  outboundStatus,
  onRetrySync,
  offline,
  realtimeDown,
}: {
  choice: VoteChoice;
  optionA: string;
  optionB: string;
  livePctA: number;
  livePctB: number;
  liveTotals: { a: number; b: number };
  voteEndsAt: number | null;
  pollDurationSec: number;
  voteOpen: boolean;
  reduceMotion: boolean;
  outboundStatus: "pending" | "synced";
  onRetrySync: () => void;
  offline: boolean;
  realtimeDown: boolean;
}) {
  const secondsLeft = useVoteSecondsLeft(voteEndsAt, voteOpen);
  const ringMax = Math.max(8, pollDurationSec);
  const ringFrac =
    secondsLeft !== null ? Math.min(1, Math.max(0, secondsLeft / ringMax)) : 1;
  const pickedLabel = choice === "A" ? optionA : optionB;
  const finalFive = Boolean(voteOpen && secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0);
  const energyRise = Boolean(voteOpen && secondsLeft !== null && secondsLeft <= 12 && secondsLeft > 5);
  const totalCast = liveTotals.a + liveTotals.b;
  const neckAndNeck =
    totalCast >= 6 && Math.abs(livePctA - livePctB) <= 10 && livePctA > 0 && livePctB > 0;
  let leadingSide: "A" | "B" | "tie" | null = null;
  if (totalCast > 0) {
    if (Math.abs(livePctA - livePctB) < 0.55) leadingSide = "tie";
    else leadingSide = livePctA > livePctB ? "A" : "B";
  }
  const barStiffness = reduceMotion ? 220 : finalFive ? 175 : energyRise || neckAndNeck ? 125 : 85;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col items-center justify-center overflow-hidden px-1 py-6 text-center sm:py-8"
    >
      <motion.div
        initial={{ scale: 0.75, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="relative mb-5 flex size-[min(26vw,6.75rem)] max-h-[6.75rem] min-h-[5.5rem] items-center justify-center rounded-full border-2 border-[var(--kc-champagne)]/55 bg-[oklch(0.16_0.04_78/0.75)] shadow-[0_0_48px_oklch(0.72_0.1_78/0.28)]"
      >
        {!reduceMotion ? (
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--kc-champagne)]/25"
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : null}
        <CheckCircle2 className="relative z-[1] size-[min(12vw,3.25rem)] text-[var(--kc-champagne)]" strokeWidth={2} aria-hidden />
      </motion.div>
      <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.28em] text-[var(--kc-champagne)]">
        Locked in
      </p>
      <h2 className="mt-2 font-heading text-[clamp(1.5rem,6.5vw,2.1rem)] font-normal leading-tight text-[var(--kc-cream)]">
        Your vote is in
      </h2>
      <p className="mx-auto mt-2 max-w-[min(34ch,94vw)] text-[clamp(0.95rem,3.8vw,1.05rem)] leading-snug text-[var(--kc-cream-dim)]">
        The audience is still deciding — you’re already counted. Watch how the room tilts.
      </p>

      <div
        className="mx-auto mt-5 w-full max-w-md rounded-2xl border border-[var(--kc-champagne)]/25 bg-[oklch(0.12_0.03_78/0.35)] px-4 py-3.5 text-center shadow-[0_12px_40px_oklch(0_0_0/0.28)]"
        role="status"
      >
        <p className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[var(--kc-champagne)]/90">
          Your choice
        </p>
        <p className="mt-2 font-heading text-[clamp(1.35rem,5.5vw,1.85rem)] font-semibold leading-tight text-[var(--kc-cream)]">
          You chose Option {choice}
        </p>
        <p className="mt-1 text-pretty text-[clamp(0.95rem,3.6vw,1.08rem)] leading-snug text-[var(--kc-champagne)]/95">
          {pickedLabel}
        </p>
      </div>

      <div className="mx-auto mt-4 w-full max-w-md px-1">
        {outboundStatus === "pending" ? (
          <div
            className="rounded-2xl border border-amber-400/50 bg-amber-950/40 px-4 py-3.5 text-left shadow-[0_12px_40px_oklch(0_0_0/0.35)]"
            role="status"
            aria-live="polite"
          >
            <p className="flex items-center gap-2 text-[clamp(1rem,3.8vw,1.12rem)] font-semibold leading-snug text-amber-50">
              <Save className="size-5 shrink-0 text-amber-200" aria-hidden />
              Vote saved locally
            </p>
            <p className="mt-2 text-[clamp(0.88rem,3.3vw,1rem)] leading-relaxed text-amber-100/92">
              Your choice is stored on this phone. We’re retrying automatically — when the network cooperates, it reaches
              the screening (including a simple HTTPS backup if live sync is flaky).
            </p>
            {(offline || realtimeDown) && (
              <p className="mt-2 flex items-start gap-2 text-[0.85rem] leading-snug text-amber-200/88">
                <WifiOff className="mt-0.5 size-4 shrink-0 opacity-90" aria-hidden />
                Connection unstable — keep this tab open; no need to tap again.
              </p>
            )}
            <GoldButton
              type="button"
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[0.75rem] font-semibold uppercase tracking-[0.14em] [touch-action:manipulation]"
              onClick={() => onRetrySync()}
            >
              <RefreshCw className="size-4" aria-hidden />
              Try sending now
            </GoldButton>
            <p className="mt-3 text-[0.72rem] leading-snug text-amber-200/75">
              If this never clears before the poll ends, your choice is still saved on this phone.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl border border-emerald-500/45 bg-emerald-950/35 px-4 py-3.5 text-left shadow-[0_12px_40px_oklch(0_0_0/0.3)]"
            role="status"
            aria-live="polite"
          >
            <p className="flex items-center gap-2 text-[clamp(1rem,3.8vw,1.12rem)] font-semibold leading-snug text-emerald-50">
              <Send className="size-5 shrink-0 text-emerald-200" aria-hidden />
              Your vote is in
            </p>
            <p className="mt-2 text-[clamp(0.88rem,3.3vw,1rem)] leading-relaxed text-emerald-100/90">
              You’re in the official count for this question — nothing else to tap.
            </p>
          </div>
        )}
      </div>

      <p className="mx-auto mt-4 max-w-[min(34ch,94vw)] text-pretty text-[clamp(0.95rem,3.9vw,1.1rem)] leading-relaxed text-[var(--kc-cream-dim)]">
        Waiting with everyone else — the house seals the ballot when the moment is right.
      </p>

      {voteOpen && secondsLeft !== null ? (
        <div className="mx-auto mt-4 flex w-full max-w-[10rem] flex-col items-center">
          <CountdownMedallion
            variant="default"
            seconds={secondsLeft}
            fraction={ringFrac}
            label="Closes in"
            className="scale-[0.82]"
          />
        </div>
      ) : null}

      <div className="mx-auto mt-4 w-full max-w-md px-0">
        <LiveAudienceBars
          pctA={livePctA}
          pctB={livePctB}
          optionA={optionA}
          optionB={optionB}
          compact
          barStiffness={barStiffness}
          leadingSide={leadingSide}
          neckAndNeck={neckAndNeck}
          finaleMode={finalFive}
        />
      </div>

      <p className="mx-auto mt-4 max-w-[min(36ch,94vw)] rounded-2xl border border-white/14 bg-white/[0.06] px-4 py-3 text-[clamp(0.88rem,3.5vw,1rem)] leading-snug text-[var(--kc-cream-dim)]">
        <Lock className="mb-1 inline size-4 text-[var(--kc-champagne)] align-text-bottom" aria-hidden /> Ballot sealed on this
        phone — no need to tap again.
      </p>
      <p className="mx-auto mt-3 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[var(--kc-cream-dim)]">
        Total ballots so far: {liveTotals.a + liveTotals.b}
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
  userChoice,
}: {
  winner: VoteChoice | null;
  tie: boolean;
  optionA: string;
  optionB: string;
  reduceMotion: boolean;
  userChoice: VoteChoice | null;
}) {
  const label = winner === "A" ? optionA : winner === "B" ? optionB : null;
  const alignedWithRoom = Boolean(userChoice && winner && userChoice === winner && !tie);
  const votedOtherPath = Boolean(userChoice && winner && userChoice !== winner && !tie);
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
            The tally tied — the house will choose the thread on the big screen.
          </p>
          <p className="mx-auto mt-8 max-w-[min(34ch,94vw)] text-pretty text-[clamp(1rem,3.9vw,1.15rem)] font-medium leading-snug text-[var(--kc-champagne)]/95">
            Every vote held tension — your choice changes everything.
          </p>
          {userChoice ? (
            <p className="mx-auto mt-3 max-w-[min(36ch,94vw)] text-pretty text-[clamp(0.95rem,3.8vw,1.08rem)] leading-relaxed text-[var(--kc-cream-dim)]">
              You picked Option {userChoice} — part of a dead-even crowd.
            </p>
          ) : null}
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
          <div className="mx-auto mt-8 max-w-[min(36ch,94vw)] space-y-3">
            <p className="text-pretty text-[clamp(1.05rem,4vw,1.2rem)] font-medium leading-snug text-[var(--kc-champagne)]">
              Your choice changes everything.
            </p>
            {userChoice ? (
              alignedWithRoom ? (
                <p className="text-pretty text-[clamp(0.95rem,3.8vw,1.08rem)] leading-relaxed text-[var(--kc-cream-dim)]">
                  You stood with Option {userChoice} — same path the room chose together.
                </p>
              ) : votedOtherPath ? (
                <p className="text-pretty text-[clamp(0.95rem,3.8vw,1.08rem)] leading-relaxed text-[var(--kc-cream-dim)]">
                  You backed Option {userChoice}; the house leaned another way — both threads mattered to the moment you
                  just lived.
                </p>
              ) : null
            ) : null}
          </div>
        </>
      )}
      <p className="mx-auto mt-10 max-w-[min(36ch,94vw)] text-[clamp(0.95rem,3.8vw,1.1rem)] leading-relaxed text-[var(--kc-cream-dim)]">
        When this beat ends, you’ll return to the lobby automatically — keep this page open.
      </p>
    </motion.section>
  );
}
