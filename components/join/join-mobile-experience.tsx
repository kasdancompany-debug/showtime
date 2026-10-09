"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { LiveDot, RedRule, ShowtimeSymbol, ShowtimeWordmark, StageBackdrop, type LiveDotStatus } from "@/components/brand";
import { JoinDebugFooter } from "@/components/join/join-debug-footer";
import { useJoinMobileVote } from "@/hooks/use-join-mobile-vote";
import type { JoinMobileTransport } from "@/hooks/use-join-mobile-vote";
import type { VoteChoice } from "@/types";
import { cn } from "@/lib/utils";

function liveDotStatus(transport: JoinMobileTransport, reconnecting: boolean): LiveDotStatus | null {
  if (transport === "na") return null;
  if (reconnecting || transport === "connecting") return "connecting";
  if (transport === "channel_error" || transport === "timed_out") return "down";
  if (transport === "subscribed") return "live";
  return null;
}

function liveDotLabel(status: LiveDotStatus): string {
  if (status === "live") return "Live";
  if (status === "connecting") return "Reconnecting…";
  return "Offline";
}

type Props = { eventCode: string };

const headline = "sh-display text-[clamp(1.9rem,8.6vw,3.1rem)]";
const questionDisplay = "sh-display text-[clamp(1.85rem,8.4vw,3.2rem)]";
const bodyReadout = "text-[clamp(1rem,3.9vw,1.3rem)] leading-snug text-[var(--sh-cream)]/90";
const finePrint = "text-[clamp(0.9rem,3.4vw,1.05rem)] leading-snug text-[var(--sh-cream-dim)]";
const fieldLabel = "sh-caption block !text-[0.7rem] !tracking-[0.24em]";
const errorText = "text-center text-[clamp(0.95rem,3.6vw,1.1rem)] font-medium text-[var(--sh-red-hot)]";

/** The audience ticket — a thin Golden Hour outline on black. */
function BallotShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "join-ballot-shell sh-ticket mx-auto flex w-full max-w-lg flex-col px-[clamp(1.25rem,6vw,2rem)] py-[clamp(1.5rem,4.5vh,2.25rem)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Every phone screen sits on the same quiet stage. */
function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "join-audience-root relative flex min-h-[100dvh] flex-col overflow-hidden bg-[var(--sh-black)] text-[var(--sh-cream)] selection:bg-[var(--sh-red)]/40",
        "[touch-action:manipulation]",
        className,
      )}
    >
      <StageBackdrop curtains={false} />
      <div className="relative z-10 flex min-h-[100dvh] flex-1 flex-col">{children}</div>
    </div>
  );
}

