import type { StoryGraph, StoryNode, StoryNodeId } from "@/types";
import type { VoteChoice } from "@/types";

/** Vote lifecycle inside the engine (UI may map to broader labels). */
export type StoryEnginePhase =
  | "idle"
  | "countdown"
  | "open"
  | "awaiting_reveal"
  | "tiebreak"
  | "revealed";

export type ResolutionSource = "tally" | "manual_tiebreak" | "manual_override";

export type CountedOutcome =
  | { type: "decisive"; winner: VoteChoice }
  | { type: "tie"; tallies: { a: number; b: number } }
  | { type: "no_votes" };

export interface StoryEngineState {
  graph: StoryGraph;
  currentNodeId: StoryNodeId;
  /** Node the active vote is about (usually the playhead while that beat is live). */
  voteNodeId: StoryNodeId | null;
  phase: StoryEnginePhase;
  countdownSec: number | null;
  voteClosesAtMs: number | null;
  tallies: { a: number; b: number };
  /** Populated after `closeVoting` for tally-based resolution. */
  countedOutcome: CountedOutcome | null;
  /** Winning branch once resolved (tally, tiebreak, or override). */
  winner: VoteChoice | null;
  resolutionSource: ResolutionSource | null;
  /**
   * While countdown is running: seconds the poll stays open after voting opens.
   * Cleared once `voteClosesAtMs` is set.
   */
  pollDurationSec: number | null;
}

export class StoryEngineError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_PHASE"
      | "INVALID_NODE"
      | "NO_VOTE_QUESTION"
      | "ADVANCE_NO_WINNER"
      | "ADVANCE_NO_BRANCH"
      | "COUNTDOWN_NOT_ACTIVE"
      | "INVALID_TALLY",
  ) {
    super(message);
    this.name = "StoryEngineError";
  }
}

export function assertVoteableNode(graph: StoryGraph, nodeId: StoryNodeId): StoryNode {
  const node = graph.nodes[nodeId];
  if (!node) throw new StoryEngineError(`Unknown node: ${nodeId}`, "INVALID_NODE");
  if (node.isEnd) throw new StoryEngineError(`Ending node cannot host a vote: ${nodeId}`, "INVALID_NODE");
  if (!node.question?.trim()) throw new StoryEngineError(`Node has no vote question: ${nodeId}`, "NO_VOTE_QUESTION");
  if (!node.optionA || !node.optionB) {
    throw new StoryEngineError(`Node is missing option A or B: ${nodeId}`, "NO_VOTE_QUESTION");
  }
  return node;
}
