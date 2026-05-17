import { getSupabaseConfig } from "@/lib/supabase/env";

export type ShowtimeSyncMode = "live_supabase" | "local_preview";

/**
 * Live Supabase: cross-device Realtime + phones on other networks.
 * Local preview: BroadcastChannel + localStorage session — same browser origin only.
 */
export function getShowtimeSyncMode(): ShowtimeSyncMode {
  return getSupabaseConfig().isConfigured ? "live_supabase" : "local_preview";
}

export function showtimeSyncModeLabel(mode: ShowtimeSyncMode): string {
  return mode === "live_supabase" ? "Live sync" : "Local preview";
}

export function showtimeSyncModeDescription(mode: ShowtimeSyncMode): string {
  return mode === "live_supabase"
    ? "Phones and other machines sync via Supabase Realtime on this event channel."
    : "Sync uses BroadcastChannel in this browser only. Open /host, /screen, and /join in tabs on the same machine for rehearsal — add Supabase env for real audiences.";
}
