"use client";

import { create } from "zustand";

import { EMPTY_STORY_GRAPH, MOCK_EVENT } from "@/lib/mock-data";
import {
  advanceToNextNode,
  closeVoting,
  createStoryEngineState,
  getEffectiveWinner,
  hostOverrideWinner,
  markRevealDisplayed,
  needsHostChoice,
  openVotingForNode,
  recordAudienceVote,
  resolveTieWithHostPick,
  setPlayheadNode,
  startVote,
  tickCountdown,
} from "@/lib/story-engine/engine";
import type { ShowtimeReportSegment } from "@/lib/showtime/event-report";
import { getNode } from "@/lib/story-engine/graph";
import type { StoryGraph, StoryNodeId, VoteChoice } from "@/types";

export type LiveShowStatus = "draft" | "waiting" | "playing" | "voting" | "revealing" | "ended";

export type LogEntry = { id: string; at: number; message: string };

const LOG_CAP = 120;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function pushLog(log: LogEntry[], message: string): LogEntry[] {
  const next = [{ id: uid(), at: Date.now(), message }, ...log];
  return next.slice(0, LOG_CAP);
}

function liveStatusFrom(eventStarted: boolean, ended: boolean, phase: string): LiveShowStatus {
  if (ended) return "ended";
  if (!eventStarted) return "draft";
  if (phase === "countdown" || phase === "open") return "voting";
  if (phase === "tiebreak" || phase === "awaiting_reveal" || phase === "revealed") return "revealing";
  return "waiting";
}

const initialEngine = createStoryEngineState(EMPTY_STORY_GRAPH, EMPTY_STORY_GRAPH.rootId);

export interface MockEventStore {
  engine: typeof initialEngine;
  eventTitle: string;
  eventCode: string;
  eventId: string;
  eventStarted: boolean;
  showEnded: boolean;
  /** Countdown preset (seconds) used when arming a vote runway. */
  countdownPresetSec: number;
  /** Poll stays open this many seconds after voting opens (immediate open or post-countdown). */
  pollDurationSec: number;
  /** Lets /join offer one-tap entry without a custom callsign (hybrid + broadcast; DB column when published). */
  allowAnonymousQuickJoin: boolean;
  audienceConnected: number;
  /** Dedupe Supabase-broadcast audience votes (multiple tabs may receive the same message). */
  processedRemoteVoteIds: string[];
  activityLog: LogEntry[];
  /** /screen could not decode or load the current reel — cleared when recovery sync arrives or live reset. */
  projectionSurfaceFault: string | null;
  /** Rehearsal: empty polls auto-resolve when closing vote so you can walk phases without phones. */
  dryRunMode: boolean;
  /** Logged when host advances after each reveal (export report). */
  reportSegments: ShowtimeReportSegment[];

  /** Legacy shape for /screen + /join */
  votePhase: import("@/types").VotePhase;
  voteEndsAt: number | null;
  countdownSec: number;
  votesA: number;
  votesB: number;
  revealedWinner: VoteChoice | null;
  currentNodeId: StoryNodeId;
  graph: StoryGraph;
  liveStatus: LiveShowStatus;

  setCurrentNodeId: (id: StoryNodeId) => void;
  startEvent: () => void;
  endShow: () => void;
  setCountdownPreset: (sec: number) => void;
  setPollDuration: (sec: number) => void;
  setAllowAnonymousQuickJoin: (v: boolean) => void;
  /** Arm countdown then open poll (uses countdown + poll presets). */
  openVoteRunway: () => void;
  /** Skip countdown; open poll immediately. */
  openVoteImmediate: () => void;
  tickCountdown: () => void;
  closeVote: () => void;
  revealWinnerToRoom: () => void;
  advanceToWinningBranch: () => void;
  hostOverrideA: () => void;
  hostOverrideB: () => void;
  resolveTieA: () => void;
  resolveTieB: () => void;
  castAudienceVote: (choice: VoteChoice) => void;
  /** Cross-device: apply a phone vote once per `clientVoteId` (deduped across host + /screen tabs). */
  recordRemoteAudienceVote: (clientVoteId: string, choice: VoteChoice) => void;
  registerAudienceMember: () => void;
  /** Dev: simulate phones */
  setAudienceConnected: (n: number) => void;
  /** Align Realtime `event:${id}` with Supabase row for {@link eventCode} (host + /screen). */
  setEventId: (id: string) => void;
  /** After loading the live row from Supabase — keeps /screen heartbeats and join URLs on the same night. */
  syncSupabaseEventMeta: (params: { eventId: string; code: string; title: string }) => void;
  pulseDemoVotes: () => void;
  /** Hard reset: draft state, root playhead, cleared votes/audience — same graph & event metadata */
  resetLiveEvent: () => void;
  setDryRunMode: (v: boolean) => void;
  /** Clears votes, audience, and opening playhead; preserves anonymous-quick-join + dry-run prefs. */
  rehearsalResetToOpeningBeat: () => void;
  rehearsalAddFakeAudience: (n: number) => void;
  /** Random A/B tally bumps while poll is open (rehearsal). */
  rehearsalSimulateRandomVotes: (count?: number) => void;
  /** Append one line to the operator activity log (e.g. projection alerts from /screen). */
  appendActivityLog: (message: string) => void;
  setProjectionSurfaceFault: (message: string | null) => void;
}

