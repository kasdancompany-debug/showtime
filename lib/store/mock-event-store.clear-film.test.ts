import { beforeEach, describe, expect, it } from "vitest";

import { EMPTY_STORY_GRAPH, MOCK_EVENT } from "@/lib/mock-data";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import type { StoryGraph } from "@/types";

const graphWithClip: StoryGraph = {
  rootId: "opening",
  nodes: {
    opening: {
      id: "opening",
      title: "Opening",
      subtitle: null,
      operatorClipName: "01_opening.mp4",
      localVideoKey: null,
      question: null,
      optionA: null,
      optionB: null,
      isEnd: true,
    },
  },
};

beforeEach(() => {
  useMockEventStore.getState().clearActiveFilm();
});

describe("clearActiveFilmIfSavedFilm", () => {
  it("clears operator runtime when the active saved film id matches", () => {
    useMockEventStore.getState().loadStoryGraph(structuredClone(graphWithClip) as StoryGraph, {
      displayName: "Lib",
      eventTitle: "Night",
      savedFilmId: "film_xyz",
    });
    expect(useMockEventStore.getState().activeSavedFilmId).toBe("film_xyz");
    expect(useMockEventStore.getState().graph.nodes.opening?.operatorClipName).toBe("01_opening.mp4");

    useMockEventStore.getState().clearActiveFilmIfSavedFilm("film_xyz");

    expect(useMockEventStore.getState().activeSavedFilmId).toBeNull();
    expect(useMockEventStore.getState().graph.nodes.opening?.operatorClipName).toBe(
      EMPTY_STORY_GRAPH.nodes.opening.operatorClipName,
    );
    expect(useMockEventStore.getState().eventTitle).toBe(MOCK_EVENT.title);
  });

  it("does not clear when a different saved film id is passed", () => {
    useMockEventStore.getState().loadStoryGraph(structuredClone(graphWithClip) as StoryGraph, {
      savedFilmId: "film_a",
    });
    useMockEventStore.getState().clearActiveFilmIfSavedFilm("film_b");
    expect(useMockEventStore.getState().activeSavedFilmId).toBe("film_a");
    expect(useMockEventStore.getState().graph.nodes.opening?.operatorClipName).toBe("01_opening.mp4");
  });
});

describe("clearCurrentNodeMedia", () => {
  it("is a no-op (clip-based operator workflow)", async () => {
    useMockEventStore.getState().loadStoryGraph(structuredClone(graphWithClip) as StoryGraph, {});
    const before = useMockEventStore.getState().graph.nodes.opening?.operatorClipName;
    await useMockEventStore.getState().clearCurrentNodeMedia();
    expect(useMockEventStore.getState().graph.nodes.opening?.operatorClipName).toBe(before);
  });
});
