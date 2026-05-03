"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { broadcastEventSync } from "./event-sync";
import type { StoryRoomSnapshotPayload } from "./payloads";

/** Suppress hot-loop emits while applying a remote snapshot (screen / second operator tab). */
export let applyingRemoteStorySnapshot = false;

export type RoomSnapshotSource = {
  eventId: string;
  engine: StoryRoomSnapshotPayload["engine"];
  graph: StoryRoomSnapshotPayload["engine"]["graph"];
  playback: StoryRoomSnapshotPayload["playback"];
  playbackSyncEpoch: number;
  eventStarted: boolean;
  showEnded: boolean;
  eventTitle: string;
  activeSavedFilmId: string | null;
  mediaGeneration: number;
  processedRemoteVoteIds: string[];
  projectionSurfaceFault: string | null;
  dryRunMode: boolean;
  allowAnonymousQuickJoin: boolean;
  countdownPresetSec: number;
  pollDurationSec: number;
  reportSegments: StoryRoomSnapshotPayload["reportSegments"];
  audienceConnected: number;
};

function safeWarn(scope: string, err: unknown): void {
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(`[showtime] ${scope}: ${detail}`);
}

function cloneForWire<T>(v: T): T {
  try {
    if (typeof structuredClone === "function") return structuredClone(v);
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(JSON.stringify(v)) as T;
  } catch (e) {
    safeWarn("cloneForWire", e);
    return v;
  }
}

export function buildStoryRoomSnapshotPayload(state: RoomSnapshotSource): StoryRoomSnapshotPayload {
  return {
    type: "story_room_snapshot",
    version: 1,
    engine: cloneForWire(state.engine),
    playback: { ...state.playback },
    playbackSyncEpoch: state.playbackSyncEpoch,
    eventStarted: state.eventStarted,
    showEnded: state.showEnded,
    eventTitle: state.eventTitle,
    activeSavedFilmId: state.activeSavedFilmId,
    mediaGeneration: state.mediaGeneration,
    processedRemoteVoteIds: [...state.processedRemoteVoteIds],
    projectionSurfaceFault: state.projectionSurfaceFault,
    dryRunMode: state.dryRunMode,
    allowAnonymousQuickJoin: state.allowAnonymousQuickJoin,
    countdownPresetSec: state.countdownPresetSec,
    pollDurationSec: state.pollDurationSec,
    reportSegments: cloneForWire(state.reportSegments),
    audienceConnected: state.audienceConnected,
  };
}

/** Stable signature for leader-tab emit debouncing (omit noisy playback position). */
export function roomSnapshotSignature(state: RoomSnapshotSource): string {
  try {
    return JSON.stringify({
      engine: state.engine,
      graph: state.graph,
      mediaGeneration: state.mediaGeneration,
      playbackSyncEpoch: state.playbackSyncEpoch,
      playback: {
        isPlaying: state.playback.isPlaying,
        durationSec: state.playback.durationSec,
      },
      eventStarted: state.eventStarted,
      showEnded: state.showEnded,
      eventTitle: state.eventTitle,
      activeSavedFilmId: state.activeSavedFilmId,
      processedRemoteVoteIds: state.processedRemoteVoteIds,
      projectionSurfaceFault: state.projectionSurfaceFault,
      dryRunMode: state.dryRunMode,
      allowAnonymousQuickJoin: state.allowAnonymousQuickJoin,
      countdownPresetSec: state.countdownPresetSec,
      pollDurationSec: state.pollDurationSec,
      reportSegments: state.reportSegments,
      audienceConnected: state.audienceConnected,
    });
  } catch (e) {
    safeWarn("roomSnapshotSignature", e);
    return `${Date.now()}`;
  }
}

export function emitStoryRoomSnapshot(state: RoomSnapshotSource): void {
  try {
    const client = createSupabaseBrowserClient();
    const payload = buildStoryRoomSnapshotPayload(state);
    void broadcastEventSync(client, state.eventId, payload);
  } catch (e) {
    safeWarn("emitStoryRoomSnapshot", e);
  }
}

/**
 * Emit after store mutations when no operator “leader” subscription is mounted (e.g. Story builder tab).
 */
export function scheduleRoomSnapshotEmit(): void {
  if (typeof window === "undefined") return;
  queueMicrotask(() => {
    void import("@/lib/store/mock-event-store")
      .then(({ useMockEventStore }) => {
        try {
          emitStoryRoomSnapshot(useMockEventStore.getState());
        } catch (e) {
          safeWarn("scheduleRoomSnapshotEmit.emit", e);
        }
      })
      .catch((e) => safeWarn("scheduleRoomSnapshotEmit.import", e));
  });
}

export function runWithRemoteStorySnapshot<T>(fn: () => T): T {
  applyingRemoteStorySnapshot = true;
  try {
    return fn();
  } finally {
    queueMicrotask(() => {
      applyingRemoteStorySnapshot = false;
    });
  }
}
