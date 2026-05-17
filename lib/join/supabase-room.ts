"use client";

/**
 * Join / operator Supabase I/O — thin re-exports around {@link "@/lib/supabase/event-room"} for legacy import paths.
 */

import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { friendlySupabaseError } from "@/lib/supabase/operator-errors";
import type { Database } from "@/lib/supabase/database.types";
import {
  fetchAudienceMemberCount as fetchAudienceMemberCountInner,
  fetchVoteMajorityForNode,
  fetchVoteTalliesForNode,
  getAudienceMemberIdBySession,
  getEventByCode,
  getStoryNodeById,
  insertBallotVote,
  isEventVotingOpen,
  isEventWinnerRevealed,
  isUniqueViolation,
  upsertAudienceMember,
  type EventRow,
  type StoryNodeRow,
} from "@/lib/supabase/event-room";
import type { VoteChoice } from "@/types";

export type RemoteEventRow = EventRow;
export type RemoteStoryNodeRow = StoryNodeRow;

export { isUniqueViolation };

export async function fetchEventByCode(client: SupabaseClient<Database>, code: string) {
  return getEventByCode(client, code);
}

export async function fetchAudienceMemberCount(client: SupabaseClient<Database>, eventId: string): Promise<number> {
  return fetchAudienceMemberCountInner(client, eventId);
}

export async function fetchStoryNode(client: SupabaseClient<Database>, nodeId: string) {
  return getStoryNodeById(client, nodeId);
}

export async function fetchAudienceMemberIdForCurrentUser(
  client: SupabaseClient<Database>,
  eventId: string,
  sessionId: string,
): Promise<string | null> {
  return getAudienceMemberIdBySession(client, eventId, sessionId);
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
  return upsertAudienceMember(client, {
    eventId: params.eventId,
    sessionId: params.sessionId,
    displayName: params.displayName,
    tableNumber: params.tableNumber,
  });
}

export async function insertVote(
  client: SupabaseClient<Database>,
  params: {
    eventId: string;
    storyNodeId: string;
    sessionId: string;
    choice: VoteChoice;
  },
) {
  const r = await insertBallotVote(client, {
    eventId: params.eventId,
    nodeId: params.storyNodeId,
    sessionId: params.sessionId,
    choice: params.choice,
  });
  if (r === "duplicate") return "duplicate" as const;
  return "ok" as const;
}

export async function fetchVoteTallies(
  client: SupabaseClient<Database>,
  eventId: string,
  storyNodeId: string,
): Promise<{ a: number; b: number }> {
  return fetchVoteTalliesForNode(client, eventId, storyNodeId);
}

export async function fetchVoteMajority(
  client: SupabaseClient<Database>,
  eventId: string,
  storyNodeId: string,
): Promise<{ winner: VoteChoice | null; tie: boolean }> {
  return fetchVoteMajorityForNode(client, eventId, storyNodeId);
}

export function isVotingStatus(status: RemoteEventRow["status"]) {
  return isEventVotingOpen(status);
}

export function isRevealingStatus(status: RemoteEventRow["status"]) {
  return isEventWinnerRevealed(status);
}

export type TryAnonymousSessionResult =
  | { ok: true; session: Session }
  | { ok: false; message: string; technical?: string };

/**
 * Best-effort anonymous session for operator / screen / admin flows.
 * Never throws — callers decide how to surface {@link TryAnonymousSessionResult}.
 */
export async function tryEnsureAnonymousSession(client: SupabaseClient<Database>): Promise<TryAnonymousSessionResult> {
  try {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (session) return { ok: true, session };

    const { data, error } = await client.auth.signInAnonymously();
    if (error) {
      const technical = error.message;
      let message = friendlySupabaseError(error);
      if (/anonymous|Anonymous sign.?ups are disabled|signups not allowed/i.test(technical)) {
        message =
          "Anonymous sign-in is turned off for this Supabase project. Enable Anonymous in Authentication → Providers, or sign in another way.";
      }
      return { ok: false, message, technical };
    }
    if (!data.session) {
      return {
        ok: false,
        message: "Anonymous sign-in did not return a session. Refresh and try again.",
        technical: "signInAnonymously returned no session",
      };
    }
    return { ok: true, session: data.session };
  } catch (e) {
    return {
      ok: false,
      message: friendlySupabaseError(e),
      technical: e instanceof Error ? e.message : undefined,
    };
  }
}
