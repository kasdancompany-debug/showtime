"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JoinDebugFooter } from "@/components/join/join-debug-footer";
import { useJoinMobileVote } from "@/hooks/use-join-mobile-vote";
import type { VoteChoice } from "@/types";
import { cn } from "@/lib/utils";

type Props = { eventCode: string };

const goldTitle = "font-heading text-[clamp(1.35rem,5vw,2.25rem)] font-normal leading-tight tracking-tight text-[var(--kc-gold-bright)]";
const questionDisplay =
  "font-heading text-[clamp(1.5rem,6.2vw,2.75rem)] font-normal leading-[1.12] tracking-tight text-[var(--kc-cream)] text-balance";
const bodyReadout =
  "text-[clamp(1rem,3.8vw,1.35rem)] font-medium leading-snug text-[color-mix(in_oklch,var(--kc-cream)_88%,transparent)]";
const finePrint = "text-[clamp(0.95rem,3.2vw,1.1rem)] leading-snug text-[color-mix(in_oklch,var(--kc-champagne)_92%,transparent)]";

function GoldHairline({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-px w-full max-w-xs bg-gradient-to-r from-transparent via-[var(--kc-gold-line)] to-transparent", className)}
      aria-hidden
    />
  );
}

function BallotShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "join-ballot-shell kc-palace-corners relative mx-auto flex w-full max-w-lg flex-col rounded-sm border border-[color-mix(in_oklch,var(--kc-gold)_22%,transparent)] bg-[color-mix(in_oklch,black_92%,var(--kc-piano))] px-[clamp(1rem,5vw,1.75rem)] py-[clamp(1.25rem,4vh,2rem)] shadow-[inset_0_1px_0_color-mix(in_oklch,var(--kc-gold-bright)_08%,transparent)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function JoinMobileExperience({ eventCode }: Props) {
  const j = useJoinMobileVote(eventCode);
  const [name, setName] = useState(() => j.persist?.displayName?.trim() ?? "");
  const [table, setTable] = useState(() => j.persist?.tableNumber?.trim() ?? "");
  const [joining, setJoining] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [dupHint, setDupHint] = useState<string | null>(null);
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

  useEffect(() => {
    if (!j.hydrated || !j.persist) return;
    if (j.persist.displayName?.trim()) setName((n) => (n.trim() ? n : j.persist!.displayName!.trim()));
    if (j.persist.tableNumber?.trim()) setTable((t) => (t.trim() ? t : j.persist!.tableNumber!.trim()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.hydrated, j.persist?.displayName, j.persist?.tableNumber]);

  async function onJoin() {
    setLocalErr(null);
    setJoining(true);
    try {
      await j.joinRoom(name, table);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Could not join");
    } finally {
      setJoining(false);
    }
  }

  async function onVote(c: VoteChoice) {
    setDupHint(null);
    setLocalErr(null);
    const r = await j.castVote(c);
    if (r === "duplicate") setDupHint("You already cast a ballot for this question.");
  }

  const debugFooter = (
    <JoinDebugFooter
      roomCode={eventCode}
      role="audience"
      participantId={j.participantId}
      audienceMemberId={j.audienceMemberId}
      registrationStatus={j.registrationStatus}
      transport={j.transport}
      voteEligible={j.voteEligible}
      voteBlockReason={j.voteBlockReason}
      joined={Boolean(j.persist?.joined)}
    />
  );

  const disconnected = !online || j.reconnecting || j.transport === "channel_error" || j.transport === "timed_out";
  const showTransportBanner = j.supabaseConfigured && j.event && disconnected;

  if (!j.hydrated || !j.remoteReady) {
    return (
      <div className="join-audience-root flex min-h-[100dvh] flex-col bg-black text-[var(--kc-cream)]">
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="kc-loading-theatre w-full max-w-sm">
            <div className="kc-gold-rule w-full max-w-[10rem] opacity-90" aria-hidden />
            <div className="kc-loading-theatre__bar" aria-hidden />
            <p className={cn(finePrint, "text-center")}>Opening your ballot…</p>
            <div className="kc-gold-rule w-full max-w-[10rem] opacity-90" aria-hidden />
          </div>
        </div>
        {debugFooter}
      </div>
    );
  }

  if (!j.supabaseConfigured) {
    return (
      <div className="join-audience-root flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-black px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-center text-[var(--kc-cream)]">
        <BallotShell className="gap-4">
          <p className={cn(goldTitle, "text-[color-mix(in_oklch,var(--kc-velvet)_45%,var(--kc-gold-bright))]")}>Live voting unavailable</p>
          <p className={bodyReadout}>This phone is not connected to the live show server.</p>
        </BallotShell>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "min-h-14 rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_35%,transparent)] px-10 text-lg text-[var(--kc-cream)]",
          )}
        >
          Home
        </Link>
        {debugFooter}
      </div>
    );
  }

  if (j.loadError && !j.event && j.remoteReady) {
    return (
      <div className="join-audience-root flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-black px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-center text-[var(--kc-cream)]">
        <BallotShell className="gap-4">
          <p className={cn(goldTitle, "text-[color-mix(in_oklch,var(--kc-velvet)_40%,var(--kc-gold-bright))]")}>This code is not open</p>
          <p className={bodyReadout}>{j.loadError ?? "Unknown error."}</p>
        </BallotShell>
        <Button
          type="button"
          className="min-h-14 rounded-lg border border-[color-mix(in_oklch,var(--kc-gold)_40%,transparent)] bg-[color-mix(in_oklch,var(--kc-gold-bright)_12%,black)] px-10 text-lg font-semibold text-[var(--kc-cream)] hover:bg-[color-mix(in_oklch,var(--kc-gold-bright)_18%,black)]"
          onClick={() => window.location.reload()}
        >
          Try again
        </Button>
        {debugFooter}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "join-audience-root flex min-h-[100dvh] flex-col overflow-hidden bg-black text-[var(--kc-cream)] selection:bg-[color-mix(in_oklch,var(--kc-gold-bright)_22%,transparent)]",
        "[touch-action:manipulation]",
      )}
    >
      {showTransportBanner ? (
        <div
          role="status"
          className={cn(
            "kc-showtime-banner shrink-0 text-center text-[clamp(0.95rem,3.5vw,1.1rem)] font-semibold leading-snug",
            !online ? "kc-showtime-banner--danger" : "kc-showtime-banner--warn",
          )}
        >
          {!online ? "You are offline — reconnect to stay in the vote." : "Connection interrupted — catching up with the room…"}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-[clamp(1rem,5vw,1.5rem)] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <header className="shrink-0 space-y-3 pb-5">
          <GoldHairline />
          <Link
            href="/"
            className="block text-center text-[clamp(0.75rem,2.8vw,0.85rem)] font-semibold uppercase tracking-[0.32em] text-[var(--kc-champagne)] no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--kc-gold-line)_70%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label="Showtime home"
          >
            Kasdan Co. · ballot
          </Link>
          <h1 className={cn(goldTitle, "text-center")}>{j.event?.title ?? "Live vote"}</h1>
          <p className="text-center font-mono text-[clamp(1rem,3.5vw,1.2rem)] tracking-[0.22em] text-[color-mix(in_oklch,var(--kc-gold-bright)_85%,var(--kc-champagne))]">
            {eventCode.toUpperCase()}
          </p>
          <GoldHairline />
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {j.uiPhase === "lobby_closed" ? (
            <BallotShell className="my-auto flex flex-1 flex-col justify-center gap-5 text-center">
              <p className={questionDisplay}>
                {j.event?.status === "ended" ? "This screening has ended." : "The house is not taking ballots yet."}
              </p>
              <p className={bodyReadout}>Ask the host, then refresh this page.</p>
            </BallotShell>
          ) : null}

          {j.uiPhase === "form" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-6">
              <BallotShell className="gap-5">
                <p className={cn(bodyReadout, "text-center")}>Once to enter the room — then your phone stays on this ballot.</p>
                <div className="space-y-3">
                  <Label htmlFor="jm-name" className={cn(finePrint, "font-semibold text-[var(--kc-champagne)]")}>
                    Your name <span className="text-[color-mix(in_oklch,var(--kc-velvet)_55%,var(--kc-gold-bright))]">*</span>
                  </Label>
                  <Input
                    id="jm-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    className="min-h-14 rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_25%,transparent)] bg-black/60 text-[clamp(1.05rem,4vw,1.25rem)] text-[var(--kc-cream)] placeholder:text-[var(--kc-cream-dim)]"
                    placeholder="Name as it should appear"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="jm-table" className={cn(finePrint, "font-semibold text-[var(--kc-champagne)]")}>
                    Table or seat <span className="font-normal text-[var(--kc-cream-dim)]">(optional)</span>
                  </Label>
                  <Input
                    id="jm-table"
                    value={table}
                    onChange={(e) => setTable(e.target.value)}
                    className="min-h-14 rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_25%,transparent)] bg-black/60 text-[clamp(1.05rem,4vw,1.25rem)] text-[var(--kc-cream)] placeholder:text-[var(--kc-cream-dim)]"
                    placeholder="e.g. 12"
                  />
                </div>
                {j.joinError ? (
                  <p className="text-center text-[clamp(1rem,3.5vw,1.15rem)] font-medium text-[color-mix(in_oklch,var(--kc-velvet)_35%,var(--kc-cream))]">
                    {j.joinError}
                  </p>
                ) : null}
                {localErr ? (
                  <p className="text-center text-[clamp(1rem,3.5vw,1.15rem)] font-medium text-[color-mix(in_oklch,var(--kc-velvet)_35%,var(--kc-cream))]">
                    {localErr}
                  </p>
                ) : null}
              </BallotShell>
              <Button
                type="button"
                disabled={joining || !name.trim()}
                className="mt-auto min-h-[min(4.25rem,18vw)] w-full rounded-lg border border-[color-mix(in_oklch,var(--kc-gold-bright)_45%,transparent)] bg-[color-mix(in_oklch,var(--kc-gold-bright)_14%,black)] py-6 text-[clamp(1.15rem,4.2vw,1.4rem)] font-bold tracking-wide text-[var(--kc-gold-bright)] transition-[filter,opacity,transform] duration-200 hover:bg-[color-mix(in_oklch,var(--kc-gold-bright)_18%,black)] active:translate-y-px disabled:pointer-events-none disabled:opacity-[0.38] disabled:saturate-50"
                onClick={() => void onJoin()}
              >
                {joining ? "Entering…" : "Enter the room"}
              </Button>
            </div>
          ) : null}

          {j.uiPhase === "waiting" || j.uiPhase === "host_locked" ? (
            <BallotShell className="my-auto flex flex-1 flex-col justify-center gap-6 text-center">
              <p className={questionDisplay}>
                {j.uiPhase === "host_locked" ? "Waiting for the host" : "Stand by"}
              </p>
              <p className={bodyReadout}>
                {j.uiPhase === "host_locked"
                  ? "Voting is closed on your phone. Watch the screen — the host will reveal the audience choice."
                  : "You are in the room. The host will open the next ballot when it is time."}
              </p>
              <button
                type="button"
                className={cn(finePrint, "mx-auto font-semibold text-[var(--kc-cream-dim)] underline decoration-[var(--kc-gold-line)] underline-offset-4")}
                onClick={() => {
                  j.leaveRoom();
                  setName("");
                  setTable("");
                }}
              >
                Leave this room
              </button>
            </BallotShell>
          ) : null}

          {j.uiPhase === "voting" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
              <p className={cn(questionDisplay, "shrink-0 text-center")}>{j.voteNode?.question?.trim() ?? "—"}</p>
              {!j.voteEligible && j.voteBlockReason ? (
                <p
                  className="shrink-0 rounded-md border border-[color-mix(in_oklch,var(--kc-velvet)_40%,transparent)] bg-[color-mix(in_oklch,var(--kc-velvet)_12%,black)] px-4 py-3 text-center text-[clamp(0.95rem,3.2vw,1.1rem)] font-semibold leading-snug text-[var(--kc-cream)]"
                  role="alert"
                >
                  {j.voteBlockReason}
                </p>
              ) : null}
              {j.voteError ? (
                <p className="shrink-0 text-center text-[clamp(1rem,3.5vw,1.15rem)] font-semibold text-[color-mix(in_oklch,var(--kc-velvet)_40%,var(--kc-cream))]">
                  {j.voteError}{" "}
                  <button type="button" className="text-[var(--kc-gold-bright)] underline underline-offset-2" onClick={j.clearVoteError}>
                    Dismiss
                  </button>
                </p>
              ) : null}
              {dupHint ? (
                <p className="shrink-0 text-center text-[clamp(1rem,3.5vw,1.15rem)] font-medium text-[var(--kc-gold-bright)]">{dupHint}</p>
              ) : null}
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <button
                  type="button"
                  disabled={j.voteSubmitting || !j.voteEligible}
                  className={cn(
                    "flex min-h-[min(30vh,13rem)] flex-col items-center justify-center gap-4 rounded-lg border-2 border-[color-mix(in_oklch,var(--kc-velvet)_55%,var(--kc-gold)_35%)] bg-black/55 px-4 py-8 text-center shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--kc-gold-bright)_12%,transparent)] transition-[border-color,box-shadow,background-color,transform] duration-200 hover:border-[color-mix(in_oklch,var(--kc-velvet)_70%,var(--kc-gold-bright)_40%)] hover:bg-black/65 active:translate-y-px active:bg-[color-mix(in_oklch,var(--kc-velvet)_08%,black)] disabled:pointer-events-none disabled:opacity-[0.38] disabled:saturate-50 sm:min-h-[min(36vh,18rem)]",
                  )}
                  onClick={() => void onVote("A")}
                >
                  <span className="text-[clamp(0.85rem,3vw,1rem)] font-bold uppercase tracking-[0.28em] text-[color-mix(in_oklch,var(--kc-velvet)_55%,var(--kc-gold-bright))]">
                    Option A
                  </span>
                  <span className="max-w-[18ch] text-[clamp(1.35rem,5.5vw,2.1rem)] font-semibold leading-tight text-[var(--kc-cream)] text-balance">
                    {j.voteNode?.option_a_label?.trim() ?? "Option A"}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={j.voteSubmitting || !j.voteEligible}
                  className={cn(
                    "flex min-h-[min(30vh,13rem)] flex-col items-center justify-center gap-4 rounded-lg border-2 border-[color-mix(in_oklch,var(--kc-gold-bright)_55%,transparent)] bg-black/55 px-4 py-8 text-center shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--kc-gold-bright)_15%,transparent)] transition-[border-color,box-shadow,background-color,transform] duration-200 hover:border-[color-mix(in_oklch,var(--kc-gold-bright)_75%,transparent)] hover:bg-black/65 active:translate-y-px active:bg-[color-mix(in_oklch,var(--kc-gold-bright)_08%,black)] disabled:pointer-events-none disabled:opacity-[0.38] disabled:saturate-50 sm:min-h-[min(36vh,18rem)]",
                  )}
                  onClick={() => void onVote("B")}
                >
                  <span className="text-[clamp(0.85rem,3vw,1rem)] font-bold uppercase tracking-[0.28em] text-[var(--kc-gold-bright)]">
                    Option B
                  </span>
                  <span className="max-w-[18ch] text-[clamp(1.35rem,5.5vw,2.1rem)] font-semibold leading-tight text-[var(--kc-cream)] text-balance">
                    {j.voteNode?.option_b_label?.trim() ?? "Option B"}
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          {j.uiPhase === "vote_received" ? (
            <BallotShell className="my-auto flex flex-1 flex-col justify-center gap-8 text-center">
              <div className="mx-auto flex size-[min(22vw,5.5rem)] items-center justify-center rounded-full border-2 border-[var(--kc-gold-bright)] text-[clamp(2.5rem,12vw,4rem)] text-[var(--kc-gold-bright)]">
                ✓
              </div>
              <p className={cn(questionDisplay, "text-[var(--kc-gold-bright)]")}>Ballot received</p>
              <p className={bodyReadout}>Your choice is on record. Watch the screen for the reveal.</p>
              {dupHint ? <p className={cn(finePrint, "font-semibold text-[color-mix(in_oklch,var(--kc-velvet)_35%,var(--kc-gold-bright))]")}>{dupHint}</p> : null}
            </BallotShell>
          ) : null}

          {j.uiPhase === "results" ? (
            <BallotShell className="my-auto flex flex-1 flex-col justify-center gap-6 text-center">
              <p className="text-[clamp(0.85rem,3vw,1rem)] font-bold uppercase tracking-[0.3em] text-[var(--kc-gold-bright)]">The house has chosen</p>
              <p className={cn(questionDisplay, "text-[var(--kc-cream)]")}>
                {j.winnerLabel ?? (j.event?.winner ? `Option ${j.event.winner}` : "—")}
              </p>
              <p className={bodyReadout}>Stay on this page — the next ballot will open when the host is ready.</p>
            </BallotShell>
          ) : null}
        </main>
      </div>
      {debugFooter}
    </div>
  );
}
