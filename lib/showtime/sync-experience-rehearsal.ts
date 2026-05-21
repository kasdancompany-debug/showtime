import type { SupabaseClient } from "@supabase/supabase-js";

import { armShowRoomAtOpening } from "@/lib/showtime/arm-show-room";
import { ensureEventForRoom } from "@/lib/showtime/ensure-event-for-room";
import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";
import {
  experienceRehearsalCode,
  linkExperienceRehearsalEvent,
} from "@/lib/supabase/experience-builder-snapshot";
import type { ExperienceRow } from "@/lib/supabase/experiences";
import { getEventByCode, listStoryNodesForEvent, updateEvent, type EventRow } from "@/lib/supabase/event-room";
import { replaceStoryNodesForEvent } from "@/lib/supabase/story-admin";
import type { Database } from "@/lib/supabase/database.types";
import type { VideoLibraryEntry } from "@/lib/showtime/video-library";
import { repackSortOrder } from "@/lib/showtime/branch-story-validate";

export type SyncRehearsalResult = {
  event: EventRow;
  code: string;
  hasOpeningVideo: boolean;
};

/**
 * Push the saved experience graph into a stable rehearsal event (home laptop test).
 */
export async function syncExperienceRehearsalEvent(
  client: SupabaseClient<Database>,
  experience: ExperienceRow,
  nodes: BranchEditorNode[],
  videoLibrary: VideoLibraryEntry[],
): Promise<SyncRehearsalResult> {
  const code = experienceRehearsalCode(experience.slug);
  const title = `${experience.title.trim() || "Experience"} (rehearsal)`;

  const event = await ensureEventForRoom(client, code, title);
  await replaceStoryNodesForEvent(client, event.id, repackSortOrder(nodes), { videoLibrary });
  await updateEvent(client, event.id, {
    title,
    experience_id: experience.id,
    screen_idle_poster_url: experience.poster_url,
  });

  const storyNodes = await listStoryNodesForEvent(client, event.id);
  const armed = await armShowRoomAtOpening(client, event.id, storyNodes);
  await linkExperienceRehearsalEvent(client, experience.id, armed.event.id);

  const reloaded = await getEventByCode(client, code);
  if (!reloaded) throw new Error("Rehearsal room could not be reloaded.");

  return {
    event: reloaded,
    code,
    hasOpeningVideo: armed.hasOpeningVideo,
  };
}
