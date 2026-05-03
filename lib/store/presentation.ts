import type { StoryEngineState } from "@/lib/story-engine/engine-types";
import { getEffectiveWinner } from "@/lib/story-engine/engine";
import { getNode } from "@/lib/story-engine/graph";
import type { VotePhase } from "@/types";

/** Maps engine phases to the legacy `VotePhase` used by /screen and /join. */
export function enginePhaseToVotePhase(engine: StoryEngineState): VotePhase {
  switch (engine.phase) {
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
}

export function selectVoteDisplayNodeId(engine: StoryEngineState): string {
  return engine.voteNodeId ?? engine.currentNodeId;
}

export function selectVoteDisplayNode(engine: StoryEngineState) {
  const id = selectVoteDisplayNodeId(engine);
  return getNode(engine.graph, id);
}

export function selectRevealedWinner(engine: StoryEngineState) {
  if (engine.phase !== "revealed") return null;
  return getEffectiveWinner(engine);
}
