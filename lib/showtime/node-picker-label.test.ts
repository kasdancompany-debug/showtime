import { describe, expect, it } from "vitest";

import type { StoryGraph } from "@/types";

import { nodePickerLabel } from "./node-picker-label";

function miniGraph(): StoryGraph {
  return {
    rootId: "a",
    nodes: {
      a: {
        id: "a",
        title: "Opening",
        subtitle: null,
        operatorClipName: "a.mp4",
        question: null,
        optionA: null,
        optionB: null,
        isEnd: false,
      },
      b: {
        id: "b",
        title: "Fork",
        subtitle: null,
        operatorClipName: "b.mp4",
        question: null,
        optionA: null,
        optionB: null,
        isEnd: true,
      },
      c: {
        id: "c",
        title: "Fork",
        subtitle: null,
        operatorClipName: "c.mp4",
        question: null,
        optionA: null,
        optionB: null,
        isEnd: true,
      },
    },
  };
}

describe("nodePickerLabel", () => {
  it("uses title when unique, adds id when titles collide", () => {
    const g = miniGraph();
    expect(nodePickerLabel(g, "a")).toBe("Opening");
    expect(nodePickerLabel(g, "b")).toBe("Fork · b");
    expect(nodePickerLabel(g, "c")).toBe("Fork · c");
  });
});
