"use client";

import { useEffect } from "react";

import { clearProjectorArmed } from "@/lib/showtime/projector-arm";
import {
  clearWantsProjectorFullscreen,
  markWantsProjectorFullscreen,
  reassertProjectorFullscreenIfWanted,
  wantsProjectorFullscreen,
} from "@/lib/showtime/projector-fullscreen";
import { onProjectorFullscreenEntered } from "@/lib/showtime/projector-playback";

/**
 * Keeps `/screen` in browser fullscreen for the whole show once the operator arms it.
 * Re-enters when the browser drops fullscreen during reel/slate transitions; Esc clears the lock.
 */
export function useProjectorFullscreenLock(deps: unknown[] = []) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    let reassertTimer: number | undefined;
    let escDismissedAt = 0;

    const scheduleReassert = () => {
      if (!wantsProjectorFullscreen()) return;
      if (document.fullscreenElement) return;
      if (Date.now() - escDismissedAt < 600) return;
      if (reassertTimer) window.clearTimeout(reassertTimer);
      reassertTimer = window.setTimeout(() => {
        reassertProjectorFullscreenIfWanted();
      }, 80);
    };

    const onFullscreenChange = () => {
      if (document.fullscreenElement) {
        markWantsProjectorFullscreen();
        onProjectorFullscreenEntered();
      }
      scheduleReassert();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleReassert();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      escDismissedAt = Date.now();
      clearWantsProjectorFullscreen();
      clearProjectorArmed();
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", onKeyDown, true);

    scheduleReassert();

    return () => {
      if (reassertTimer) window.clearTimeout(reassertTimer);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("keydown", onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller passes show-phase deps (status, node, src)
  }, deps);
}
