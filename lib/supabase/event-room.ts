/**
 * Typed Supabase access for the live room — single source of truth in Postgres.
 * UI state (operator graph, etc.) should hydrate from these rows, not from localStorage.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, ShowtimeEventStatus, VoteAb } from "@/lib/supabase/database.types";
import type { VoteChoice } from "@/types";

export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type StoryNodeRow = Database["public"]["Tables"]["story_nodes"]["Row"];
export type AudienceMemberRow = Database["public"]["Tables"]["audience_members"]["Row"];
export type VoteRow = Database["public"]["Tables"]["votes"]["Row"];

export async function getEventByCode(client: SupabaseClient<Database>, code: string): Promise<EventRow | null> {
  const { data, error } = await client.from("events").select("*").eq("code", code.toUpperCase()).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getEventById(client: SupabaseClient<Database>, id: string): Promise<EventRow | null> {
  const { data, error } = await client.from("events").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listStoryNodesForEvent(
  client: SupabaseClient<Database>,
  eventId: string,
): Promise<StoryNodeRow[]> {
  const { data, error } = await client
    .from("story_nodes")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function updateEvent(
  client: SupabaseClient<Database>,
  eventId: string,
  patch: Database["public"]["Tables"]["events"]["Update"],
): Promise<void> {
  const { error } = await client.from("events").update(patch).eq("id", eventId);
  if (error) throw error;
}

export async function deleteVotesForEvent(client: SupabaseClient<Database>, eventId: string): Promise<void> {
  const { error } = await client.from("votes").delete().eq("event_id", eventId);
  if (error) throw error;
}

export async function deleteAudienceMembersForEvent(client: SupabaseClient<Database>, eventId: string): Promise<void> {
  const { error } = await client.from("audience_members").delete().eq("event_id", eventId);
  if (error) throw error;
}

export async function getStoryNodeById(client: SupabaseClient<Database>, nodeId: string): Promise<StoryNodeRow | null> {
  const { data, error } = await client.from("story_nodes").select("*").eq("id", nodeId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getStoryNodeByEventAndKey(
  client: SupabaseClient<Database>,
  eventId: string,
  nodeKey: string,
): Promise<StoryNodeRow | null> {
  const { data, error } = await client
    .from("story_nodes")
    .select("*")
    .eq("event_id", eventId)
    .eq("node_key", nodeKey.trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Upsert seat row for this phone session (idempotent re-join). */
export async function upsertAudienceMember(
  client: SupabaseClient<Database>,
  params: {
    eventId: string;
    sessionId: string;
    displayName: string;
    tableNumber: string | null;
  },
): Promise<string> {
  const row: Database["public"]["Tables"]["audience_members"]["Insert"] = {
    event_id: params.eventId,
    session_id: params.sessionId.trim(),
    display_name: params.displayName.trim(),
    table_number: params.tableNumber?.trim() || null,
  };
  const { data, error } = await client
    .from("audience_members")
    .upsert(row, { onConflict: "event_id,session_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getAudienceMemberIdBySession(
  client: SupabaseClient<Database>,
  eventId: string,
  sessionId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("audience_members")
    .select("id")
    .eq("event_id", eventId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

export async function fetchAudienceMemberCount(client: SupabaseClient<Database>, eventId: string): Promise<number> {
  const { data, error } = await client.rpc("get_audience_member_count", { p_event_id: eventId });
  if (error) throw error;
  return typeof data === "number" && Number.isFinite(data) ? data : 0;
}

export async function insertBallotVote(
  client: SupabaseClient<Database>,
  params: { eventId: string; nodeId: string; sessionId: string; choice: VoteChoice },
): Promise<"ok" | "duplicate"> {
  const row: Database["public"]["Tables"]["votes"]["Insert"] = {
    event_id: params.eventId,
    node_id: params.nodeId,
    session_id: params.sessionId.trim(),
    ballot_option: params.choice as VoteAb,
  };
  const { error } = await client.from("votes").insert(row);
  if (error) {
    if ("code" in error && error.code === "23505") return "duplicate";
    throw error;
  }
  return "ok";
}

export async function fetchVoteTalliesForNode(
  client: SupabaseClient<Database>,
  eventId: string,
  nodeId: string,
): Promise<{ a: number; b: number }> {
  const { data, error } = await client.from("votes").select("ballot_option").eq("event_id", eventId).eq("node_id", nodeId);
  if (error) throw error;
  let a = 0;
  let b = 0;
  for (const row of data ?? []) {
    if (row.ballot_option === "A") a++;
    else b++;
  }
  return { a, b };
}

export async function sessionHasVoteOnNode(
  client: SupabaseClient<Database>,
  eventId: string,
  nodeId: string,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("votes")
    .select("id")
    .eq("event_id", eventId)
    .eq("node_id", nodeId)
    .eq("session_id", sessionId.trim())
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

/** This phone’s ballot on a node, if any (for refresh-safe join UI). */
export async function getSessionBallotOnNode(
  client: SupabaseClient<Database>,
  eventId: string,
  nodeId: string,
  sessionId: string,
): Promise<VoteAb | null> {
  const { data, error } = await client
    .from("votes")
    .select("ballot_option")
    .eq("event_id", eventId)
    .eq("node_id", nodeId)
    .eq("session_id", sessionId.trim())
    .maybeSingle();
  if (error) throw error;
  return data?.ballot_option ?? null;
}

export async function fetchVoteMajorityForNode(
  client: SupabaseClient<Database>,
  eventId: string,
  nodeId: string,
): Promise<{ winner: VoteChoice | null; tie: boolean }> {
  const { a, b } = await fetchVoteTalliesForNode(client, eventId, nodeId);
  if (a === 0 && b === 0) return { winner: null, tie: false };
  if (a === b) return { winner: null, tie: true };
  return { winner: a > b ? "A" : "B", tie: false };
}

export function isEventVotingOpen(status: ShowtimeEventStatus): boolean {
  return status === "voting_open";
}

export function isEventWinnerRevealed(status: ShowtimeEventStatus): boolean {
  return status === "winner_revealed";
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}
