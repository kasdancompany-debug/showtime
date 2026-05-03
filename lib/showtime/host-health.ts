import { MOCK_EVENT } from "@/lib/mock-data";

export type HostRemoteEventLookupStatus = "idle" | "loading" | "ok" | "missing" | "error";

/** True when Supabase is on but this event code has no row (hybrid mock code exempt). */
export function shouldWarnRemoteEventMissing(
  status: HostRemoteEventLookupStatus,
  eventCode: string,
): boolean {
  return status === "missing" && eventCode.toUpperCase() !== MOCK_EVENT.eventCode;
}

/** Supabase Realtime probe status — mirrors `hooks/use-event-room-realtime-probe` without importing React hooks into lib. */
export type RealtimeProbeHealthStatus = "unsupported" | "idle" | "connecting" | "subscribed" | "error";

/** True when Live Supabase mode but the probe channel reports a hard failure (not transient "connecting"). */
export function shouldWarnRealtimeDisconnected(
  syncMode: "live_supabase" | "local_preview",
  status: RealtimeProbeHealthStatus,
): boolean {
  if (syncMode !== "live_supabase") return false;
  return status === "error";
}
