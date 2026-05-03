"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MOCK_EVENT } from "@/lib/mock-data";
import { broadcastEventSync, subscribeEventSyncWithStatus } from "@/lib/realtime/event-sync";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchAudienceMemberIdForCurrentUser,
  fetchEventByCode,
  fetchStoryNode,
  fetchVoteMajority,
  insertAudienceMember,
  insertVote,
  isUniqueViolation,
  type RemoteEventRow,
  type RemoteStoryNodeRow,
} from "@/lib/join/supabase-room";
import {
  clearJoinSession,
  loadJoinSession,
  newSessionId,
  recordVoteForNode,
  saveJoinSession,
  type JoinSessionPersist,
} from "@/lib/join/session-storage";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { selectVoteDisplayNode } from "@/lib/store/presentation";
import { getEffectiveWinner } from "@/lib/story-engine/engine";
import type { StoryNodeId, VoteChoice, VotePhase } from "@/types";

type LiveVoteSnapshot = {
  phase: VotePhase;
  endsAt: number | null;
  totals: { a: number; b: number };
  revealedWinner: VoteChoice | null;
  question: string | null;
  optionALabel: string;
  optionBLabel: string;
  voteNodeId: StoryNodeId | null;
  eventTitle: string;
  allowAnonymousQuickJoin?: boolean;
};

export type JoinScreen =
  | "landing"
  | "waiting"
  | "voting"
  | "vote_received"
  | "results";

/** Supabase Realtime transport for join (postgres channel and/or broadcast sync). */
export type JoinTransportStatus =
  | "na"
  | "idle"
  | "connecting"
  | "subscribed"
  | "channel_error"
  | "timed_out";

