import type { SupabaseClient } from "@supabase/supabase-js";

import { getNight1DemoNodes, NIGHT1_EVENT_CODE, NIGHT1_EVENT_TITLE } from "@/lib/showtime/night1-demo-graph";
import { inferLibraryFromNodes } from "@/lib/showtime/video-library";
import type { Database } from "@/lib/supabase/database.types";
import {
  deleteAudienceMembersForEvent,
  deleteVotesForEvent,
  getEventByCode,
  updateEvent,
} from "@/lib/supabase/event-room";
import { replaceStoryNodesForEvent } from "@/lib/supabase/story-admin";

/**
 * Ensures `NIGHT1` exists and matches the canonical demo graph.
 * Clears votes and audience for a clean rehearsal run.
 */
export async function resetNight1DemoData(client: SupabaseClient<Database>): Promise<{ eventId: string }> {
  let ev = await getEventByCode(client, NIGHT1_EVENT_CODE);
  if (!ev) {
    const { error: insErr } = await client.from("events").insert({
      code: NIGHT1_EVENT_CODE,
      title: NIGHT1_EVENT_TITLE,
      status: "setup",
    });
    if (insErr) throw insErr;
    ev = await getEventByCode(client, NIGHT1_EVENT_CODE);
  }
  if (!ev) throw new Error("NIGHT1 event missing after insert.");
  const eventId = ev.id;
  await deleteVotesForEvent(client, eventId);
  await deleteAudienceMembersForEvent(client, eventId);
  await updateEvent(client, eventId, {
    status: "setup",
    winner: null,
    vote_ends_at: null,
    screen_show_closed_tally: false,
    screen_show_live_vote_counts: true,
  });
  const demoNodes = getNight1DemoNodes();
  await replaceStoryNodesForEvent(client, eventId, demoNodes, { videoLibrary: inferLibraryFromNodes(demoNodes) });
  return { eventId };
}
