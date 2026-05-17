"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MOCK_EVENT } from "@/lib/mock-data";
import { broadcastEventSync, subscribeEventSync, subscribeEventSyncWithStatus } from "@/lib/realtime/event-sync";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchAudienceMemberIdForCurrentUser,
  fetchEventByCode,
  fetchStoryNode,
  fetchVoteMajority,
  fetchVoteTallies,
  insertAudienceMember,
  isUniqueViolation,
  type RemoteEventRow,
  type RemoteStoryNodeRow,
} from "@/lib/join/supabase-room";
import {
  clearJoinSession,
  loadJoinSession,
  markVotePending,
  markVoteSynced,
  newSessionId,
  recordVoteForNode,
  saveJoinSession,
  type JoinSessionPersist,
} from "@/lib/join/session-storage";
import { attemptHostedVoteDelivery } from "@/lib/join/vote-sync-http";
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
  pollDurationSec?: number;
  pctA?: number;
  pctB?: number;
  totalVotes?: number;
  serverNowMs?: number;
};

/** Operator broadcast overlay for hosted Supabase events (percentages, clock sync). */
type HostedVoteBroadcastSlice = Pick<
  LiveVoteSnapshot,
  | "phase"
  | "endsAt"
  | "totals"
  | "revealedWinner"
  | "pollDurationSec"
  | "pctA"
  | "pctB"
  | "totalVotes"
  | "serverNowMs"
  | "voteNodeId"
