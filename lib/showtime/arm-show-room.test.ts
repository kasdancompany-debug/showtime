import { describe, expect, it } from "vitest";

import { sortStoryNodes } from "@/lib/showtime/arm-show-room";
import type { StoryNodeRow } from "@/lib/supabase/event-room";

function node(partial: Partial<StoryNodeRow> & { node_key: string; sort_order: number }): StoryNodeRow {
  return {
    id: partial.id ?? partial.node_key,
    event_id: "evt",
    node_key: partial.node_key,
    title: partial.title ?? partial.node_key,
    video: "",
    video_url: partial.video_url ?? "",
    operator_notes: "",
    beat_status: "draft",
    question: null,
    option_a_label: null,
    option_b_label: null,
    option_a_next_node_key: null,
    option_b_next_node_key: null,
    is_ending: false,
    sort_order: partial.sort_order,
    created_at: "",
    updated_at: "",
  } as StoryNodeRow;
}

describe("sortStoryNodes", () => {
  it("orders by sort_order then node_key", () => {
    const sorted = sortStoryNodes([
      node({ node_key: "02_B", sort_order: 1 }),
      node({ node_key: "01_A", sort_order: 0 }),
      node({ node_key: "01_Z", sort_order: 0 }),
    ]);
    expect(sorted.map((n) => n.node_key)).toEqual(["01_A", "01_Z", "02_B"]);
  });
});
