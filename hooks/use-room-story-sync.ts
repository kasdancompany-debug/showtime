"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  applyingRemoteStorySnapshot,
  emitStoryRoomSnapshot,
  roomSnapshotSignature,
  runWithRemoteStorySnapshot,
  type RoomSnapshotSource,
} from "@/lib/realtime/story-room-snapshot";
import { subscribeEventSync } from "@/lib/realtime/event-sync";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMockEventStore } from "@/lib/store/mock-event-store";

function safeWarn(scope: string, err: unknown): void {
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(`[showtime] ${scope}: ${detail}`);
}

function pickSnapshotFields(s: ReturnType<typeof useMockEventStore.getState>): RoomSnapshotSource {
  return {
    eventId: s.eventId,
    engine: s.engine,
    graph: s.graph,
    playback: s.playback,
    playbackSyncEpoch: s.playbackSyncEpoch,
    eventStarted: s.eventStarted,
    showEnded: s.showEnded,
    eventTitle: s.eventTitle,
    activeSavedFilmId: s.activeSavedFilmId,
    mediaGeneration: s.mediaGeneration,
    processedRemoteVoteIds: s.processedRemoteVoteIds,
    projectionSurfaceFault: s.projectionSurfaceFault,
    dryRunMode: s.dryRunMode,
    allowAnonymousQuickJoin: s.allowAnonymousQuickJoin,
    countdownPresetSec: s.countdownPresetSec,
    pollDurationSec: s.pollDurationSec,
    reportSegments: s.reportSegments,
    audienceConnected: s.audienceConnected,
  };
}

/** Apply full-room snapshots from BroadcastChannel / Supabase (projector + spare operator tabs). */
export function useRoomStoryInboundSync() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const eventId = useMockEventStore((s) => s.eventId);
  const applyRemoteStoryRoomSnapshot = useMockEventStore((s) => s.applyRemoteStoryRoomSnapshot);

  useEffect(() => {
    return subscribeEventSync(client, eventId, (p) => {
      if (p.type !== "story_room_snapshot") return;
      if (p.version !== 1) return;
      try {
        runWithRemoteStorySnapshot(() => {
          applyRemoteStoryRoomSnapshot(p);
        });
      } catch (e) {
        safeWarn("useRoomStoryInboundSync", e);
      }
    });
  }, [client, eventId, applyRemoteStoryRoomSnapshot]);
}

/**
 * Leader tab: push room snapshots when meaningful store fields change (mounted only from /host).
 */
export function useRoomStoryLeaderSync() {
  const eventId = useMockEventStore((s) => s.eventId);
  const prevSigRef = useRef<string | null>(null);

  useEffect(() => {
    prevSigRef.current = roomSnapshotSignature(pickSnapshotFields(useMockEventStore.getState()));
  }, [eventId]);

  useEffect(() => {
    return useMockEventStore.subscribe((state) => {
      if (applyingRemoteStorySnapshot) return;
      try {
        const picked = pickSnapshotFields(state);
        const sig = roomSnapshotSignature(picked);
        if (sig === prevSigRef.current) return;
        prevSigRef.current = sig;
        emitStoryRoomSnapshot(picked);
      } catch (e) {
        safeWarn("useRoomStoryLeaderSync", e);
      }
    });
  }, []);
}
