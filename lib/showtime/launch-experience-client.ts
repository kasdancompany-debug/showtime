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
): Promise<LaunchExperienceApiResponse & { httpStatus: number }> {
  const res = await fetch(`/api/experiences/${encodeURIComponent(experienceId)}/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode: roomCode?.trim() || undefined }),
  });

  let body: LaunchExperienceApiResponse = { ok: false };
  try {
    body = (await res.json()) as LaunchExperienceApiResponse;
  } catch {
    body = {
      ok: false,
      error: res.ok ? "Invalid response from launch API." : `Launch API returned ${res.status}.`,
    };
  }

  if (!body.useClientFallback && (res.status === 503 || res.status === 502)) {
    body.useClientFallback = true;
  }

  return { ...body, httpStatus: res.status };
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

export function formatLaunchError(api: LaunchExperienceApiResponse, clientErr?: unknown): string {
  const parts = [api.error, api.technical].filter((s) => typeof s === "string" && s.trim());
  if (parts.length) return parts.join(" — ");
  if (clientErr instanceof Error && clientErr.message.trim()) return clientErr.message;
  if (api.useClientFallback) {
    return "Could not launch from the browser. Enable Anonymous sign-in in Supabase, or add SUPABASE_SERVICE_ROLE_KEY to Vercel.";
  }
  return "Launch failed.";
}
