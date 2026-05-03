"use client";

import { useEffect, useMemo, useState } from "react";

import { eventRoomChannel } from "@/lib/realtime/channels";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type RealtimeProbeStatus = "unsupported" | "idle" | "connecting" | "subscribed" | "error";

/**
 * Lightweight subscribe to the event broadcast channel to surface connection health on /host diagnostics.
 * Separate from vote sync channels so diagnostics stays independent.
 */
export function useEventRoomRealtimeProbe(eventId: string | undefined, probeRetryKey = 0) {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<RealtimeProbeStatus>("idle");

  useEffect(() => {
    if (!client || !eventId) {
      setStatus(client ? "idle" : "unsupported");
      return;
    }

    setStatus("connecting");
    const ch = client.channel(eventRoomChannel(eventId), {
      config: { broadcast: { ack: false } },
    }).on("broadcast", { event: "sync" }, () => {});

    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("subscribed");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error");
      else if (s === "CLOSED") setStatus("idle");
    });

    return () => {
      void client.removeChannel(ch);
    };
  }, [client, eventId, probeRetryKey]);

  return { status, supabaseConfigured: Boolean(client) };
}
