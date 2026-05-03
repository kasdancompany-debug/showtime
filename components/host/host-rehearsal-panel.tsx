"use client";

import { useCallback, useMemo } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Download,
  FlaskConical,
  MonitorPlay,
  Radio,
  RefreshCw,
  ScanLine,
  Shuffle,
  Users,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createDemoBranchingStoryGraph } from "@/lib/showtime/demo-branching-graph";
import {
  buildShowtimeEventReportPayload,
  formatShowtimeEventReportText,
} from "@/lib/showtime/event-report";
import { LOOPBACK_WARNING } from "@/lib/join/get-join-url";
import { getShowtimeSyncMode } from "@/lib/showtime/sync-mode";
import { getNode, validateGraph } from "@/lib/story-engine/graph";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { useShowtimeHostDiagnostics } from "@/hooks/use-showtime-host-diagnostics";
import { cn } from "@/lib/utils";

export function HostRehearsalPanel({ embedInDesk = false }: { embedInDesk?: boolean }) {
  const diagnostics = useShowtimeHostDiagnostics();
  const syncMode = useMemo(() => getShowtimeSyncMode(), []);

  const graph = useMockEventStore((s) => s.graph);
  const eventTitle = useMockEventStore((s) => s.eventTitle);
  const eventCode = useMockEventStore((s) => s.eventCode);
  const audienceConnected = useMockEventStore((s) => s.audienceConnected);
  const dryRunMode = useMockEventStore((s) => s.dryRunMode);
  const reportSegments = useMockEventStore((s) => s.reportSegments);
  const engine = useMockEventStore((s) => s.engine);
  const currentNodeId = useMockEventStore((s) => s.currentNodeId);

  const loadStoryGraph = useMockEventStore((s) => s.loadStoryGraph);
  const setDryRunMode = useMockEventStore((s) => s.setDryRunMode);
  const rehearsalResetToOpeningBeat = useMockEventStore((s) => s.rehearsalResetToOpeningBeat);
  const rehearsalAddFakeAudience = useMockEventStore((s) => s.rehearsalAddFakeAudience);
  const rehearsalSimulateRandomVotes = useMockEventStore((s) => s.rehearsalSimulateRandomVotes);

  const storyGraphValidation = useMemo(() => validateGraph(graph), [graph]);

  const realtimeHealthy =
    syncMode === "local_preview"
      ? true
      : diagnostics.supabaseClientConfigured &&
        (diagnostics.realtimeStatus === "subscribed" || diagnostics.realtimeStatus === "connecting");

  const joinUrlOk = Boolean(diagnostics.joinUrl?.startsWith("https://")) && !diagnostics.loopbackJoinWarning;

  const checklist = useMemo(
    () => [
      {
        id: "screen",
        ok: diagnostics.screenLikelyConnected,
        label: "Wall display (/screen)",
        detail: diagnostics.screenLikelyConnected
          ? "Heartbeat seen recently"
          : "Open /screen on this origin so the desk gets heartbeats.",
      },
      {
        id: "join",
        ok: joinUrlOk,
        label: "Audience join URL",
        detail: joinUrlOk ? diagnostics.joinUrl ?? "Ready" : diagnostics.loopbackJoinWarning ? LOOPBACK_WARNING : "Need HTTPS join URL",
      },
      {
        id: "story",
        ok: storyGraphValidation.ok,
        label: "Story graph",
        detail: storyGraphValidation.ok
          ? "Branches, vote copy, and operator clip names validate"
          : storyGraphValidation.errors[0] ?? "Fix graph in Story builder",
      },
      {
        id: "sync",
        ok: realtimeHealthy,
        label: syncMode === "local_preview" ? "Local preview sync" : "Supabase realtime",
        detail:
          syncMode === "local_preview"
            ? "BroadcastChannel — same-browser tabs only"
            : `Probe: ${diagnostics.realtimeStatus}`,
      },
    ],
    [
      diagnostics.screenLikelyConnected,
      diagnostics.joinUrl,
      diagnostics.loopbackJoinWarning,
      diagnostics.realtimeStatus,
      joinUrlOk,
      storyGraphValidation,
      syncMode,
      realtimeHealthy,
    ],
  );

  const loadDemo = useCallback(() => {
    loadStoryGraph(createDemoBranchingStoryGraph(), {
      displayName: "Demo 3-node branch",
      eventTitle: "Rehearsal: branching demo",
    });
  }, [loadStoryGraph]);

  const exportReport = useCallback(() => {
    const st = useMockEventStore.getState();
    const cur = getNode(st.graph, st.currentNodeId);
    const payload = buildShowtimeEventReportPayload({
      eventTitle: st.eventTitle,
      eventCode: st.eventCode,
      audienceConnected: st.audienceConnected,
      graphRootId: st.graph.rootId,
      currentNodeId: st.currentNodeId,
      currentNodeTitle: cur?.title ?? st.currentNodeId,
      enginePhase: st.engine.phase,
      segments: st.reportSegments,
      voteOpen: st.engine.phase === "open",
      voteNodeId: st.engine.voteNodeId,
      talliesA: st.engine.tallies.a,
      talliesB: st.engine.tallies.b,
    });
    const text = formatShowtimeEventReportText(payload);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `showtime-report-${st.eventCode}-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const confirmRehearsalReset = useCallback(() => {
    if (
      !window.confirm(
        "Rehearsal reset: clear votes, audience headcount, and return to the opening beat? Anonymous quick join and dry-run stay as set.",
      )
    )
      return;
    rehearsalResetToOpeningBeat();
  }, [rehearsalResetToOpeningBeat]);

  const sections = (
    <>
      <section className={cn(embedInDesk ? "space-y-2" : "space-y-3")}>
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">Preflight</p>
        <ul className={cn(embedInDesk ? "space-y-2" : "space-y-3")}>
          {checklist.map((row) => (
            <li
              key={row.id}
              className={cn(
                "flex gap-2 border",
                embedInDesk ? "rounded-lg px-3 py-2" : "gap-3 rounded-2xl px-4 py-3",
                row.ok ? "border-emerald-500/35 bg-emerald-500/[0.07]" : "border-amber-500/35 bg-amber-500/[0.07]",
              )}
            >
              {row.ok ? (
                <CheckCircle2 className={cn("mt-0.5 shrink-0 text-emerald-400", embedInDesk ? "size-4" : "size-5")} aria-hidden />
              ) : (
                <CircleAlert className={cn("mt-0.5 shrink-0 text-amber-300", embedInDesk ? "size-4" : "size-5")} aria-hidden />
              )}
              <div className="min-w-0">
                <p className={cn("font-medium text-foreground", embedInDesk && "text-sm")}>{row.label}</p>
                <p className={cn("mt-0.5 leading-relaxed text-muted-foreground", embedInDesk ? "text-xs" : "mt-1 text-sm")}>{row.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        {!storyGraphValidation.ok ? (
          <p
            className={cn(
              "rounded-lg border border-[var(--bn-line)] bg-card/40 text-muted-foreground",
              embedInDesk ? "px-3 py-2 text-xs" : "rounded-xl px-4 py-3 text-sm",
            )}
          >
            <strong className="text-foreground">Story graph check</strong> —{" "}
            {storyGraphValidation.errors.slice(0, 2).join(" · ")}
            {storyGraphValidation.errors.length > 2 ? ` (+${storyGraphValidation.errors.length - 2} more)` : null}
          </p>
        ) : null}
      </section>

      <section className={cn("grid sm:grid-cols-2", embedInDesk ? "gap-2" : "gap-4")}>
        <div className={cn("rounded-xl border border-[var(--bn-line)] bg-card/50", embedInDesk ? "p-3" : "rounded-2xl p-4")}>
          <p className="mb-2 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">
            <ScanLine className="size-4" />
            Demo story
          </p>
          <Button
            type="button"
            className={cn("w-full font-semibold", embedInDesk ? "h-9 rounded-lg text-sm" : "min-h-12 rounded-xl text-base")}
            onClick={loadDemo}
          >
            Load 3-node demo
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">Replaces the live graph in this tab with a branching sample.</p>
        </div>
        <div className={cn("rounded-xl border border-[var(--bn-line)] bg-card/50", embedInDesk ? "p-3" : "rounded-2xl p-4")}>
          <p className="mb-2 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">
            <Radio className="size-4" />
            Dry run
          </p>
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-xl border border-[var(--bn-line)] bg-black/20",
              embedInDesk ? "px-3 py-2" : "gap-3 px-4 py-3",
            )}
          >
            <input
              type="checkbox"
              className={cn("mt-0.5 shrink-0 rounded border-[var(--bn-line)]", embedInDesk ? "size-4" : "mt-1 size-5")}
              checked={dryRunMode}
              onChange={(e) => setDryRunMode(e.target.checked)}
            />
            <span className={cn("leading-relaxed text-muted-foreground", embedInDesk ? "text-xs" : "text-sm")}>
              <strong className="text-foreground">Advance without phones</strong> — closing an empty poll auto-picks Option A so you can reach reveal and advance. Real ties still need you.
            </span>
          </label>
        </div>
      </section>

      <section className={cn("rounded-xl border border-[var(--bn-line)] bg-card/50", embedInDesk ? "p-3" : "rounded-2xl p-4")}>
        <p className="mb-2 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">
          <Users className="size-4" />
          Fake audience
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="secondary"
            className={cn("font-semibold", embedInDesk ? "h-9 rounded-lg text-sm" : "min-h-12 rounded-xl")}
            onClick={() => rehearsalAddFakeAudience(10)}
          >
            +10
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={cn("font-semibold", embedInDesk ? "h-9 rounded-lg text-sm" : "min-h-12 rounded-xl")}
            onClick={() => rehearsalAddFakeAudience(50)}
          >
            +50
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={cn("font-semibold", embedInDesk ? "h-9 rounded-lg text-sm" : "min-h-12 rounded-xl")}
            onClick={() => rehearsalAddFakeAudience(200)}
          >
            +200
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          className={cn("mt-2 w-full border-[var(--bn-line)]", embedInDesk ? "h-9 rounded-lg text-sm" : "mt-3 min-h-12 rounded-xl text-base")}
          onClick={() => rehearsalSimulateRandomVotes()}
        >
          <Shuffle className="mr-2 size-4" />
          Simulate random votes (open poll)
        </Button>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Headcount is cosmetic unless you run random votes — we spray up to 500 tallies or match your headcount (min 24).
        </p>
      </section>

      <section className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          className={embedInDesk ? "h-9 rounded-lg text-sm" : "min-h-12 rounded-xl text-base"}
          onClick={confirmRehearsalReset}
        >
          <RefreshCw className="mr-2 size-4" />
          Reset run (votes + audience + opening beat)
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn("border-[var(--bn-line)]", embedInDesk ? "h-9 rounded-lg text-sm" : "min-h-12 rounded-xl text-base")}
          onClick={exportReport}
        >
          <Download className="mr-2 size-4" />
          Export report
        </Button>
      </section>

      <section
        className={cn(
          "rounded-xl border border-[var(--bn-line)] bg-black/20 font-mono text-muted-foreground",
          embedInDesk ? "px-3 py-2 text-xs" : "rounded-2xl px-4 py-3 text-sm",
        )}
      >
        <p>
          <MonitorPlay className="mr-2 inline size-4 align-text-bottom text-primary" />
          Report rounds: <strong className="text-foreground">{reportSegments.length}</strong> · Audience:{" "}
          <strong className="text-foreground">{audienceConnected}</strong> · Playhead:{" "}
          <strong className="text-foreground">{getNode(graph, currentNodeId)?.title ?? currentNodeId}</strong> · Phase:{" "}
          <strong className="text-foreground">{engine.phase}</strong>
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2">
          <MonitorPlay className="size-4 text-muted-foreground" />
          <span>{eventTitle}</span>
          <span className="text-[var(--bn-line)]">|</span>
          <Wifi className="size-4" />
          <span>{eventCode}</span>
        </p>
      </section>
    </>
  );

  if (embedInDesk) {
    return (
      <div className="px-1 pb-1">
        <div className="flex flex-col gap-3">{sections}</div>
      </div>
    );
  }

  return (
    <Card className="border-2 border-dashed border-primary/40 bg-gradient-to-b from-primary/[0.07] to-transparent backdrop-blur-xl">
      <CardHeader className="border-b border-[var(--bn-line)] bg-black/10 pb-4">
        <CardTitle className="flex items-center gap-2 font-heading text-2xl font-normal">
          <FlaskConical className="size-7 text-primary" />
          Rehearsal & testing
        </CardTitle>
        <CardDescription className="text-base leading-relaxed">
          Load a sample graph, simulate phones, dry-run empty polls, run preflight checks, and export a simple vote report — no production data leaves this browser unless you download it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 pt-6">{sections}</CardContent>
    </Card>
  );
}
