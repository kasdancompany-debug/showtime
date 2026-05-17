"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Loader2, RefreshCw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { useJoinBaseUrl } from "@/hooks/use-join-base-url";
import { useScreenPresenceFromSync } from "@/hooks/use-screen-presence-from-sync";
import { NIGHT1_EVENT_CODE } from "@/lib/showtime/night1-demo-graph";
import { rowsToEditorNodes, validateBranchStory } from "@/lib/showtime/branch-story-validate";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchVoteTalliesForNode,
  getEventByCode,
  listStoryNodesForEvent,
  type EventRow,
  type StoryNodeRow,
} from "@/lib/supabase/event-room";
import { resetNight1DemoData } from "@/lib/supabase/seed-night1-demo";
type CheckState = "pending" | "pass" | "manual";

function CheckRow({
  step,
  title,
  detail,
  state,
}: {
  step: number;
  title: string;
  detail: string;
  state: CheckState;
}) {
  const icon =
    state === "pass" ? (
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
    ) : state === "manual" ? (
      <Circle className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
    ) : (
      <Circle className="text-muted-foreground/50 mt-0.5 size-5 shrink-0" aria-hidden />
    );
  return (
    <li className="flex gap-3 border-b border-border/60 py-3 last:border-0">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          <span className="text-muted-foreground mr-2 font-mono text-sm">{step}.</span>
          {title}
        </p>
        <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">{detail}</p>
      </div>
    </li>
  );
}

