import type { SupabaseClient } from "@supabase/supabase-js";

import { hasStoryVideoUrl } from "@/lib/showtime/video-url";
import type { Database } from "@/lib/supabase/database.types";
import {
  deleteAudienceMembersForEvent,
  deleteVotesForEvent,
  getEventById,
  updateEvent,
  type EventRow,
  type StoryNodeRow,
} from "@/lib/supabase/event-room";
import { withPlaybackCommand } from "@/lib/supabase/playback-command";

export function sortStoryNodes(nodes: StoryNodeRow[]): StoryNodeRow[] {
  return [...nodes].sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key));
}

export type ArmShowRoomResult = {
  event: EventRow;
  firstNode: StoryNodeRow;
  /** True when the opening beat has a resolvable video URL. */
  hasOpeningVideo: boolean;
};

/**
 * Reset votes/audience and park the room on beat 1 with projector load command (status `ready`).
 */
export async function armShowRoomAtOpening(
  client: SupabaseClient<Database>,
  eventId: string,
  nodes: StoryNodeRow[],
): Promise<ArmShowRoomResult> {
  const sorted = sortStoryNodes(nodes);
  const first = sorted[0];
  if (!first) {
    throw new Error("This show has no beats yet. Add at least one beat in the show builder.");
  }

  await deleteVotesForEvent(client, eventId);
  await deleteAudienceMembersForEvent(client, eventId);

  await updateEvent(client, eventId, {
    status: "ready",
    current_node_id: first.id,
    winner: null,
    vote_ends_at: null,
    screen_show_closed_tally: false,
    screen_show_live_vote_counts: true,
    ...withPlaybackCommand("load", { playback_position_seconds: 0 }),
  });

  const event = await getEventById(client, eventId);
  if (!event) throw new Error("Show disappeared after arming the room.");

  return {
    event,
    firstNode: first,
    hasOpeningVideo: hasStoryVideoUrl(first.video_url),
  };
}
