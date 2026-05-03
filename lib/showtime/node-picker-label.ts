import type { StoryGraph, StoryNodeId } from "@/types";

/**
 * Human-readable label for node pickers. Disambiguates duplicate titles with the internal id.
 */
export function nodePickerLabel(graph: StoryGraph, id: StoryNodeId): string {
  const n = graph.nodes[id];
  const title = (n?.title ?? "").trim() || "Untitled beat";
  const sameTitle = Object.values(graph.nodes).filter((x) => ((x.title ?? "").trim() || "Untitled beat") === title).length;
  if (sameTitle > 1) return `${title} · ${id}`;
  return title;
}
