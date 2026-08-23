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

function isRateLimitError(error: { status?: number; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  return /rate limit/i.test(error.message ?? "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Full jitter backoff (AWS-style): random(0, base * 2^attempt), capped. */
function backoffDelayMs(attempt: number): number {
  const base = 400;
  const cap = 6000;
  const max = Math.min(cap, base * 2 ** attempt);
  return Math.random() * max;
}

/**
 * Best-effort anonymous session for operator / screen / admin flows.
 * Never throws — callers decide how to surface {@link TryAnonymousSessionResult}.
 *
 * Retries on 429 (rate limited): a real audience QR-scan burst — 100+ phones tapping "enter
 * the room" within the same few seconds, especially when many share one venue-wifi NAT'd IP —
 * can trip Supabase Auth's anonymous sign-in rate limit. Without a retry, that burst just fails
 * outright for whoever loses the race; jittered backoff spreads the retries out instead.
 */
export async function tryEnsureAnonymousSession(
  client: SupabaseClient<Database>,
  maxAttempts = 5,
): Promise<TryAnonymousSessionResult> {
  try {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (session) return { ok: true, session };

    let lastError: { status?: number; message: string } | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await sleep(backoffDelayMs(attempt - 1));

      const { data, error } = await client.auth.signInAnonymously();
      if (!error) {
        if (!data.session) {
          return {
            ok: false,
            message: "Anonymous sign-in did not return a session. Refresh and try again.",
            technical: "signInAnonymously returned no session",
          };
        }
        return { ok: true, session: data.session };
      }

      lastError = error;
      if (!isRateLimitError(error)) break;
    }

    const error = lastError!;
    const technical = error.message;
    let message = friendlySupabaseError(error);
    if (isRateLimitError(error)) {
      message = "The room is busy right now — retrying automatically, hang tight.";
    } else if (/anonymous|Anonymous sign.?ups are disabled|signups not allowed/i.test(technical)) {
      message =
        "Anonymous sign-in is turned off for this Supabase project. Enable Anonymous in Authentication → Providers, or sign in another way.";
    }
    return { ok: false, message, technical };
  } catch (e) {
    return {
      ok: false,
      message: friendlySupabaseError(e),
      technical: e instanceof Error ? e.message : undefined,
    };
  }
}
