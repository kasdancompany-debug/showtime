"use client";

import { useEffect, useRef, useState } from "react";

import { getLocalVideoBlob } from "@/lib/media/local-video-store";
import type { StoryNode } from "@/types";

export type PlaybackSrcStatus = "idle" | "loading" | "ready" | "missing";

/**
 * Resolves a node's playable URL: remote `videoUrl`, or a blob URL from `localVideoKey` in IndexedDB.
 */
export function useNodePlaybackSrc(node: StoryNode | undefined): {
  src: string | null;
  status: PlaybackSrcStatus;
} {
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<PlaybackSrcStatus>("idle");
  const revokeRef = useRef<string | null>(null);

  useEffect(() => {
    if (revokeRef.current) {
      URL.revokeObjectURL(revokeRef.current);
      revokeRef.current = null;
    }

    if (!node) {
      setSrc(null);
      setStatus("idle");
      return;
    }

    const key = node.localVideoKey?.trim();
    const remote = node.videoUrl?.trim();

    if (key) {
      setStatus("loading");
      let cancelled = false;
      void getLocalVideoBlob(key).then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setSrc(null);
          setStatus("missing");
          return;
        }
        const url = URL.createObjectURL(blob);
        revokeRef.current = url;
        setSrc(url);
        setStatus("ready");
      });
      return () => {
        cancelled = true;
      };
    }

    setSrc(remote || null);
    setStatus(remote ? "ready" : "idle");
    return undefined;
  }, [node]);

  useEffect(
    () => () => {
      if (revokeRef.current) {
        URL.revokeObjectURL(revokeRef.current);
        revokeRef.current = null;
      }
    },
    [],
  );

  return { src, status };
}
