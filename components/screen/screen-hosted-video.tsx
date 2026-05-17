"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

import { StudioBadge } from "@/components/kasdan";
import { broadcastEventSync } from "@/lib/realtime/event-sync";
import type { PlaybackCmd } from "@/lib/supabase/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProjectorArmed, markProjectorArmed } from "@/lib/showtime/projector-arm";
import { cn } from "@/lib/utils";

const FIT_LS_KEY = "kasdan.screen.videoObjectFit";
const LOAD_STALL_MS = 45_000;

/** Browsers usually block audio until there is a user gesture on this tab — we try unmuted first, then fall back. */
function tryEnterBrowserFullscreen(): void {
  if (typeof document === "undefined") return;
  try {
    if (document.fullscreenElement) return;
    const root = document.documentElement;
    const req = root.requestFullscreen?.bind(root) ?? (root as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.bind(root);
    if (req) void req.call(root).catch(() => {});
  } catch {
    /* policy / denied */
  }
}

type ScreenRoomStatus = "ready" | "playing" | "paused";

type ScreenVideoFaultKind = "none" | "load_failed" | "autoplay_blocked" | "network" | "stall_timeout";

type Props = {
  eventId: string;
  /** Supabase `story_nodes.id` — changing this clears the element so the previous reel never lingers. */
  mediaInstanceId: string;
  src: string;
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
  if (typeof window === "undefined") return "contain";
  try {
    const v = window.localStorage.getItem(FIT_LS_KEY);
    if (v === "cover") return "cover";
  } catch {
    /* ignore */
  }
  return "contain";
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

type PlayAttempt = "unmuted" | "muted" | "blocked";

/** Prefer sound when the projector tab was armed (one tap per session). Otherwise start muted so the reel still rolls. */
async function attemptProjectorPlayback(el: HTMLVideoElement, preferSound: boolean): Promise<PlayAttempt> {
  const tryUnmuted = async (): Promise<boolean> => {
    el.muted = false;
    try {
      await el.play();
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") return false;
      throw e;
    }
  };
  const tryMuted = async (): Promise<boolean> => {
    el.muted = true;
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
  /** Prefer unmuted for projector room; may be forced true if the browser blocks unmuted play(). */
  const [muted, setMuted] = useState(false);
  const [showUnmute, setShowUnmute] = useState(true);
  const [objectFit, setObjectFit] = useState<"contain" | "cover">("contain");
  const [faultKind, setFaultKind] = useState<ScreenVideoFaultKind>("none");
  const [faultCopy, setFaultCopy] = useState<{ headline: string; hint: string } | null>(null);
  const [needsSoundTap, setNeedsSoundTap] = useState(false);
  const lastAppliedCommandId = useRef<string | null>(null);
  const loadTimerRef = useRef<number | undefined>(undefined);

  /** New `<video>` / src = new reel; must re-apply the current command (play was often applied to the old element). */
  useEffect(() => {
    lastAppliedCommandId.current = null;
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

  /** One tap on the projector picture — arms this tab for sound on later operator cues. */
  const recoverPlaybackFromUserGesture = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    markProjectorArmed();
    el.muted = false;
    setMuted(false);
    setShowUnmute(false);
    setNeedsSoundTap(false);
    tryEnterBrowserFullscreen();
    void el.play().catch(() => {
      setFaultKind("autoplay_blocked");
      setFaultCopy({
        headline: "Still blocked",
        hint: "Tap the picture again, or use F11 for fullscreen.",
      });
    });
    clearFault();
  }, [clearFault]);

  useEffect(() => {
    const armed = isProjectorArmed();
    setMuted(!armed);
    setShowUnmute(!armed);
    setNeedsSoundTap(false);
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
    el.addEventListener("loadeddata", onReadyEnough);
    el.addEventListener("canplay", onReadyEnough);
    el.addEventListener("playing", disarmLoadTimeout);
    return () => {
      el.removeEventListener("loadeddata", onReadyEnough);
      el.removeEventListener("canplay", onReadyEnough);
      el.removeEventListener("playing", disarmLoadTimeout);
    };
  }, [src, mediaInstanceId, disarmLoadTimeout]);

  useEffect(() => {
    disarmLoadTimeout();
    armLoadTimeout();
    return () => disarmLoadTimeout();
  }, [src, mediaInstanceId, armLoadTimeout, disarmLoadTimeout]);

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
          if (playbackCommand === "restart") el.currentTime = 0;
          else if (startPositionSeconds > 0) el.currentTime = startPositionSeconds;

          const preferSound = isProjectorArmed();
          const result = await attemptProjectorPlayback(el, preferSound);

          if (result === "unmuted") {
            setMuted(false);
            setShowUnmute(false);
            setNeedsSoundTap(false);
            clearFault();
            if (preferSound) tryEnterBrowserFullscreen();
            return true;
          }
          if (result === "muted") {
            setMuted(true);
            setShowUnmute(true);
            setNeedsSoundTap(true);
            clearFault();
            return true;
          }
          setFaultKind("autoplay_blocked");
          setFaultCopy({
            headline: "Browser blocked playback",
            hint: "Tap anywhere on the picture once to start the reel (browser policy).",
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
  }, [playbackCommand, playbackCommandId, startPositionSeconds, roomStatus, mediaInstanceId, src, reportFault, clearFault]);

  useEffect(() => {
    return () => {
      ref.current?.pause(); // eslint-disable-line react-hooks/exhaustive-deps
      disarmLoadTimeout();
    };
  }, [disarmLoadTimeout]);

  const toggleFit = useCallback(() => {
    setObjectFit((prev) => {
      const next = prev === "contain" ? "cover" : "contain";
      try {
        window.localStorage.setItem(FIT_LS_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const showPlaybackChrome = roomStatus === "playing" || roomStatus === "paused";
  const showFaultOverlay = faultKind !== "none" && faultCopy;

  return (
    <div className={cn("relative isolate min-h-0 w-full flex-1 bg-black", className, showFaultOverlay && "z-50")}>
      {/* Remount only per beat; keying on `src` remounts mid-play() when the URL settles and triggers a spurious “media removed” error. */}
      <video
        ref={ref}
        key={mediaInstanceId}
        className={cn(
          "absolute inset-0 h-full w-full bg-black transition-opacity duration-200",
          objectFit === "cover" ? "object-cover" : "object-contain",
          visuallyObscured ? "opacity-0" : "opacity-100",
        )}
        src={src}
        playsInline
        muted={muted}
        autoPlay={false}
        controls={false}
        preload="metadata"
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
              hint: "Check the reel URL in Show builder and that this screen can reach the file.",
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

      {needsSoundTap && !showFaultOverlay && !visuallyObscured ? (
        <button
          type="button"
          className="absolute inset-0 z-[45] flex cursor-pointer flex-col items-center justify-end bg-gradient-to-t from-black/75 via-black/20 to-transparent pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-24"
          onClick={recoverPlaybackFromUserGesture}
          aria-label="Tap for sound and fullscreen"
        >
          <p className="max-w-lg px-6 text-center font-sans text-[clamp(0.95rem,2.2vw,1.2rem)] font-medium text-white/90">
            Tap anywhere for sound & fullscreen
          </p>
          <p className="mt-2 px-6 text-center font-sans text-[clamp(0.75rem,1.6vw,0.9rem)] text-white/55">
            Once per show — later reels start with sound from the operator desk.
          </p>
        </button>
      ) : null}

      {showFaultOverlay ? (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-6 text-center">
          <p className="text-[clamp(1.25rem,4vw,2rem)] font-semibold leading-snug text-red-200/95">{faultCopy.headline}</p>
          <p className="max-w-lg text-[clamp(0.95rem,2.2vw,1.15rem)] text-neutral-400">{faultCopy.hint}</p>
          {faultKind === "autoplay_blocked" ? (
            <button
              type="button"
              className="rounded-full bg-white/15 px-6 py-3 text-base font-medium text-white ring-1 ring-white/35 backdrop-blur-sm hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
              onClick={recoverPlaybackFromUserGesture}
            >
              Tap to start
            </button>
          ) : null}
          {faultKind !== "autoplay_blocked" ? (
            <div className="max-w-[min(100%,52rem)] space-y-2 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Tried to open</p>
              <p className="break-all font-mono text-[clamp(0.75rem,1.8vw,0.95rem)] text-neutral-300">{src}</p>
              {operatorVideoRef.trim() && operatorVideoRef.trim() !== src ? (
                <>
                  <p className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Story beat source</p>
                  <p className="break-all font-mono text-[clamp(0.75rem,1.8vw,0.95rem)] text-neutral-400">{operatorVideoRef.trim()}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showPlaybackChrome && !showFaultOverlay && !visuallyObscured ? (
        <div
          className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-between p-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
          aria-hidden={false}
        >
          <div className="flex w-full items-start justify-between gap-2">
            <StudioBadge className="pointer-events-auto scale-[0.72] origin-top-left shadow-sm shadow-black/40" />
            <div className="flex shrink-0 items-start gap-2">
              <button
                type="button"
                title={objectFit === "contain" ? "Reel fills the frame (cover)" : "Letterbox reel (contain)"}
                onClick={toggleFit}
                className="pointer-events-auto rounded-md border border-white/20 bg-black/55 p-2 text-white/90 backdrop-blur-sm hover:bg-black/70"
              >
                {objectFit === "contain" ? (
                  <Maximize2 className="size-4" aria-hidden />
                ) : (
                  <Minimize2 className="size-4" aria-hidden />
                )}
              </button>
            </div>
          </div>
          {showUnmute && muted && !needsSoundTap ? (
            <div className="flex justify-center">
              <button
                type="button"
                className="pointer-events-auto rounded-full bg-black/70 px-5 py-2.5 text-sm font-medium text-white/95 ring-1 ring-white/25 backdrop-blur-sm"
                onClick={recoverPlaybackFromUserGesture}
              >
                Sound & fullscreen
              </button>
            </div>
          ) : (
            <div />
          )}
        </div>
      ) : null}
    </div>
  );
}
