import { isProjectorArmed, markProjectorArmed } from "@/lib/showtime/projector-arm";

export const PROJECTOR_VIDEO_SELECTOR = "[data-projector-video]";

export function applyProjectorElementAudio(el: HTMLVideoElement, wantSound: boolean): void {
  el.muted = !wantSound;
  el.volume = 1;
  el.defaultMuted = !wantSound;
}

/** Set when the operator enters fullscreen once; all later desk cues may use sound. */
export function shouldPreferProjectorSound(): boolean {
  return isProjectorArmed();
}

export function getProjectorVideoElement(): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLVideoElement>(PROJECTOR_VIDEO_SELECTOR);
}

/** After entering fullscreen (user gesture), unlock audio on the current reel without an on-screen prompt. */
export function unmuteProjectorVideoIfPresent(): void {
  const el = getProjectorVideoElement();
  if (!el) return;
  applyProjectorElementAudio(el, true);
  if (!el.paused) void el.play().catch(() => {});
}

export function onProjectorFullscreenEntered(): void {
  markProjectorArmed();
  unmuteProjectorVideoIfPresent();
}
