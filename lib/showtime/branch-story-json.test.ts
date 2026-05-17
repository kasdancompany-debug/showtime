import { describe, expect, it } from "vitest";

import { exportBranchStoryDocument, importBranchStoryDocument } from "@/lib/showtime/branch-story-json";
import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";
import { inferLibraryFromNodes } from "@/lib/showtime/video-library";

const sample: BranchEditorNode[] = [
  {
    node_key: "01_A",
    title: "Open",
    video_url: "https://cdn.example/a.mp4",
    operator_notes: "Open house",
    beat_status: "ready",
    question: "Q?",
    option_a_label: "A",
    option_b_label: "B",
    option_a_next_node_key: "02_B",
    option_b_next_node_key: "02_B",
    is_ending: false,
    sort_order: 1,
  },
  {
    node_key: "02_B",
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
    sort_order: 0,
  },
];

describe("branch-story-json", () => {
  it("round-trips export → import with stable sort order", () => {
    const lib = inferLibraryFromNodes(sample);
    const json = exportBranchStoryDocument(sample, lib);
    expect(json).toContain('"beats"');
    expect(json).toContain('"beat_code"');
    const r = importBranchStoryDocument(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes).toHaveLength(2);
    expect(r.videoLibrary.length).toBeGreaterThan(0);
    expect(r.nodes[0]?.node_key).toBe("02_B");
    expect(r.nodes[1]?.node_key).toBe("01_A");
    expect(r.nodes[0]?.sort_order).toBe(0);
    expect(r.nodes[1]?.sort_order).toBe(1);
  });

  it("imports legacy v2 backup with nodes + node_key", () => {
    const legacy = JSON.stringify({
      format: "kasdan-branch-story",
      version: 2,
      nodes: [
        {
          node_key: "A1",
          title: "One",
          video_url: "https://cdn.example/1.mp4",
          question: "Q",
          option_a_label: "a",
          option_b_label: "b",
          option_a_next_node_key: "A2",
          option_b_next_node_key: "A2",
          is_ending: false,
        },
        {
          node_key: "A2",
          title: "Two",
          video_url: "https://cdn.example/2.mp4",
          question: "",
          option_a_label: "",
          option_b_label: "",
          option_a_next_node_key: "",
          option_b_next_node_key: "",
          is_ending: true,
        },
      ],
    });
    const r = importBranchStoryDocument(legacy);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.map((n) => n.node_key).sort()).toEqual(["A1", "A2"]);
  });

  it("rejects bad format", () => {
    const r = importBranchStoryDocument("{}");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
