import { describe, expect, it } from "vitest";

import { materializeExperienceToBranchNodes } from "@/lib/showtime/materialize-experience";
import type { ExperienceSceneRow, ExperienceVoteMomentRow } from "@/lib/showtime/materialize-experience";

function scene(p: Partial<ExperienceSceneRow> & { id: string; title: string }): ExperienceSceneRow {
  return {
    experience_id: "exp-1",
    order_index: 0,
    description: "",
    media_url: null,
    duration_seconds: null,
    created_at: "",
    updated_at: "",
    ...p,
  };
}

function vote(p: Partial<ExperienceVoteMomentRow> & { id: string; question: string }): ExperienceVoteMomentRow {
  return {
    experience_id: "exp-1",
    scene_id: null,
    order_index: 0,
    choice_a: "A",
    choice_b: "B",
    countdown_seconds: 45,
    result_mode: "majority",
    branch_a: null,
    branch_b: null,
    created_at: "",
    updated_at: "",
    ...p,
  };
}

describe("materializeExperienceToBranchNodes", () => {
  it("merges scene and linked vote into one beat", () => {
    const nodes = materializeExperienceToBranchNodes(
      [scene({ id: "s1", title: "Opening", order_index: 0, media_url: "https://x/open.mp4" })],
      [
        vote({
          id: "v1",
          scene_id: "s1",
          order_index: 1,
          question: "Go left?",
          choice_a: "Left",
          choice_b: "Right",
        }),
      ],
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.video_url).toBe("https://x/open.mp4");
    expect(nodes[0]?.question).toBe("Go left?");
  });

  it("auto-wires continue vote for scene-only beats", () => {
    const nodes = materializeExperienceToBranchNodes(
      [
        scene({ id: "s1", title: "A", order_index: 0, media_url: "/a.mp4" }),
        scene({ id: "s2", title: "B", order_index: 1, media_url: "/b.mp4" }),
      ],
      [],
    );
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.question).toBe("Continue?");
    expect(nodes[0]?.option_a_next_node_key).toBe(nodes[1]?.node_key);
  });
});
