"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  reconcileAudienceParticipant,
  type AudienceRegistrationStatus,
} from "@/lib/join/ensure-audience-participant";
import { joinLifecycleLog } from "@/lib/join/join-lifecycle-log";
import {
  clearRoomParticipant,
  loadRoomParticipant,
  markVotePending,
  markVoteSynced,
  saveRoomParticipant,
  type RoomParticipantRuntime,
} from "@/lib/join/participant-identity";
import {
  tryEnsureAnonymousSession,
  fetchAudienceMemberIdForCurrentUser,
  insertAudienceMember,
  isUniqueViolation,
} from "@/lib/join/supabase-room";
import { attemptHostedVoteDelivery } from "@/lib/join/vote-sync-http";
import { friendlySupabaseError } from "@/lib/supabase/operator-errors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getEventByCode,
  getSessionBallotOnNode,
  getStoryNodeById,
  type EventRow,
  type StoryNodeRow,
} from "@/lib/supabase/event-room";
import type { VoteChoice } from "@/types";

export type JoinMobileTransport = "na" | "connecting" | "subscribed" | "channel_error" | "timed_out";

export function useJoinMobileVote(eventCodeRaw: string) {
  const code = eventCodeRaw.toUpperCase();
  const supabase = useMemo(() => (typeof window !== "undefined" ? createSupabaseBrowserClient() : null), []);

  const [hydrated, setHydrated] = useState(false);
  const [persist, setPersist] = useState<RoomParticipantRuntime | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<AudienceRegistrationStatus>("pending");
  const [audienceMemberId, setAudienceMemberId] = useState<string | null>(null);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [voteNode, setVoteNode] = useState<StoryNodeRow | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteBlockReason, setVoteBlockReason] = useState<string | null>(null);
  const [transport, setTransport] = useState<JoinMobileTransport>("na");
  const [rtNonce, setRtNonce] = useState(0);
  const [serverBallot, setServerBallot] = useState<VoteChoice | null>(null);

  const eventRef = useRef(event);
  eventRef.current = event;

  const persistRef = useRef(persist);
  persistRef.current = persist;

  const audienceMemberIdRef = useRef(audienceMemberId);
  audienceMemberIdRef.current = audienceMemberId;

  const mergePersist = useCallback((next: RoomParticipantRuntime) => {
    saveRoomParticipant(next);
    setPersist(next);
  }, []);

  useEffect(() => {
    const initial = loadRoomParticipant(code);
    setPersist(initial);
    setHydrated(true);
  }, [code]);

  const runReconcile = useCallback(async () => {
    const ev = eventRef.current;
    const result = await reconcileAudienceParticipant(supabase, code, ev?.id ?? null);
    mergePersist(result.participant);
    setRegistrationStatus(result.registrationStatus);
    setAudienceMemberId(result.audienceMemberId);
    if (result.registrationStatus === "needs_rejoin" && result.resetReason === "missing_db_row") {
      setJoinError("Your ballot was reset on this device. Enter the room again to vote.");
    }
  }, [supabase, code, mergePersist]);

  useEffect(() => {
    if (!hydrated || !remoteReady) return;
    void runReconcile();
  }, [hydrated, remoteReady, event?.id, runReconcile]);

  const refreshVoteNode = useCallback(
    async (ev: EventRow | null) => {
      if (!supabase || !ev?.current_node_id) {
        setVoteNode(null);
        return;
      }
      const voteish = ["voting_open", "voting_closed", "winner_revealed"].includes(ev.status);
      if (!voteish) {
        setVoteNode(null);
        return;
      }
      try {
        const n = await getStoryNodeById(supabase, ev.current_node_id);
        setVoteNode(n);
      } catch {
        setVoteNode(null);
      }
    },
    [supabase],
  );

  const refreshServerBallot = useCallback(async () => {
    const ev = eventRef.current;
    const p = persistRef.current;
    if (
      !supabase ||
      !ev?.id ||
      !ev.current_node_id ||
      !p?.joined ||
      !p.participantId ||
      !audienceMemberIdRef.current ||
      ev.status !== "voting_open"
    ) {
      setServerBallot(null);
      return;
    }
    try {
      const b = await getSessionBallotOnNode(supabase, ev.id, ev.current_node_id, p.participantId);
      setServerBallot(b);
    } catch {
      setServerBallot(null);
    }
  }, [supabase]);

  useEffect(() => {
    void refreshServerBallot();
  }, [
    refreshServerBallot,
    event?.id,
    event?.current_node_id,
    event?.status,
    persist?.joined,
    persist?.participantId,
    audienceMemberId,
  ]);

  useEffect(() => {
    if (!supabase) {
      setRemoteReady(true);
      setLoadError(null);
      setEvent(null);
      return;
    }
    let cancelled = false;
    setRemoteReady(false);
    setLoadError(null);
    void (async () => {
      try {
        const ev = await getEventByCode(supabase, code);
        if (cancelled) return;
        setEvent(ev);
        if (!ev) setLoadError("No live event exists for this code.");
        await refreshVoteNode(ev);
      } catch (e) {
        if (!cancelled) {
          setEvent(null);
          setLoadError(friendlySupabaseError(e));
        }
      } finally {
        if (!cancelled) setRemoteReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, code, refreshVoteNode]);

  const eventId = event?.id;

  useEffect(() => {
    if (!supabase || !eventId) return;
    let cancelled = false;
    let retryTimer: number | undefined;

    const scheduleRetry = () => {
      if (cancelled) return;
      retryTimer = window.setTimeout(() => {
        if (!cancelled) setRtNonce((n) => n + 1);
      }, 2500);
    };

    setTransport("connecting");
    const ch = supabase
      .channel(`join-mobile-${eventId}-${rtNonce}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `id=eq.${eventId}` },
        async (payload) => {
          const row = payload.new as EventRow;
          if (row?.id) {
            setEvent(row);
            await refreshVoteNode(row);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setTransport("subscribed");
        else if (status === "CHANNEL_ERROR") {
          setTransport("channel_error");
          scheduleRetry();
        } else if (status === "TIMED_OUT") {
          setTransport("timed_out");
          scheduleRetry();
        }
      });

    const onOnline = () => setRtNonce((n) => n + 1);
    const onVis = () => {
      if (document.visibilityState === "visible") setRtNonce((n) => n + 1);
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(ch);
    };
  }, [supabase, eventId, rtNonce, refreshVoteNode]);

  const acceptingJoins = Boolean(event && event.status !== "setup" && event.status !== "ended");

  const voteOpen = Boolean(event?.status === "voting_open" && event.current_node_id);

  const votedThisRound = Boolean(voteOpen && serverBallot !== null);

  const voteEligible = Boolean(
    voteOpen &&
      persist?.joined &&
      persist.participantId &&
      audienceMemberId &&
      registrationStatus === "registered" &&
      !voteSubmitting &&
      serverBallot === null,
  );

  const computeVoteBlockReason = useCallback((): string | null => {
    if (!voteOpen) return "Voting is not open on this ballot.";
    if (!persist?.joined) return "Enter the room before you can vote.";
    if (!persist.participantId) return "This device has no audience participant id for this room.";
    if (registrationStatus === "needs_rejoin") return "Re-enter the room — your audience registration was lost.";
    if (registrationStatus !== "registered" || !audienceMemberId) {
      return "You are not registered as an audience member for this room yet.";
    }
    if (voteSubmitting) return "Your ballot is being submitted.";
    if (serverBallot !== null) return "You already voted on this question.";
    return null;
  }, [voteOpen, persist, registrationStatus, audienceMemberId, voteSubmitting, serverBallot]);

  useEffect(() => {
    if (!voteOpen) {
      setVoteBlockReason(null);
      return;
    }
    setVoteBlockReason(computeVoteBlockReason());
  }, [voteOpen, computeVoteBlockReason]);

  const votePending = Boolean(
    event?.current_node_id && persist?.voteOutboundStatus?.[event.current_node_id] === "pending",
  );

  const winnerLabel = useMemo(() => {
    if (!event?.winner) return null;
    if (!voteNode) return event.winner === "A" ? "Option A" : "Option B";
    if (event.winner === "A") return voteNode.option_a_label?.trim() || "Option A";
    return voteNode.option_b_label?.trim() || "Option B";
  }, [event?.winner, voteNode]);

  const joinRoom = useCallback(
    async (displayName: string, tableNumber: string) => {
      if (!supabase || !event) throw new Error("Not ready to join.");
      const p = persistRef.current ?? loadRoomParticipant(code);
      const participantId = p?.participantId;
      if (!participantId) throw new Error("Could not create a participant id for this room.");
      setJoinError(null);

      const name = displayName.trim();
      const table = tableNumber.trim();
      if (!name) throw new Error("Please enter your name.");

      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) {
        setJoinError(anon.message);
        throw new Error(anon.message);
      }

      let memberId: string;
      try {
        memberId = await insertAudienceMember(supabase, {
          eventId: event.id,
          displayName: name,
          tableNumber: table || null,
          sessionId: participantId,
        });
      } catch (e) {
        if (isUniqueViolation(e)) {
          const existing = await fetchAudienceMemberIdForCurrentUser(supabase, event.id, participantId);
          if (!existing) throw e instanceof Error ? e : new Error("Could not join");
          memberId = existing;
        } else {
          throw e instanceof Error ? e : new Error("Could not join");
        }
      }

      joinLifecycleLog("created participant in database", {
        roomCode: code,
        participantId,
        audienceMemberId: memberId,
      });

      const next: RoomParticipantRuntime = {
        participantId,
        roomCode: code,
        role: "audience",
        displayName: name,
        tableNumber: table,
        joined: true,
        audienceMemberId: memberId,
        votesByNodeId: p?.votesByNodeId ?? {},
        voteOutboundStatus: p?.voteOutboundStatus ?? {},
      };
      mergePersist(next);
      setAudienceMemberId(memberId);
      setRegistrationStatus("registered");
      joinLifecycleLog("ready to vote", { roomCode: code, participantId, audienceMemberId: memberId });
    },
    [supabase, event, mergePersist, code],
  );

  const castVote = useCallback(
    async (choice: VoteChoice): Promise<"ok" | "duplicate" | "blocked" | "queued"> => {
      const block = computeVoteBlockReason();
      if (block) {
        setVoteError(block);
        setVoteBlockReason(block);
        joinLifecycleLog("vote blocked", { roomCode: code, reason: block });
        return "blocked";
      }

      const p = persistRef.current;
      const ev = eventRef.current;
      if (!supabase || !ev?.current_node_id || !p?.participantId) {
        const msg = "Cannot vote — reconnect and enter the room again.";
        setVoteError(msg);
        return "blocked";
      }

      const nodeId = ev.current_node_id;
      setVoteSubmitting(true);
      setVoteError(null);
      try {
        const cur = persistRef.current;
        if (!cur) {
          const msg = "Cannot vote — no participant on this device.";
          setVoteError(msg);
          return "blocked";
        }
        mergePersist(markVotePending(cur, code, nodeId, choice));
        const r = await attemptHostedVoteDelivery(supabase, {
          eventId: ev.id,
          storyNodeId: nodeId,
          sessionId: cur.participantId,
          choice,
        });
        const latest = loadRoomParticipant(code);
        if (r === "ok" || r === "duplicate") {
          if (latest) mergePersist(markVoteSynced(latest, nodeId));
          await refreshServerBallot();
          return r === "duplicate" ? "duplicate" : "ok";
        }
        const msg = "Vote queued — reconnecting to the room, it will send automatically.";
        setVoteError(msg);
        return "queued";
      } catch (e) {
        const msg = friendlySupabaseError(e);
        setVoteError(msg);
        return "blocked";
      } finally {
        setVoteSubmitting(false);
      }
    },
    [computeVoteBlockReason, supabase, code, mergePersist, refreshServerBallot],
  );

  /**
   * A vote that failed delivery is marked "pending" in memory (see castVote's catch path) but
   * nothing was retrying it automatically — a phone that dropped connection mid-tap would leave
   * the ballot silently unsent until the attendee noticed and tapped again. Retry it ourselves
   * whenever the network comes back or the realtime channel resubscribes, using the same
   * participant id so the attendee never has to re-enter their name.
   */
  const retryPendingVote = useCallback(async () => {
    const p = persistRef.current;
    const ev = eventRef.current;
    if (!supabase || !ev?.current_node_id || !p?.participantId) return;
    const nodeId = ev.current_node_id;
    if (p.voteOutboundStatus?.[nodeId] !== "pending") return;
    const choice = p.votesByNodeId[nodeId];
    if (!choice) return;
    try {
      const r = await attemptHostedVoteDelivery(supabase, {
        eventId: ev.id,
        storyNodeId: nodeId,
        sessionId: p.participantId,
        choice,
      });
      if (r === "ok" || r === "duplicate") {
        mergePersist(markVoteSynced(p, nodeId));
        setVoteError(null);
        await refreshServerBallot();
      }
    } catch {
      /* still pending — next reconnect/online event will retry again */
    }
  }, [supabase, mergePersist, refreshServerBallot]);

  useEffect(() => {
    if (transport !== "subscribed") return;
    void retryPendingVote();
  }, [transport, retryPendingVote]);

  useEffect(() => {
    const onOnline = () => void retryPendingVote();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retryPendingVote]);

  const leaveRoom = useCallback(() => {
    clearRoomParticipant(code);
    const fresh = loadRoomParticipant(code);
    setPersist(fresh);
    setServerBallot(null);
    setJoinError(null);
    setVoteError(null);
    setVoteBlockReason(null);
    setAudienceMemberId(null);
    setRegistrationStatus("fresh");
  }, [code]);

  const reconnecting = Boolean(
    supabase &&
      eventId &&
      (transport === "channel_error" ||
        transport === "timed_out" ||
        (transport === "connecting" && rtNonce > 0)),
  );

  const uiPhase = useMemo(() => {
    if (!hydrated || !remoteReady) return "loading" as const;
    if (!supabase) return "no_supabase" as const;
    if (loadError && !event) return "error" as const;
    if (!event) return "no_event" as const;
    if (!acceptingJoins) return "lobby_closed" as const;
    if (!persist?.joined || registrationStatus === "needs_rejoin") return "form" as const;
    if (event.status === "winner_revealed" && event.winner && event.current_node_id) return "results" as const;
    if (voteOpen && !votedThisRound) return "voting" as const;
    if (voteOpen && votedThisRound) return "vote_received" as const;
    if (persist?.joined && event.status === "voting_closed") return "host_locked" as const;
    return "waiting" as const;
  }, [
    hydrated,
    remoteReady,
    supabase,
    loadError,
    event,
    acceptingJoins,
    persist?.joined,
    registrationStatus,
    voteOpen,
    votedThisRound,
  ]);

  return {
    hydrated,
    supabaseConfigured: Boolean(supabase),
    remoteReady,
    loadError,
    joinError,
    voteError,
    clearVoteError: () => setVoteError(null),
    event,
    voteNode,
    persist,
    participantId: persist?.participantId ?? null,
    audienceMemberId,
    registrationStatus,
    role: "audience" as const,
    voteEligible,
    voteBlockReason,
    acceptingJoins,
    voteOpen,
    votedThisRound,
    serverBallot,
    winnerLabel,
    voteSubmitting,
    votePending,
    transport,
    reconnecting,
    joinRoom,
    castVote,
    leaveRoom,
    uiPhase,
  };
}
