"use client";

import { useEffect, useMemo } from "react";

import { subscribeEventSync } from "@/lib/realtime/event-sync";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Local preview: apply phone votes from BroadcastChannel so the host tab’s mock tallies match /join tabs.
 */
export function useIngestBroadcastAudienceVotes(eventId: string | undefined) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (supabase || !eventId) return;
    return subscribeEventSync(null, eventId, (p) => {
      if (p.type !== "audience_vote") return;
      useMockEventStore.getState().recordRemoteAudienceVote(p.clientVoteId, p.choice);
    });
  }, [supabase, eventId]);
}
