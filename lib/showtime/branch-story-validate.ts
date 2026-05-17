import type { Database } from "@/lib/supabase/database.types";

import { analyzeStoryBeatVideoUrl, hasStoryVideoUrl } from "@/lib/showtime/video-url";

export type StoryNodeRow = Database["public"]["Tables"]["story_nodes"]["Row"];

/** `draft` = still editing; `ready` = OK for live (triggers readiness warnings if incomplete). */
export type BeatLiveStatus = "draft" | "ready";

/** In-memory row for the branch editor — maps to `story_nodes` + `sort_order`. */
export type BranchEditorNode = {
  node_key: string;
  /** Human title shown to operators and in lists. */
  title: string;
  /** Hosted .mp4 / .webm URL (https://… or root-relative path like /videos/…). */
  video_url: string;
  /** Admin UI: selected row in Video Library — not persisted; resolved into `video_url` on assign. */
  video_asset_id?: string;
  /** Cue script for the operator (not shown on /screen or /join). */
  operator_notes: string;
  beat_status: BeatLiveStatus;
  question: string;
  option_a_label: string;
  option_b_label: string;
  option_a_next_node_key: string;
  option_b_next_node_key: string;
  is_ending: boolean;
  sort_order: number;
};

export function repackSortOrder(list: BranchEditorNode[]): BranchEditorNode[] {
  const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key));
  return sorted.map((n, i) => ({ ...n, sort_order: i }));
}

export function rowsToEditorNodes(rows: StoryNodeRow[]): BranchEditorNode[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key))
    .map((r) => ({
      node_key: r.node_key,
      title: r.title ?? "",
      video_url: r.video_url ?? "",
      operator_notes: r.operator_notes ?? "",
      beat_status: r.beat_status === "ready" ? "ready" : "draft",
      question: r.question ?? "",
      option_a_label: r.option_a_label ?? "",
      option_b_label: r.option_b_label ?? "",
      option_a_next_node_key: r.option_a_next_node_key ?? "",
      option_b_next_node_key: r.option_b_next_node_key ?? "",
      is_ending: r.is_ending,
      sort_order: r.sort_order,
    }));
}

function appendLiveReadinessWarnings(nodes: BranchEditorNode[], warnings: string[]) {
  for (const n of nodes) {
    const k = n.node_key.trim() || "(unnamed beat)";
    if (n.beat_status === "draft") {
      warnings.push(
        `${k}: still marked Draft — when this beat is finished, set it to Ready so you know the show is prepped for the room.`,
      );
      continue;
    }
    if (!n.operator_notes?.trim()) {
      warnings.push(
        `${k}: marked Ready but has no operator notes — add what to say or do in the booth, or set back to Draft while you iterate.`,
      );
    }
  }
}

/**
 * Validates the show map before save.
 * Opening beat = lowest `sort_order` (ties broken by beat code); at least one beat required.
 */
const PLACEHOLDER_ORIGIN = "https://origin.invalid";

export function validateBranchStory(nodes: BranchEditorNode[]): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (nodes.length === 0) {
    errors.push("Add at least one beat. The first beat in the list (top of the order) is how the show opens.");
    return { ok: false, errors, warnings };
  }

  const keys = new Set<string>();
  for (const n of nodes) {
    const k = n.node_key.trim();
    if (!k) {
      errors.push("Every beat needs a beat code (for example 01_OPENING).");
      continue;
    }
    if (keys.has(k)) errors.push(`Two beats use the same beat code “${k}”. Change one of them.`);
    keys.add(k);
  }

  const sorted = [...nodes].sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key));
  const opening = sorted[0];
  if (!opening?.node_key.trim()) {
    errors.push("Put the opening beat first using Move up / Move down.");
  }

  for (const n of nodes) {
    const k = n.node_key.trim() || "(unnamed beat)";
    const videoTrim = n.video_url?.trim() ?? "";
    if (!videoTrim) {
      errors.push(`${k}: pick a reel from the library or paste a video address (.mp4 / .webm on https or a path like /videos/…).`);
    } else if (!hasStoryVideoUrl(n.video_url)) {
      errors.push(`${k}: that video address cannot be used here (use https://… or a path starting with /).`);
    } else {
      const { resolvedUrl, issues } = analyzeStoryBeatVideoUrl(n.video_url, PLACEHOLDER_ORIGIN);
      if (resolvedUrl) {
        for (const issue of issues) {
          warnings.push(`${k}: ${issue.message}`);
        }
      }
    }

    if (n.is_ending) {
      if (n.question?.trim()) {
        errors.push(`${k}: ending beats should not have a vote question.`);
      }
      if (n.option_a_label?.trim() || n.option_b_label?.trim()) {
        errors.push(`${k}: ending beats should not have option labels.`);
      }
      const endNextA = n.option_a_next_node_key?.trim() ?? "";
      const endNextB = n.option_b_next_node_key?.trim() ?? "";
      if (endNextA || endNextB) {
        errors.push(`${k}: ending beats should not link to a next beat.`);
      }
      continue;
    }
    if (!n.question?.trim()) {
      errors.push(`${k}: add the vote question for this beat.`);
    }
    if (!n.option_a_label?.trim()) {
      errors.push(`${k}: add the label for Option A.`);
    }
    if (!n.option_b_label?.trim()) {
      errors.push(`${k}: add the label for Option B.`);
    }
    const nextA = n.option_a_next_node_key?.trim() ?? "";
    const nextB = n.option_b_next_node_key?.trim() ?? "";
    if (!nextA) {
      errors.push(`${k}: choose which beat comes next if Option A wins.`);
    } else if (!keys.has(nextA)) {
      errors.push(`${k}: Option A points to an unknown beat code “${nextA}”.`);
    }
    if (!nextB) {
      errors.push(`${k}: choose which beat comes next if Option B wins.`);
    } else if (!keys.has(nextB)) {
      errors.push(`${k}: Option B points to an unknown beat code “${nextB}”.`);
    }
  }

  if (errors.length === 0) {
    appendLiveReadinessWarnings(nodes, warnings);
  }

  return { ok: errors.length === 0, errors, warnings };
}
