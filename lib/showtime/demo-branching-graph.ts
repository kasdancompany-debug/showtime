import { normalizeStoryGraph } from "@/lib/story-engine/graph";
import type { StoryGraph } from "@/types";

/**
 * Minimal 3-node branching story for rehearsal — operator plays files manually.
 */
export function createDemoBranchingStoryGraph(): StoryGraph {
  return normalizeStoryGraph({
    rootId: "demo-root",
    nodes: {
      "demo-root": {
        id: "demo-root",
        title: "Opening beat",
        subtitle: "Rehearsal graph",
        operatorClipName: "01_opening.mp4",
        question: "Which thread should the story follow?",
        optionA: { label: "The coral corridor", nextNodeId: "demo-coral", nextClipName: "02A_coral.mp4" },
        optionB: { label: "The teal tunnel", nextNodeId: "demo-teal", nextClipName: "02B_teal.mp4" },
        isEnd: false,
      },
      "demo-coral": {
        id: "demo-coral",
        title: "Coral finale",
        subtitle: "Sample ending — Option A path",
        operatorClipName: "03_coral_finale.mp4",
        question: null,
        optionA: null,
        optionB: null,
        isEnd: true,
      },
      "demo-teal": {
        id: "demo-teal",
        title: "Teal finale",
        subtitle: "Sample ending — Option B path",
        operatorClipName: "03_teal_finale.mp4",
        question: null,
        optionA: null,
        optionB: null,
        isEnd: true,
      },
    },
  });
}