export default function TestRunPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const join = useJoinBaseUrl();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [nodes, setNodes] = useState<StoryNodeRow[]>([]);
  const [tallies, setTallies] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionOk, setSessionOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [peakVoteTotal, setPeakVoteTotal] = useState(0);

  const { screenLikelyConnected } = useScreenPresenceFromSync(event?.id);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const currentBeat = event?.current_node_id ? nodesById.get(event.current_node_id) ?? null : null;
  const voteBeat =
    event && ["voting_open", "voting_closed", "winner_revealed"].includes(event.status) && event.current_node_id
      ? (nodesById.get(event.current_node_id) ?? null)
      : null;

  const load = useCallback(async () => {
    if (!supabase) {
      setLoadError("Supabase env not configured.");
      setEvent(null);
      setNodes([]);
      setSessionOk(false);
      return;
    }
    setLoadError(null);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      setSessionOk(anon.ok);
      if (!anon.ok) {
        setLoadError(anon.message);
      }
    } catch {
      setSessionOk(false);
    }
    try {
      const ev = await getEventByCode(supabase, NIGHT1_EVENT_CODE);
      if (!ev) {
        setEvent(null);
        setNodes([]);
        setLoadError(
          `No event with code ${NIGHT1_EVENT_CODE}. Apply migrations (includes seed) or use Reset with SUPABASE_SERVICE_ROLE_KEY.`,
        );
        return;
      }
      const list = await listStoryNodesForEvent(supabase, ev.id);
      setEvent(ev);
      setNodes(list);
      if (ev.current_node_id && ev.status === "voting_open") {
        const t = await fetchVoteTalliesForNode(supabase, ev.id, ev.current_node_id);
        setTallies(t);
      } else {
        setTallies({ a: 0, b: 0 });
      }
    } catch (e) {
      setEvent(null);
      setNodes([]);
      setLoadError(e instanceof Error ? e.message : "Load failed");
    }
  }, [supabase]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!supabase || !event?.id) return;
    const ch = supabase
      .channel(`test-run-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `id=eq.${event.id}` },
        (payload) => {
          const row = payload.new as EventRow;
          if (row?.id) setEvent(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `event_id=eq.${event.id}` },
        () => {
          void (async () => {
            const ev = await getEventByCode(supabase, NIGHT1_EVENT_CODE);
            if (ev?.current_node_id && ev.status === "voting_open") {
              const t = await fetchVoteTalliesForNode(supabase, ev.id, ev.current_node_id);
              setTallies(t);
            }
          })();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, event?.id]);

  useEffect(() => {
    if (!supabase || !event?.id || event.status !== "voting_open") {
      return;
    }
    const nodeId = event.current_node_id;
    if (!nodeId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const t = await fetchVoteTalliesForNode(supabase, event.id, nodeId);
        if (!cancelled) setTallies(t);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [supabase, event?.id, event?.current_node_id, event?.status]);

  const graphValid = useMemo(
    () => (nodes.length ? validateBranchStory(rowsToEditorNodes(nodes)).ok : false),
    [nodes],
  );

  const joinUrl = join.joinBaseUrl ? `${join.joinBaseUrl}/join/${NIGHT1_EVENT_CODE}` : "";

  const tallyTotal = tallies.a + tallies.b;
  useEffect(() => {
    setPeakVoteTotal((p) => Math.max(p, tallyTotal));
  }, [tallyTotal]);

  const checks: { step: number; title: string; detail: string; state: CheckState }[] = [
    {
      step: 1,
      title: "Event exists",
      detail: `Supabase row for code ${NIGHT1_EVENT_CODE} (seed migration or reset).`,
      state: event ? "pass" : "pending",
    },
    {
      step: 2,
      title: "Supabase connected",
      detail: "Browser client configured and anonymous session established.",
      state: supabase && sessionOk && !loadError?.includes("env") ? "pass" : "pending",
    },
    {
      step: 3,
      title: "Join URL works",
      detail: joinUrl
        ? `Open ${joinUrl} on a phone (same Wi‑Fi / tunnel).${join.loopbackJoinWarning ? " Warning: join origin looks like localhost — phones may not reach it." : ""}`
        : "Resolve NEXT_PUBLIC_JOIN_ORIGIN or open from a non-localhost host.",
      state: joinUrl && !join.loopbackJoinWarning ? "pass" : joinUrl ? "manual" : "pending",
    },
    {
      step: 4,
      title: "Screen is listening",
      detail: "Open /screen with the same event; heartbeats should arrive within ~12s.",
      state: screenLikelyConnected ? "pass" : event ? "manual" : "pending",
    },
    {
      step: 5,
      title: "Host can open vote",
      detail: "On /host with NIGHT1 loaded: start event if needed, then open a vote.",
      state: event?.status === "voting_open" ? "pass" : "manual",
    },
    {
      step: 6,
      title: "Phone can vote",
      detail: "From /join/NIGHT1, submit Option A or B while the poll is open.",
      state: peakVoteTotal > 0 ? "pass" : "manual",
    },
    {
      step: 7,
      title: "Votes tally",
      detail: "Tallies on /host and /screen should move with each vote.",
      state: peakVoteTotal > 0 ? "pass" : "manual",
    },
    {
      step: 8,
      title: "Winner reveals",
      detail: "Close vote, then reveal winner on /host.",
      state: event?.status === "winner_revealed" || event?.winner ? "pass" : "manual",
    },
    {
      step: 9,
      title: "Host advances branch",
      detail: "Advance to the winning next beat; current node should leave the opening key.",
      state: currentBeat && currentBeat.node_key !== "01_OPENING" ? "pass" : "manual",
    },
    {
      step: 10,
      title: "Next clip instruction updates",
      detail: "On /host, Live status should show the current beat’s resolved video URL or reel label after you advance.",
      state:
        currentBeat && currentBeat.node_key !== "01_OPENING" && currentBeat.video_url?.trim()
          ? "pass"
          : "manual",
    },
  ];

  const handleReset = async () => {
    setBusy(true);
    setResetMessage(null);
    setPeakVoteTotal(0);
    let done = false;
    try {
      if (process.env.NODE_ENV === "development") {
        const res = await fetch("/api/dev/seed-night1", { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.ok) {
          setResetMessage("Reset complete (service role).");
          await loadRef.current();
          done = true;
        } else if (res.status !== 503 && res.status !== 403) {
          setResetMessage(body.error ?? `HTTP ${res.status}`);
        }
      }
      if (!done && supabase) {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) {
          setResetMessage(anon.message);
        } else {
          await resetNight1DemoData(supabase);
          setResetMessage((m) => m ?? "Reset complete (browser session).");
          await loadRef.current();
        }
      }
    } catch (e) {
      setResetMessage(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">E2E test run</h1>
          <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Home
          </Link>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Live checklist for <span className="font-mono">{NIGHT1_EVENT_CODE}</span>. Keep this tab open while you drive{" "}
          <Link href="/host" className="text-primary underline-offset-2 hover:underline">
            /host
          </Link>
          ,{" "}
          <Link href="/screen" className="text-primary underline-offset-2 hover:underline">
            /screen
          </Link>
          , and a phone on{" "}
          <span className="font-mono">
            /join/{NIGHT1_EVENT_CODE}
          </span>
          .
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">NIGHT1 demo reset</CardTitle>
          <CardDescription>
            Applies the canonical five-beat graph (three votes, two endings), clears votes and audience, and returns the
            room to <span className="font-mono">setup</span> at the opening beat.
            {process.env.NODE_ENV === "development" ? (
              <>
                {" "}
                In development, reset tries the service-role API first (set{" "}
                <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> in <span className="font-mono">.env.local</span>
                ), then falls back to your signed-in browser session.
              </>
            ) : (
              <> Uses your Supabase session only.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleReset} disabled={busy || !supabase}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span className="ml-2">Reset NIGHT1 to demo data</span>
          </Button>
          {resetMessage ? <p className="text-muted-foreground text-sm">{resetMessage}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live status</CardTitle>
          <CardDescription>Refreshes from Supabase Realtime and short polling.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!supabase ? (
            <p className="text-destructive">Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.</p>
          ) : loadError ? (
            <p className="text-destructive">{loadError}</p>
          ) : (
            <>
              <p>
                <span className="text-muted-foreground">Event status:</span>{" "}
                <span className="font-mono">{event?.status ?? "—"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Current beat:</span>{" "}
                <span className="font-mono">{currentBeat?.node_key ?? "—"}</span>
                {currentBeat?.video_url?.trim() ? (
                  <>
                    {" "}
                    <span className="text-muted-foreground">→</span>{" "}
                    <span className="font-mono break-all">{currentBeat.video_url.trim()}</span>
                  </>
                ) : null}
              </p>
              <p>
                <span className="text-muted-foreground">Active vote node:</span>{" "}
                <span className="font-mono">{voteBeat?.node_key ?? "—"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Tallies (live poll):</span> A={tallies.a} · B={tallies.b}
              </p>
              <p>
                <span className="text-muted-foreground">Story graph validation:</span>{" "}
                <span className={graphValid ? "text-emerald-600" : "text-amber-700"}>
                  {graphValid ? "OK" : "Fix graph in Show builder"}
                </span>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist</CardTitle>
          <CardDescription>
            Green checks update automatically where possible; follow the steps for operator and audience actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {checks.map((c) => (
              <CheckRow key={c.step} {...c} />
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-center text-xs">
        <Link href="/admin/story" className="underline-offset-2 hover:underline">
          Open Show builder
        </Link>
      </p>
    </div>
  );
}
