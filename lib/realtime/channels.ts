/** Realtime channel naming — keep in sync when wiring Supabase broadcasts */

export function eventRoomChannel(eventId: string) {
  return `event:${eventId}`;
}

export function eventPresenceChannel(eventId: string) {
  return `presence:event:${eventId}`;
}
