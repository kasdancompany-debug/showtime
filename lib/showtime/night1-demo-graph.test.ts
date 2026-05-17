import { describe, expect, it } from "vitest";

import { getNight1DemoNodes } from "@/lib/showtime/night1-demo-graph";
import { validateBranchStory } from "@/lib/showtime/branch-story-validate";

describe("NIGHT1 demo graph", () => {
  it("passes branch validation", () => {
    const { ok, errors, warnings } = validateBranchStory(getNight1DemoNodes());
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(ok).toBe(true);
  });

  it("has five beats, three votes, two endings", () => {
    const nodes = getNight1DemoNodes();
    expect(nodes).toHaveLength(5);
    expect(nodes.filter((n) => !n.is_ending)).toHaveLength(3);
    expect(nodes.filter((n) => n.is_ending)).toHaveLength(2);
  });
});
