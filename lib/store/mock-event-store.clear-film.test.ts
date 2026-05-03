import { beforeEach, describe, expect, it, vi } from "vitest";

import * as localVideoStore from "@/lib/media/local-video-store";
import { MOCK_EVENT } from "@/lib/mock-data";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import type { StoryGraph } from "@/types";

vi.mock("@/lib/media/local-video-store", () => ({
  deleteLocalVideoBlob: vi.fn().mockResolvedValue(undefined),
  clearAllLocalVideoBlobs: vi.fn().mockResolvedValue(undefined),
  getLocalVideoBlob: vi.fn(),
  putLocalVideoBlob: vi.fn(),
}));

const graphWithLocal: StoryGraph = {
  rootId: "opening",
  nodes: {
    opening: {
      id: "opening",
      title: "Opening",
      subtitle: null,
      videoUrl: "https://example.com/a.mp4",
      localVideoKey: "k_test_1",
      question: null,
      optionA: null,
      optionB: null,
      isEnd: true,
    },
  },
};

beforeEach(() => {
  useMockEventStore.getState().clearActiveFilm();
  vi.mocked(localVideoStore.deleteLocalVideoBlob).mockClear();
});

describe("clearActiveFilmIfSavedFilm", () => {
  it("clears operator runtime when the active saved film id matches", () => {
    useMockEventStore.getState().loadStoryGraph(structuredClone(graphWithLocal) as StoryGraph, {
      displayName: "Lib",
      eventTitle: "Night",
      savedFilmId: "film_xyz",
    });
    expect(useMockEventStore.getState().activeSavedFilmId).toBe("film_xyz");
    expect(useMockEventStore.getState().graph.nodes.opening?.videoUrl).toBeTruthy();

    useMockEventStore.getState().clearActiveFilmIfSavedFilm("film_xyz");

    expect(useMockEventStore.getState().activeSavedFilmId).toBeNull();
    expect(useMockEventStore.getState().graph.nodes.opening?.videoUrl).toBeNull();
    expect(useMockEventStore.getState().eventTitle).toBe(MOCK_EVENT.title);
  });

  it("does not clear when a different saved film id is passed", () => {
    useMockEventStore.getState().loadStoryGraph(structuredClone(graphWithLocal) as StoryGraph, {
      savedFilmId: "film_a",
    });
    useMockEventStore.getState().clearActiveFilmIfSavedFilm("film_b");
    expect(useMockEventStore.getState().activeSavedFilmId).toBe("film_a");
    expect(useMockEventStore.getState().graph.nodes.opening?.videoUrl).toBeTruthy();
  });
});

describe("clearCurrentNodeMedia", () => {
  it("removes remote and local media fields and deletes the IndexedDB key", async () => {
    useMockEventStore.getState().loadStoryGraph(structuredClone(graphWithLocal) as StoryGraph, {});
    await useMockEventStore.getState().clearCurrentNodeMedia();
    const n = useMockEventStore.getState().graph.nodes.opening;
    expect(n?.videoUrl).toBeNull();
    expect(n?.localVideoKey).toBeNull();
    expect(vi.mocked(localVideoStore.deleteLocalVideoBlob)).toHaveBeenCalledWith("k_test_1");
  });
});
