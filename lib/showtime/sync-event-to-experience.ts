import type { SupabaseClient } from "@supabase/supabase-js";

import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";
import type { VideoLibraryEntry } from "@/lib/showtime/video-library";
import {
  linkExperienceRehearsalEvent,
  saveExperienceBuilderSnapshot,
} from "@/lib/supabase/experience-builder-snapshot";
import {
  createExperience,
  getExperienceByRehearsalEventId,
  getExperienceForEvent,
  type ExperienceRow,
} from "@/lib/supabase/experiences";
import { updateEvent, type EventRow } from "@/lib/supabase/event-room";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Mirror a saved show (event + story graph) into Movie Experiences so it appears on /experiences.
 */
export async function syncEventBuilderToExperience(
  client: SupabaseClient<Database>,
  event: EventRow,
  nodes: BranchEditorNode[],
  videoLibrary: VideoLibraryEntry[],
  meta?: { title?: string; posterUrl?: string | null },
): Promise<ExperienceRow> {
  let experience =
    (await getExperienceForEvent(client, event.id)) ?? (await getExperienceByRehearsalEventId(client, event.id));

  const title = meta?.title?.trim() || event.title?.trim() || event.code;
  const posterUrl =
    meta?.posterUrl !== undefined ? meta.posterUrl : (event.screen_idle_poster_url?.trim() || null);

  if (!experience) {
    experience = await createExperience(client, {
      title,
      posterUrl,
      description: "",
      status: "draft",
    });
    await updateEvent(client, event.id, { experience_id: experience.id });
    await linkExperienceRehearsalEvent(client, experience.id, event.id);
  }

  const updated = await saveExperienceBuilderSnapshot(client, experience.id, nodes, videoLibrary, {
    title,
    posterUrl,
  });

  if (event.experience_id !== updated.id) {
    await updateEvent(client, event.id, { experience_id: updated.id });
  }

  if (!updated.rehearsal_event_id) {
    await linkExperienceRehearsalEvent(client, updated.id, event.id);
  }

  return updated;
}
