import { getNode } from "@/lib/story-engine/graph";
import type { StoryGraph, StoryNode, StoryNodeId } from "@/types";

/** First DFS path from root to `targetId` (for timeline breadcrumbs). */
export function pathFromRoot(graph: StoryGraph, targetId: StoryNodeId): StoryNodeId[] | null {
  const { rootId, nodes } = graph;
  function dfs(id: StoryNodeId, stack: StoryNodeId[]): StoryNodeId[] | null {
    if (stack.includes(id)) return null;
    const path = [...stack, id];
    if (id === targetId) return path;
    const n = nodes[id];
    if (!n) return null;
    const kids: StoryNodeId[] = [];
    if (n.optionA?.nextNodeId) kids.push(n.optionA.nextNodeId);
    if (n.optionB?.nextNodeId) kids.push(n.optionB.nextNodeId);
    for (const k of kids) {
      const hit = dfs(k, path);
      if (hit) return hit;
    }
    return null;
  }
  return dfs(rootId, []);
}

export type BranchOutlook = {
  kind: "end";
} | {
  kind: "branch";
  a: { nextId: StoryNodeId; branchLabel: string; beatTitle: string } | null;
  b: { nextId: StoryNodeId; branchLabel: string; beatTitle: string } | null;
} | {
  kind: "leaf";
};

export function branchOutlookFromNode(graph: StoryGraph, nodeId: StoryNodeId): BranchOutlook {
  const n = getNode(graph, nodeId);
  if (!n) return { kind: "leaf" };
  if (n.isEnd) return { kind: "end" };
  const pick = (branch: StoryNode["optionA"], side: "A" | "B") => {
    if (!branch?.nextNodeId?.trim()) return null;
    const next = getNode(graph, branch.nextNodeId);
    return {
      nextId: branch.nextNodeId,
      branchLabel: branch.label?.trim() || `Option ${side}`,
      beatTitle: next?.title?.trim() || branch.nextNodeId,
    };
  };
  const a = pick(n.optionA, "A");
  const b = pick(n.optionB, "B");
  if (!a && !b) return { kind: "leaf" };
  return { kind: "branch", a, b };
}
