import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";
import { repackSortOrder } from "@/lib/showtime/branch-story-validate";
import type { Database } from "@/lib/supabase/database.types";

export type ExperienceSceneRow = Database["public"]["Tables"]["experience_scenes"]["Row"];
export type ExperienceVoteMomentRow = Database["public"]["Tables"]["experience_vote_moments"]["Row"];

type TimelineItem =
  | { kind: "scene"; order: number; scene: ExperienceSceneRow }
  | { kind: "vote"; order: number; vote: ExperienceVoteMomentRow };

function beatKey(index: number): string {
  return `BEAT_${String(index + 1).padStart(2, "0")}`;
}

function combinedNode(
  scene: ExperienceSceneRow,
  vote: ExperienceVoteMomentRow,
  sortOrder: number,
  nodeKey: string,
): BranchEditorNode {
  return {
    node_key: nodeKey,
    title: scene.title.trim() || vote.question.trim(),
    video_url: scene.media_url?.trim() ?? "",
    operator_notes: scene.description.trim(),
    beat_status: "ready",
    question: vote.question.trim(),
    option_a_label: vote.choice_a.trim(),
    option_b_label: vote.choice_b.trim(),
    option_a_next_node_key: vote.branch_a?.trim() ?? "",
    option_b_next_node_key: vote.branch_b?.trim() ?? "",
    is_ending: false,
    sort_order: sortOrder,
  };
}

function sceneOnlyNode(scene: ExperienceSceneRow, sortOrder: number, nodeKey: string, isEnding: boolean): BranchEditorNode {
  return {
    node_key: nodeKey,
    title: scene.title.trim(),
    video_url: scene.media_url?.trim() ?? "",
    operator_notes: scene.description.trim(),
    beat_status: "ready",
    question: "",
    option_a_label: "",
    option_b_label: "",
    option_a_next_node_key: "",
    option_b_next_node_key: "",
    is_ending: isEnding,
    sort_order: sortOrder,
  };
}

function voteOnlyNode(vote: ExperienceVoteMomentRow, sortOrder: number, nodeKey: string): BranchEditorNode {
  return {
    node_key: nodeKey,
    title: vote.question.trim(),
    video_url: "",
    operator_notes: "",
    beat_status: "ready",
    question: vote.question.trim(),
    option_a_label: vote.choice_a.trim(),
    option_b_label: vote.choice_b.trim(),
    option_a_next_node_key: vote.branch_a?.trim() ?? "",
    option_b_next_node_key: vote.branch_b?.trim() ?? "",
    is_ending: false,
    sort_order: sortOrder,
  };
}

/** Merge scenes and vote moments into story beats for `replaceStoryNodesForEvent`. */
export function materializeExperienceToBranchNodes(
  scenes: ExperienceSceneRow[],
  votes: ExperienceVoteMomentRow[],
): BranchEditorNode[] {
  const items: TimelineItem[] = [
    ...scenes.map((scene) => ({ kind: "scene" as const, order: scene.order_index, scene })),
    ...votes.map((vote) => ({ kind: "vote" as const, order: vote.order_index, vote })),
  ].sort((a, b) => a.order - b.order || (a.kind === "scene" ? -1 : 1));

  const draft: BranchEditorNode[] = [];
  let pendingScene: ExperienceSceneRow | null = null;
  let beatIndex = 0;

  const flushPendingScene = (isLast: boolean) => {
    if (!pendingScene) return;
    draft.push(sceneOnlyNode(pendingScene, draft.length, beatKey(beatIndex), isLast));
    beatIndex += 1;
    pendingScene = null;
  };

  for (const item of items) {
    if (item.kind === "scene") {
      flushPendingScene(false);
      pendingScene = item.scene;
      continue;
    }

    const vote = item.vote;
    if (pendingScene && (!vote.scene_id || vote.scene_id === pendingScene.id)) {
      draft.push(combinedNode(pendingScene, vote, draft.length, beatKey(beatIndex)));
      beatIndex += 1;
      pendingScene = null;
    } else {
      flushPendingScene(false);
      draft.push(voteOnlyNode(vote, draft.length, beatKey(beatIndex)));
      beatIndex += 1;
    }
  }

  flushPendingScene(true);

  const nodes = repackSortOrder(draft);
  const keyByIndex = nodes.map((n) => n.node_key);
  const validKeys = new Set(keyByIndex);

  const resolveBranch = (raw: string, fallback: string): string => {
    const k = raw.trim();
    if (k && validKeys.has(k)) return k;
    return fallback;
  };

  return nodes.map((n, i) => {
    const nextKey = keyByIndex[i + 1] ?? "";
    const hasVote =
      Boolean(n.question.trim()) &&
      Boolean(n.option_a_label.trim()) &&
      Boolean(n.option_b_label.trim());

    if (hasVote) {
      const a = resolveBranch(n.option_a_next_node_key, nextKey);
      const b = resolveBranch(n.option_b_next_node_key, nextKey);
      const soleBeat = nodes.length === 1;
      return {
        ...n,
        option_a_next_node_key: a,
        option_b_next_node_key: b,
        is_ending: soleBeat ? false : !a && !b,
      };
    }

    if (n.is_ending || !nextKey) {
      return { ...n, is_ending: true };
    }

    return {
      ...n,
      question: "Continue?",
      option_a_label: "Continue",
      option_b_label: "Continue",
      option_a_next_node_key: nextKey,
      option_b_next_node_key: nextKey,
      is_ending: false,
    };
  });
}
