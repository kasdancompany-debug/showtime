import { clearProjectorArmed } from "@/lib/showtime/projector-arm";
import { onProjectorFullscreenEntered } from "@/lib/showtime/projector-playback";

const WANTS_FULLSCREEN_KEY = "kasdan.projectorWantsFullscreen";

export function wantsProjectorFullscreen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(WANTS_FULLSCREEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWantsProjectorFullscreen(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WANTS_FULLSCREEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearWantsProjectorFullscreen(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(WANTS_FULLSCREEN_KEY);
  } catch {
    /* ignore */
  }
}

export function isProjectorFullscreenActive(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.fullscreenElement);
}

/** Request document fullscreen; on success, remember so we can re-enter after reel / slate transitions. */
export async function enterProjectorFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if (document.fullscreenElement) {
    markWantsProjectorFullscreen();
    onProjectorFullscreenEntered();
    return true;
  }
  const root = document.documentElement;
  const req =
    root.requestFullscreen?.bind(root) ??
    (root as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.bind(root);
  if (!req) return false;
  try {
    await req.call(root);
    markWantsProjectorFullscreen();
    onProjectorFullscreenEntered();
    return true;
  } catch {
    return false;
  }
}

/** Operator or Esc — leave fullscreen and stop auto re-entering. */
export async function exitProjectorFullscreen(): Promise<void> {
  clearWantsProjectorFullscreen();
  clearProjectorArmed();
  if (typeof document === "undefined") return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

/** Browsers often drop fullscreen when the video remounts or the UI layer changes — put it back if the user asked to stay fullscreen. */
export function reassertProjectorFullscreenIfWanted(): void {
  if (!wantsProjectorFullscreen() || isProjectorFullscreenActive()) return;
  void enterProjectorFullscreen();
}
