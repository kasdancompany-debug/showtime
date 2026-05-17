"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  tryEnsureAnonymousSession,
  fetchAudienceMemberIdForCurrentUser,
  insertAudienceMember,
  isUniqueViolation,
} from "@/lib/join/supabase-room";
import {
  clearJoinSession,
  loadJoinSession,
  markVotePending,
  markVoteSynced,
  newSessionId,
  saveJoinSession,
  type JoinSessionPersist,
} from "@/lib/join/session-storage";
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
  const [persist, setPersist] = useState<JoinSessionPersist | null>(null);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [voteNode, setVoteNode] = useState<StoryNodeRow | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [transport, setTransport] = useState<JoinMobileTransport>("na");
  const [rtNonce, setRtNonce] = useState(0);
  /** Server-confirmed ballot for current vote node (refresh-safe). */
  const [serverBallot, setServerBallot] = useState<VoteChoice | null>(null);

  const eventRef = useRef(event);
  eventRef.current = event;

  const persistRef = useRef(persist);
  persistRef.current = persist;

  const mergePersist = useCallback((next: JoinSessionPersist) => {
    saveJoinSession(next);
    setPersist(next);
  }, []);

  useEffect(() => {
    setPersist(loadJoinSession(code));
    setHydrated(true);
  }, [code]);

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
      !p.sessionId ||
      ev.status !== "voting_open"
    ) {
      setServerBallot(null);
      return;
    }
    try {
      const b = await getSessionBallotOnNode(supabase, ev.id, ev.current_node_id, p.sessionId);
      setServerBallot(b);
    } catch {
      setServerBallot(null);
    }
  }, [supabase]);

  useEffect(() => {
    void refreshServerBallot();
  }, [refreshServerBallot, event?.id, event?.current_node_id, event?.status, persist?.joined, persist?.sessionId]);

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

  const winnerLabel = useMemo(() => {
    if (!event?.winner) return null;
    if (!voteNode) return event.winner === "A" ? "Option A" : "Option B";
    if (event.winner === "A") return voteNode.option_a_label?.trim() || "Option A";
    return voteNode.option_b_label?.trim() || "Option B";
  }, [event?.winner, voteNode]);

  const joinRoom = useCallback(
    async (displayName: string, tableNumber: string) => {
      if (!supabase || !event) throw new Error("Not ready to join.");
      const p = persistRef.current;
      const sid = p?.sessionId ?? newSessionId();
      setJoinError(null);
      const name = displayName.trim();
      const table = tableNumber.trim();
      if (!name) throw new Error("Please enter your name.");

      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) {
        setJoinError(anon.message);
        throw new Error(anon.message);
      }
      try {
        await insertAudienceMember(supabase, {
          eventId: event.id,
          displayName: name,
          tableNumber: table || null,
          sessionId: sid,
        });
      } catch (e) {
        if (isUniqueViolation(e)) {
          const existing = await fetchAudienceMemberIdForCurrentUser(supabase, event.id, sid);
          if (!existing) throw e instanceof Error ? e : new Error("Could not join");
        } else {
          throw e instanceof Error ? e : new Error("Could not join");
        }
      }

      mergePersist({
        sessionId: sid,
        eventCode: code,
        displayName: name,
        tableNumber: table,
        joined: true,
        votesByNodeId: p?.votesByNodeId ?? {},
        voteOutboundStatus: p?.voteOutboundStatus ?? {},
      });
    },
    [supabase, event, mergePersist, code],
  );

  const castVote = useCallback(
    async (choice: VoteChoice): Promise<"ok" | "duplicate" | "blocked" | "queued"> => {
      const p = persistRef.current;
      if (!supabase || !event?.current_node_id || !p?.joined || !p.sessionId || voteSubmitting) return "blocked";
      if (serverBallot !== null) return "duplicate";

      const nodeId = event.current_node_id;
      setVoteSubmitting(true);
      setVoteError(null);
      try {
        const cur = persistRef.current;
        if (!cur) return "blocked";
        mergePersist(markVotePending(cur, code, nodeId, choice));
        const r = await attemptHostedVoteDelivery(supabase, {
          eventId: event.id,
          storyNodeId: nodeId,
          sessionId: cur.sessionId,
          choice,
        });
        const latest = loadJoinSession(code);
        if (r === "ok" || r === "duplicate") {
          if (latest) mergePersist(markVoteSynced(latest, nodeId));
          await refreshServerBallot();
          return r === "duplicate" ? "duplicate" : "ok";
        }
        return "queued";
      } catch (e) {
        setVoteError(friendlySupabaseError(e));
        return "blocked";
      } finally {
        setVoteSubmitting(false);
      }
    },
    [supabase, event, code, mergePersist, voteSubmitting, serverBallot, refreshServerBallot],
  );

  const leaveRoom = useCallback(() => {
    clearJoinSession(code);
    setPersist(null);
    setServerBallot(null);
    setJoinError(null);
    setVoteError(null);
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
    if (!persist?.joined) return "form" as const;
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
    acceptingJoins,
    voteOpen,
    votedThisRound,
    serverBallot,
    winnerLabel,
    voteSubmitting,
    transport,
    reconnecting,
    joinRoom,
    castVote,
    leaveRoom,
    uiPhase,
  };
}
