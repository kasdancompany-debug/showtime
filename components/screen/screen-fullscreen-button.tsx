"use client";

import { useCallback, useEffect, useState } from "react";
import { Expand } from "lucide-react";

import {
  enterProjectorFullscreen,
  exitProjectorFullscreen,
  isProjectorFullscreenActive,
  wantsProjectorFullscreen,
} from "@/lib/showtime/projector-fullscreen";
import { cn } from "@/lib/utils";

/**
 * Browser Fullscreen API for the projector tab — separate from reel contain/cover in {@link ScreenHostedVideo}.
 */
export function ScreenFullscreenButton({
  className,
  variant = "floating",
}: {
  className?: string;
  variant?: "floating" | "inline";
}) {
  const [active, setActive] = useState(() => isProjectorFullscreenActive());

  useEffect(() => {
    const onChange = () => setActive(isProjectorFullscreenActive());
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange as EventListener);
    };
  }, []);

  const toggle = useCallback(async () => {
    if (isProjectorFullscreenActive()) {
      await exitProjectorFullscreen();
    } else {
      await enterProjectorFullscreen();
    }
  }, []);

  /** Sticky lock is on — stay clean; Esc clears lock and exits. */
  if (active && wantsProjectorFullscreen()) return null;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title="Fill the monitor and enable sound for the show (once per session)"
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-md border border-white/20 bg-black/55 px-3 py-2 text-xs font-medium text-white/90 backdrop-blur-sm hover:bg-black/75",
        variant === "floating" && "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[150]",
        className,
      )}
    >
      <Expand className="size-4 shrink-0" aria-hidden />
      Fullscreen
    </button>
  );
}
