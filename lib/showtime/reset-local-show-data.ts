"use client";

import { clearAllJoinSessions, clearJoinSession } from "@/lib/join/session-storage";
import { useMockEventStore } from "@/lib/store/mock-event-store";

function safeWarn(scope: string, err: unknown): void {
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(`[showtime] ${scope}: ${detail}`);
}

/**
 * Clears join sessions, then resets operator runtime to the empty story.
 * Follower tabs catch up via {@link scheduleRoomSnapshotEmit}.
 */
export async function resetLocalShowData(): Promise<void> {
  const before = useMockEventStore.getState().eventCode;
  try {
    clearJoinSession(before);
    clearAllJoinSessions();
  } catch (e) {
    safeWarn("resetLocalShowData.joinSessions", e);
  }
  try {
    useMockEventStore.getState().clearActiveFilm();
    clearJoinSession(useMockEventStore.getState().eventCode);
  } catch (e) {
    safeWarn("resetLocalShowData.store", e);
  }
}
