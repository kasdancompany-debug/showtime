import type { SupabaseClient } from "@supabase/supabase-js";

import {
  exportBranchStoryDocument,
  importBranchStoryDocument,
  type BranchStoryJsonFile,
} from "@/lib/showtime/branch-story-json";
import { repackSortOrder, type BranchEditorNode } from "@/lib/showtime/branch-story-validate";
import { materializeExperienceToBranchNodes } from "@/lib/showtime/materialize-experience";
import { slugTitleToShowCode } from "@/lib/showtime/show-code";
import {
  attachVideoAssetIds,
  inferLibraryFromNodes,
  mergeLibraryForLoad,
  parseVideoLibrary,
  type VideoLibraryEntry,
} from "@/lib/showtime/video-library";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  getExperienceById,
  getExperienceFull,
  type ExperienceRow,
  type ExperienceSceneRow,
  type ExperienceVoteMomentRow,
} from "@/lib/supabase/experiences";
import { getEventById, type EventRow } from "@/lib/supabase/event-room";

export type ExperienceBuilderState = {
  experience: ExperienceRow;
  nodes: BranchEditorNode[];
  videoLibrary: VideoLibraryEntry[];
  rehearsalEvent: EventRow | null;
};

export type ExperienceTimelineSummary = {
  beatCount: number;
  voteCount: number;
};

/** Count beats/votes from saved builder_story (or legacy scenes table). */
export function summarizeExperienceTimeline(full: {
  builder_story: ExperienceRow["builder_story"];
  scenes: ExperienceSceneRow[];
  voteMoments: ExperienceVoteMomentRow[];
}): ExperienceTimelineSummary {
  const nodes = resolveExperienceBranchNodes(
    { builder_story: full.builder_story } as ExperienceRow,
    { scenes: full.scenes, voteMoments: full.voteMoments },
  );
  const voteCount = nodes.filter(
    (n) =>
      !n.is_ending &&
      Boolean(n.question?.trim() && n.option_a_label?.trim() && n.option_b_label?.trim()),
  ).length;
  return { beatCount: nodes.length, voteCount };
}

export function experienceRehearsalCode(slug: string): string {
  const fromSlug = slugTitleToShowCode(slug.replace(/-/g, " "));
  if (fromSlug.length >= 3) return fromSlug.slice(0, 40);
  return slugTitleToShowCode(slug).slice(0, 40) || "REH";
}

export function parseExperienceBuilderStory(raw: Json | null): BranchStoryJsonFile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.format !== "kasdan-branch-story") return null;
  return raw as unknown as BranchStoryJsonFile;
}

/** Resolve beats for the builder or launch — prefers saved builder_story, else legacy scenes/votes. */
export function resolveExperienceBranchNodes(
  experience: ExperienceRow,
  legacy?: { scenes: ExperienceSceneRow[]; voteMoments: ExperienceVoteMomentRow[] },
): BranchEditorNode[] {
  const doc = parseExperienceBuilderStory(experience.builder_story);
  if (doc) {
    const imported = importBranchStoryDocument(JSON.stringify(doc));
    if (imported.ok && imported.nodes.length > 0) {
      return repackSortOrder(imported.nodes);
    }
  }
  if (legacy && (legacy.scenes.length > 0 || legacy.voteMoments.length > 0)) {
    return materializeExperienceToBranchNodes(legacy.scenes, legacy.voteMoments);
  }
  return [];
}

/** Reel library from saved builder_story, merged with beat URLs (for launch materialization). */
export function resolveExperienceVideoLibrary(
  experience: ExperienceRow,
  nodes: BranchEditorNode[],
): VideoLibraryEntry[] {
  const doc = parseExperienceBuilderStory(experience.builder_story);
  const storedLib = doc?.video_library ? parseVideoLibrary(doc.video_library) : [];
  return mergeLibraryForLoad(storedLib, nodes);
}

export async function loadExperienceBuilderState(
  client: SupabaseClient<Database>,
  experienceId: string,
): Promise<ExperienceBuilderState | null> {
  const full = await getExperienceFull(client, experienceId);
  if (!full) return null;

  let nodes = resolveExperienceBranchNodes(full, {
    scenes: full.scenes,
    voteMoments: full.voteMoments,
  });
  if (nodes.length === 0) {
    nodes = repackSortOrder([
      {
        node_key: "01_OPENING",
        title: full.title.trim() || "Opening",
        video_url: "",
        operator_notes: "",
        beat_status: "draft",
        question: "",
        option_a_label: "",
        option_b_label: "",
        option_a_next_node_key: "",
        option_b_next_node_key: "",
        is_ending: false,
        sort_order: 0,
      },
    ]);
  }

  const doc = parseExperienceBuilderStory(full.builder_story);
  const storedLib = doc?.video_library ? parseVideoLibrary(doc.video_library) : [];
  const lib = mergeLibraryForLoad(storedLib, nodes);
  const packed = attachVideoAssetIds(repackSortOrder(nodes), lib);

  let rehearsalEvent: EventRow | null = null;
  if (full.rehearsal_event_id) {
    rehearsalEvent = await getEventById(client, full.rehearsal_event_id);
  }

  return {
    experience: full,
    nodes: packed,
    videoLibrary: lib,
    rehearsalEvent,
  };
}

export async function saveExperienceBuilderSnapshot(
  client: SupabaseClient<Database>,
  experienceId: string,
  nodes: BranchEditorNode[],
  videoLibrary: VideoLibraryEntry[],
  meta?: {
    title?: string;
    description?: string;
    posterUrl?: string | null;
    status?: ExperienceRow["status"];
  },
): Promise<ExperienceRow> {
  const packed = repackSortOrder(nodes);
  const jsonText = exportBranchStoryDocument(packed, videoLibrary);
  const doc = JSON.parse(jsonText) as BranchStoryJsonFile;

  const row: Database["public"]["Tables"]["experiences"]["Update"] = {
    builder_story: doc as unknown as Json,
  };
  if (meta?.title !== undefined) row.title = meta.title.trim();
  if (meta?.description !== undefined) row.description = meta.description.trim();
  if (meta?.posterUrl !== undefined) row.poster_url = meta.posterUrl?.trim() || null;
  if (meta?.status !== undefined) row.status = meta.status;

  const { data, error } = await client.from("experiences").update(row).eq("id", experienceId).select("*").single();
  if (error) throw error;
  if (!data) throw new Error("Experience not found after save.");
  return data;
}

export async function linkExperienceRehearsalEvent(
  client: SupabaseClient<Database>,
  experienceId: string,
  eventId: string,
): Promise<void> {
  const { error } = await client
    .from("experiences")
    .update({ rehearsal_event_id: eventId })
    .eq("id", experienceId);
  if (error) throw error;
}

export async function getExperienceRow(
  client: SupabaseClient<Database>,
  id: string,
): Promise<ExperienceRow | null> {
  return getExperienceById(client, id);
}
