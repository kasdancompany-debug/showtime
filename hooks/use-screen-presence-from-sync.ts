"use client";

import { useEffect, useMemo, useState } from "react";

import { subscribeEventSync } from "@/lib/realtime/event-sync";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const STALE_MS = 12_000;

/**
 * /host: listens for projector heartbeats on the shared event sync channel.
 */
export function useScreenPresenceFromSync(eventId: string | undefined) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null);

  useEffect(() => {
    if (!eventId) return;

    return subscribeEventSync(client, eventId, (payload) => {
      if (payload.type === "surface_heartbeat" && payload.surface === "screen") {
        setLastHeartbeatAt(payload.sentAt);
      }
    });
  }, [client, eventId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(id);
  }, []);

  const screenLikelyConnected =
    lastHeartbeatAt !== null && now - lastHeartbeatAt < STALE_MS;

  return { lastHeartbeatAt, screenLikelyConnected };
}
