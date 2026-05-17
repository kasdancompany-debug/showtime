"use client";

import { useEffect, useMemo } from "react";

import { broadcastEventSync } from "@/lib/realtime/event-sync";
import { buildLocalPreviewVotePayload } from "@/lib/showtime/local-vote-broadcast";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * When Supabase is not configured, mirrors mock vote state to BroadcastChannel so /join tabs stay in sync with /host.
 */
export function useLocalMockVoteBroadcast() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const eventId = useMockEventStore((s) => s.eventId);
  const engine = useMockEventStore((s) => s.engine);
  const votePhase = useMockEventStore((s) => s.votePhase);
  const voteEndsAt = useMockEventStore((s) => s.voteEndsAt);
  const votesA = useMockEventStore((s) => s.votesA);
  const votesB = useMockEventStore((s) => s.votesB);
  const revealedWinner = useMockEventStore((s) => s.revealedWinner);
  const eventTitle = useMockEventStore((s) => s.eventTitle);
  const allowAnonymousQuickJoin = useMockEventStore((s) => s.allowAnonymousQuickJoin);
  const pollDurationSec = useMockEventStore((s) => s.pollDurationSec);

  useEffect(() => {
    if (client || !eventId) return;
    const payload = buildLocalPreviewVotePayload({
      engine,
      votePhase,
      voteEndsAt,
      votesA,
      votesB,
      revealedWinner,
      eventTitle,
      allowAnonymousQuickJoin,
      pollDurationSec,
    });
    void broadcastEventSync(null, eventId, payload);
  }, [
    client,
    eventId,
    engine,
    votePhase,
    voteEndsAt,
    votesA,
    votesB,
    revealedWinner,
    eventTitle,
    allowAnonymousQuickJoin,
    pollDurationSec,
  ]);
}
