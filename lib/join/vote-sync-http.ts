"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { insertVote } from "@/lib/join/supabase-room";
import type { Database } from "@/lib/supabase/database.types";
import type { VoteChoice } from "@/types";

export async function postJoinVoteHttpFallback(params: {
  eventId: string;
  storyNodeId: string;
  sessionId: string;
  choice: VoteChoice;
  accessToken: string;
}): Promise<"ok" | "duplicate" | "failed"> {
  try {
    const res = await fetch("/api/join/vote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        eventId: params.eventId,
        storyNodeId: params.storyNodeId,
        sessionId: params.sessionId,
        choice: params.choice,
      }),
    });
    if (res.status === 409) return "duplicate";
    if (!res.ok) return "failed";
    return "ok";
  } catch {
    return "failed";
  }
}

export async function attemptHostedVoteDelivery(
  supabase: SupabaseClient<Database>,
  params: {
    eventId: string;
    storyNodeId: string;
    sessionId: string;
    choice: VoteChoice;
  },
): Promise<"ok" | "duplicate" | "failed"> {
  const tryInsert = async (): Promise<"ok" | "duplicate" | "failed"> => {
    try {
      const r = await insertVote(supabase, params);
      return r === "duplicate" ? "duplicate" : "ok";
    } catch {
      return "failed";
    }
  };

  let r = await tryInsert();
  if (r !== "failed") return r;
  r = await tryInsert();
  if (r !== "failed") return r;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return "failed";

  return postJoinVoteHttpFallback({ ...params, accessToken: token });
}
