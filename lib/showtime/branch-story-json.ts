import { inferLibraryFromNodes, parseVideoLibrary, type VideoLibraryEntry } from "@/lib/showtime/video-library";
import { repackSortOrder, type BranchEditorNode } from "@/lib/showtime/branch-story-validate";

export const BRANCH_STORY_JSON_FORMAT = "kasdan-branch-story" as const;
export const BRANCH_STORY_JSON_VERSION = 3;

/** v3 on-disk shape (beginner-oriented names). Import still accepts legacy v2 `nodes` + `node_key`. */
export type BranchStoryJsonBeatV3 = {
  beat_code: string;
  title?: string;
  video_url?: string;
  operator_notes?: string;
  beat_status?: "draft" | "ready";
  question?: string;
  option_a_label?: string;
  option_a_next_beat_code?: string;
  option_b_label?: string;
  option_b_next_beat_code?: string;
  is_ending?: boolean;
};

export type BranchStoryJsonFile = {
  format: typeof BRANCH_STORY_JSON_FORMAT;
  version: number;
  exportedAt?: string;
  video_library?: unknown[];
  beats: BranchStoryJsonBeatV3[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function exportBranchStoryDocument(nodes: BranchEditorNode[], videoLibrary?: VideoLibraryEntry[]): string {
  const sorted = [...nodes].sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key));
  const doc: BranchStoryJsonFile = {
    format: BRANCH_STORY_JSON_FORMAT,
    version: BRANCH_STORY_JSON_VERSION,
    exportedAt: new Date().toISOString(),
    ...(videoLibrary && videoLibrary.length > 0 ? { video_library: videoLibrary } : {}),
    beats: sorted.map((n) => ({
      beat_code: n.node_key.trim(),
      title: n.title.trim(),
      video_url: n.video_url.trim(),
      operator_notes: n.operator_notes.trim(),
      beat_status: n.beat_status,
      question: n.question.trim(),
      option_a_label: n.option_a_label.trim(),
      option_a_next_beat_code: n.option_a_next_node_key.trim(),
      option_b_label: n.option_b_label.trim(),
      option_b_next_beat_code: n.option_b_next_node_key.trim(),
      is_ending: n.is_ending,
    })),
  };
  return JSON.stringify(doc, null, 2);
}

function readBeatArray(parsed: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(parsed.beats)) return parsed.beats;
  if (Array.isArray(parsed.nodes)) return parsed.nodes;
  return null;
}

export function importBranchStoryDocument(
  text: string,
): { ok: true; nodes: BranchEditorNode[]; videoLibrary: VideoLibraryEntry[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, errors: ["That text is not valid JSON."] };
  }
  if (!isRecord(parsed)) {
    return { ok: false, errors: ["Root must be a JSON object."] };
  }
  if (parsed.format !== BRANCH_STORY_JSON_FORMAT) {
    return { ok: false, errors: [`Unknown format (expected "${BRANCH_STORY_JSON_FORMAT}").`] };
  }
  if (typeof parsed.version !== "number" || parsed.version < 2) {
    return { ok: false, errors: ["Missing or unsupported version (need at least 2)."] };
  }

  const beatRows = readBeatArray(parsed);
  if (!beatRows) {
    return {
      ok: false,
      errors: ['Missing "beats" array (v3). Older backups use a "nodes" array instead — either is accepted.'],
    };
  }
  if (beatRows.length === 0) {
    return { ok: false, errors: ["The beats list is empty."] };
  }

  const draft: BranchEditorNode[] = [];
  for (let i = 0; i < beatRows.length; i += 1) {
    const raw = beatRows[i];
    if (!isRecord(raw)) {
      errors.push(`beats[${i}]: must be an object.`);
      continue;
    }
    const beatCode =
      typeof raw.beat_code === "string"
        ? raw.beat_code
        : typeof raw.node_key === "string"
          ? raw.node_key
          : "";
    const nextA =
      typeof raw.option_a_next_beat_code === "string"
        ? raw.option_a_next_beat_code
        : typeof raw.option_a_next_node_key === "string"
          ? raw.option_a_next_node_key
          : "";
    const nextB =
      typeof raw.option_b_next_beat_code === "string"
        ? raw.option_b_next_beat_code
        : typeof raw.option_b_next_node_key === "string"
          ? raw.option_b_next_node_key
          : "";

    const beatStatus =
      raw.beat_status === "ready" || raw.beat_status === "draft" ? raw.beat_status : "draft";

    draft.push({
      node_key: beatCode,
      title: typeof raw.title === "string" ? raw.title : "",
      video_url: typeof raw.video_url === "string" ? raw.video_url : "",
      operator_notes: typeof raw.operator_notes === "string" ? raw.operator_notes : "",
      beat_status: beatStatus,
      question: typeof raw.question === "string" ? raw.question : "",
      option_a_label: typeof raw.option_a_label === "string" ? raw.option_a_label : "",
      option_b_label: typeof raw.option_b_label === "string" ? raw.option_b_label : "",
      option_a_next_node_key: nextA,
      option_b_next_node_key: nextB,
      is_ending: Boolean(raw.is_ending),
      sort_order: draft.length,
    });
  }

  if (errors.length) return { ok: false, errors };

  const packed = repackSortOrder(draft);
  const lib = parseVideoLibrary(parsed.video_library);
  const videoLibrary = lib.length > 0 ? lib : inferLibraryFromNodes(packed);

  return { ok: true, nodes: packed, videoLibrary };
}
