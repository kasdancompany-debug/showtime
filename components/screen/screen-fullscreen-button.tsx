"use client";

import { useCallback, useEffect, useState } from "react";
import { Expand } from "lucide-react";

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
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange as EventListener);
    };
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        const el = document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if ((el as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
          await (el as unknown as { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen();
        }
      }
    } catch {
      /* Safari / policy may block without gesture — user can use F11 */
    }
  }, []);

  /** While fullscreen, hide the control so the slate/video stays clean; Esc still exits (browser `fullscreenchange`). */
  if (active) return null;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title="Fill the monitor (browser fullscreen)"
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
