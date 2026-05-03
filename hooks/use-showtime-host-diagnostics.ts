"use client";

import { useCallback, useMemo, useState } from "react";

import { useJoinBaseUrl } from "@/hooks/use-join-base-url";
import { useEventRoomRealtimeProbe } from "@/hooks/use-event-room-realtime-probe";
import { useHostRemoteEventLookup } from "@/hooks/use-host-remote-event-lookup";
import { useScreenPresenceFromSync } from "@/hooks/use-screen-presence-from-sync";
import { getJoinUrl } from "@/lib/join/get-join-url";
import { formatJoinOriginEnvDisplay, getJoinOriginEnvRaw } from "@/lib/join/join-base-url";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { getShowtimeSyncMode } from "@/lib/showtime/sync-mode";
import { getNode } from "@/lib/story-engine/graph";
import { useMockEventStore } from "@/lib/store/mock-event-store";

export function useShowtimeHostDiagnostics() {
  const [probeRetryKey, setProbeRetryKey] = useState(0);
  const joinUrlState = useJoinBaseUrl();

  const eventCode = useMockEventStore((s) => s.eventCode);
  const eventId = useMockEventStore((s) => s.eventId);
  const audienceConnected = useMockEventStore((s) => s.audienceConnected);
  const votePhase = useMockEventStore((s) => s.votePhase);
  const enginePhase = useMockEventStore((s) => s.engine.phase);
  const currentNodeId = useMockEventStore((s) => s.currentNodeId);
  const graph = useMockEventStore((s) => s.graph);
  const eventStarted = useMockEventStore((s) => s.eventStarted);

  const syncMode = useMemo(() => getShowtimeSyncMode(), []);
  const supabaseCfg = useMemo(() => getSupabaseConfig(), []);

  const { status: realtimeStatus, supabaseConfigured: supabaseClientConfigured } = useEventRoomRealtimeProbe(
    eventId,
    probeRetryKey,
  );
  const { lastHeartbeatAt, screenLikelyConnected } = useScreenPresenceFromSync(eventId);
  const remoteLookup = useHostRemoteEventLookup(eventCode, supabaseCfg.isConfigured);

  const joinUrl =
    joinUrlState.windowOrigin && eventCode ? getJoinUrl(eventCode, joinUrlState.windowOrigin) : "";
  const nodeTitle = getNode(graph, currentNodeId)?.title ?? "—";

  const bumpRealtimeProbe = useCallback(() => setProbeRetryKey((k) => k + 1), []);

  return {
    syncMode,
    supabaseUrlPresent: Boolean(supabaseCfg.url?.trim()),
    supabaseAnonPresent: Boolean(supabaseCfg.anonKey?.trim()),
    joinOriginEnvRaw: getJoinOriginEnvRaw(),
    joinOriginEnvDisplay: formatJoinOriginEnvDisplay(),
    ...joinUrlState,
    joinUrl,
    eventCode,
    eventId,
    realtimeStatus,
    lastScreenHeartbeatAt: lastHeartbeatAt,
    screenLikelyConnected,
    audienceConnected,
    votePhase,
    enginePhase,
    currentNodeId,
    currentNodeTitle: nodeTitle,
    remoteEventLookup: remoteLookup.status,
    remoteEventError: remoteLookup.errorMessage,
    eventStarted,
    supabaseClientConfigured,
    bumpRealtimeProbe,
  };
}
