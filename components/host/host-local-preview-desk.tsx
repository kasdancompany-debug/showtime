"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Monitor, Radio, Users } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useJoinBaseUrl } from "@/hooks/use-join-base-url";
import { useShowtimeConnection } from "@/hooks/use-showtime-connection";
import { useShowtimeHostDiagnostics } from "@/hooks/use-showtime-host-diagnostics";
import { getJoinUrl } from "@/lib/join/get-join-url";
import { MOCK_EVENT } from "@/lib/mock-data";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { selectVoteDisplayNode } from "@/lib/store/presentation";
import { getEffectiveWinner } from "@/lib/story-engine/engine";
import { cn } from "@/lib/utils";

/**
 * `/host` when Supabase env is absent — drives the mock story engine and BroadcastChannel vote sync.
 */
export function HostLocalPreviewDesk() {
  const { snapshot } = useShowtimeConnection();
  const diagnostics = useShowtimeHostDiagnostics();
  const joinBase = useJoinBaseUrl();

  const eventTitle = useMockEventStore((s) => s.eventTitle);
  const eventCode = useMockEventStore((s) => s.eventCode);
  const eventStarted = useMockEventStore((s) => s.eventStarted);
  const showEnded = useMockEventStore((s) => s.showEnded);
  const engine = useMockEventStore((s) => s.engine);
  const votePhase = useMockEventStore((s) => s.votePhase);
  const votesA = useMockEventStore((s) => s.votesA);
  const votesB = useMockEventStore((s) => s.votesB);
  const startEvent = useMockEventStore((s) => s.startEvent);
  const openVoteImmediate = useMockEventStore((s) => s.openVoteImmediate);
  const closeVote = useMockEventStore((s) => s.closeVote);
  const revealWinnerToRoom = useMockEventStore((s) => s.revealWinnerToRoom);
  const advanceToWinningBranch = useMockEventStore((s) => s.advanceToWinningBranch);
  const rehearsalResetToOpeningBeat = useMockEventStore((s) => s.rehearsalResetToOpeningBeat);
  const endShow = useMockEventStore((s) => s.endShow);

  const [copiedJoin, setCopiedJoin] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const joinUrl =
    joinBase.joinBaseUrl && eventCode ? getJoinUrl(eventCode, joinBase.joinBaseUrl) : "";
  const voteNode = useMemo(() => selectVoteDisplayNode(engine), [engine]);
  const revealed = votePhase === "reveal" ? getEffectiveWinner(engine) : null;

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
    if (!eventCode) return;
    try {
      await navigator.clipboard.writeText(eventCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      /* ignore */
    }
  }, [eventCode]);

  const screenOk = diagnostics.screenLikelyConnected;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--host-divider)] bg-[oklch(0.091_0.012_265)] px-3 py-2 md:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-[var(--kc-cream)] md:text-base">{eventTitle}</h1>
          <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--kc-cream-dim)] md:text-xs">
            <span className="font-semibold text-[oklch(0.88_0.06_82)]">{eventCode}</span>
            <span className="text-[var(--kc-cream-dim)]"> · rehearsal</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] md:text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 ring-1",
              screenOk ? "bg-emerald-950/40 text-emerald-100 ring-emerald-500/25" : "bg-white/5 text-[var(--kc-cream-dim)] ring-white/10",
            )}
          >
            <Monitor className="size-3 shrink-0 opacity-90" aria-hidden />
            {screenOk ? "Screen tab open" : "Open /screen tab"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-[oklch(1_0_0/0.05)] px-2 py-1 ring-1 ring-white/10">
            <Users className="size-3 opacity-80" aria-hidden />
            <span className="font-semibold tabular-nums text-[var(--kc-cream)]">{votesA + votesB}</span>
            <span className="text-[var(--kc-cream-dim)]">votes</span>
          </span>
          <span className="inline-flex max-w-[11rem] items-center gap-1 truncate rounded-md bg-amber-950/35 px-2 py-1 text-amber-100/95 ring-1 ring-amber-500/25">
            <Radio className="size-3 shrink-0 opacity-90" aria-hidden />
            <span className="truncate">{snapshot.badgeLabel}</span>
          </span>
        </div>
        <Link
          href="/screen"
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "shrink-0 rounded-lg border-white/15 text-[var(--kc-cream)]",
          )}
        >
          Open /screen
        </Link>
      </header>

      <div className="shrink-0 space-y-1 border-b border-white/10 bg-[oklch(0.14_0.02_265)] px-3 py-2 text-[11px] leading-snug text-[oklch(0.9_0.02_95)] md:text-xs">
        <p>
          <span className="font-semibold text-amber-100/95">{snapshot.badgeLabel}</span>
          {" — "}
          Tabs on this computer share vote state via BroadcastChannel. Add Supabase env vars for phones and other devices.
        </p>
        {snapshot.blockingIssues.length ? (
          <ul className="list-inside list-disc space-y-1 text-amber-50/95">
            {snapshot.blockingIssues.map((i) => (
              <li key={i.id}>
                <span className="font-medium">{i.title}.</span> {i.nextStep}
              </li>
            ))}
          </ul>
        ) : null}
        {snapshot.warnings.length ? (
          <ul className="list-inside list-disc space-y-1 text-[oklch(0.88_0.02_95)]">
            {snapshot.warnings.map((i) => (
              <li key={i.id}>
                <span className="font-medium">{i.title}.</span> {i.nextStep}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-2 lg:gap-3 lg:p-3">
        <Card
          size="sm"
          className="flex min-h-0 flex-col gap-2 overflow-hidden border-white/10 bg-[oklch(0.1_0.012_265)] py-3 shadow-none"
        >
          <CardHeader className="shrink-0 space-y-0.5 px-3 pb-0 pt-0">
            <CardTitle className="text-sm font-semibold text-[var(--kc-cream)]">Rehearsal controls</CardTitle>
            <CardDescription className="text-[10px] text-[var(--kc-cream-dim)]">
              Same flow as live shows — without a database.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-3 pb-2 pt-0">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="rounded-lg" onClick={() => startEvent()} disabled={eventStarted}>
                Start event
              </Button>
              <Button type="button" size="sm" variant="secondary" className="rounded-lg" onClick={() => openVoteImmediate()} disabled={!eventStarted || showEnded}>
                Open vote
              </Button>
              <Button type="button" size="sm" variant="secondary" className="rounded-lg" onClick={() => closeVote()} disabled={votePhase !== "open"}>
                Close vote
              </Button>
              <Button type="button" size="sm" variant="secondary" className="rounded-lg" onClick={() => revealWinnerToRoom()} disabled={votePhase !== "closed"}>
                Reveal
              </Button>
              <Button type="button" size="sm" variant="secondary" className="rounded-lg" onClick={() => advanceToWinningBranch()} disabled={votePhase !== "reveal" || !revealed}>
                Advance
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-2">
              <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => rehearsalResetToOpeningBeat()}>
                Reset to opening
              </Button>
              <Button type="button" size="sm" variant="destructive" className="rounded-lg" onClick={() => endShow()} disabled={showEnded}>
                End show
              </Button>
            </div>
            {voteNode?.question ? (
              <p className="text-xs leading-relaxed text-[oklch(0.9_0.02_95)]">
                <span className="font-semibold text-amber-200/90">Active question:</span> {voteNode.question}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg border border-rose-500/25 bg-rose-950/25 p-2">
                <p className="text-[10px] uppercase tracking-wide text-rose-200/80">A</p>
                <p className="text-xl font-bold tabular-nums text-white">{votesA}</p>
              </div>
              <div className="rounded-lg border border-sky-500/25 bg-sky-950/25 p-2">
                <p className="text-[10px] uppercase tracking-wide text-sky-200/80">B</p>
                <p className="text-xl font-bold tabular-nums text-white">{votesB}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          size="sm"
          className="flex min-h-0 flex-col gap-2 border-white/10 bg-[oklch(0.1_0.012_265)] py-3 shadow-none"
        >
          <CardHeader className="shrink-0 space-y-0.5 px-3 pb-0 pt-0">
            <CardTitle className="text-sm font-semibold text-[var(--kc-cream)]">Audience join</CardTitle>
            <CardDescription className="text-[10px] text-[var(--kc-cream-dim)]">
              Open <span className="font-mono">/join/{MOCK_EVENT.eventCode}</span> in another tab (same browser).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-3 pb-2 pt-0">
            {joinUrl ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => void copyJoin()}>
                  <Copy className="mr-1 size-3" aria-hidden />
                  {copiedJoin ? "Copied" : "Copy join URL"}
                </Button>
                <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => void copyCode()}>
                  <Copy className="mr-1 size-3" aria-hidden />
                  {copiedCode ? "Copied" : "Copy code"}
                </Button>
              </div>
            ) : null}
            <p className="break-all font-mono text-[10px] text-[oklch(0.88_0.02_95)]">{joinUrl || "Join URL unavailable"}</p>
            <Link
              href={`/join/${MOCK_EVENT.eventCode}`}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "host-primary-cta w-fit rounded-lg border-0")}
            >
              Open /join in new tab
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
