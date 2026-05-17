"use client";

import { useEffect, useMemo, useState } from "react";

import { subscribeEventSync } from "@/lib/realtime/event-sync";
import type { EventRealtimePayload } from "@/lib/realtime/payloads";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type VotePayload = Extract<EventRealtimePayload, { type: "vote" }>;

/**
 * When Supabase is off, mirrors operator vote broadcasts so /screen matches /host across tabs.
 */
export function useLocalPreviewVoteMirror() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const eventId = useMockEventStore((s) => s.eventId);
  const [vote, setVote] = useState<VotePayload | null>(null);

  useEffect(() => {
    if (supabase || !eventId) return;
    return subscribeEventSync(null, eventId, (p) => {
      if (p.type === "vote") setVote(p);
    });
  }, [supabase, eventId]);

  return vote;
}
