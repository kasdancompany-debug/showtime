"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { YoutubeSyncPlayer } from "@/components/media/youtube-sync-player";
import { resolveVideoSource } from "@/lib/media/video-source";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { cn } from "@/lib/utils";

type ScreenVideoProps = {
  src: string;
  /** Fire store + telemetry when natural end */
  onEnded: () => void;
  onMediaError?: () => void;
  /** Clears fatal error overlay when a load succeeds (e.g. after src change). */
  onMediaReady?: () => void;
  className?: string;
  /** Projection: letterbox vs crop to fill wall */
  objectFit?: "contain" | "cover";
  sendPlaybackTelemetry: (opts: { positionSec: number; isPlaying: boolean; durationSec?: number | null }) => void;
};

const TELEMETRY_MS = 280;

function DirectHtml5Video({
  src,
  onEnded,
  onMediaError,
  onMediaReady,
  className,
  objectFit = "contain",
  sendPlaybackTelemetry,
}: ScreenVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastBroadcast = useRef(0);
  const [buffering, setBuffering] = useState(false);

  const isPlaying = useMockEventStore((s) => s.playback.isPlaying);
  const positionSec = useMockEventStore((s) => s.playback.positionSec);
  const eventStarted = useMockEventStore((s) => s.eventStarted);

  const setPlaybackPosition = useMockEventStore((s) => s.setPlaybackPosition);
  const setPlaybackDuration = useMockEventStore((s) => s.setPlaybackDuration);

  const lastExternalPosition = useRef(positionSec);
  const prevSrc = useRef(src);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (prevSrc.current !== src) {
      prevSrc.current = src;
      v.load();
      lastExternalPosition.current = 0;
    }
  }, [src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !eventStarted) return;

    const applyTransport = () => {
      if (isPlaying) void v.play().catch(() => {});
      else {
        v.pause();
        setBuffering(false);
      }
    };

    applyTransport();

    const onCanPlay = () => {
      if (!eventStarted || !isPlaying) return;
      void v.play().catch(() => {});
    };
    v.addEventListener("canplay", onCanPlay);
    return () => v.removeEventListener("canplay", onCanPlay);
  }, [isPlaying, eventStarted, src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const drift = Math.abs(v.currentTime - positionSec);
    if (drift > 1.25 && Math.abs(positionSec - lastExternalPosition.current) > 0.25) {
      v.currentTime = positionSec;
    }
    lastExternalPosition.current = positionSec;
  }, [positionSec]);

  const pushTelemetry = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const now = Date.now();
    if (now - lastBroadcast.current < TELEMETRY_MS) return;
    lastBroadcast.current = now;
    sendPlaybackTelemetry({
      positionSec: v.currentTime,
      isPlaying: !v.paused,
      durationSec: Number.isFinite(v.duration) ? v.duration : null,
    });
  }, [sendPlaybackTelemetry]);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setPlaybackPosition(v.currentTime);
    if (!v.paused) {
      pushTelemetry();
    }
  }, [setPlaybackPosition, pushTelemetry]);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    setPlaybackDuration(v.duration);
    onMediaReady?.();
    sendPlaybackTelemetry({
      positionSec: v.currentTime,
      isPlaying: !v.paused,
      durationSec: v.duration,
    });
  }, [setPlaybackDuration, sendPlaybackTelemetry, onMediaReady]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || isPlaying) return;
    sendPlaybackTelemetry({
      positionSec: v.currentTime,
      isPlaying: false,
      durationSec: Number.isFinite(v.duration) ? v.duration : null,
    });
  }, [isPlaying, sendPlaybackTelemetry]);

  return (
    <div className={cn("relative h-full min-h-0 w-full flex-1 bg-black", className)}>
      <video
        ref={videoRef}
        className={cn("h-full w-full bg-black", objectFit === "cover" ? "object-cover" : "object-contain")}
        playsInline
        preload="metadata"
        src={src}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onError={(e) => {
          setBuffering(false);
          const el = e.currentTarget;
          const code = el.error?.code;
          if (code === MediaError.MEDIA_ERR_ABORTED) return;
          onMediaError?.();
        }}
      />
      {buffering ? (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-black/25"
          role="status"
          aria-live="polite"
          aria-label="Buffering"
        >
          <div className="h-px w-full bg-[linear-gradient(90deg,transparent,oklch(0.72_0.05_78/0.35),transparent)] opacity-90" />
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <p className="text-center font-mono text-[clamp(1rem,3vw,1.75rem)] font-semibold uppercase tracking-[0.2em] text-[var(--kc-champagne)]">
              Buffering
            </p>
            <div className="mt-8 h-1 w-[min(40vw,22rem)] rounded-full bg-[linear-gradient(90deg,transparent,oklch(0.72_0.05_78/0.45),transparent)] animate-pulse" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ScreenVideo({
  src,
  onEnded,
  onMediaError,
  onMediaReady,
  className,
  objectFit = "contain",
  sendPlaybackTelemetry,
}: ScreenVideoProps) {
  const source = useMemo(() => resolveVideoSource(src), [src]);
  const isPlaying = useMockEventStore((s) => s.playback.isPlaying);
  const positionSec = useMockEventStore((s) => s.playback.positionSec);
  const eventStarted = useMockEventStore((s) => s.eventStarted);
  const setPlaybackPosition = useMockEventStore((s) => s.setPlaybackPosition);
  const setPlaybackDuration = useMockEventStore((s) => s.setPlaybackDuration);

  if (!source) {
    return <div className={cn("flex flex-1 items-center justify-center bg-black text-muted-foreground", className)} />;
  }

  if (source.kind === "youtube") {
    return (
      <YoutubeSyncPlayer
        videoId={source.videoId}
        className={cn("h-full min-h-0 flex-1", className)}
        objectFit={objectFit}
        muted={false}
        showYoutubeControls={false}
        isPlaying={isPlaying}
        eventStarted={eventStarted}
        positionSec={positionSec}
        setPlaybackPosition={setPlaybackPosition}
        setPlaybackDuration={setPlaybackDuration}
        sendPlaybackTelemetry={sendPlaybackTelemetry}
        onEnded={onEnded}
        onMediaError={onMediaError}
        onMediaReady={onMediaReady}
      />
    );
  }

  return (
    <DirectHtml5Video
      src={source.url}
      onEnded={onEnded}
      onMediaError={onMediaError}
      onMediaReady={onMediaReady}
      className={className}
      objectFit={objectFit}
      sendPlaybackTelemetry={sendPlaybackTelemetry}
    />
  );
}
