"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { clearAllRoomParticipants } from "@/lib/join/participant-identity";
import { OPERATOR_CODE_LS } from "@/lib/showtime/operator-session";
import type { Database } from "@/lib/supabase/database.types";

const SHOWTIME_PREFIXES = ["showtime:", "kc-join-"];

export function listShowtimeStorageKeys(): string[] {
  if (typeof window === "undefined") return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && SHOWTIME_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && SHOWTIME_PREFIXES.some((p) => k.startsWith(p))) keys.push(`session:${k}`);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

export async function resetShowtimeDeviceStorage(
  supabase: SupabaseClient<Database> | null,
): Promise<void> {
  clearAllRoomParticipants();
  if (typeof window !== "undefined") {
    try {
      const dropLocal: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (
          k &&
          (k.startsWith("showtime:") ||
            k.startsWith("showtime.") ||
            k.startsWith("kc-join-") ||
            k === OPERATOR_CODE_LS)
        ) {
          dropLocal.push(k);
        }
      }
      for (const k of dropLocal) window.localStorage.removeItem(k);

      const dropSession: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && (k.startsWith("showtime:") || k.startsWith("kc-join-"))) dropSession.push(k);
      }
      for (const k of dropSession) window.sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }

  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }
}

export async function resetShowtimeDeviceAndReload(
  supabase: SupabaseClient<Database> | null,
): Promise<void> {
  await resetShowtimeDeviceStorage(supabase);
  if (typeof window !== "undefined") window.location.reload();
}
