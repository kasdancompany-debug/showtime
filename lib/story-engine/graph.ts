import type { StoryBranch, StoryGraph, StoryNode, StoryNodeId } from "@/types";
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

/** Filename the operator should roll after `winner` wins at `voteNodeId`. */
export function nextClipForVoteWinner(
  graph: StoryGraph,
  voteNodeId: StoryNodeId,
  winner: VoteChoice,
): string | null {
  const node = graph.nodes[voteNodeId];
  if (!node) return null;
  const br = winner === "A" ? node.optionA : node.optionB;
  return br?.nextClipName?.trim() || null;
}

export function listNodeIds(graph: StoryGraph): StoryNodeId[] {
  return Object.keys(graph.nodes);
}

/** Raw JSON may omit clip names (legacy graphs); fills stable defaults. */
type RawNode = Partial<StoryNode> & {
  videoUrl?: string | null;
  localVideoKey?: string | null;
};

function defaultClipName(raw: RawNode, id: string): string {
  const o = raw.operatorClipName?.trim();
  if (o) return o;
  const base = (raw.title ?? "").trim() || id;
  return `${base.replace(/\s+/g, "_")}.mp4`;
}

/** Merge imported / legacy saves into the current story shape (clip names, no video fields). */
export function normalizeStoryGraph(graph: StoryGraph): StoryGraph {
  const raw = graph.nodes as Record<string, RawNode>;
  const clipById: Record<string, string> = {};
  for (const [id, n] of Object.entries(raw)) {
    clipById[id] = defaultClipName(n, id);
  }

  const nodes = {} as Record<StoryNodeId, StoryNode>;
  for (const [id, n] of Object.entries(raw)) {
    const normalizeBranch = (b: StoryBranch | RawNode["optionA"]): StoryBranch | null => {
      if (!b || !b.nextNodeId?.trim()) return null;
      const tid = b.nextNodeId.trim();
      const nextClip =
        (b as StoryBranch).nextClipName?.trim() ||
        clipById[tid] ||
        `${tid.replace(/\s+/g, "_")}.mp4`;
      return {
        label: b.label,
        nextNodeId: tid as StoryNodeId,
        nextClipName: nextClip,
      };
    };

    const lk = n.localVideoKey;
    const localVideoKey =
      typeof lk === "string" && lk.trim() ? lk.trim() : null;

    nodes[id as StoryNodeId] = {
      id: (n.id ?? id) as StoryNodeId,
      title: n.title ?? "",
      subtitle: n.subtitle ?? null,
      operatorClipName: clipById[id]!,
      localVideoKey,
      question: n.question ?? null,
      optionA: normalizeBranch(n.optionA ?? null),
      optionB: normalizeBranch(n.optionB ?? null),
      isEnd: Boolean(n.isEnd),
    };
  }
  return { rootId: graph.rootId, nodes };
}

function beatLabel(node: StoryNode, id: string) {
  const t = (node.title ?? "").trim() || "Untitled";
  return `“${t}” (${id})`;
}

export type ValidateGraphOptions = {
  /** @deprecated Video is not used; ignored. */
  requireMedia?: boolean;
};

/**
 * Structural checks for Story builder and operator start.
 * Clips are operator cues only — this app does not validate files exist on disk.
 */
export function validateGraph(graph: StoryGraph, opts: ValidateGraphOptions = {}): { ok: true } | { ok: false; errors: string[] } {
  void opts.requireMedia;
  const errors: string[] = [];
  if (!graph.nodes[graph.rootId]) errors.push("Root beat is missing — graph has no valid starting node.");

  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.id !== id) errors.push(`Node key ${id} does not match node.id ${node.id}`);

    if (!(node.operatorClipName ?? "").trim()) {
      errors.push(`${beatLabel(node, id)}: add an operator clip name (e.g. 01_Opening.mp4).`);
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
      if (!(branch.nextClipName ?? "").trim()) {
        errors.push(`${beatLabel(node, id)}: Option ${side} needs a “next clip” file name for the operator.`);
      }
    };

    checkBranch("A", node.optionA);
    checkBranch("B", node.optionB);

    if (!node.isEnd) {
      if (!(node.question ?? "").trim()) {
        errors.push(`${beatLabel(node, id)}: non-ending beats need a vote question.`);
      }
      if (!node.optionA) {
        errors.push(`${beatLabel(node, id)}: add Option A (label + next beat + next clip) for this fork.`);
      }
      if (!node.optionB) {
        errors.push(`${beatLabel(node, id)}: add Option B (label + next beat + next clip) for this fork.`);
      }
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Duplicate one beat (same branch wiring). Returns null if source missing. */
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
    localVideoKey: null,
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
