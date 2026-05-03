import { normalizeStoryGraph } from "@/lib/story-engine/graph";
import type { StoryGraph } from "@/types";

/**
 * Minimal 3-node branching story for rehearsal — no uploaded videos required.
 * Root vote → two ending beats (coral / teal paths).
 */
export function createDemoBranchingStoryGraph(): StoryGraph {
  return normalizeStoryGraph({
    rootId: "demo-root",
    nodes: {
      "demo-root": {
        id: "demo-root",
        title: "Opening beat",
        subtitle: "Rehearsal graph — add real media later in Story builder",
        videoUrl: null,
        localVideoKey: null,
        question: "Which thread should the story follow?",
        optionA: { label: "The coral corridor", nextNodeId: "demo-coral" },
        optionB: { label: "The teal tunnel", nextNodeId: "demo-teal" },
        isEnd: false,
      },
      "demo-coral": {
        id: "demo-coral",
        title: "Coral finale",
        subtitle: "Sample ending — Option A path",
        videoUrl: null,
        localVideoKey: null,
        question: null,
        optionA: null,
        optionB: null,
        isEnd: true,
      },
      "demo-teal": {
        id: "demo-teal",
        title: "Teal finale",
        subtitle: "Sample ending — Option B path",
        videoUrl: null,
        localVideoKey: null,
        question: null,
        optionA: null,
        optionB: null,
        isEnd: true,
      },
    },
  });
}
