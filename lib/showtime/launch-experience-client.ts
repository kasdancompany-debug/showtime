import type { SupabaseClient } from "@supabase/supabase-js";

import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import type { LaunchExperienceResult } from "@/lib/showtime/launch-experience";
import { launchExperienceToLiveRoom } from "@/lib/showtime/launch-experience";
import type { Database } from "@/lib/supabase/database.types";
import type { EventRow } from "@/lib/supabase/event-room";

export type LaunchExperienceApiResponse = {
  ok: boolean;
  error?: string;
  technical?: string;
  useClientFallback?: boolean;
  roomCode?: string;
  event?: EventRow;
  hasOpeningVideo?: boolean;
};

export async function launchExperienceViaApi(
  experienceId: string,
  roomCode?: string,
): Promise<LaunchExperienceApiResponse> {
  const res = await fetch(`/api/experiences/${encodeURIComponent(experienceId)}/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode: roomCode?.trim() || undefined }),
  });
  return (await res.json()) as LaunchExperienceApiResponse;
}

export async function launchExperienceViaClient(
  client: SupabaseClient<Database>,
  experienceId: string,
  roomCode?: string,
): Promise<LaunchExperienceResult> {
  const anon = await tryEnsureAnonymousSession(client);
  if (!anon.ok) throw new Error(anon.message);
  return launchExperienceToLiveRoom(client, experienceId, { roomCode });
}
