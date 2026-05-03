import type { ShowtimeEvent, StoryGraph } from "@/types";

/** One blank beat — add branches and clip names in Story builder. */
export const EMPTY_STORY_GRAPH: StoryGraph = {
  rootId: "opening",
  nodes: {
    opening: {
      id: "opening",
      title: "Opening",
      subtitle: null,
      operatorClipName: "00_placeholder.mp4",
      localVideoKey: null,
      question: null,
      optionA: null,
      optionB: null,
      isEnd: true,
    },
  },
};

export const MOCK_EVENT: ShowtimeEvent = {
  id: "evt_local_01",
  title: "Untitled picture",
  eventCode: "NIGHT1",
  storyGraphId: "graph_local",
  currentNodeId: EMPTY_STORY_GRAPH.rootId,
  createdAt: new Date().toISOString(),
};
