"use client";

import { useCallback, useEffect, useId, useRef } from "react";

import { loadYoutubeIframeApi } from "@/lib/media/load-youtube-iframe-api";
import { cn } from "@/lib/utils";

/** Minimal typing — avoid pulling @types/youtube */
type YtPlayer = {
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  mute?: () => void;
  destroy?: () => void;
};

const YT_ENDED = 0;
const TELEMETRY_MS = 280;

type YoutubeSyncPlayerProps = {
  videoId: string;
  className?: string;
  /** Letterbox vs crop-to-fill for the iframe (16:9 assumption). */
  objectFit?: "contain" | "cover";
  muted?: boolean;
  /** Operator desk: show YouTube controls inside the iframe */
  showYoutubeControls?: boolean;
  isPlaying: boolean;
  eventStarted: boolean;
  positionSec: number;
  setPlaybackPosition: (sec: number) => void;
  setPlaybackDuration: (sec: number | null) => void;
  sendPlaybackTelemetry?: (opts: {
    positionSec: number;
    isPlaying: boolean;
    durationSec?: number | null;
  }) => void;
  onEnded: () => void;
  onMediaError?: () => void;
  onMediaReady?: () => void;
};

export function YoutubeSyncPlayer({
  videoId,
  className,
  objectFit = "contain",
  muted = false,
  showYoutubeControls = false,
  isPlaying,
  eventStarted,
  positionSec,
  setPlaybackPosition,
  setPlaybackDuration,
  sendPlaybackTelemetry,
  onEnded,
  onMediaError,
  onMediaReady,
}: YoutubeSyncPlayerProps) {
  const uid = useId().replace(/:/g, "");
  const containerId = `yt-${uid}`;
  const playerRef = useRef<YtPlayer | null>(null);
  const lastBroadcast = useRef(0);
  const lastExternalPosition = useRef(positionSec);
  const endedRef = useRef(false);
  const activeVideoId = useRef(videoId);
  const isPlayingRef = useRef(isPlaying);
  const eventStartedRef = useRef(eventStarted);
  isPlayingRef.current = isPlaying;
  eventStartedRef.current = eventStarted;

  const destroyPlayer = useCallback(() => {
    try {
      playerRef.current?.destroy?.();
    } catch {
      /* ignore */
    }
    playerRef.current = null;
  }, []);

  useEffect(() => {
    endedRef.current = false;
    activeVideoId.current = videoId;
    let cancelled = false;

    void (async () => {
      try {
        await loadYoutubeIframeApi();
        if (cancelled || activeVideoId.current !== videoId) return;

        const w = window as Window & {
          YT?: { Player: new (id: string, opts: Record<string, unknown>) => YtPlayer };
        };
        if (!w.YT?.Player) {
          onMediaError?.();
          return;
        }

        destroyPlayer();

        new w.YT.Player(containerId, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            controls: showYoutubeControls ? 1 : 0,
          },
          events: {
            onReady: (ev: { target: YtPlayer }) => {
              if (cancelled || activeVideoId.current !== videoId) return;
              playerRef.current = ev.target;
              try {
                const d = ev.target.getDuration?.();
                if (Number.isFinite(d) && (d as number) > 0) setPlaybackDuration(d as number);
              } catch {
                /* ignore */
              }
              onMediaReady?.();
              try {
                if (muted) ev.target.mute?.();
              } catch {
                /* ignore */
              }
              if (eventStartedRef.current && isPlayingRef.current) {
                try {
                  ev.target.playVideo?.();
                } catch {
                  /* ignore */
                }
              }
            },
            onError: () => {
              if (!cancelled) onMediaError?.();
            },
            onStateChange: (ev: { data: number }) => {
              if (cancelled || activeVideoId.current !== videoId) return;
              if (ev.data === YT_ENDED && !endedRef.current) {
                endedRef.current = true;
                onEnded();
              }
            },
          },
        });
      } catch {
        if (!cancelled) onMediaError?.();
      }
    })();

    return () => {
      cancelled = true;
      destroyPlayer();
    };
  }, [videoId, containerId, destroyPlayer, muted, onEnded, onMediaError, onMediaReady, setPlaybackDuration, showYoutubeControls]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !eventStarted) return;
    try {
      if (isPlaying) void p.playVideo?.();
      else p.pauseVideo?.();
    } catch {
      /* ignore */
    }
  }, [isPlaying, eventStarted]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p?.getCurrentTime || !p.seekTo) return;
    const drift = Math.abs((p.getCurrentTime() ?? 0) - positionSec);
    const storeJumped = Math.abs(positionSec - lastExternalPosition.current) > 0.25;
    lastExternalPosition.current = positionSec;
    if (storeJumped && drift > 1.25) {
      try {
        p.seekTo(positionSec, true);
      } catch {
        /* ignore */
      }
    }
  }, [positionSec]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const cur = playerRef.current;
      if (!cur?.getCurrentTime) return;
      try {
        const t = cur.getCurrentTime() ?? 0;
        setPlaybackPosition(t);
        const now = Date.now();
        if (sendPlaybackTelemetry && now - lastBroadcast.current >= TELEMETRY_MS) {
          lastBroadcast.current = now;
          const dur = cur.getDuration?.();
          sendPlaybackTelemetry({
            positionSec: t,
            isPlaying: isPlaying && eventStarted,
            durationSec: Number.isFinite(dur) ? dur : null,
          });
        }
      } catch {
        /* ignore */
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [eventStarted, isPlaying, sendPlaybackTelemetry, setPlaybackPosition]);

  const iframeContain = "[&_iframe]:h-full [&_iframe]:w-full";
  const iframeCover =
    "[&_iframe]:absolute [&_iframe]:left-1/2 [&_iframe]:top-1/2 [&_iframe]:h-[56.25vw] [&_iframe]:min-h-full [&_iframe]:w-[177.77vh] [&_iframe]:min-w-full [&_iframe]:-translate-x-1/2 [&_iframe]:-translate-y-1/2";

  return (
    <div className={cn("relative min-h-0 w-full overflow-hidden bg-black", className)}>
      <div
        id={containerId}
        className={cn(
          "relative h-full min-h-[12rem] w-full bg-black",
          objectFit === "cover" ? `overflow-hidden ${iframeCover}` : iframeContain,
        )}
      />
    </div>
  );
}
