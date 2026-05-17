"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { eventRoomChannel } from "./channels";
import type { EventRealtimePayload } from "./payloads";
import type { Database } from "@/lib/supabase/database.types";

const bcCache = new Map<string, BroadcastChannel>();
/** One subscribed channel per event for outbound sends (reuse across broadcasts). */
const outboundChannels = new Map<string, ReturnType<SupabaseClient<Database>["channel"]>>();

function getBroadcastChannel(eventId: string) {
  if (!bcCache.has(eventId)) {
    bcCache.set(eventId, new BroadcastChannel(`bn-event-${eventId}`));
  }
  return bcCache.get(eventId)!;
}

async function getOutboundChannel(client: SupabaseClient<Database>, eventId: string) {
  let ch = outboundChannels.get(eventId);
  if (ch) return ch;
  ch = client.channel(eventRoomChannel(eventId), {
    config: { broadcast: { ack: false } },
  });
  await new Promise<void>((resolve, reject) => {
    ch!.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR") reject(new Error("Realtime channel error"));
    });
  });
  outboundChannels.set(eventId, ch);
  return ch;
}

export type EventSyncHandler = (payload: EventRealtimePayload) => void;

/** Maps Supabase Realtime channel subscription callbacks for diagnostics / join UX. */
export type EventSyncChannelStatus =
  | "idle"
  | "connecting"
  | "subscribed"
  | "channel_error"
  | "timed_out"
  | "closed";

function subscribeEventSyncInner(
  client: SupabaseClient<Database> | null,
  eventId: string,
  onMessage: EventSyncHandler,
  onChannelStatus?: (status: EventSyncChannelStatus) => void,
) {
  if (client) {
    onChannelStatus?.("connecting");
    const ch = client.channel(eventRoomChannel(eventId), {
      config: { broadcast: { ack: false } },
    }).on("broadcast", { event: "sync" }, ({ payload }) => {
      try {
        onMessage(payload as EventRealtimePayload);
      } catch {
        /* ignore malformed payloads */
      }
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") onChannelStatus?.("subscribed");
      if (status === "CHANNEL_ERROR") onChannelStatus?.("channel_error");
      if (status === "TIMED_OUT") onChannelStatus?.("timed_out");
      if (status === "CLOSED") onChannelStatus?.("closed");
    });
    return () => {
      void client.removeChannel(ch);
    };
  }

  onChannelStatus?.("idle");
  const bc = getBroadcastChannel(eventId);
  const handler = (ev: MessageEvent<EventRealtimePayload>) => {
    try {
      onMessage(ev.data);
    } catch {
      /* ignore malformed payloads */
    }
  };
  bc.addEventListener("message", handler);
  return () => bc.removeEventListener("message", handler);
}

/**
 * Single transport: Supabase broadcast when configured, otherwise BroadcastChannel (same-browser tabs).
 */
export function subscribeEventSync(
  client: SupabaseClient<Database> | null,
  eventId: string,
  onMessage: EventSyncHandler,
) {
  return subscribeEventSyncInner(client, eventId, onMessage, undefined);
}

/** Same as `subscribeEventSync`, plus channel lifecycle callbacks when using Supabase. */
export function subscribeEventSyncWithStatus(
  client: SupabaseClient<Database> | null,
  eventId: string,
  onMessage: EventSyncHandler,
  onChannelStatus?: (status: EventSyncChannelStatus) => void,
) {
  return subscribeEventSyncInner(client, eventId, onMessage, onChannelStatus);
}

export async function broadcastEventSync(
  client: SupabaseClient<Database> | null,
  eventId: string,
  payload: EventRealtimePayload,
) {
  if (client) {
    try {
      const ch = await getOutboundChannel(client, eventId);
      await ch.send({ type: "broadcast", event: "sync", payload });
    } catch {
      getBroadcastChannel(eventId).postMessage(payload);
    }
  } else {
    getBroadcastChannel(eventId).postMessage(payload);
  }
}