/** Time left on the open vote — display only; the server decides when the vote closes. */
function VoteClock({ endsAt }: { endsAt: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  const [span, setSpan] = useState({ key: endsAt ?? "", max: 0 });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const end = endsAt ? Date.parse(endsAt) : Number.NaN;
  const left = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : null;

  if (span.key !== (endsAt ?? "")) {
    setSpan({ key: endsAt ?? "", max: left ?? 0 });
  } else if (left != null && left > span.max) {
    setSpan({ key: span.key, max: left });
  }

  if (left == null) return null;
  const fraction = span.max > 0 ? Math.min(1, left / span.max) : 0;
  const urgent = left > 0 && left <= 3;

  return (
    <div className="shrink-0" role="timer" aria-label={`${left} seconds left to vote`}>
      <div className="h-[3px] w-full bg-[var(--sh-line)]">
        <div
          className="h-full origin-left bg-[var(--sh-red)] transition-[width] duration-300 ease-linear"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p className={cn("sh-caption mt-2 text-center", urgent && "!text-[var(--sh-red-hot)]")}>
        {left > 0 ? `Closes in ${left}s` : "Closing…"}
      </p>
    </div>
  );
}

/** A big, thumb-sized ballot button. A is Showtime Red, B is Reel Cream. */
function ChoiceButton({
  letter,
  label,
  disabled,
  onClick,
}: {
  letter: "A" | "B";
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const isA = letter === "A";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Vote ${letter}: ${label}`}
      className={cn(
        "group relative flex min-h-[min(30vh,13rem)] flex-col items-center justify-center gap-4 overflow-hidden rounded-[6px] px-5 py-8 text-center",
        "transition-[transform,box-shadow,opacity,filter] duration-200 active:translate-y-px active:brightness-95 sm:min-h-[min(36vh,18rem)]",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sh-cream)]",
        "disabled:pointer-events-none disabled:opacity-[0.38] disabled:saturate-50",
        isA
          ? "bg-[var(--sh-red)] text-[var(--sh-on-red)] shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_18px_44px_-18px_rgb(214_40_40/0.7)]"
          : "bg-[var(--sh-cream)] text-[var(--sh-black)] shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_18px_44px_-22px_rgb(247_241_230/0.4)]",
      )}
    >
      <span
        aria-hidden
        className="flex size-[clamp(2.75rem,12vw,3.5rem)] items-center justify-center rounded-full border-2 border-current font-heading text-[clamp(1.35rem,6vw,1.8rem)] font-black leading-none"
      >
        {letter}
      </span>
      <span className="max-w-[18ch] font-heading text-[clamp(1.4rem,5.8vw,2.1rem)] font-extrabold leading-[1.1] text-balance">
        {label}
      </span>
    </button>
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
  const [debugEnabled, setDebugEnabled] = useState(() => process.env.NODE_ENV !== "production");

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
    if (new URLSearchParams(window.location.search).get("debug") === "1") setDebugEnabled(true);
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

  const dotStatus = liveDotStatus(j.transport, j.reconnecting);

  const debugFooter = debugEnabled ? (
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
  ) : null;

  const disconnected = !online || j.reconnecting || j.transport === "channel_error" || j.transport === "timed_out";
  const showTransportBanner = j.supabaseConfigured && j.event && disconnected;

  const safePad =
    "px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]";

  if (!j.hydrated || !j.remoteReady) {
    return (
      <Stage>
        <div className={cn("flex flex-1 flex-col items-center justify-center gap-6", safePad)}>
          <ShowtimeWordmark className="text-[clamp(2.6rem,13vw,4rem)]" />
          <div className="kc-loading-theatre !min-h-0 w-full max-w-sm">
            <div className="kc-loading-theatre__bar" aria-hidden />
            <p className={cn(finePrint, "text-center")}>Opening your ballot…</p>
          </div>
        </div>
        {debugFooter}
      </Stage>
    );
  }

  if (!j.supabaseConfigured) {
    return (
      <Stage>
        <div className={cn("flex flex-1 flex-col items-center justify-center gap-6 text-center", safePad)}>
          <BallotShell className="gap-4 text-center">
            <p className={headline}>Live voting unavailable</p>
            <p className={bodyReadout}>This phone is not connected to the live show server.</p>
          </BallotShell>
          <Link href="/" className="sh-btn sh-btn--ghost min-h-14 px-10">
            Home
          </Link>
        </div>
        {debugFooter}
      </Stage>
    );
  }

  if (j.loadError && !j.event && j.remoteReady) {
    return (
      <Stage>
        <div className={cn("flex flex-1 flex-col items-center justify-center gap-6 text-center", safePad)}>
          <BallotShell className="gap-4 text-center">
            <p className={headline}>This code is not open</p>
            <p className={bodyReadout}>{j.loadError ?? "Unknown error."}</p>
          </BallotShell>
          <button type="button" className="sh-btn sh-btn--red min-h-14 px-10" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
        {debugFooter}
      </Stage>
    );
  }

  return (
    <Stage>
      {showTransportBanner ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "kc-showtime-banner shrink-0 text-center text-[clamp(0.95rem,3.5vw,1.1rem)] font-semibold leading-snug",
            !online ? "kc-showtime-banner--danger" : "kc-showtime-banner--warn",
          )}
        >
          {!online ? "You are offline — reconnect to stay in the vote." : "Connection interrupted — catching up with the room…"}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-[clamp(1rem,5vw,1.5rem)] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="shrink-0 pb-5 text-center">
          <Link
            href="/"
            className="inline-block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sh-cream)]"
            aria-label="Showtime home"
          >
            <ShowtimeWordmark compact className="text-[clamp(1.5rem,7.5vw,2.1rem)]" />
          </Link>
          <h1 className="sh-display mt-4 text-[clamp(1.25rem,5.6vw,1.9rem)]">{j.event?.title ?? "Live vote"}</h1>
          <div className="mt-3 flex items-center justify-center gap-3">
            <p className="font-mono text-[clamp(0.85rem,3.4vw,1rem)] tracking-[0.28em] text-[var(--sh-cream)]">
              {eventCode.toUpperCase()}
            </p>
            {dotStatus ? (
              <span className="flex items-center gap-1.5" role="status" aria-label={liveDotLabel(dotStatus)}>
                <LiveDot status={dotStatus} />
                <span className="sh-caption !text-[0.62rem]">{liveDotLabel(dotStatus)}</span>
              </span>
            ) : null}
          </div>
          <RedRule center className="mt-4" />
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
              <BallotShell className="gap-6 pt-9">
                <span className="sh-caption absolute left-1/2 top-4 -translate-x-1/2 !text-[0.6rem] !tracking-[0.34em] !text-[var(--sh-gold)]">
                  Admit one
                </span>
                <p className={cn(bodyReadout, "text-center")}>Once to enter the room — then your phone stays on this ballot.</p>
                <div className="space-y-2.5">
                  <label htmlFor="jm-name" className={fieldLabel}>
                    Your name <span className="text-[var(--sh-red-hot)]">*</span>
                  </label>
                  <input
                    id="jm-name"
                    className="sh-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Name as it should appear"
                  />
                </div>
                <div className="space-y-2.5">
                  <label htmlFor="jm-table" className={fieldLabel}>
                    Table or seat <span className="normal-case tracking-normal opacity-70">(optional)</span>
                  </label>
                  <input
                    id="jm-table"
                    className="sh-input"
                    value={table}
                    onChange={(e) => setTable(e.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>
                {j.joinError ? (
                  <p className={errorText} role="alert">
                    {j.joinError}
                  </p>
                ) : null}
                {localErr ? (
                  <p className={errorText} role="alert">
                    {localErr}
                  </p>
                ) : null}
              </BallotShell>
              <button
                type="button"
                disabled={joining || !name.trim()}
                className="sh-btn sh-btn--red mt-auto min-h-[min(4.25rem,18vw)] w-full !text-[clamp(0.85rem,3.4vw,1rem)]"
                onClick={() => void onJoin()}
              >
                {joining ? "Entering…" : "Enter the room"}
              </button>
            </div>
          ) : null}

          {j.uiPhase === "waiting" || j.uiPhase === "host_locked" ? (
            <BallotShell className="my-auto flex flex-1 flex-col justify-center gap-6 text-center">
              <p className={questionDisplay}>{j.uiPhase === "host_locked" ? "Waiting for the host" : "Stand by"}</p>
              <p className={bodyReadout}>
                {j.uiPhase === "host_locked"
                  ? "Voting is closed on your phone. Watch the screen — the host will reveal the audience choice."
                  : "You are in the room. The host will open the next ballot when it is time."}
              </p>
              <button
                type="button"
                className={cn(finePrint, "mx-auto font-medium underline decoration-[var(--sh-line-strong)] underline-offset-4")}
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
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
              {j.voteEligible ? (
                <p
                  className="sh-eyebrow inline-flex shrink-0 items-center justify-center gap-2.5 !text-[0.7rem] !text-[var(--sh-cream)]"
                  role="status"
                  aria-live="polite"
                  aria-label="Voting is open"
                >
                  <LiveDot status="live" />
                  Choose now
                </p>
              ) : null}
              <p className={cn(questionDisplay, "shrink-0 text-center")}>{j.voteNode?.question?.trim() ?? "—"}</p>
              {j.voteEligible ? <VoteClock endsAt={j.event?.vote_ends_at} /> : null}
              {!j.voteEligible && j.voteBlockReason ? (
                <p
                  className="shrink-0 rounded-[6px] border border-[var(--sh-red)]/50 bg-[var(--sh-red)]/12 px-4 py-3 text-center text-[clamp(0.95rem,3.3vw,1.1rem)] font-semibold leading-snug text-[var(--sh-cream)]"
                  role="alert"
                >
                  {j.voteBlockReason}
                </p>
              ) : null}
              {j.voteError && j.votePending ? (
                <p className={cn(errorText, "shrink-0 !text-[var(--sh-cream)]")} role="status" aria-live="polite">
                  {j.voteError}
                </p>
              ) : j.voteError ? (
                <p className={cn(errorText, "shrink-0")}>
                  {j.voteError}{" "}
                  <button type="button" className="text-[var(--sh-cream)] underline underline-offset-2" onClick={j.clearVoteError}>
                    Dismiss
                  </button>
                </p>
              ) : null}
              {dupHint ? <p className={cn(errorText, "shrink-0 !text-[var(--sh-cream)]")}>{dupHint}</p> : null}
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <ChoiceButton
                  letter="A"
                  label={j.voteNode?.option_a_label?.trim() ?? "Option A"}
                  disabled={j.voteSubmitting || !j.voteEligible}
                  onClick={() => void onVote("A")}
                />
                <ChoiceButton
                  letter="B"
                  label={j.voteNode?.option_b_label?.trim() ?? "Option B"}
                  disabled={j.voteSubmitting || !j.voteEligible}
                  onClick={() => void onVote("B")}
                />
              </div>
            </div>
          ) : null}

          {j.uiPhase === "vote_received" ? (
            <BallotShell className="my-auto flex flex-1 flex-col items-center justify-center gap-7 text-center">
              <ShowtimeSymbol className="sh-symbol-in size-[min(30vw,7.5rem)]" title="Vote received" />
              <p className={questionDisplay}>
                Ballot received<span className="sh-accent">.</span>
              </p>
              <p className={bodyReadout}>Your choice is on record. Watch the screen for the reveal.</p>
              {dupHint ? <p className={cn(finePrint, "font-semibold text-[var(--sh-cream)]")}>{dupHint}</p> : null}
            </BallotShell>
          ) : null}

          {j.uiPhase === "results" ? (
            <BallotShell className="my-auto flex flex-1 flex-col justify-center gap-6 text-center">
              <p className="sh-eyebrow !text-[0.75rem] !text-[var(--sh-red-hot)]">The house has chosen</p>
              <p className={questionDisplay}>{j.winnerLabel ?? (j.event?.winner ? `Option ${j.event.winner}` : "—")}</p>
              <p className={bodyReadout}>Stay on this page — the next ballot will open when the host is ready.</p>
            </BallotShell>
          ) : null}
        </main>
      </div>
      {debugFooter}
    </Stage>
  );
}
