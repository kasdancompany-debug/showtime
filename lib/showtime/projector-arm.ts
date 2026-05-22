const SESSION_KEY = "kasdan.projectorArmed";

/** Projector tab was tapped once this session — operator play may use sound without another prompt. */
export function isProjectorArmed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markProjectorArmed(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearProjectorArmed(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

import { readStoredOperatorCode, readUrlRoomCode } from "@/lib/showtime/operator-session";

const PROJECTOR_WINDOW_NAME = "kasdan-projector";

/** Reuse one projector tab per browser profile (focus if already open). */
export function openOrFocusProjector(arm = false, roomCode?: string): Window | null {
  if (typeof window === "undefined") return null;
  const code = (roomCode?.trim() || readUrlRoomCode() || readStoredOperatorCode()).toUpperCase();
  const qs = new URLSearchParams();
  if (arm) qs.set("arm", "1");
  if (code.length >= 3) qs.set("code", code);
  const path = qs.toString() ? `/screen?${qs}` : "/screen";
  const url = `${window.location.origin}${path}`;
  try {
    return window.open(url, PROJECTOR_WINDOW_NAME);
  } catch {
    return null;
  }
}
