"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, EventStatus, VoteOption } from "@/lib/supabase/database.types";
import type { VoteChoice } from "@/types";

export type RemoteEventRow = Database["public"]["Tables"]["events"]["Row"];
export type RemoteStoryNodeRow = Database["public"]["Tables"]["story_nodes"]["Row"];

export async function fetchEventByCode(client: SupabaseClient<Database>, code: string) {
  const { data, error } = await client
    .from("events")
    .select("*")
    .eq("event_code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchStoryNode(client: SupabaseClient<Database>, nodeId: string) {
  const { data, error } = await client.from("story_nodes").select("*").eq("id", nodeId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureAnonymousSession(client: SupabaseClient<Database>) {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session) return session;
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) throw new Error("Anonymous sign-in returned no session");
  return data.session;
}

export async function fetchAudienceMemberIdForCurrentUser(client: SupabaseClient<Database>, eventId: string) {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("audience_members")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

export async function insertAudienceMember(
  client: SupabaseClient<Database>,
  params: {
    eventId: string;
    displayName: string;
    tableNumber: string | null;
    sessionId: string;
  },
) {
  const session = await ensureAnonymousSession(client);
  const { data, error } = await client
    .from("audience_members")
    .insert({
      event_id: params.eventId,
      display_name: params.displayName,
      table_number: params.tableNumber,
      session_id: params.sessionId,
      user_id: session.user.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function insertVote(
  client: SupabaseClient<Database>,
  params: {
    eventId: string;
    storyNodeId: string;
    audienceMemberId: string;
    choice: VoteChoice;
  },
) {
  const row: Database["public"]["Tables"]["votes"]["Insert"] = {
    event_id: params.eventId,
    story_node_id: params.storyNodeId,
    audience_member_id: params.audienceMemberId,
    vote_option: params.choice as VoteOption,
  };
  const { error } = await client.from("votes").insert(row);
  if (error) {
    if ("code" in error && error.code === "23505") return "duplicate" as const;
    throw error;
  }
  return "ok" as const;
}

export async function fetchVoteTallies(
  client: SupabaseClient<Database>,
  eventId: string,
  storyNodeId: string,
): Promise<{ a: number; b: number }> {
  const { data, error } = await client
    .from("votes")
    .select("vote_option")
    .eq("event_id", eventId)
    .eq("story_node_id", storyNodeId);
  if (error) throw error;
  let a = 0;
  let b = 0;
  for (const row of data ?? []) {
    if (row.vote_option === "A") a++;
    else b++;
  }
  return { a, b };
}

export async function fetchVoteMajority(
  client: SupabaseClient<Database>,
  eventId: string,
  storyNodeId: string,
): Promise<{ winner: VoteChoice | null; tie: boolean }> {
  const { a, b } = await fetchVoteTallies(client, eventId, storyNodeId);
  if (a === 0 && b === 0) return { winner: null, tie: false };
  if (a === b) return { winner: null, tie: true };
  return { winner: a > b ? "A" : "B", tie: false };
}

export function isVotingStatus(status: EventStatus) {
  return status === "voting";
}

export function isRevealingStatus(status: EventStatus) {
  return status === "revealing";
}