>;

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
  const mockVotesA = useMockEventStore((s) => s.votesA);
  const mockVotesB = useMockEventStore((s) => s.votesB);
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
  const [hostedTallies, setHostedTallies] = useState<{ a: number; b: number } | null>(null);
  const [hostedPollEndsAt, setHostedPollEndsAt] = useState<number | null>(null);
  const [hostedVoteBroadcast, setHostedVoteBroadcast] = useState<HostedVoteBroadcastSlice | null>(null);
  const hostedVoteRoundRef = useRef<string | null>(null);
  const [serverVoteDuplicateHint, setServerVoteDuplicateHint] = useState<string | null>(null);
  const autoJoinAttemptedRef = useRef(false);

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
        const voteish = ["voting_open", "voting_closed", "winner_revealed"].includes(ev.status);
        if (voteish && ev.current_node_id) {
          const node = await fetchStoryNode(supabase, ev.current_node_id);
          if (!cancelled) setRemoteNode(node);
        }
        if (ev.status === "winner_revealed" && ev.current_node_id) {
          const maj = await fetchVoteMajority(supabase, ev.id, ev.current_node_id);
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
  const remoteEventRef = useRef(remoteEvent);
  remoteEventRef.current = remoteEvent;

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
            const voteish = ["voting_open", "voting_closed", "winner_revealed"].includes(row.status);
            if (voteish && row.current_node_id) {
              const node = await fetchStoryNode(supabase, row.current_node_id);
              setRemoteNode(node);
            } else {
              setRemoteNode(null);
            }
            if (row.status === "winner_revealed" && row.current_node_id) {
              const maj = await fetchVoteMajority(supabase, row.id, row.current_node_id);
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

  const isSupabaseHybridMock = Boolean(
    supabase && remoteReady && !remoteEvent && code === MOCK_EVENT.eventCode,
  );
  const isLocalBroadcastMock = Boolean(!supabase && remoteReady && code === MOCK_EVENT.eventCode);
  const broadcastMockNight = isSupabaseHybridMock || isLocalBroadcastMock;

  const syncEventId = remoteEvent?.id ?? (code === MOCK_EVENT.eventCode ? MOCK_EVENT.id : "");

  /* ----- Broadcast sync: hybrid local nights + zero-Supabase preview tabs ----- */
  useEffect(() => {
    if (!syncEventId || !broadcastMockNight) return;

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
        pollDurationSec: p.pollDurationSec,
        pctA: p.pctA,
        pctB: p.pctB,
        totalVotes: p.totalVotes,
        serverNowMs: p.serverNowMs,
      });
    }, (st) => {
      if (st === "connecting") setJoinTransportStatus("connecting");
      if (st === "subscribed") setJoinTransportStatus("subscribed");
      if (st === "channel_error") setJoinTransportStatus("channel_error");
      if (st === "timed_out") setJoinTransportStatus("timed_out");
      if (st === "idle") setJoinTransportStatus("na");
    });
  }, [supabase, syncEventId, broadcastMockNight, transportRetryNonce]);

  /* ----- Hosted: merge operator broadcast (percentages / countdown hints) ----- */
  useEffect(() => {
    if (!supabase || !eventId || isSupabaseHybridMock) return;

    return subscribeEventSync(supabase, eventId, (p) => {
      if (p.type !== "vote") return;
      const ev = remoteEventRef.current;
      const activeId = ev?.status === "voting_open" ? ev.current_node_id : null;
      if (!activeId || (p.voteNodeId != null && p.voteNodeId !== activeId)) return;

      setHostedVoteBroadcast({
        phase: p.phase,
        endsAt: p.endsAt,
        totals: p.totals,
        revealedWinner: p.revealedWinner,
        pollDurationSec: p.pollDurationSec,
        pctA: p.pctA,
        pctB: p.pctB,
        totalVotes: p.totalVotes,
        serverNowMs: p.serverNowMs,
        voteNodeId: p.voteNodeId ?? null,
      });
    });
  }, [supabase, eventId, isSupabaseHybridMock, transportRetryNonce]);

  /* ----- Hosted: live tallies from Postgres ----- */
  useEffect(() => {
    if (!supabase || !eventId || isSupabaseHybridMock) return;

    const channel = supabase
      .channel(`join-votes-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `event_id=eq.${eventId}` },
        async () => {
          const ev = remoteEventRef.current;
          const vid = ev?.current_node_id;
          if (!vid || ev?.status !== "voting_open") return;
          try {
            const t = await fetchVoteTallies(supabase, ev.id, vid);
            setHostedTallies(t);
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, eventId, isSupabaseHybridMock, transportRetryNonce]);

  useEffect(() => {
    if (!supabase || !eventId || isSupabaseHybridMock || !remoteEvent) return;
    const storyNodeId = remoteEvent.current_node_id;
    if (remoteEvent.status !== "voting_open" || !storyNodeId) {
      setHostedTallies(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const t = await fetchVoteTallies(supabase, remoteEvent.id, storyNodeId);
        if (!cancelled) setHostedTallies(t);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, eventId, isSupabaseHybridMock, remoteEvent]);

  useEffect(() => {
    if (!remoteEvent || isSupabaseHybridMock) return;
    const voting = remoteEvent.status === "voting_open" && Boolean(remoteEvent.current_node_id);
    if (!voting) {
      hostedVoteRoundRef.current = null;
      setHostedPollEndsAt(null);
      setHostedVoteBroadcast(null);
      return;
    }
    const roundKey = `${remoteEvent.id}:${remoteEvent.current_node_id}`;
    if (hostedVoteRoundRef.current === roundKey) return;
    hostedVoteRoundRef.current = roundKey;
    setHostedVoteBroadcast(null);
    setHostedPollEndsAt(Date.now() + 30 * 1000);
  }, [remoteEvent, isSupabaseHybridMock]);

  const mockVoteNode = useMemo(() => selectVoteDisplayNode(mockEngine), [mockEngine]);
  const mockWinner = mockVotePhase === "reveal" ? getEffectiveWinner(mockEngine) : null;
  const mockVoteEndsAt = useMockEventStore((s) => s.voteEndsAt);
  const mockPollDurationSec = useMockEventStore((s) => s.pollDurationSec);
  const mockAllowAnonymousQuickJoin = useMockEventStore((s) => s.allowAnonymousQuickJoin);

  const activeStoryNodeId = broadcastMockNight
    ? (liveVote?.voteNodeId ?? mockEngine.voteNodeId ?? null)
    : supabase && remoteEvent
      ? remoteEvent.status === "voting_open"
        ? (remoteEvent.current_node_id ?? null)
        : null
      : (mockEngine.voteNodeId ?? null);

  const voteOpen = broadcastMockNight
    ? liveVote
      ? liveVote.phase === "open"
      : mockVotePhase === "open"
    : supabase && remoteEvent
      ? remoteEvent.status === "voting_open" && Boolean(remoteEvent.current_node_id)
      : mockVotePhase === "open";

  const isReveal = broadcastMockNight
    ? liveVote
      ? liveVote.phase === "reveal"
      : mockVotePhase === "reveal"
    : supabase && remoteEvent
      ? remoteEvent.status === "winner_revealed"
      : mockVotePhase === "reveal";

  const title = remoteEvent?.title || (liveVote?.eventTitle ?? mockTitle) || MOCK_EVENT.title;

  const question =
    supabase && remoteEvent
      ? (remoteNode?.question ?? null)
      : broadcastMockNight
        ? (liveVote?.question ?? mockVoteNode?.question ?? null)
        : mockVoteNode?.question ?? null;

  const optionALabel =
    supabase && remoteEvent
      ? remoteNode?.option_a_label ?? "Option A"
      : broadcastMockNight
        ? (liveVote?.optionALabel ?? mockVoteNode?.optionA?.label ?? "A")
        : mockVoteNode?.optionA?.label ?? "A";

  const optionBLabel =
    supabase && remoteEvent
      ? remoteNode?.option_b_label ?? "Option B"
      : broadcastMockNight
        ? (liveVote?.optionBLabel ?? mockVoteNode?.optionB?.label ?? "B")
        : mockVoteNode?.optionB?.label ?? "B";

  const allowAnonymousQuickJoin = broadcastMockNight
    ? Boolean(liveVote ? liveVote.allowAnonymousQuickJoin : mockAllowAnonymousQuickJoin)
    : true;

  const revealedWinner: VoteChoice | null = broadcastMockNight
    ? (liveVote?.revealedWinner ?? mockWinner)
    : supabase && remoteEvent
      ? remoteWinner
      : mockWinner;

  const votedThisRound =
    Boolean(activeStoryNodeId && persist?.votesByNodeId[activeStoryNodeId]);

  useEffect(() => {
    setServerVoteDuplicateHint(null);
  }, [activeStoryNodeId]);

  /** Poll closes at (ms): hybrid broadcast, operator broadcast / synthetic fallback, or local demo store. */
  const voteEndsAt = useMemo(() => {
    if (broadcastMockNight) return liveVote?.endsAt ?? mockVoteEndsAt ?? null;
    if (supabase && remoteEvent && voteOpen && activeStoryNodeId) {
      if (hostedVoteBroadcast?.endsAt != null) return hostedVoteBroadcast.endsAt;
      return hostedPollEndsAt;
    }
    if (!supabase || !remoteEvent) return mockVoteEndsAt;
    return null;
  }, [
    broadcastMockNight,
    liveVote?.endsAt,
    mockVoteEndsAt,
    supabase,
    remoteEvent,
    voteOpen,
    activeStoryNodeId,
    hostedPollEndsAt,
    hostedVoteBroadcast?.endsAt,
  ]);

  const pollDurationSecResolved = useMemo(() => {
    if (broadcastMockNight) return liveVote?.pollDurationSec ?? mockPollDurationSec;
    if (supabase && remoteEvent) return hostedVoteBroadcast?.pollDurationSec ?? 30;
    return mockPollDurationSec;
  }, [broadcastMockNight, liveVote?.pollDurationSec, supabase, remoteEvent, hostedVoteBroadcast?.pollDurationSec, mockPollDurationSec]);

  const liveTotals = useMemo(() => {
    if (broadcastMockNight && liveVote) return liveVote.totals;
    if (broadcastMockNight) return { a: mockVotesA, b: mockVotesB };
    if (supabase && remoteEvent && voteOpen && activeStoryNodeId) {
      return hostedTallies ?? { a: 0, b: 0 };
    }
    if (!supabase || !remoteEvent) return { a: mockVotesA, b: mockVotesB };
    return { a: 0, b: 0 };
  }, [
    broadcastMockNight,
    liveVote,
    supabase,
    remoteEvent,
    voteOpen,
    activeStoryNodeId,
    hostedTallies,
    mockVotesA,
    mockVotesB,
  ]);

  const livePctA = useMemo(() => {
    if (broadcastMockNight && liveVote?.phase === "open" && liveVote.pctA != null) {
      return liveVote.pctA;
    }
    if (!broadcastMockNight && voteOpen && hostedVoteBroadcast?.pctA != null) {
      return hostedVoteBroadcast.pctA;
    }
    const t = liveTotals.a + liveTotals.b;
    if (!t) return 50;
    return (liveTotals.a / t) * 100;
  }, [broadcastMockNight, liveVote, voteOpen, hostedVoteBroadcast, liveTotals.a, liveTotals.b]);

  const livePctB = useMemo(() => {
    if (broadcastMockNight && liveVote?.phase === "open" && liveVote.pctB != null) {
      return liveVote.pctB;
    }
    if (!broadcastMockNight && voteOpen && hostedVoteBroadcast?.pctB != null) {
      return hostedVoteBroadcast.pctB;
    }
    const t = liveTotals.a + liveTotals.b;
    if (!t) return 50;
    return (liveTotals.b / t) * 100;
  }, [broadcastMockNight, liveVote, voteOpen, hostedVoteBroadcast, liveTotals.a, liveTotals.b]);

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
      if (broadcastMockNight) return true;
      if (!supabase) return code === MOCK_EVENT.eventCode;
      return false;
    }
    return remoteEvent.status !== "setup" && remoteEvent.status !== "ended";
  }, [remoteEvent, broadcastMockNight, supabase, code]);

  const joinsClosedReason = useMemo(() => {
    if (!remoteEvent) return null;
    if (remoteEvent.status === "setup") return "setup" as const;
    if (remoteEvent.status === "ended") return "ended" as const;
    return null;
  }, [remoteEvent]);

  const joinsClosed =
    hydrated && remoteReady && Boolean(remoteEvent) && !acceptingAudienceJoins && !bootstrapFailed;

  const needsJoinTransport = Boolean(supabase && (remoteEvent || isSupabaseHybridMock));

  const joinTransportOk = !needsJoinTransport || joinTransportStatus === "subscribed";

  const joinTransportConnecting = needsJoinTransport && joinTransportStatus === "connecting";

  const joinRealtimeDown =
    needsJoinTransport &&
    remoteReady &&
    !bootstrapFailed &&
    (joinTransportStatus === "channel_error" || joinTransportStatus === "timed_out");

  /** HTTP tally poll when the main Realtime channel is down but the guest can still POST votes. */
  useEffect(() => {
    if (!supabase || !eventId || isSupabaseHybridMock || !joinRealtimeDown || !voteOpen || !activeStoryNodeId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const t = await fetchVoteTallies(supabase, eventId, activeStoryNodeId);
        if (!cancelled) setHostedTallies(t);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [supabase, eventId, isSupabaseHybridMock, joinRealtimeDown, voteOpen, activeStoryNodeId]);

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

  /** Hosted DB delivery + HTTP fallback */
  const syncPendingHostedVotes = useCallback(async () => {
    if (!online || !supabase || !remoteEvent || isSupabaseHybridMock) return;
    const latest = loadJoinSession(code);
    if (!latest?.joined || !latest.sessionId) return;
    const pending = latest.voteOutboundStatus;
    if (!pending) return;
    for (const [nodeId, st] of Object.entries(pending)) {
      if (st !== "pending") continue;
      const choice = latest.votesByNodeId[nodeId];
      if (!choice) continue;
      const r = await attemptHostedVoteDelivery(supabase, {
        eventId: remoteEvent.id,
        storyNodeId: nodeId,
        sessionId: latest.sessionId,
        choice,
      });
      if (r === "ok" || r === "duplicate") {
        const cur = loadJoinSession(code);
        if (cur) mergePersist(markVoteSynced(cur, nodeId));
      }
    }
  }, [online, supabase, remoteEvent, isSupabaseHybridMock, code, mergePersist]);

  /** Hybrid / local-preview mock night: broadcast retries for pending phone votes */
  const syncPendingHybridBroadcast = useCallback(async () => {
    if (!online || !broadcastMockNight || !syncEventId) return;
    const latest = loadJoinSession(code);
    if (!latest?.joined) return;
    const pending = latest.voteOutboundStatus;
    if (!pending) return;
    for (const [nodeId, st] of Object.entries(pending)) {
      if (st !== "pending") continue;
      const choice = latest.votesByNodeId[nodeId];
      if (!choice) continue;
      const clientVoteId = `${latest.sessionId}:${nodeId}`;
      try {
        await broadcastEventSync(supabase, syncEventId, {
          type: "audience_vote",
          clientVoteId,
          choice,
        });
        const cur = loadJoinSession(code);
        if (cur) mergePersist(markVoteSynced(cur, nodeId));
      } catch {
        /* next interval */
      }
    }
  }, [online, supabase, broadcastMockNight, syncEventId, code, mergePersist]);

  useEffect(() => {
    const tick = () => {
      void syncPendingHostedVotes();
      void syncPendingHybridBroadcast();
    };
    tick();
    const id = window.setInterval(tick, 5500);
    window.addEventListener("online", tick);
    return () => {
      window.removeEventListener("online", tick);
      window.clearInterval(id);
    };
  }, [syncPendingHostedVotes, syncPendingHybridBroadcast]);

  useEffect(() => {
    if (!voteOpen) return;
    void syncPendingHostedVotes();
    void syncPendingHybridBroadcast();
  }, [voteOpen, syncPendingHostedVotes, syncPendingHybridBroadcast]);

  useEffect(() => {
    if (!joinRealtimeDown || !voteOpen) return;
    void syncPendingHostedVotes();
  }, [joinRealtimeDown, voteOpen, syncPendingHostedVotes]);

  const retryPendingVoteSync = useCallback(() => {
    void syncPendingHostedVotes();
    void syncPendingHybridBroadcast();
  }, [syncPendingHostedVotes, syncPendingHybridBroadcast]);

  const activeVoteOutboundStatus = useMemo((): "pending" | "synced" | null => {
    if (!activeStoryNodeId || !persist?.votesByNodeId[activeStoryNodeId]) return null;
    return persist.voteOutboundStatus?.[activeStoryNodeId] === "pending" ? "pending" : "synced";
  }, [activeStoryNodeId, persist]);

  const joinRoom = useCallback(
    async (displayName: string, tableNumber: string) => {
      const sid = persist?.sessionId ?? newSessionId();
      setJoinRoomError(null);
      const trimmedName = displayName.trim();
      const trimmedTable = tableNumber.trim();

      if (supabase && remoteEvent) {
        try {
          await insertAudienceMember(supabase, {
            eventId: remoteEvent.id,
            displayName: trimmedName,
            tableNumber: trimmedTable || null,
            sessionId: sid,
          });
        } catch (e) {
          if (isUniqueViolation(e)) {
            const existing = await fetchAudienceMemberIdForCurrentUser(supabase, remoteEvent.id, sid);
            if (!existing) {
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
        votesByNodeId: persist?.votesByNodeId ?? {},
        voteOutboundStatus: persist?.voteOutboundStatus ?? {},
      };
      mergePersist(next);
    },
    [
      persist?.sessionId,
      persist?.votesByNodeId,
      persist?.voteOutboundStatus,
      mergePersist,
      supabase,
      remoteEvent,
      mockRegister,
      code,
    ],
  );

  useEffect(() => {
    if (!hydrated || !allowAnonymousQuickJoin || !readyToJoin) return;
    if (persist?.joined) return;
    if (autoJoinAttemptedRef.current) return;
    autoJoinAttemptedRef.current = true;
    void joinRoom("Guest", "").catch(() => {
      autoJoinAttemptedRef.current = false;
    });
  }, [hydrated, allowAnonymousQuickJoin, readyToJoin, persist?.joined, joinRoom]);

  const castVote = useCallback(
    async (choice: VoteChoice): Promise<"ok" | "duplicate" | "blocked" | "queued"> => {
      if (!persist?.joined || !activeStoryNodeId || votedThisRound || voteSubmitting) return "blocked";

      const nodeId = activeStoryNodeId;
      setVoteSubmitting(true);
      try {
        if (supabase && remoteEvent && persist.sessionId) {
          mergePersist(markVotePending(persist, code, nodeId, choice));
          const r = await attemptHostedVoteDelivery(supabase, {
            eventId: remoteEvent.id,
            storyNodeId: nodeId,
            sessionId: persist.sessionId,
            choice,
          });
          const latest = loadJoinSession(code);
          if (!latest) {
            void syncPendingHostedVotes();
            return "queued";
          }
          if (r === "ok") {
            mergePersist(markVoteSynced(latest, nodeId));
            return "ok";
          }
          if (r === "duplicate") {
            mergePersist(markVoteSynced(latest, nodeId));
            setServerVoteDuplicateHint(
              "You already voted on this question — your first choice is locked in.",
            );
            return "duplicate";
          }
          void syncPendingHostedVotes();
          return "queued";
        }

        if (syncEventId && broadcastMockNight && persist.sessionId) {
          mergePersist(markVotePending(persist, code, nodeId, choice));
          const clientVoteId = `${persist.sessionId}:${nodeId}`;
          const send = () =>
            broadcastEventSync(supabase, syncEventId, {
              type: "audience_vote",
              clientVoteId,
              choice,
            });
          try {
            await send();
            const latest = loadJoinSession(code);
            if (latest) mergePersist(markVoteSynced(latest, nodeId));
            return "ok";
          } catch {
            try {
              await send();
              const latest = loadJoinSession(code);
              if (latest) mergePersist(markVoteSynced(latest, nodeId));
              return "ok";
            } catch {
              void syncPendingHybridBroadcast();
              return "queued";
            }
          }
        }

        mockCast(choice);
        const next = recordVoteForNode(persist, code, nodeId, choice);
        mergePersist({
          ...next,
          voteOutboundStatus: { ...(next.voteOutboundStatus ?? {}), [nodeId]: "synced" },
        });
        return "ok";
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
      broadcastMockNight,
      syncPendingHostedVotes,
      syncPendingHybridBroadcast,
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
      const voteish = ev && ["voting_open", "voting_closed", "winner_revealed"].includes(ev.status);
      if (voteish && ev?.current_node_id) {
        const node = await fetchStoryNode(supabase, ev.current_node_id);
        setRemoteNode(node);
      } else {
        setRemoteNode(null);
      }
      if (ev?.status === "winner_revealed" && ev.current_node_id) {
        const maj = await fetchVoteMajority(supabase, ev.id, ev.current_node_id);
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
    /** Supabase client exists but no `events` row yet — hybrid rehearsal with broadcast. */
    isHybridMock: isSupabaseHybridMock,
    broadcastMockNight,
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
    pollDurationSec: pollDurationSecResolved,
    liveTotals,
    livePctA,
    livePctB,
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
    activeVoteOutboundStatus,
    retryPendingVoteSync,
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
