import { describe, expect, it } from "vitest";

import type { StoryGraph } from "@/types";

import {
  advancePlayheadToNode,
  advanceToNextNode,
  applyVoteTallies,
  classifyVoteTallies,
  closeVoting,
  createStoryEngineState,
  getCurrentNode,
  getEffectiveWinner,
  getVoteNode,
  hostOverrideWinner,
  isAtEndingNode,
  markRevealDisplayed,
  needsHostChoice,
  openVotingForNode,
  recordAudienceVote,
  resolveTieWithHostPick,
  startVote,
  tickCountdown,
} from "./engine";

function voteGraph(): StoryGraph {
  return {
    rootId: "vote",
    nodes: {
      vote: {
        id: "vote",
        title: "Fork",
        subtitle: null,
        operatorClipName: "vote.mp4",
        question: "Left or right?",
        optionA: { label: "Left", nextNodeId: "path_a", nextClipName: "path_a.mp4" },
        optionB: { label: "Right", nextNodeId: "path_b", nextClipName: "path_b.mp4" },
        isEnd: false,
      },
      path_a: {
        id: "path_a",
        title: "Path A",
        subtitle: null,
        operatorClipName: "path_a.mp4",
        question: null,
        optionA: null,
        optionB: null,
        isEnd: true,
      },
      path_b: {
        id: "path_b",
        title: "Path B",
        subtitle: null,
        operatorClipName: "path_b.mp4",
        question: null,
        optionA: null,
        optionB: null,
        isEnd: false,
      },
    },
  };
}

describe("Showtime story engine", () => {
  it("A wins after tally", () => {
    const g = voteGraph();
    let s = createStoryEngineState(g, "vote");
    s = openVotingForNode(s);
    s = applyVoteTallies(s, { a: 7, b: 2 });
    s = closeVoting(s);
    expect(s.phase).toBe("awaiting_reveal");
    expect(getEffectiveWinner(s)).toBe("A");
    expect(needsHostChoice(s)).toBe(false);
    expect(s.countedOutcome).toEqual({ type: "decisive", winner: "A" });
    s = advanceToNextNode(s);
    expect(s.currentNodeId).toBe("path_a");
    expect(s.phase).toBe("idle");
  });

  it("B wins after tally", () => {
    const g = voteGraph();
    let s = createStoryEngineState(g, "vote");
    s = openVotingForNode(s);
    s = applyVoteTallies(s, { a: 1, b: 4 });
    s = closeVoting(s);
    expect(getEffectiveWinner(s)).toBe("B");
    s = advanceToNextNode(s);
    expect(s.currentNodeId).toBe("path_b");
  });

  it("tie sends host to tiebreak (both options need operator choice)", () => {
    const g = voteGraph();
    let s = createStoryEngineState(g, "vote");
    s = openVotingForNode(s);
    s = applyVoteTallies(s, { a: 5, b: 5 });
    s = closeVoting(s);
    expect(s.phase).toBe("tiebreak");
    expect(needsHostChoice(s)).toBe(true);
    expect(s.countedOutcome).toEqual({ type: "tie", tallies: { a: 5, b: 5 } });
    expect(getEffectiveWinner(s)).toBeNull();
    s = resolveTieWithHostPick(s, "B");
    expect(s.phase).toBe("awaiting_reveal");
    expect(getEffectiveWinner(s)).toBe("B");
    expect(s.resolutionSource).toBe("manual_tiebreak");
    s = markRevealDisplayed(s);
    expect(s.phase).toBe("revealed");
    s = advanceToNextNode(s);
    expect(s.currentNodeId).toBe("path_b");
  });

  it("no votes is tiebreak like a tie", () => {
    const g = voteGraph();
    let s = createStoryEngineState(g, "vote");
    s = openVotingForNode(s);
    s = closeVoting(s);
    expect(s.phase).toBe("tiebreak");
    expect(s.countedOutcome?.type).toBe("no_votes");
    s = resolveTieWithHostPick(s, "A");
    s = advanceToNextNode(s);
    expect(s.currentNodeId).toBe("path_a");
  });

  it("manual override while open skips tally", () => {
    const g = voteGraph();
    let s = createStoryEngineState(g, "vote");
    s = openVotingForNode(s);
    s = recordAudienceVote(s, "A");
    s = recordAudienceVote(s, "A");
    s = hostOverrideWinner(s, "B");
    expect(s.phase).toBe("awaiting_reveal");
    expect(getEffectiveWinner(s)).toBe("B");
    expect(s.resolutionSource).toBe("manual_override");
    expect(s.countedOutcome).toBeNull();
    s = advanceToNextNode(s);
    expect(s.currentNodeId).toBe("path_b");
  });

  it("detects ending node on playhead", () => {
    const g = voteGraph();
    let s = createStoryEngineState(g, "path_b");
    expect(isAtEndingNode(s)).toBe(false);
    s = advancePlayheadToNode(s, "path_a");
    expect(getCurrentNode(s)?.isEnd).toBe(true);
    expect(isAtEndingNode(s)).toBe(true);
  });

  it("classifyVoteTallies covers decisive branches", () => {
    expect(classifyVoteTallies(3, 1)).toEqual({ type: "decisive", winner: "A" });
    expect(classifyVoteTallies(0, 2)).toEqual({ type: "decisive", winner: "B" });
    expect(classifyVoteTallies(4, 4).type).toBe("tie");
    expect(classifyVoteTallies(0, 0).type).toBe("no_votes");
  });

  it("startVote with countdown opens after ticks", () => {
    const g = voteGraph();
    let s = createStoryEngineState(g, "vote");
    s = startVote(s, { countdownSeconds: 2 });
    expect(s.phase).toBe("countdown");
    expect(getVoteNode(s)?.id).toBe("vote");
    s = tickCountdown(s);
    expect(s.countdownSec).toBe(1);
    s = tickCountdown(s);
    expect(s.phase).toBe("open");
  });

  it("getCurrentNode reflects playhead", () => {
    const g = voteGraph();
    const s = createStoryEngineState(g, "path_b");
    expect(getCurrentNode(s)?.title).toBe("Path B");
  });
});
