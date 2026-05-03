import type { StoryGraph, StoryNode, StoryNodeId } from "@/types";
import type { VoteChoice } from "@/types";

import {
  type CountedOutcome,
  type ResolutionSource,
  type StoryEnginePhase,
  type StoryEngineState,
  StoryEngineError,
  assertVoteableNode,
} from "./engine-types";
import { getNode, nextNodeAfterVote } from "./graph";

// ——— state factory ———

export function createStoryEngineState(
  graph: StoryGraph,
  currentNodeId: StoryNodeId = graph.rootId,
): StoryEngineState {
  if (!graph.nodes[currentNodeId]) {
    throw new StoryEngineError(`Unknown currentNodeId: ${currentNodeId}`, "INVALID_NODE");
  }
  return {
    graph,
    currentNodeId,
    voteNodeId: null,
    phase: "idle",
    countdownSec: null,
    voteClosesAtMs: null,
    tallies: { a: 0, b: 0 },
    countedOutcome: null,
    winner: null,
    resolutionSource: null,
    pollDurationSec: null,
  };
}

// ——— queries (read-only) ———

export function getCurrentNode(state: StoryEngineState): StoryNode | undefined {
  return getNode(state.graph, state.currentNodeId);
}

export function getVoteNode(state: StoryEngineState): StoryNode | undefined {
  return state.voteNodeId ? getNode(state.graph, state.voteNodeId) : undefined;
}

export function isAtEndingNode(state: StoryEngineState): boolean {
  const n = getCurrentNode(state);
  return Boolean(n?.isEnd);
}

export function needsHostChoice(state: StoryEngineState): boolean {
  return state.phase === "tiebreak";
}

export function getEffectiveWinner(state: StoryEngineState): VoteChoice | null {
  if (state.winner) return state.winner;
  if (state.countedOutcome?.type === "decisive") return state.countedOutcome.winner;
  return null;
}

export function countVotes(state: StoryEngineState): { a: number; b: number } {
  return { ...state.tallies };
}

// ——— transitions ———

/**
 * Arm a vote for a node: optional countdown, then opens automatically when countdown reaches 0 via `tickCountdown`.
 * Pass `countdownSeconds: 0` or `null` to open immediately.
 */
export function startVote(
  state: StoryEngineState,
  opts: {
    nodeId?: StoryNodeId;
    countdownSeconds: number | null;
    voteClosesAtMs?: number | null;
    /** When the poll opens, close it after this many seconds (unless `voteClosesAtMs` is set on immediate open). */
    pollDurationSec?: number;
  },
): StoryEngineState {
  if (state.phase !== "idle") {
    throw new StoryEngineError(`Cannot start vote in phase ${state.phase}`, "INVALID_PHASE");
  }
  const nodeId = opts.nodeId ?? state.currentNodeId;
  assertVoteableNode(state.graph, nodeId);
  const pollDur = opts.pollDurationSec ?? 60;

  const sec = opts.countdownSeconds;
  if (sec == null || sec <= 0) {
    const closesAt = opts.voteClosesAtMs ?? Date.now() + pollDur * 1000;
    return {
      ...state,
      voteNodeId: nodeId,
      phase: "open",
      countdownSec: null,
      voteClosesAtMs: closesAt,
      tallies: { a: 0, b: 0 },
      countedOutcome: null,
      winner: null,
      resolutionSource: null,
      pollDurationSec: null,
    };
  }

  return {
    ...state,
    voteNodeId: nodeId,
    phase: "countdown",
    countdownSec: sec,
    voteClosesAtMs: null,
    tallies: { a: 0, b: 0 },
    countedOutcome: null,
    winner: null,
    resolutionSource: null,
    pollDurationSec: pollDur,
  };
}

/** Alias: open voting immediately for the playhead (or explicit node). */
export function openVotingForNode(
  state: StoryEngineState,
  opts: { nodeId?: StoryNodeId; voteClosesAtMs?: number | null; pollDurationSec?: number } = {},
): StoryEngineState {
  return startVote(state, {
    nodeId: opts.nodeId,
    countdownSeconds: null,
    voteClosesAtMs: opts.voteClosesAtMs,
    pollDurationSec: opts.pollDurationSec,
  });
}

