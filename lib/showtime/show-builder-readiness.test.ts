import { describe, expect, it } from "vitest";

import { computeShowReadiness } from "@/lib/showtime/show-builder-readiness";
import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";

function node(p: Partial<BranchEditorNode>): BranchEditorNode {
  return {
    node_key: "01",
    title: "T",
    video_url: "https://x/a.mp4",
    operator_notes: "n",
    beat_status: "ready",
    question: "Q?",
    option_a_label: "A",
    option_b_label: "B",
    option_a_next_node_key: "02",
    option_b_next_node_key: "02",
    is_ending: false,
    sort_order: 0,
    ...p,
  };
}

describe("computeShowReadiness", () => {
  it("flags missing video", () => {
    const rows = computeShowReadiness({
      nodes: [node({ video_url: "" })],
      structuralErrors: [],
      screenTestAcknowledged: true,
    });
    expect(rows.find((r) => r.id === "videos")?.ok).toBe(false);
  });

  it("passes screen when acknowledged", () => {
    const rows = computeShowReadiness({
      nodes: [node({}), { ...node({ node_key: "02", sort_order: 1 }), is_ending: true, question: "", option_a_label: "", option_b_label: "", option_a_next_node_key: "", option_b_next_node_key: "" }],
      structuralErrors: [],
      screenTestAcknowledged: true,
    });
    expect(rows.find((r) => r.id === "screen")?.ok).toBe(true);
  });
});