function legacyFromEngine(s: {
  engine: typeof initialEngine;
  eventStarted: boolean;
  showEnded: boolean;
}) {
  const e = s.engine;
  const mapPhase = (): import("@/types").VotePhase => {
    switch (e.phase) {
      case "idle":
        return "idle";
      case "countdown":
        return "countdown";
      case "open":
        return "open";
      case "awaiting_reveal":
      case "tiebreak":
        return "closed";
      case "revealed":
        return "reveal";
      default:
        return "idle";
    }
  };
  const votePhase = mapPhase();
  const revealedWinner = e.phase === "revealed" ? getEffectiveWinner(e) : null;
  return {
    votePhase,
    voteEndsAt: e.voteClosesAtMs,
    countdownSec: e.countdownSec ?? 0,
    votesA: e.tallies.a,
    votesB: e.tallies.b,
    revealedWinner,
    currentNodeId: e.currentNodeId,
    graph: e.graph,
    liveStatus: liveStatusFrom(s.eventStarted, s.showEnded, e.phase),
  };
}

export const useMockEventStore = create<MockEventStore>((set, get) => ({
  engine: initialEngine,
  eventTitle: MOCK_EVENT.title,
  eventCode: MOCK_EVENT.eventCode,
  eventId: MOCK_EVENT.id,
  eventStarted: false,
  showEnded: false,
  countdownPresetSec: 30,
    /** Game-show pacing (~25–30s); host can extend in the control desk. */
    pollDurationSec: 30,
  allowAnonymousQuickJoin: false,
  audienceConnected: 0,
  processedRemoteVoteIds: [],
  activityLog: [],
  projectionSurfaceFault: null,
  dryRunMode: false,
  reportSegments: [],
  ...legacyFromEngine({
    engine: initialEngine,
    eventStarted: false,
    showEnded: false,
  }),

  setCurrentNodeId: (id) =>
    set((s) => {
      try {
        const engine = setPlayheadNode(s.engine, id);
        return {
          engine,
          activityLog: pushLog(s.activityLog, `Jump to node ${id}`),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch {
        return {
          activityLog: pushLog(s.activityLog, `Jump to ${id} ignored (engine busy)`),
        };
      }
    }),

  startEvent: () =>
    set((s) => ({
      eventStarted: true,
      showEnded: false,
      activityLog: pushLog(s.activityLog, "Event started — room unlocked"),
      ...legacyFromEngine({ ...s, eventStarted: true, showEnded: false }),
    })),

  endShow: () =>
    set((s) => ({
      showEnded: true,
      activityLog: pushLog(s.activityLog, "Show ended"),
      ...legacyFromEngine({ ...s, showEnded: true }),
    })),

  setCountdownPreset: (sec) => set({ countdownPresetSec: sec }),

  setPollDuration: (sec) => set({ pollDurationSec: Math.max(5, sec) }),

  setAllowAnonymousQuickJoin: (v) =>
    set((s) => ({
      allowAnonymousQuickJoin: v,
      activityLog: pushLog(s.activityLog, v ? "Anonymous quick join enabled for phones" : "Anonymous quick join disabled"),
    })),

  openVoteRunway: () =>
    set((s) => {
      if (!s.eventStarted || s.showEnded) {
        return { activityLog: pushLog(s.activityLog, "Open vote blocked — start event first") };
      }
      try {
        const engine = startVote(s.engine, {
          countdownSeconds: s.countdownPresetSec,
          pollDurationSec: s.pollDurationSec,
        });
        return {
          engine,
          activityLog: pushLog(
            s.activityLog,
            `Vote armed — ${s.countdownPresetSec}s countdown → ${s.pollDurationSec}s poll`,
          ),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Open vote failed";
        return { activityLog: pushLog(s.activityLog, msg) };
      }
    }),

  openVoteImmediate: () =>
    set((s) => {
      if (!s.eventStarted || s.showEnded) {
        return { activityLog: pushLog(s.activityLog, "Open vote blocked — start event first") };
      }
      try {
        const engine = openVotingForNode(s.engine, { pollDurationSec: s.pollDurationSec });
        return {
          engine,
          activityLog: pushLog(s.activityLog, `Vote opened (immediate, ${s.pollDurationSec}s poll)`),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Open vote failed";
        return { activityLog: pushLog(s.activityLog, msg) };
      }
    }),

  tickCountdown: () =>
    set((s) => {
      try {
        const engine = tickCountdown(s.engine);
        const opened = s.engine.phase === "countdown" && engine.phase === "open";
        return {
          engine,
          activityLog: opened
            ? pushLog(s.activityLog, "Countdown complete — voting open")
            : s.activityLog,
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch {
        return {};
      }
    }),

  closeVote: () =>
    set((s) => {
      try {
        let engine = closeVoting(s.engine);
        let log =
          needsHostChoice(engine) ? "Vote closed — tie or empty tally (host pick required)" : "Vote closed — tally locked";
        if (
          s.dryRunMode &&
          engine.phase === "tiebreak" &&
          engine.countedOutcome?.type === "no_votes"
        ) {
          engine = resolveTieWithHostPick(engine, "A");
          log = "Vote closed — dry run auto-resolved empty poll → Option A";
        }
        return {
          engine,
          activityLog: pushLog(s.activityLog, log),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Close vote failed";
        return { activityLog: pushLog(s.activityLog, msg) };
      }
    }),

  revealWinnerToRoom: () =>
    set((s) => {
      try {
        const engine = markRevealDisplayed(s.engine);
        return {
          engine,
          activityLog: pushLog(s.activityLog, "Winner revealed to room"),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Reveal failed";
        return { activityLog: pushLog(s.activityLog, msg) };
      }
    }),

  advanceToWinningBranch: () =>
    set((s) => {
      try {
        const prev = s.engine;
        const ta = prev.tallies.a;
        const tb = prev.tallies.b;
        const voteNodeId = prev.voteNodeId;
        const winner = prev.winner;
        const engine = advanceToNextNode(prev);
        const vn = voteNodeId ? getNode(s.graph, voteNodeId) : undefined;
        const ln = getNode(engine.graph, engine.currentNodeId);
        let reportSegments = s.reportSegments;
        if (voteNodeId && winner) {
          const seg: ShowtimeReportSegment = {
            id: uid(),
            voteNodeId,
            voteNodeTitle: vn?.title ?? voteNodeId,
            votesA: ta,
            votesB: tb,
            winner,
            landedNodeId: engine.currentNodeId,
            landedTitle: ln?.title ?? engine.currentNodeId,
            at: Date.now(),
          };
          reportSegments = [...s.reportSegments, seg];
        }
        return {
          engine,
          reportSegments,
          activityLog: pushLog(s.activityLog, `Advanced to ${engine.currentNodeId} — play next clip manually`),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Advance failed";
        return { activityLog: pushLog(s.activityLog, msg) };
      }
    }),

  hostOverrideA: () =>
    set((s) => {
      try {
        const engine = hostOverrideWinner(s.engine, "A");
        return {
          engine,
          activityLog: pushLog(s.activityLog, "Host override → Option A"),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Override failed";
        return { activityLog: pushLog(s.activityLog, msg) };
      }
    }),

  hostOverrideB: () =>
    set((s) => {
      try {
        const engine = hostOverrideWinner(s.engine, "B");
        return {
          engine,
          activityLog: pushLog(s.activityLog, "Host override → Option B"),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Override failed";
        return { activityLog: pushLog(s.activityLog, msg) };
      }
    }),

  resolveTieA: () =>
    set((s) => {
      try {
        const engine = resolveTieWithHostPick(s.engine, "A");
        return {
          engine,
          activityLog: pushLog(s.activityLog, "Host resolved tie → A"),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Resolve tie failed";
        return { activityLog: pushLog(s.activityLog, msg) };
      }
    }),

  resolveTieB: () =>
    set((s) => {
      try {
        const engine = resolveTieWithHostPick(s.engine, "B");
        return {
          engine,
          activityLog: pushLog(s.activityLog, "Host resolved tie → B"),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Resolve tie failed";
        return { activityLog: pushLog(s.activityLog, msg) };
      }
    }),

  castAudienceVote: (choice) =>
    set((s) => {
      try {
        const engine = recordAudienceVote(s.engine, choice);
        return { engine, ...legacyFromEngine({ ...s, engine }) };
      } catch {
        return {};
      }
    }),

  recordRemoteAudienceVote: (clientVoteId, choice) =>
    set((s) => {
      if (!clientVoteId || s.processedRemoteVoteIds.includes(clientVoteId)) return {};
      try {
        const engine = recordAudienceVote(s.engine, choice);
        const processedRemoteVoteIds = [...s.processedRemoteVoteIds, clientVoteId].slice(-400);
        return {
          engine,
          processedRemoteVoteIds,
          activityLog: pushLog(s.activityLog, `Audience vote (${choice}) · remote`),
          ...legacyFromEngine({ ...s, engine }),
        };
      } catch {
        return {};
      }
    }),

  registerAudienceMember: () =>
    set((s) => ({
      audienceConnected: s.audienceConnected + 1,
      activityLog: pushLog(s.activityLog, "Audience member joined"),
    })),

  setAudienceConnected: (n) => set({ audienceConnected: Math.max(0, n) }),

  setEventId: (id) => {
    const next = id.trim();
    if (!next) return;
    if (get().eventId === next) return;
    set({ eventId: next });
  },

  syncSupabaseEventMeta: ({ eventId, code, title }) => {
    const id = eventId.trim();
    const c = code.trim().toUpperCase();
    if (!id || !c) return;
    const t = title.trim();
    set({
      eventId: id,
      eventCode: c,
      ...(t ? { eventTitle: t } : {}),
    });
  },

  pulseDemoVotes: () =>
    set((s) => {
      if (s.engine.phase !== "open") return {};
      const da = Math.floor(Math.random() * 3);
      const db = Math.floor(Math.random() * 3);
      const engine = {
        ...s.engine,
        tallies: { a: s.engine.tallies.a + da, b: s.engine.tallies.b + db },
      };
      return {
        engine,
        activityLog: pushLog(s.activityLog, `Simulated +${da}/+${db} votes`),
        ...legacyFromEngine({ ...s, engine }),
      };
    }),

  resetLiveEvent: () =>
    set((s) => {
      const engine = createStoryEngineState(s.graph, s.graph.rootId);
      return {
        engine,
        eventStarted: false,
        showEnded: false,
        audienceConnected: 0,
        allowAnonymousQuickJoin: false,
        processedRemoteVoteIds: [],
        projectionSurfaceFault: null,
        reportSegments: [],
        activityLog: pushLog(s.activityLog, "Event reset — draft at opening beat"),
        ...legacyFromEngine({
          engine,
          eventStarted: false,
          showEnded: false,
        }),
      };
    }),

  setDryRunMode: (v) =>
    set((s) => ({
      dryRunMode: v,
      activityLog: pushLog(s.activityLog, v ? "Dry run mode on — empty polls resolve to A when closed" : "Dry run mode off"),
    })),

  rehearsalResetToOpeningBeat: () =>
    set((s) => {
      const engine = createStoryEngineState(s.graph, s.graph.rootId);
      return {
        engine,
        eventStarted: false,
        showEnded: false,
        audienceConnected: 0,
        processedRemoteVoteIds: [],
        projectionSurfaceFault: null,
        reportSegments: [],
        activityLog: pushLog(
          s.activityLog,
          "Rehearsal reset — votes & audience cleared; opening beat (prefs preserved)",
        ),
        ...legacyFromEngine({
          engine,
          eventStarted: false,
          showEnded: false,
        }),
      };
    }),

  rehearsalAddFakeAudience: (n) =>
    set((s) => {
      const add = Math.max(0, Math.floor(n));
      if (!add) return {};
      return {
        audienceConnected: s.audienceConnected + add,
        activityLog: pushLog(s.activityLog, `Rehearsal: +${add} fake audience headcount`),
      };
    }),

  rehearsalSimulateRandomVotes: (count) =>
    set((s) => {
      if (s.engine.phase !== "open") return {};
      const cap = 500;
      const n = Math.min(cap, Math.max(1, count ?? Math.max(s.audienceConnected, 24)));
      let engine = s.engine;
      for (let i = 0; i < n; i++) {
        engine = recordAudienceVote(engine, Math.random() < 0.5 ? "A" : "B");
      }
      return {
        engine,
        activityLog: pushLog(s.activityLog, `Rehearsal: simulated ${n} random votes`),
        ...legacyFromEngine({ ...s, engine }),
      };
    }),

  appendActivityLog: (message) =>
    set((s) => ({
      activityLog: pushLog(s.activityLog, message.trim() || "Log"),
    })),

  setProjectionSurfaceFault: (message) =>
    set({ projectionSurfaceFault: message?.trim() ? message.trim() : null }),
}));
