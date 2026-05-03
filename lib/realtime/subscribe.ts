"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { eventRoomChannel } from "./channels";
import type { EventRealtimePayload } from "./payloads";
import type { Database } from "@/lib/supabase/database.types";

export type EventMessageHandler = (payload: EventRealtimePayload) => void;

/**
 * Subscribe to event updates. No-op unsubscribe when `client` is null (mock mode).
 */
export function subscribeToEventRoom(
  client: SupabaseClient<Database> | null,
  eventId: string,
  onMessage: EventMessageHandler,
) {
  if (!client) {
    return () => {};
  }

  const channel = client.channel(eventRoomChannel(eventId)).on("broadcast", { event: "sync" }, ({ payload }) => {
    onMessage(payload as EventRealtimePayload);
  });

  void channel.subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
