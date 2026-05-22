import { describe, expect, it } from "vitest";

import { validateBranchStory, type BranchEditorNode } from "@/lib/showtime/branch-story-validate";

function baseNode(p: Partial<BranchEditorNode>): BranchEditorNode {
  return {
    node_key: "01_A",
    title: "T",
    video_url: "https://cdn.example/clip.mp4",
    operator_notes: "Notes",
    beat_status: "ready",
    question: "Q?",
    option_a_label: "A",
    option_b_label: "B",
    option_a_next_node_key: "02_B",
    option_b_next_node_key: "02_B",
    is_ending: false,
    sort_order: 0,
    ...p,
  };
}

describe("validateBranchStory (hosted URL only)", () => {
  it("requires video_url for non-ending", () => {
    const nodes = [
      baseNode({ node_key: "01_A", video_url: "", option_a_next_node_key: "02_B", option_b_next_node_key: "02_B" }),
      baseNode({ node_key: "02_B", sort_order: 1, option_a_next_node_key: "01_A", option_b_next_node_key: "01_A" }),
    ];
    const { ok, errors } = validateBranchStory(nodes);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("reel") || e.includes("video"))).toBe(true);
  });

  it("ending must not have question, options, or next keys", () => {
    const nodes: BranchEditorNode[] = [
    {
      node_key: "END",
      title: "Fin",
      video_url: "https://cdn.example/e.mp4",
      operator_notes: "",
      beat_status: "draft",
      question: "Bad",
        option_a_label: "a",
        option_b_label: "b",
        option_a_next_node_key: "X",
        option_b_next_node_key: "",
        is_ending: true,
        sort_order: 0,
      },
    ];
    const { ok, errors } = validateBranchStory(nodes);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("question"))).toBe(true);
    expect(errors.some((e) => e.includes("option labels"))).toBe(true);
    expect(errors.some((e) => e.includes("next beat"))).toBe(true);
  });

  it("passes two-node graph with ending", () => {
    const nodes: BranchEditorNode[] = [
      {
        node_key: "01_A",
        title: "Open",
        video_url: "https://cdn.example/a.mp4",
        operator_notes: "",
        beat_status: "ready",
        question: "Q?",
        option_a_label: "A",
        option_b_label: "B",
        option_a_next_node_key: "02_END",
        option_b_next_node_key: "02_END",
        is_ending: false,
        sort_order: 0,
      },
      {
        node_key: "02_END",
        title: "End",
        video_url: "https://cdn.example/b.mp4",
        operator_notes: "",
        beat_status: "ready",
        question: "",
        option_a_label: "",
        option_b_label: "",
        option_a_next_node_key: "",
        option_b_next_node_key: "",
        is_ending: true,
        sort_order: 1,
      },
    ];
    const { ok, errors } = validateBranchStory(nodes);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it("adds live-readiness warnings when graph is valid", () => {
    const nodes: BranchEditorNode[] = [
      {
        node_key: "01_A",
        title: "Open",
        video_url: "https://cdn.example/a.mp4",
        operator_notes: "",
        beat_status: "ready",
        question: "Q?",
        option_a_label: "A",
        option_b_label: "B",
        option_a_next_node_key: "02_END",
        option_b_next_node_key: "02_END",
        is_ending: false,
        sort_order: 0,
      },
      {
        node_key: "02_END",
        title: "End",
        video_url: "https://cdn.example/b.mp4",
        operator_notes: "",
        beat_status: "draft",
        question: "",
        option_a_label: "",
        option_b_label: "",
        option_a_next_node_key: "",
        option_b_next_node_key: "",
        is_ending: true,
        sort_order: 1,
      },
    ];
    const { ok, warnings } = validateBranchStory(nodes);
    expect(ok).toBe(true);
    expect(warnings.some((w) => w.includes("02_END") && w.includes("Draft"))).toBe(true);
  });
});
