"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { broadcastEventSync } from "@/lib/realtime/event-sync";
import type { PlaybackCmd } from "@/lib/supabase/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProjectorArmed } from "@/lib/showtime/projector-arm";
import {
  applyProjectorElementAudio,
  shouldPreferProjectorSound,
} from "@/lib/showtime/projector-playback";
import { cn } from "@/lib/utils";

const FIT_LS_KEY = "kasdan.screen.videoObjectFit";
const LOAD_STALL_MS = 45_000;

type ScreenRoomStatus = "ready" | "playing" | "paused";

type ScreenVideoFaultKind = "none" | "load_failed" | "autoplay_blocked" | "network" | "stall_timeout";

type Props = {
  eventId: string;
  /** Supabase `story_nodes.id` — new beat swaps `src` on the same element (no remount flash). */
  mediaInstanceId: string;
  src: string;
  /** Warm candidate reels (both A/B branches while voting, the winner once revealed) so branch advance starts without a stall. */
  prefetchSrcs?: string[];
  /** Operator-entered URL/path from the story beat (shown on load errors when useful). */
  operatorVideoRef?: string;
  /** Room status for this surface — `load` runs in `ready` too (cue without autoplay). */
  roomStatus: ScreenRoomStatus;
  playbackCommand: PlaybackCmd;
  playbackCommandId: string;
  startPositionSeconds: number;
  /** When true, video is still loading commands but covered by another layer (e.g. ready slate). */
  visuallyObscured?: boolean;
  className?: string;
  onEnded: () => void | Promise<void>;
};

function readFitPref(): "contain" | "cover" {
  if (typeof window === "undefined") return "cover";
  try {
    const v = window.localStorage.getItem(FIT_LS_KEY);
    if (v === "contain") return "contain";
  } catch {
    /* ignore */
  }
  return "cover";
}

function mapMediaErrorMessage(el: HTMLVideoElement): { headline: string; hint: string; kind: ScreenVideoFaultKind } {
  const code = el.error?.code;
  if (code === MediaError.MEDIA_ERR_NETWORK) {
    return {
      kind: "network",
      headline: "Video failed to load",
      hint: "The screen lost contact with the video host or the transfer stalled. Check connectivity and the file URL.",
    };
  }
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return {
      kind: "load_failed",
      headline: "Video failed to load",
      hint: "The file may be missing, blocked by CORS, or not a format this browser can play. Use .mp4 or .webm.",
    };
  }
  if (code === MediaError.MEDIA_ERR_DECODE) {
    return {
      kind: "load_failed",
      headline: "Video failed to load",
      hint: "The browser could not decode this file. Re-encode the reel or try a different export.",
    };
  }
  if (code === MediaError.MEDIA_ERR_ABORTED) {
    return {
      kind: "load_failed",
      headline: "Video failed to load",
      hint: "Loading was interrupted before the file finished.",
    };
  }
  return {
    kind: "load_failed",
    headline: "Video failed to load",
    hint: "Check the reel URL in Show builder and that this screen can reach the file.",
  };
}

function isBenignPlayInterrupt(e: unknown): boolean {
  if (e instanceof DOMException) {
    if (e.name === "AbortError") return true;
    const m = e.message ?? "";
    if (/play\(\) request was interrupted/i.test(m)) return true;
    if (/media was removed from the document/i.test(m)) return true;
  }
  if (e instanceof Error) {
    const m = e.message ?? "";
    if (/play\(\) request was interrupted/i.test(m)) return true;
    if (/media was removed from the document/i.test(m)) return true;
  }
  return false;
}

const REEL_REVEAL_MS = 280;
const CANPLAY_BEFORE_PLAY_MS = 20_000;

function waitUntilCanPlay(el: HTMLVideoElement, timeoutMs = CANPLAY_BEFORE_PLAY_MS): Promise<void> {
  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for video to buffer"));
    }, timeoutMs);
    const cleanup = () => {
      el.removeEventListener("canplay", onReady);
      el.removeEventListener("loadeddata", onReady);
      window.clearTimeout(timer);
    };
    el.addEventListener("canplay", onReady, { once: true });
    el.addEventListener("loadeddata", onReady, { once: true });
  });
}

type PlayAttempt = "unmuted" | "muted" | "blocked";

/** Prefer sound after fullscreen was used once; otherwise start muted so the reel still rolls (no on-screen prompt). */
async function attemptProjectorPlayback(el: HTMLVideoElement, preferSound: boolean): Promise<PlayAttempt> {
  const tryUnmuted = async (): Promise<boolean> => {
    applyProjectorElementAudio(el, true);
    try {
      await el.play();
      return el.muted === false;
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return false;
      throw e;
    }
  };
  const tryMuted = async (): Promise<boolean> => {
    applyProjectorElementAudio(el, false);
    try {
      await el.play();
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return false;
      throw e;
    }
  };

  if (preferSound) {
    if (await tryUnmuted()) return "unmuted";
    if (await tryMuted()) return "muted";
    return "blocked";
  }
  if (await tryMuted()) return "muted";
  if (await tryUnmuted()) return "unmuted";
  return "blocked";
}

