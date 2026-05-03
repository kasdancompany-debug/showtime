"use client";

import { useEffect, useMemo, useState } from "react";

import {
  subscribeEventSyncWithStatus,
  type EventSyncChannelStatus,
} from "@/lib/realtime/event-sync";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMockEventStore } from "@/lib/store/mock-event-store";

/**
 * /screen only: Supabase Realtime channel health. BroadcastChannel mode reports `idle` (no disconnect signal).
 */
export function useScreenChannelStatus() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const eventId = useMockEventStore((s) => s.eventId);
  const [status, setStatus] = useState<EventSyncChannelStatus>("idle");

  useEffect(() => {
    return subscribeEventSyncWithStatus(client, eventId, () => {}, setStatus);
  }, [client, eventId]);

  return { status, usesSupabase: Boolean(client) };
}
