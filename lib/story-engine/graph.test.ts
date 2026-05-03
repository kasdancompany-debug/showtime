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
        videoUrl: "https://example.com/x.mp4",
        localVideoKey: null,
        question: "Q?",
        optionA: { label: "A", nextNodeId: "e" },
        optionB: { label: "B", nextNodeId: "e" },
        isEnd: false,
      },
      e: {
        id: "e",
        title: "End",
        subtitle: null,
        videoUrl: "https://example.com/y.mp4",
        localVideoKey: null,
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

  it("flags missing video", () => {
    const g = minimalValid();
    g.nodes.r.videoUrl = null;
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("video"))).toBe(true);
  });

  it("flags missing vote question on non-ending beat", () => {
    const g = minimalValid();
    g.nodes.r.question = null;
    expect(validateGraph(g).ok).toBe(false);
  });

  it("flags Option A with empty next beat", () => {
    const g = minimalValid();
    g.nodes.r.optionA = { label: "A", nextNodeId: "" };
    const r = validateGraph(g);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("Option A"))).toBe(true);
  });

  it("rejects end beat with branches", () => {
    const g = minimalValid();
    g.nodes.e.isEnd = true;
    g.nodes.e.optionA = { label: "X", nextNodeId: "r" };
    expect(validateGraph(g).ok).toBe(false);
  });

  it("accepts demo rehearsal graph when media not required", () => {
    const demo = createDemoBranchingStoryGraph();
    expect(validateGraph(demo, { requireMedia: false }).ok).toBe(true);
    expect(validateGraph(demo, { requireMedia: true }).ok).toBe(false);
  });
});
