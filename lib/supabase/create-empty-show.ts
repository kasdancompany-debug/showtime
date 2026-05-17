import type { SupabaseClient } from "@supabase/supabase-js";

import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";
import type { Database } from "@/lib/supabase/database.types";
import { getEventByCode } from "@/lib/supabase/event-room";
import { replaceStoryNodesForEvent } from "@/lib/supabase/story-admin";

function blankOpening(): BranchEditorNode {
  return {
    node_key: "01_OPENING",
    title: "Opening",
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
  };
}

/**
 * Creates a new `events` row plus a single opening beat (service role or any client that passes RLS).
 */
export async function createEmptyShow(
  client: SupabaseClient<Database>,
  params: { code: string; title: string },
): Promise<Database["public"]["Tables"]["events"]["Row"]> {
  const code = params.code.trim().toUpperCase();
  if (code.length < 3) {
    throw new Error("Show codes must be at least 3 characters (letters and numbers).");
  }
  if (!/^[A-Z0-9_]+$/.test(code)) {
    throw new Error("Use only letters, numbers, and underscores in the show code.");
  }

  const existing = await getEventByCode(client, code);
  if (existing) {
    throw new Error("CODE_TAKEN");
  }

  const title = params.title.trim() || `Live show ${code}`;
  const { data: inserted, error: insErr } = await client
    .from("events")
    .insert({
      code,
      title,
      status: "setup",
    })
    .select("*")
    .single();

  if (insErr) throw insErr;
  if (!inserted?.id) throw new Error("Event was not created (no id returned).");

  await replaceStoryNodesForEvent(client, inserted.id, [blankOpening()], { videoLibrary: [] });

  const full = await getEventByCode(client, code);
  if (!full) throw new Error("Could not reload the new show.");
  return full;
}
