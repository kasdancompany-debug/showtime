import type { StoryGraph, StoryNodeId } from "@/types";

export const STORY_BUILDER_LOCAL_STORAGE_KEY = "showtime-story-builder-disk-v1";

export type StoryBuilderFileV1 = {
  version: 1;
  savedAt: string;
  graph: StoryGraph;
  orderedNodeIds: StoryNodeId[];
};

export function saveStoryBuilderLocal(graph: StoryGraph, orderedNodeIds: StoryNodeId[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload: StoryBuilderFileV1 = {
      version: 1,
      savedAt: new Date().toISOString(),
      graph,
      orderedNodeIds,
    };
    localStorage.setItem(STORY_BUILDER_LOCAL_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function loadStoryBuilderLocal(): StoryBuilderFileV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORY_BUILDER_LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoryBuilderFileV1>;
    if (parsed.version !== 1 || !parsed.graph?.nodes || !parsed.graph.rootId) return null;
    const ids = Array.isArray(parsed.orderedNodeIds) ? parsed.orderedNodeIds : [];
    return {
      version: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      graph: parsed.graph,
      orderedNodeIds: ids as StoryNodeId[],
    };
  } catch {
    return null;
  }
}

export function downloadStoryJson(graph: StoryGraph, orderedNodeIds: StoryNodeId[], filename = "showtime-story.json") {
  const payload = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    graph,
    orderedNodeIds,
    note: "Local video keys reference IndexedDB on the machine where files were picked — other browsers cannot play them.",
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedStoryJson(text: string):
  | { ok: true; graph: StoryGraph; orderedNodeIds: StoryNodeId[] }
  | { ok: false; error: string } {
  try {
    const data = JSON.parse(text) as {
      graph?: StoryGraph;
      orderedNodeIds?: StoryNodeId[];
    };
    const g = data.graph;
    if (!g?.nodes || !g.rootId || !g.nodes[g.rootId]) {
      return { ok: false, error: "JSON must include graph.nodes and graph.rootId." };
    }
    const order = Array.isArray(data.orderedNodeIds) ? data.orderedNodeIds : Object.keys(g.nodes);
    return { ok: true, graph: g, orderedNodeIds: order as StoryNodeId[] };
  } catch {
    return { ok: false, error: "Could not parse JSON." };
  }
}
