import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createEmptyShow } from "@/lib/supabase/create-empty-show";
import { getEventByCode, type EventRow } from "@/lib/supabase/event-room";

/**
 * Ensure an `events` row exists for a room code — RPC first (anon-safe), then direct insert (service role).
 */
export async function ensureEventForRoom(
  client: SupabaseClient<Database>,
  roomCode: string,
  title: string,
): Promise<EventRow> {
  const code = roomCode.trim().toUpperCase();
  const existing = await getEventByCode(client, code);
  if (existing) return existing;

  const { data: newId, error: rpcError } = await client.rpc("create_show_for_builder", {
    p_code: code,
    p_title: title,
  });

  if (rpcError?.message?.includes("CODE_TAKEN")) {
    const taken = await getEventByCode(client, code);
    if (taken) return taken;
  }

  if (!rpcError && newId) {
    const created = await getEventByCode(client, code);
    if (created) return created;
  }

  return createEmptyShow(client, { code, title });
}