export function tickCountdown(state: StoryEngineState): StoryEngineState {
  if (state.phase !== "countdown" || state.countdownSec == null) {
    throw new StoryEngineError("No active countdown", "COUNTDOWN_NOT_ACTIVE");
  }
  if (state.countdownSec <= 1) {
    if (!state.voteNodeId) throw new StoryEngineError("Countdown without voteNodeId", "INVALID_PHASE");
    assertVoteableNode(state.graph, state.voteNodeId);
    const pollDur = state.pollDurationSec ?? 60;
    return {
      ...state,
      phase: "open",
      countdownSec: null,
      tallies: { a: 0, b: 0 },
      voteClosesAtMs: Date.now() + pollDur * 1000,
      pollDurationSec: null,
    };
  }
  return { ...state, countdownSec: state.countdownSec - 1 };
}

/** Replace tallies while voting is open (e.g. from Supabase realtime). */
export function applyVoteTallies(state: StoryEngineState, tallies: { a: number; b: number }): StoryEngineState {
  if (state.phase !== "open") {
    throw new StoryEngineError(`Cannot apply tallies in phase ${state.phase}`, "INVALID_PHASE");
  }
  if (tallies.a < 0 || tallies.b < 0) {
    throw new StoryEngineError("Tallies must be non-negative", "INVALID_TALLY");
  }
  return { ...state, tallies: { a: tallies.a, b: tallies.b } };
}

export function recordAudienceVote(state: StoryEngineState, choice: VoteChoice): StoryEngineState {
  if (state.phase !== "open") {
    throw new StoryEngineError(`Cannot record vote in phase ${state.phase}`, "INVALID_PHASE");
  }
  return {
    ...state,
    tallies: choice === "A" ? { ...state.tallies, a: state.tallies.a + 1 } : { ...state.tallies, b: state.tallies.b + 1 },
  };
}

/** Pure tally classification (used by `closeVoting`). */
export function classifyVoteTallies(a: number, b: number): CountedOutcome {
  if (a < 0 || b < 0) throw new StoryEngineError("Tallies must be non-negative", "INVALID_TALLY");
  if (a === 0 && b === 0) return { type: "no_votes" };
  if (a === b) return { type: "tie", tallies: { a, b } };
  return { type: "decisive", winner: a > b ? "A" : "B" };
}

/** Close the poll and classify outcome (decisive / tie / no votes). Ties and empty tallies require host tiebreak. */
export function closeVoting(state: StoryEngineState): StoryEngineState {
  if (state.phase !== "open") {
    throw new StoryEngineError(`Cannot close voting in phase ${state.phase}`, "INVALID_PHASE");
  }
  const countedOutcome = classifyVoteTallies(state.tallies.a, state.tallies.b);
  let phase: StoryEnginePhase;
  let winner: VoteChoice | null = null;
  let resolutionSource: ResolutionSource | null = null;

  if (countedOutcome.type === "no_votes" || countedOutcome.type === "tie") {
    phase = "tiebreak";
  } else {
    phase = "awaiting_reveal";
    winner = countedOutcome.winner;
    resolutionSource = "tally";
  }

  return {
    ...state,
    phase,
    voteClosesAtMs: null,
    countedOutcome,
    winner,
    resolutionSource,
    pollDurationSec: null,
  };
}

/** After decisive tally (or after manual resolution), mark reveal step for UI. Idempotent if already revealed. */
export function markRevealDisplayed(state: StoryEngineState): StoryEngineState {
  if (state.phase !== "awaiting_reveal") {
    throw new StoryEngineError(`Cannot reveal in phase ${state.phase}`, "INVALID_PHASE");
  }
  if (!state.winner) {
    throw new StoryEngineError("No winner to reveal", "ADVANCE_NO_WINNER");
  }
  return { ...state, phase: "revealed" };
}

