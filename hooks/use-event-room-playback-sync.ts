"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { broadcastEventSync, subscribeEventSync } from "@/lib/realtime/event-sync";
import type { PlaybackCommand } from "@/lib/realtime/payloads";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMockEventStore } from "@/lib/store/mock-event-store";

/**
 * Host: receives playback telemetry from /screen to update program clock.
 * Screen: receives transport commands (play / pause / restart / seek) from host.
 */
export function useEventRoomPlaybackSync(role: "host" | "screen") {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const eventId = useMockEventStore((s) => s.eventId);
  const currentNodeId = useMockEventStore((s) => s.currentNodeId);

  const playSegment = useMockEventStore((s) => s.playSegment);
  const pauseSegment = useMockEventStore((s) => s.pauseSegment);
  const restartSegment = useMockEventStore((s) => s.restartSegment);
  const seekRelative = useMockEventStore((s) => s.seekRelative);
  const applyRemotePlayback = useMockEventStore((s) => s.applyRemotePlayback);

  const nodeRef = useRef(currentNodeId);
  nodeRef.current = currentNodeId;

  useEffect(() => {
    return subscribeEventSync(client, eventId, (payload) => {
      if (payload.type === "playback_command") {
        if (role !== "screen") return;
        switch (payload.command) {
          case "play":
            playSegment();
            break;
          case "pause":
            pauseSegment();
            break;
          case "restart":
            restartSegment();
            break;
          case "seek":
            seekRelative(payload.offsetSec ?? 0);
            break;
          default:
            break;
        }
        return;
      }

      if (payload.type === "playback") {
        if (role !== "host") return;
        if (payload.nodeId !== nodeRef.current) return;
        applyRemotePlayback({
          isPlaying: payload.isPlaying,
          positionSec: payload.positionSec,
          durationSec: payload.durationSec !== undefined ? payload.durationSec : undefined,
        });
        return;
      }

      if (payload.type === "playback_resync") {
        if (role !== "screen") return;
        if (payload.nodeId !== nodeRef.current) return;
        applyRemotePlayback({
          positionSec: payload.positionSec,
          isPlaying: payload.isPlaying,
          durationSec: payload.durationSec !== undefined ? payload.durationSec : undefined,
        });
      }
    });
  }, [
    client,
    eventId,
    role,
    playSegment,
    pauseSegment,
    restartSegment,
    seekRelative,
    applyRemotePlayback,
  ]);

  const sendPlaybackTelemetry = useCallback(
    (opts: { positionSec: number; isPlaying: boolean; durationSec?: number | null }) => {
      void broadcastEventSync(client, eventId, {
        type: "playback",
        nodeId: nodeRef.current,
        positionSec: opts.positionSec,
        isPlaying: opts.isPlaying,
        durationSec: opts.durationSec,
      });
    },
    [client, eventId],
  );

  const sendPlaybackCommand = useCallback(
    (command: PlaybackCommand, offsetSec?: number) => {
      void broadcastEventSync(client, eventId, { type: "playback_command", command, offsetSec });
    },
    [client, eventId],
  );

  const sendPlaybackResync = useCallback(() => {
    const st = useMockEventStore.getState();
    void broadcastEventSync(client, eventId, {
      type: "playback_resync",
      nodeId: st.currentNodeId,
      positionSec: st.playback.positionSec,
      isPlaying: st.playback.isPlaying,
      durationSec: st.playback.durationSec,
    });
  }, [client, eventId]);

  return { client, eventId, sendPlaybackTelemetry, sendPlaybackCommand, sendPlaybackResync };
}