/**
 * Full-viewport HTML5 player: Supabase `playback_command` + `playback_command_id` only advance
 * `lastApplied` after a command actually runs, so a later `playing` + `play` update still applies.
 * Playback starts only after an explicit `play` command (host gesture on the desk), not on branch advance.
 */
export function ScreenHostedVideo({
  eventId,
  mediaInstanceId,
  src,
  prefetchSrcs = [],
  operatorVideoRef = "",
  roomStatus,
  playbackCommand,
  playbackCommandId,
  startPositionSeconds,
  visuallyObscured = false,
  className,
  onEnded,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const [objectFit, setObjectFit] = useState<"contain" | "cover">("cover");
  const [faultKind, setFaultKind] = useState<ScreenVideoFaultKind>("none");
  const [faultCopy, setFaultCopy] = useState<{ headline: string; hint: string } | null>(null);
  const [reelRevealed, setReelRevealed] = useState(false);
  const lastAppliedCommandId = useRef<string | null>(null);
  const loadTimerRef = useRef<number | undefined>(undefined);

  /** New beat / src: re-apply playback command and hide until the new reel is actually playing. */
  useEffect(() => {
    lastAppliedCommandId.current = null;
    setReelRevealed(false);
    ref.current?.pause();
  }, [mediaInstanceId, src]);

  useEffect(() => {
    setObjectFit(readFitPref());
  }, []);

  const reportFault = useCallback(
    (message: string) => {
      void broadcastEventSync(client, eventId, {
        type: "projection_alert",
        kind: "video_error",
        message,
      });
    },
    [client, eventId],
  );

  const clearFault = useCallback(() => {
    setFaultKind("none");
    setFaultCopy(null);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el && isProjectorArmed()) applyProjectorElementAudio(el, true);
    clearFault();
  }, [src, mediaInstanceId, clearFault]);

  const armLoadTimeout = useCallback(() => {
    if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current);
    const el = ref.current;
    if (!el) return;
    loadTimerRef.current = window.setTimeout(() => {
      const v = ref.current;
      if (!v || v !== el) return;
      if (v.error) return;
      if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
      setFaultKind("stall_timeout");
      setFaultCopy({
        headline: "Video failed to load",
        hint: "Loading took too long (timeout). The file may be very large, the network is slow, or the server is not responding. Check the URL and CDN.",
      });
      reportFault("Video load timeout (stalled)");
    }, LOAD_STALL_MS);
  }, [reportFault]);

  const disarmLoadTimeout = useCallback(() => {
    if (loadTimerRef.current) {
      window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onReadyEnough = () => {
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) disarmLoadTimeout();
    };
    const onPlaying = () => {
      disarmLoadTimeout();
      if (isProjectorArmed() && el.muted) {
        applyProjectorElementAudio(el, true);
      }
    };
    el.addEventListener("loadeddata", onReadyEnough);
    el.addEventListener("canplay", onReadyEnough);
    el.addEventListener("playing", onPlaying);
    return () => {
      el.removeEventListener("loadeddata", onReadyEnough);
      el.removeEventListener("canplay", onReadyEnough);
      el.removeEventListener("playing", onPlaying);
    };
  }, [src, mediaInstanceId, disarmLoadTimeout]);

  useEffect(() => {
    disarmLoadTimeout();
    armLoadTimeout();
    return () => disarmLoadTimeout();
  }, [src, mediaInstanceId, armLoadTimeout, disarmLoadTimeout]);

  /** Buffer behind title slates so lifting to `playing` does not flash black. */
  useEffect(() => {
    const el = ref.current;
    if (!el || !visuallyObscured) return;
    const markReady = () => setReelRevealed(true);
    el.addEventListener("canplay", markReady, { once: true });
    el.addEventListener("loadeddata", markReady, { once: true });
    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) markReady();
    return () => {
      el.removeEventListener("canplay", markReady);
      el.removeEventListener("loadeddata", markReady);
    };
  }, [visuallyObscured, src, mediaInstanceId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (lastAppliedCommandId.current === playbackCommandId) return;

    let cancelled = false;

    const run = async (): Promise<boolean> => {
      switch (playbackCommand) {
        case "load": {
          if (!["ready", "playing", "paused"].includes(roomStatus)) return false;
          el.pause();
          const pos = startPositionSeconds;
          let seekApplied = false;
          const applySeek = () => {
            if (seekApplied) return;
            seekApplied = true;
            try {
              el.currentTime = pos;
            } catch {
              /* ignore */
            }
          };
          el.addEventListener("loadedmetadata", applySeek, { once: true });
          el.load();
          if (el.readyState >= HTMLMediaElement.HAVE_METADATA) applySeek();
          return true;
        }
        case "pause": {
          if (!["playing", "paused"].includes(roomStatus)) return false;
          el.pause();
          return true;
        }
        case "play":
        case "restart": {
          if (roomStatus !== "playing") return false;
          if (!reelRevealed) {
            try {
              await waitUntilCanPlay(el, CANPLAY_BEFORE_PLAY_MS);
            } catch {
              /* still attempt play — may be a slow edge network */
            }
          }
          if (playbackCommand === "restart") el.currentTime = 0;
          else if (startPositionSeconds > 0) el.currentTime = startPositionSeconds;

          const preferSound = shouldPreferProjectorSound();
          const result = await attemptProjectorPlayback(el, preferSound);

          if (result === "unmuted") {
            applyProjectorElementAudio(el, true);
            clearFault();
            setReelRevealed(true);
            return true;
          }
          if (result === "muted") {
            applyProjectorElementAudio(el, false);
            if (preferSound && !el.paused) {
              applyProjectorElementAudio(el, true);
            }
            clearFault();
            setReelRevealed(true);
            return true;
          }
          setFaultKind("autoplay_blocked");
          setFaultCopy({
            headline: "Browser blocked playback",
            hint: "Tap Fullscreen (bottom-right) once — the picture will play.",
          });
          reportFault("Autoplay / play() blocked (NotAllowedError)");
          return true;
        }
        default:
          return false;
      }
    };

    void (async () => {
      try {
        const ok = await run();
        if (cancelled || ref.current !== el) return;
        if (ok) lastAppliedCommandId.current = playbackCommandId;
      } catch (e) {
        if (cancelled || ref.current !== el) return;
        if (isBenignPlayInterrupt(e)) return;
        reportFault(e instanceof Error ? e.message : "play() failed");
        setFaultKind("load_failed");
        setFaultCopy({
          headline: "Video failed to load",
          hint: e instanceof Error ? e.message : "play() failed",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    playbackCommand,
    playbackCommandId,
    startPositionSeconds,
    roomStatus,
    mediaInstanceId,
    src,
    reelRevealed,
    reportFault,
    clearFault,
  ]);

  useEffect(() => {
    return () => {
      ref.current?.pause(); // eslint-disable-line react-hooks/exhaustive-deps
      disarmLoadTimeout();
    };
  }, [disarmLoadTimeout]);

  /**
   * `visuallyObscured` means a title slate is covering this element on purpose (pre-show,
   * between beats) — a load/decode failure underneath it is an operator concern (already
   * broadcast via reportFault to /host), not something the audience should see dumped on the
   * projector. Only surface the overlay once the video is actually meant to be visible.
   */
  const showFaultOverlay = faultKind !== "none" && faultCopy && !visuallyObscured;
  const showReelPicture = !visuallyObscured && reelRevealed;

  return (
    <div className={cn("relative isolate min-h-0 w-full flex-1 bg-black", className, showFaultOverlay && "z-50")}>
      {prefetchSrcs
        .filter((s) => s && s !== src)
        .map((s) => (
          <video
            key={s}
            aria-hidden
            className="pointer-events-none absolute size-0 overflow-hidden opacity-0"
            src={s}
            playsInline
            muted
            preload="auto"
          />
        ))}
      <video
        ref={ref}
        data-projector-video
        className={cn(
          "absolute inset-0 h-full w-full bg-black transition-opacity ease-out",
          objectFit === "cover" ? "object-cover" : "object-contain",
          showReelPicture ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: `${REEL_REVEAL_MS}ms` }}
        src={src}
        playsInline
        autoPlay={false}
        controls={false}
        preload="auto"
        onEnded={() => {
          void onEnded();
        }}
        onError={() => {
          disarmLoadTimeout();
          const el = ref.current;
          if (!el?.error) {
            setFaultKind("load_failed");
            setFaultCopy({
              headline: "Video failed to load",
              hint: "This reel could not be reached from the big screen. It may still be loading.",
            });
            reportFault("Video element error (unknown code)");
            return;
          }
          const mapped = mapMediaErrorMessage(el);
          setFaultKind(mapped.kind === "network" ? "network" : "load_failed");
          setFaultCopy({ headline: mapped.headline, hint: mapped.hint });
          reportFault(`Video element error: ${mapped.headline}`);
        }}
      />

      {showFaultOverlay ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
          <p className="text-[clamp(1.25rem,4vw,2rem)] font-semibold leading-snug text-red-200/95">{faultCopy.headline}</p>
          <p className="max-w-lg text-[clamp(0.95rem,2.2vw,1.15rem)] text-neutral-400">{faultCopy.hint}</p>
          {faultKind !== "autoplay_blocked" ? (
            <div className="max-w-[min(100%,52rem)] space-y-2 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Tried to open</p>
              <p className="break-all font-mono text-[clamp(0.75rem,1.8vw,0.95rem)] text-neutral-300">{src}</p>
              {operatorVideoRef.trim() && operatorVideoRef.trim() !== src ? (
                <>
                  <p className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Cue</p>
                  <p className="break-all font-mono text-[clamp(0.75rem,1.8vw,0.95rem)] text-neutral-400">{operatorVideoRef.trim()}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}