export function useJoinRoom(eventCodeRaw: string) {
  const code = eventCodeRaw.toUpperCase();

  const supabase = useMemo(() => (typeof window !== "undefined" ? createSupabaseBrowserClient() : null), []);

  const mockEngine = useMockEventStore((s) => s.engine);
  const mockVotePhase = useMockEventStore((s) => s.votePhase);
  const mockTitle = useMockEventStore((s) => s.eventTitle);
  const mockCast = useMockEventStore((s) => s.castAudienceVote);
  const mockRegister = useMockEventStore((s) => s.registerAudienceMember);

  const [persist, setPersist] = useState<JoinSessionPersist | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [remoteEvent, setRemoteEvent] = useState<RemoteEventRow | null>(null);
  const [remoteNode, setRemoteNode] = useState<RemoteStoryNodeRow | null>(null);
  const [remoteWinner, setRemoteWinner] = useState<VoteChoice | null>(null);
  const [remoteTie, setRemoteTie] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [joinRoomError, setJoinRoomError] = useState<string | null>(null);
  const [transportRetryNonce, setTransportRetryNonce] = useState(0);
  const [joinTransportStatus, setJoinTransportStatus] = useState<JoinTransportStatus>("na");

  const [online, setOnline] = useState(true);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [liveVote, setLiveVote] = useState<LiveVoteSnapshot | null>(null);
  const [serverVoteDuplicateHint, setServerVoteDuplicateHint] = useState<string | null>(null);

  useEffect(() => {
    setPersist(loadJoinSession(code));
    setHydrated(true);
  }, [code]);

  useEffect(() => {
    setBootstrapFailed(false);
    setFetchError(null);
    setJoinRoomError(null);
    setJoinTransportStatus(supabase ? "idle" : "na");
    setTransportRetryNonce(0);
  }, [code, supabase]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  /* ----- Supabase bootstrap ----- */
  useEffect(() => {
    if (!supabase) {
      setRemoteReady(true);
      return;
    }

    let cancelled = false;
    setRemoteReady(false);
    setRemoteEvent(null);
    setRemoteNode(null);
    setRemoteWinner(null);
    setRemoteTie(false);

    void (async () => {
      try {
        const ev = await fetchEventByCode(supabase, code);
        if (cancelled) return;
        setBootstrapFailed(false);
        setFetchError(null);
        if (!ev) {
          setRemoteEvent(null);
          setRemoteReady(true);
          return;
        }
        setRemoteEvent(ev);
        if (ev.active_vote_id) {
          const node = await fetchStoryNode(supabase, ev.active_vote_id);
          if (!cancelled) setRemoteNode(node);
        }
        if (ev.status === "revealing" && ev.active_vote_id) {
          const maj = await fetchVoteMajority(supabase, ev.id, ev.active_vote_id);
          if (!cancelled) {
            setRemoteWinner(maj.winner);
            setRemoteTie(maj.tie);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setBootstrapFailed(true);
          setFetchError(e instanceof Error ? e.message : "Could not load event");
          setRemoteEvent(null);
        }
      } finally {
        if (!cancelled) setRemoteReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, code]);

  const eventId = remoteEvent?.id;

  /* ----- Postgres realtime: remote events ----- */
  useEffect(() => {
    if (!supabase || !eventId) return;

    setJoinTransportStatus("connecting");
    const channel = supabase
      .channel(`join-room-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `id=eq.${eventId}` },
        async (payload) => {
          const row = payload.new as RemoteEventRow;
          setRemoteEvent(row);
          try {
            if (row.active_vote_id) {
              const node = await fetchStoryNode(supabase, row.active_vote_id);
              setRemoteNode(node);
            } else {
              setRemoteNode(null);
            }
            if (row.status === "revealing" && row.active_vote_id) {
              const maj = await fetchVoteMajority(supabase, row.id, row.active_vote_id);
              setRemoteWinner(maj.winner);
              setRemoteTie(maj.tie);
            } else {
              setRemoteWinner(null);
              setRemoteTie(false);
            }
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setJoinTransportStatus("subscribed");
        else if (status === "CHANNEL_ERROR") setJoinTransportStatus("channel_error");
        else if (status === "TIMED_OUT") setJoinTransportStatus("timed_out");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, eventId, transportRetryNonce]);

  const isHybridMock = Boolean(
    supabase && remoteReady && !remoteEvent && code === MOCK_EVENT.eventCode,
  );

  const syncEventId = remoteEvent?.id ?? (code === MOCK_EVENT.eventCode ? MOCK_EVENT.id : "");

  /* ----- Broadcast sync: hybrid local nights ----- */
  useEffect(() => {
    if (!supabase || !syncEventId || !isHybridMock) return;

    return subscribeEventSyncWithStatus(supabase, syncEventId, (p) => {
      if (p.type !== "vote") return;
      setLiveVote({
        phase: p.phase,
        endsAt: p.endsAt,
        totals: p.totals,
        revealedWinner: p.revealedWinner,
        question: p.question ?? null,
        optionALabel: p.optionALabel ?? "Option A",
        optionBLabel: p.optionBLabel ?? "Option B",
        voteNodeId: p.voteNodeId ?? null,
        eventTitle: p.eventTitle ?? "",
        allowAnonymousQuickJoin: p.allowAnonymousQuickJoin,
      });
    }, (st) => {
      if (st === "connecting") setJoinTransportStatus("connecting");
      if (st === "subscribed") setJoinTransportStatus("subscribed");
      if (st === "channel_error") setJoinTransportStatus("channel_error");
      if (st === "timed_out") setJoinTransportStatus("timed_out");
      if (st === "idle") setJoinTransportStatus("na");
    });
  }, [supabase, syncEventId, isHybridMock, transportRetryNonce]);

  const mockVoteNode = useMemo(() => selectVoteDisplayNode(mockEngine), [mockEngine]);
  const mockWinner = mockVotePhase === "reveal" ? getEffectiveWinner(mockEngine) : null;
  const mockVoteEndsAt = useMockEventStore((s) => s.voteEndsAt);
  const pollDurationSec = useMockEventStore((s) => s.pollDurationSec);

  const activeStoryNodeId =
    isHybridMock ? liveVote?.voteNodeId ?? null
    : supabase && remoteEvent ? remoteEvent.active_vote_id ?? null
    : mockEngine.voteNodeId ?? null;

  const voteOpen =
    isHybridMock ? liveVote?.phase === "open"
    : supabase && remoteEvent ? remoteEvent.status === "voting" && Boolean(remoteEvent.active_vote_id)
    : mockVotePhase === "open";

  const isReveal =
    isHybridMock ? liveVote?.phase === "reveal"
    : supabase && remoteEvent ? remoteEvent.status === "revealing"
    : mockVotePhase === "reveal";

  const title =
    remoteEvent?.title ||
    (isHybridMock && liveVote?.eventTitle ? liveVote.eventTitle : "") ||
    mockTitle ||
    MOCK_EVENT.title;

  const question =
    isHybridMock ? liveVote?.question ?? null
    : supabase && remoteEvent ? remoteNode?.question ?? null
    : mockVoteNode?.question ?? null;

  const optionALabel =
    isHybridMock ? liveVote?.optionALabel ?? "Option A"
    : supabase && remoteEvent ? remoteNode?.option_a_label ?? "Option A"
    : mockVoteNode?.optionA?.label ?? "A";

  const optionBLabel =
    isHybridMock ? liveVote?.optionBLabel ?? "Option B"
    : supabase && remoteEvent ? remoteNode?.option_b_label ?? "Option B"
    : mockVoteNode?.optionB?.label ?? "B";

  const allowAnonymousQuickJoin = Boolean(
    isHybridMock ? liveVote?.allowAnonymousQuickJoin : remoteEvent?.allow_anonymous_quick_join,
  );

  const revealedWinner: VoteChoice | null =
    isHybridMock ? liveVote?.revealedWinner ?? null
    : supabase && remoteEvent ? remoteWinner
    : mockWinner;

  const votedThisRound =
    Boolean(activeStoryNodeId && persist?.votesByNodeId[activeStoryNodeId]);

  useEffect(() => {
    setServerVoteDuplicateHint(null);
  }, [activeStoryNodeId]);

  /** Poll closes at (ms); hybrid/live broadcast carries endsAt; pure local demo uses mock store; hosted Supabase events omit until schema adds a column. */
  const voteEndsAt = useMemo(() => {
    if (isHybridMock) return liveVote?.endsAt ?? null;
    if (supabase && remoteEvent) return null;
    return mockVoteEndsAt;
  }, [isHybridMock, liveVote?.endsAt, supabase, remoteEvent, mockVoteEndsAt]);

  const screen: JoinScreen = useMemo(() => {
    if (!hydrated) return "landing";
    if (!persist?.joined) return "landing";
    const showReveal = isReveal && (revealedWinner !== null || remoteTie);
    if (voteOpen && activeStoryNodeId && !votedThisRound) return "voting";
    if (showReveal) return "results";
    if (voteOpen && votedThisRound) return "vote_received";
    return "waiting";
  }, [
    hydrated,
    persist?.joined,
    voteOpen,
    activeStoryNodeId,
    votedThisRound,
    isReveal,
    revealedWinner,
    remoteTie,
  ]);

  const validEvent = useMemo(() => {
    if (!hydrated) return true;
    if (supabase) {
      if (!remoteReady) return true;
      return Boolean(remoteEvent) || code === MOCK_EVENT.eventCode;
    }
    return code === MOCK_EVENT.eventCode;
  }, [hydrated, supabase, remoteReady, remoteEvent, code]);

  const invalidCode = hydrated && remoteReady && !bootstrapFailed && !validEvent;

  const acceptingAudienceJoins = useMemo(() => {
    if (!remoteEvent) {
      if (isHybridMock) return true;
      if (!supabase) return code === MOCK_EVENT.eventCode;
      return false;
    }
    return remoteEvent.status !== "draft" && remoteEvent.status !== "ended";
  }, [remoteEvent, isHybridMock, supabase, code]);

  const joinsClosedReason = useMemo(() => {
    if (!remoteEvent) return null;
    if (remoteEvent.status === "draft") return "draft" as const;
    if (remoteEvent.status === "ended") return "ended" as const;
    return null;
  }, [remoteEvent]);

  const joinsClosed =
    hydrated && remoteReady && Boolean(remoteEvent) && !acceptingAudienceJoins && !bootstrapFailed;

  const needsJoinTransport = Boolean(supabase && (remoteEvent || isHybridMock));

  const joinTransportOk = !needsJoinTransport || joinTransportStatus === "subscribed";

  const joinTransportConnecting = needsJoinTransport && joinTransportStatus === "connecting";

  const joinRealtimeDown =
    needsJoinTransport &&
    remoteReady &&
    !bootstrapFailed &&
    (joinTransportStatus === "channel_error" || joinTransportStatus === "timed_out");

  /** Full-screen reconnect only before guest has a saved seat; joined guests see an inline banner instead. */
  const joinRealtimeBlocking = joinRealtimeDown && !persist?.joined;

  const readyToJoin =
    remoteReady &&
    validEvent &&
    acceptingAudienceJoins &&
    Boolean(title?.trim()) &&
    joinTransportOk &&
    !bootstrapFailed;

  const mergePersist = useCallback((next: JoinSessionPersist) => {
    saveJoinSession(next);
    setPersist(next);
  }, []);

  const joinRoom = useCallback(
    async (displayName: string, tableNumber: string) => {
      const sid = persist?.sessionId ?? newSessionId();
      let audienceMemberId = persist?.audienceMemberId;
      setJoinRoomError(null);
      const trimmedName = displayName.trim();
      const trimmedTable = tableNumber.trim();

      if (supabase && remoteEvent) {
        try {
          audienceMemberId = await insertAudienceMember(supabase, {
            eventId: remoteEvent.id,
            displayName: trimmedName,
            tableNumber: trimmedTable || null,
            sessionId: sid,
          });
        } catch (e) {
          if (isUniqueViolation(e)) {
            const existing = await fetchAudienceMemberIdForCurrentUser(supabase, remoteEvent.id);
            audienceMemberId = existing ?? persist?.audienceMemberId;
            if (!audienceMemberId) {
              const msg = e instanceof Error ? e.message : "Could not join";
              setJoinRoomError(msg);
              throw e;
            }
          } else {
            const msg = e instanceof Error ? e.message : "Could not join";
            setJoinRoomError(msg);
            throw e;
          }
        }
      } else {
        mockRegister();
      }

      const next: JoinSessionPersist = {
        sessionId: sid,
        eventCode: code,
        displayName: trimmedName,
        tableNumber: trimmedTable,
        joined: true,
        audienceMemberId,
        votesByNodeId: persist?.votesByNodeId ?? {},
      };
      mergePersist(next);
    },
    [
      persist?.sessionId,
      persist?.votesByNodeId,
      persist?.audienceMemberId,
      mergePersist,
      supabase,
      remoteEvent,
      mockRegister,
      code,
    ],
  );

  const castVote = useCallback(
    async (choice: VoteChoice): Promise<"ok" | "duplicate" | "blocked"> => {
      if (!persist?.joined || !activeStoryNodeId || votedThisRound || voteSubmitting) return "blocked";

      setVoteSubmitting(true);
      try {
        let duplicate = false;
        if (supabase && remoteEvent && persist.audienceMemberId) {
          const res = await insertVote(supabase, {
            eventId: remoteEvent.id,
            storyNodeId: activeStoryNodeId,
            audienceMemberId: persist.audienceMemberId,
            choice,
          });
          if (res === "duplicate") {
            duplicate = true;
            setServerVoteDuplicateHint(
              "You already voted on this question — your first choice is locked in.",
            );
          }
        } else if (supabase && syncEventId) {
          const clientVoteId = `${persist.sessionId}:${activeStoryNodeId}`;
          await broadcastEventSync(supabase, syncEventId, {
            type: "audience_vote",
            clientVoteId,
            choice,
          });
        } else {
          mockCast(choice);
        }
        const next = recordVoteForNode(persist, code, activeStoryNodeId, choice);
        mergePersist(next);
        return duplicate ? "duplicate" : "ok";
      } catch {
        return "blocked";
      } finally {
        setVoteSubmitting(false);
      }
    },
    [
      persist,
      activeStoryNodeId,
      votedThisRound,
      voteSubmitting,
      supabase,
      remoteEvent,
      syncEventId,
      mockCast,
      mergePersist,
      code,
    ],
  );

  const retryBootstrap = useCallback(async () => {
    if (!supabase) return;
    setFetchError(null);
    setBootstrapFailed(false);
    setRemoteReady(false);
    try {
      const ev = await fetchEventByCode(supabase, code);
      setBootstrapFailed(false);
      setFetchError(null);
      setRemoteEvent(ev);
      if (ev?.active_vote_id) {
        const node = await fetchStoryNode(supabase, ev.active_vote_id);
        setRemoteNode(node);
      } else {
        setRemoteNode(null);
      }
      if (ev?.status === "revealing" && ev.active_vote_id) {
        const maj = await fetchVoteMajority(supabase, ev.id, ev.active_vote_id);
        setRemoteWinner(maj.winner);
        setRemoteTie(maj.tie);
      }
    } catch (e) {
      setBootstrapFailed(true);
      setFetchError(e instanceof Error ? e.message : "Retry failed");
      setRemoteEvent(null);
    } finally {
      setRemoteReady(true);
      setTransportRetryNonce((n) => n + 1);
    }
  }, [supabase, code]);

  const retryJoinTransport = useCallback(() => {
    setTransportRetryNonce((n) => n + 1);
  }, []);

  const leaveRoom = useCallback(() => {
    clearJoinSession(code);
    setPersist(null);
    setServerVoteDuplicateHint(null);
    setJoinRoomError(null);
  }, [code]);

  const dismissDuplicateVoteHint = useCallback(() => setServerVoteDuplicateHint(null), []);

  /** @deprecated Prefer fetchError / joinRoomError / joinRealtimeDown */
  const remoteError =
    fetchError ||
    joinRoomError ||
    (joinRealtimeDown ? "Realtime connection failed — check network or try again." : null);

  return {
    hydrated,
    mode: supabase ? ("supabase" as const) : ("mock" as const),
    realtimeConfigured: Boolean(supabase),
    isHybridMock,
    validEvent,
    invalidCode,
    remoteReady,
    bootstrapFailed,
    fetchError,
    joinRoomError,
    joinTransportStatus,
    joinTransportConnecting,
    joinRealtimeDown,
    joinRealtimeBlocking,
    voteEndsAt,
    pollDurationSec,
    joinsClosed,
    joinsClosedReason,
    acceptingAudienceJoins,
    readyToJoin,
    /** Legacy combined banner message */
    remoteError,
    online,
    title,
    question,
    optionALabel,
    optionBLabel,
    voteOpen,
    isReveal,
    revealedWinner,
    revealTie: remoteTie,
    activeStoryNodeId,
    persist,
    screen,
    votedThisRound,
    voteSubmitting,
    joinRoom,
    castVote,
    retryRemote: retryBootstrap,
    retryJoinTransport,
    allowAnonymousQuickJoin,
    leaveRoom,
    serverVoteDuplicateHint,
    dismissDuplicateVoteHint,
  };
}
