import type { StoryGraph, StoryNode, StoryNodeId } from "@/types";
import type { VoteChoice } from "@/types";

export function getNode(graph: StoryGraph, id: StoryNodeId): StoryNode | undefined {
  return graph.nodes[id];
}

export function getRootNode(graph: StoryGraph): StoryNode {
  const n = graph.nodes[graph.rootId];
  if (!n) throw new Error("StoryGraph missing root node");
  return n;
}

export function nextNodeAfterVote(
  graph: StoryGraph,
  nodeId: StoryNodeId,
  choice: VoteChoice,
): StoryNodeId | null {
  const node = graph.nodes[nodeId];
  if (!node) return null;
  const branch = choice === "A" ? node.optionA : node.optionB;
  return branch?.nextNodeId ?? null;
}

export function listNodeIds(graph: StoryGraph): StoryNodeId[] {
  return Object.keys(graph.nodes);
}

/** Ensure optional fields exist after JSON import / legacy saves. */
export function normalizeStoryGraph(graph: StoryGraph): StoryGraph {
  const nodes = {} as Record<StoryNodeId, StoryNode>;
  for (const [k, raw] of Object.entries(graph.nodes)) {
    const n = raw as StoryNode;
    nodes[k as StoryNodeId] = {
      ...n,
      subtitle: n.subtitle ?? null,
      localVideoKey: n.localVideoKey ?? null,
    };
  }
  return { rootId: graph.rootId, nodes };
}

function beatLabel(node: StoryNode, id: string) {
  const t = (node.title ?? "").trim() || "Untitled";
  return `“${t}” (${id})`;
}

export type ValidateGraphOptions = {
  /** When false, skips “missing video” checks (rehearsal graphs / dry assets). Default true. */
  requireMedia?: boolean;
};

/**
 * Structural + production checks for Story builder and operator load.
 */
export function validateGraph(
  graph: StoryGraph,
  opts: ValidateGraphOptions = {},
): { ok: true } | { ok: false; errors: string[] } {
  const requireMedia = opts.requireMedia !== false;
  const errors: string[] = [];
  if (!graph.nodes[graph.rootId]) errors.push("Root beat is missing — graph has no valid starting node.");

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.id !== id) errors.push(`Node key ${id} does not match node.id ${node.id}`);

    const hasMedia =
      Boolean(node.videoUrl?.trim()) || Boolean(node.localVideoKey && String(node.localVideoKey).trim());
    if (requireMedia && !hasMedia) {
      errors.push(`${beatLabel(node, id)}: add a video URL or a local file for this beat.`);
    }

    const hasBranch = Boolean(node.optionA || node.optionB);
    if (node.isEnd && hasBranch) {
      errors.push(`${beatLabel(node, id)}: end beats cannot have Option A/B branches — turn off “End beat” or remove branches.`);
    }

    const checkBranch = (side: "A" | "B", branch: StoryNode["optionA"]) => {
      if (!branch) return;
      const target = branch.nextNodeId;
      if (!target?.trim()) {
        errors.push(`${beatLabel(node, id)}: Option ${side} has no next beat selected.`);
        return;
      }
      if (!graph.nodes[target]) {
        errors.push(`${beatLabel(node, id)}: Option ${side} points to missing beat “${target}”.`);
      }
      if (!(branch.label ?? "").trim()) {
        errors.push(`${beatLabel(node, id)}: Option ${side} needs a label for the audience.`);
      }
    };

    checkBranch("A", node.optionA);
    checkBranch("B", node.optionB);

    if (!node.isEnd) {
      if (!(node.question ?? "").trim()) {
        errors.push(`${beatLabel(node, id)}: non-ending beats need a vote question.`);
      }
      if (!node.optionA) {
        errors.push(`${beatLabel(node, id)}: add Option A (label + next beat) for this fork.`);
      }
      if (!node.optionB) {
        errors.push(`${beatLabel(node, id)}: add Option B (label + next beat) for this fork.`);
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Duplicate one beat (same branch wiring and media keys). Returns null if source missing. */
export function duplicateNodeInGraph(
  graph: StoryGraph,
  sourceId: StoryNodeId,
): { graph: StoryGraph; newId: StoryNodeId } | null {
  const src = graph.nodes[sourceId];
  if (!src) return null;

  let newId = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` as StoryNodeId;
  while (graph.nodes[newId]) {
    newId = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` as StoryNodeId;
  }

  const copy: StoryNode = {
    ...src,
    id: newId,
    title: `${src.title || "Beat"} (copy)`,
  };

  return {
    graph: {
      ...graph,
      nodes: { ...graph.nodes, [newId]: copy },
    },
    newId,
  };
}

/** Rename a beat id and rewrite all branch pointers. Returns null if invalid or collision. */
export function renameNodeIdInGraph(graph: StoryGraph, oldId: StoryNodeId, newId: StoryNodeId): StoryGraph | null {
  const trimmed = newId.trim().replace(/\s+/g, "_");
  if (!trimmed || oldId === trimmed || !graph.nodes[oldId] || graph.nodes[trimmed]) return null;

  const remap = (nid: StoryNodeId) => (nid === oldId ? trimmed : nid);

  const nodes: Record<StoryNodeId, StoryNode> = {};

  for (const [key, node] of Object.entries(graph.nodes)) {
    const nextKey = key === oldId ? trimmed : key;
    nodes[nextKey as StoryNodeId] = {
      ...node,
      id: key === oldId ? trimmed : node.id,
      optionA: node.optionA
        ? { ...node.optionA, nextNodeId: remap(node.optionA.nextNodeId as StoryNodeId) }
        : null,
      optionB: node.optionB
        ? { ...node.optionB, nextNodeId: remap(node.optionB.nextNodeId as StoryNodeId) }
        : null,
    };
  }

  return {
    rootId: graph.rootId === oldId ? trimmed : graph.rootId,
    nodes,
  };
}

/** Keep a stable node list order in sync with graph keys (for reorder UI). */
export function syncNodeListOrder(ordered: StoryNodeId[], graph: StoryGraph): StoryNodeId[] {
  const keys = new Set(listNodeIds(graph));
  const next = ordered.filter((id) => keys.has(id));
  for (const id of keys) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

/**
 * Removes a node and clears any branch whose `nextNodeId` pointed at it.
 * Returns `null` if `id` is the graph root (root cannot be removed).
 */
export function removeNodeFromGraph(graph: StoryGraph, id: StoryNodeId): StoryGraph | null {
  if (id === graph.rootId || !graph.nodes[id]) return null;

  const nodes = {} as Record<StoryNodeId, StoryNode>;

  for (const nid of Object.keys(graph.nodes) as StoryNodeId[]) {
    if (nid === id) continue;

    const node = graph.nodes[nid];
    let optionA = node.optionA;
    let optionB = node.optionB;
    if (optionA?.nextNodeId === id) optionA = null;
    if (optionB?.nextNodeId === id) optionB = null;

    const hasBranch = Boolean(optionA || optionB);
    nodes[nid] = {
      ...node,
      optionA,
      optionB,
      isEnd: !hasBranch,
    };
  }

  return { rootId: graph.rootId, nodes };
}