/**
 * Host picks the winning branch during tiebreak (tied tallies or no votes).
 * Does not imply reveal — call `markRevealDisplayed` when the room has shown the pick.
 */
export function resolveTieWithHostPick(state: StoryEngineState, choice: VoteChoice): StoryEngineState {
  if (state.phase !== "tiebreak") {
    throw new StoryEngineError(`Host tiebreak only in tiebreak phase (got ${state.phase})`, "INVALID_PHASE");
  }
  return {
    ...state,
    phase: "awaiting_reveal",
    winner: choice,
    resolutionSource: "manual_tiebreak",
    pollDurationSec: null,
  };
}

/**
 * Host override while voting is still open: skip tally and declare a winner (e.g. production call).
 */
export function hostOverrideWinner(state: StoryEngineState, choice: VoteChoice): StoryEngineState {
  if (state.phase !== "open") {
    throw new StoryEngineError(`Override only while voting is open (got ${state.phase})`, "INVALID_PHASE");
  }
  return {
    ...state,
    phase: "awaiting_reveal",
    voteClosesAtMs: null,
    winner: choice,
    resolutionSource: "manual_override",
    countedOutcome: null,
    pollDurationSec: null,
  };
}

/**
 * Move playhead to the branch for `state.winner` from `voteNodeId`, then reset vote machine to idle.
 */
export function advanceToNextNode(state: StoryEngineState): StoryEngineState {
  if (state.phase !== "awaiting_reveal" && state.phase !== "revealed") {
    throw new StoryEngineError(`Cannot advance in phase ${state.phase}`, "INVALID_PHASE");
  }
  if (!state.winner) throw new StoryEngineError("No winner set", "ADVANCE_NO_WINNER");
  if (!state.voteNodeId) throw new StoryEngineError("No vote node", "INVALID_PHASE");

  const nextId = nextNodeAfterVote(state.graph, state.voteNodeId, state.winner);
  if (!nextId) throw new StoryEngineError("No next node for this winner", "ADVANCE_NO_BRANCH");

  return {
    ...state,
    graph: state.graph,
    currentNodeId: nextId,
    voteNodeId: null,
    phase: "idle",
    countdownSec: null,
    voteClosesAtMs: null,
    tallies: { a: 0, b: 0 },
    countedOutcome: null,
    winner: null,
    resolutionSource: null,
    pollDurationSec: null,
  };
}

/** Move playhead while the engine is idle (operator jump cuts). */
export function setPlayheadNode(state: StoryEngineState, nodeId: StoryNodeId): StoryEngineState {
  if (state.phase !== "idle") {
    throw new StoryEngineError(`Playhead jumps only in idle (got ${state.phase})`, "INVALID_PHASE");
  }
  if (!state.graph.nodes[nodeId]) throw new StoryEngineError(`Unknown node: ${nodeId}`, "INVALID_NODE");
  return {
    ...state,
    currentNodeId: nodeId,
    voteNodeId: null,
    countdownSec: null,
    voteClosesAtMs: null,
    tallies: { a: 0, b: 0 },
    countedOutcome: null,
    winner: null,
    resolutionSource: null,
    pollDurationSec: null,
  };
}

/** Advance without a vote (e.g. linear beat). Only from idle at a node with no vote question. */
export function advancePlayheadToNode(state: StoryEngineState, nodeId: StoryNodeId): StoryEngineState {
  if (state.phase !== "idle" && state.phase !== "revealed") {
    throw new StoryEngineError(`Cannot jump playhead in phase ${state.phase}`, "INVALID_PHASE");
  }
  if (!state.graph.nodes[nodeId]) throw new StoryEngineError(`Unknown node: ${nodeId}`, "INVALID_NODE");
  return {
    ...state,
    currentNodeId: nodeId,
    voteNodeId: null,
    phase: "idle",
    countdownSec: null,
    voteClosesAtMs: null,
    tallies: { a: 0, b: 0 },
    countedOutcome: null,
    winner: null,
    resolutionSource: null,
    pollDurationSec: null,
  };
}
