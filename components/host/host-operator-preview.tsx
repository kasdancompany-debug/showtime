"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { YoutubeSyncPlayer } from "@/components/media/youtube-sync-player";
import { Button } from "@/components/ui/button";
import { useNodePlaybackSrc } from "@/hooks/use-node-playback-src";
import { resolveVideoSource } from "@/lib/media/video-source";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { cn } from "@/lib/utils";
import type { StoryNode } from "@/types";

/** Fixed 16∶9 frame so the desk stays above the fold on laptop viewports. */
export const HOST_DESK_PREVIEW_FRAME =
  "relative mx-auto aspect-video w-full max-w-full max-h-[min(13rem,22vh)] overflow-hidden rounded-lg bg-black ring-1 ring-[oklch(1_0_0/0.08)] sm:max-h-[min(15rem,26vh)]";

/** Desk preview — mirrors transport; direct URLs, blobs, YouTube. */
export function HostOperatorPreviewVideo({
  src,
  isPlaying,
  onFaultChange,
}: {
  src: string;
  isPlaying: boolean;
  onFaultChange?: (failed: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const source = useMemo(() => resolveVideoSource(src), [src]);
  const [mediaFault, setMediaFault] = useState(false);
  const [ytRetryNonce, setYtRetryNonce] = useState(0);
  const setPlaybackPosition = useMockEventStore((s) => s.setPlaybackPosition);
  const setPlaybackDuration = useMockEventStore((s) => s.setPlaybackDuration);
  const positionSec = useMockEventStore((s) => s.playback.positionSec);
  const eventStarted = useMockEventStore((s) => s.eventStarted);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const tryPlay = useCallback(() => {
    const v = ref.current;
    if (!v || !isPlayingRef.current) return;
    void v.play().catch(() => {});
  }, []);

  useEffect(() => {
    setMediaFault(false);
    setYtRetryNonce(0);
  }, [src]);

  useEffect(() => {
    onFaultChange?.(mediaFault);
  }, [mediaFault, onFaultChange]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.load();
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isPlaying) tryPlay();
    else v.pause();
  }, [isPlaying, tryPlay, src]);

  const onLoadedMetadata = useCallback(() => {
    const v = ref.current;
    if (!v || !Number.isFinite(v.duration)) return;
    setPlaybackDuration(v.duration);
    tryPlay();
  }, [setPlaybackDuration, tryPlay]);

  const faultPanel = (detail: string) => (
    <div
      className={cn(
        HOST_DESK_PREVIEW_FRAME,
        "flex flex-col items-center justify-center gap-2 border-amber-500/45 bg-black/85 px-3 py-4 text-center",
      )}
    >
      <p className="text-sm font-semibold text-amber-50">Preview failed</p>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{detail}</p>
      <Button
        type="button"
        variant="secondary"
        className="rounded-xl"
        onClick={() => {
          setMediaFault(false);
          if (source?.kind === "youtube") setYtRetryNonce((n) => n + 1);
          else ref.current?.load();
        }}
      >
        Retry
      </Button>
    </div>
  );

  if (!source) {
    return faultPanel("No video selected. Add media in Story builder.");
  }

  if (source.kind === "youtube") {
    if (mediaFault) {
      return faultPanel(
        "YouTube did not load (network, embed block, or bad ID). Test the link in a normal browser tab.",
      );
    }
    return (
      <div className={cn(HOST_DESK_PREVIEW_FRAME, "flex min-h-0 flex-col")}>
        <YoutubeSyncPlayer
          key={`${source.videoId}-${ytRetryNonce}`}
          videoId={source.videoId}
          className="min-h-0 flex-1"
          muted
          showYoutubeControls
          isPlaying={isPlaying}
          eventStarted={eventStarted}
          positionSec={positionSec}
          setPlaybackPosition={setPlaybackPosition}
          setPlaybackDuration={setPlaybackDuration}
          onEnded={() => {}}
          onMediaError={() => setMediaFault(true)}
          onMediaReady={() => setMediaFault(false)}
        />
      </div>
    );
  }

  if (mediaFault) {
    return faultPanel(
      "This browser could not play the file (bad URL, CORS, or codec). Try MP4/H.264 or YouTube.",
    );
  }

  return (
    <div className={HOST_DESK_PREVIEW_FRAME}>
      <video
        ref={ref}
        src={source.url}
        className="h-full w-full object-contain"
        muted
        playsInline
        controls
        preload="auto"
        onLoadedMetadata={() => {
          setMediaFault(false);
          onLoadedMetadata();
        }}
        onCanPlay={tryPlay}
        onError={() => setMediaFault(true)}
        onTimeUpdate={() => {
          const v = ref.current;
          if (v) setPlaybackPosition(v.currentTime);
        }}
      />
    </div>
  );
}

export function HostOperatorDeskPreview({
  node,
  isPlaying,
  onFaultChange,
}: {
  node: StoryNode | undefined;
  isPlaying: boolean;
  onFaultChange?: (failed: boolean) => void;
}) {
  const mediaGeneration = useMockEventStore((s) => s.mediaGeneration);
  const { src, status } = useNodePlaybackSrc(node, mediaGeneration);

  useEffect(() => {
    if (!src || status !== "ready") onFaultChange?.(false);
  }, [src, status, onFaultChange]);

  if (status === "loading") {
    return (
      <div className={cn(HOST_DESK_PREVIEW_FRAME, "flex items-center justify-center bg-black/40 px-3")}>
        <p className="text-center text-xs text-muted-foreground sm:text-sm">Loading video…</p>
      </div>
    );
  }
  if (status === "missing") {
    return (
      <div className={cn(HOST_DESK_PREVIEW_FRAME, "flex items-center justify-center border-amber-500/35 bg-amber-950/25 px-3")}>
        <p className="text-center text-xs leading-relaxed text-amber-100/95 sm:text-sm">
          Local file missing. Re-pick the video in Story builder on this computer.
        </p>
      </div>
    );
  }
  if (!src) {
    return (
      <div
        className={cn(
          HOST_DESK_PREVIEW_FRAME,
          "flex flex-col items-center justify-center gap-1 border-dashed bg-black/25 px-3 text-center",
        )}
      >
        <p className="text-xs font-medium text-foreground/90 sm:text-sm">No video selected.</p>
        <p className="max-w-sm text-[0.65rem] text-muted-foreground sm:text-xs">Add a URL or local file in Story builder.</p>
      </div>
    );
  }
  return <HostOperatorPreviewVideo src={src} isPlaying={isPlaying} onFaultChange={onFaultChange} />;
}
