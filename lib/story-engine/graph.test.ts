import { describe, expect, it } from "vitest";

import type { StoryGraph } from "@/types";

import { createDemoBranchingStoryGraph } from "@/lib/showtime/demo-branching-graph";

import { validateGraph } from "./graph";

function minimalValid(): StoryGraph {
  return {
    rootId: "r",
    nodes: {
      r: {
        id: "r",
        title: "Start",
        subtitle: null,
        operatorClipName: "01_start.mp4",
        question: "Q?",
        optionA: { label: "A", nextNodeId: "e", nextClipName: "02A.mp4" },
        optionB: { label: "B", nextNodeId: "e", nextClipName: "02B.mp4" },
        isEnd: false,
      },
      e: {
        id: "e",
        title: "End",
        subtitle: null,
        operatorClipName: "03_end.mp4",
        question: null,
        optionA: null,
        optionB: null,
        isEnd: true,
      },
    },
  };
}

describe("validateGraph", () => {
  it("accepts a minimal valid fork plus end", () => {
    expect(validateGraph(minimalValid())).toEqual({ ok: true });
  });

  it("flags missing operator clip name", () => {
    const g = minimalValid();
    g.nodes.r.operatorClipName = "";
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("clip"))).toBe(true);
  });

  it("flags missing vote question on non-ending beat", () => {
    const g = minimalValid();
    g.nodes.r.question = null;
    expect(validateGraph(g).ok).toBe(false);
  });

  it("flags Option A with empty next beat", () => {
    const g = minimalValid();
    g.nodes.r.optionA = { label: "A", nextNodeId: "", nextClipName: "x.mp4" };
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("Option A"))).toBe(true);
  });

  it("rejects end beat with branches", () => {
    const g = minimalValid();
    g.nodes.e.isEnd = true;
    g.nodes.e.optionA = { label: "X", nextNodeId: "r", nextClipName: "y.mp4" };
    expect(validateGraph(g).ok).toBe(false);
  });

  it("accepts demo rehearsal graph", () => {
    const demo = createDemoBranchingStoryGraph();
    expect(validateGraph(demo).ok).toBe(true);
  });
});
