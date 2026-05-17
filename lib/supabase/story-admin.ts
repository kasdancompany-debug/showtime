/**
 * Replace all `story_nodes` for an event (branch map save from /admin/story).
 * Uses a two-step insert so deferred FKs are satisfied without a server-side transaction wrapper.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";
import type { VideoLibraryEntry } from "@/lib/showtime/video-library";
import { toEventVideoLibraryJson } from "@/lib/showtime/video-library";
import type { Database, Json } from "@/lib/supabase/database.types";

import { updateEvent } from "@/lib/supabase/event-room";
import { withPlaybackCommand } from "@/lib/supabase/playback-command";

export async function replaceStoryNodesForEvent(
  client: SupabaseClient<Database>,
  eventId: string,
  nodes: BranchEditorNode[],
  options?: { videoLibrary?: VideoLibraryEntry[] },
): Promise<void> {
  if (options?.videoLibrary) {
    await updateEvent(client, eventId, { video_library: toEventVideoLibraryJson(options.videoLibrary) as Json });
  }

  const stripped: BranchEditorNode[] = nodes.map((n) => {
    const { video_asset_id, ...rest } = n;
    void video_asset_id;
    return rest;
  });
  const sorted = [...stripped].sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key));

  await updateEvent(client, eventId, {
    current_node_id: null,
    winner: null,
    status: "setup",
    vote_ends_at: null,
    screen_show_closed_tally: false,
    screen_show_live_vote_counts: true,
    ...withPlaybackCommand("load", { playback_position_seconds: 0 }),
  });

  const { error: delErr } = await client.from("story_nodes").delete().eq("event_id", eventId);
  if (delErr) throw delErr;

  const inserts: Database["public"]["Tables"]["story_nodes"]["Insert"][] = sorted.map((n) => ({
    event_id: eventId,
    node_key: n.node_key.trim(),
    title: n.title.trim() || n.node_key.trim(),
    video: "",
    video_url: n.video_url.trim() || "",
    operator_notes: n.operator_notes?.trim() ?? "",
    beat_status: n.beat_status === "ready" ? "ready" : "draft",
    question: n.is_ending ? null : n.question.trim() || null,
    option_a_label: n.is_ending ? null : n.option_a_label.trim() || null,
    option_b_label: n.is_ending ? null : n.option_b_label.trim() || null,
    option_a_next_node_key: null,
    option_b_next_node_key: null,
    is_ending: n.is_ending,
    sort_order: n.sort_order,
  }));

  const { data: inserted, error: insErr } = await client.from("story_nodes").insert(inserts).select("id, node_key");
  if (insErr) throw insErr;

  const keyToId = new Map((inserted ?? []).map((r) => [r.node_key, r.id]));

  for (const n of sorted) {
    if (n.is_ending) continue;
    const id = keyToId.get(n.node_key.trim());
    if (!id) continue;
    const { error: upErr } = await client
      .from("story_nodes")
      .update({
        option_a_next_node_key: n.option_a_next_node_key.trim(),
        option_b_next_node_key: n.option_b_next_node_key.trim(),
      })
      .eq("id", id);
    if (upErr) throw upErr;
  }

  const firstKey = sorted[0]?.node_key.trim();
  const firstId = firstKey ? keyToId.get(firstKey) : null;
  if (firstId) {
    await updateEvent(client, eventId, { current_node_id: firstId, status: "setup" });
  }
}
