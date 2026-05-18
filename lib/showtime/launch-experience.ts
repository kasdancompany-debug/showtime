import type { SupabaseClient } from "@supabase/supabase-js";

import { armShowRoomAtOpening } from "@/lib/showtime/arm-show-room";
import { generateRoomCode } from "@/lib/showtime/generate-room-code";
import { materializeExperienceToBranchNodes } from "@/lib/showtime/materialize-experience";
import type { Database } from "@/lib/supabase/database.types";
import { ensureEventForRoom } from "@/lib/showtime/ensure-event-for-room";
import {
  getExperienceFull,
  getLiveRoomByCode,
  type ExperienceRow,
  type LiveRoomRow,
} from "@/lib/supabase/experiences";
import { getEventByCode, listStoryNodesForEvent, updateEvent, type EventRow } from "@/lib/supabase/event-room";
import { replaceStoryNodesForEvent } from "@/lib/supabase/story-admin";

export type LaunchExperienceResult = {
  roomCode: string;
  event: EventRow;
  experience: ExperienceRow;
  liveRoom: LiveRoomRow;
  hasOpeningVideo: boolean;
};

async function pickUniqueRoomCode(client: SupabaseClient<Database>, preferred?: string): Promise<string> {
  const first = preferred?.trim().toUpperCase();
  if (first && first.length >= 3) {
    const taken = await getLiveRoomByCode(client, first);
    const eventTaken = await getEventByCode(client, first);
    if (!taken && !eventTaken) return first;
  }

  for (let attempt = 0; attempt < 40; attempt++) {
    const code = generateRoomCode(6);
    const taken = await getLiveRoomByCode(client, code);
    const eventTaken = await getEventByCode(client, code);
    if (!taken && !eventTaken) return code;
  }
  throw new Error("Could not generate a unique room code. Try again.");
}

/**
 * Materialize an experience into a fresh live room (`events` + `story_nodes` + `live_rooms`).
 */
export async function launchExperienceToLiveRoom(
  client: SupabaseClient<Database>,
  experienceId: string,
  options?: { roomCode?: string },
): Promise<LaunchExperienceResult> {
  const full = await getExperienceFull(client, experienceId);
  if (!full) throw new Error("Experience not found.");
  if (full.status === "archived") {
    throw new Error("Archived experiences cannot be launched. Set status to draft or ready first.");
  }

  const nodes = materializeExperienceToBranchNodes(full.scenes, full.voteMoments);
  if (nodes.length === 0) {
    throw new Error("Add at least one scene or vote moment before launching.");
  }

  const roomCode = await pickUniqueRoomCode(client, options?.roomCode);
  const title = full.title.trim() || `Experience ${roomCode}`;

  const event = await ensureEventForRoom(client, roomCode, title);

  await replaceStoryNodesForEvent(client, event.id, nodes);
  await updateEvent(client, event.id, {
    title,
    experience_id: full.id,
    screen_idle_poster_url: full.poster_url,
  });

  const storyNodes = await listStoryNodesForEvent(client, event.id);
  const armed = await armShowRoomAtOpening(client, event.id, storyNodes);

  const { data: liveRoom, error: lrErr } = await client
    .from("live_rooms")
    .insert({
      room_code: roomCode,
      experience_id: full.id,
      event_id: armed.event.id,
      status: "lobby",
    })
    .select("*")
    .single();
  if (lrErr) throw lrErr;
  if (!liveRoom) throw new Error("Live room row was not created.");

  return {
    roomCode,
    event: armed.event,
    experience: full,
    liveRoom,
    hasOpeningVideo: armed.hasOpeningVideo,
  };
}
