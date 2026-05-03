"use client";

import { useEffect, useMemo } from "react";

import { broadcastEventSync } from "@/lib/realtime/event-sync";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const HEARTBEAT_MS = 4000;

/**
 * /screen only: announces presence on the event channel so /host can warn if no projector tab is open.
 * Uses Supabase broadcast when configured; otherwise BroadcastChannel (same origin tabs).
 */
export function useScreenSurfaceHeartbeat(eventId: string | undefined) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!eventId) return;

    const ping = () => {
      void broadcastEventSync(client, eventId, {
        type: "surface_heartbeat",
        surface: "screen",
        sentAt: Date.now(),
      });
    };

    ping();
    const id = window.setInterval(ping, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [client, eventId]);
}
