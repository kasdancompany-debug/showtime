"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMockEventStore } from "@/lib/store/mock-event-store";
import { friendlySupabaseError } from "@/lib/supabase/operator-errors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchVoteTalliesForNode,
  getEventByCode,
  getStoryNodeById,
  getStoryNodeByEventAndKey,
  type EventRow,
  type StoryNodeRow,
} from "@/lib/supabase/event-room";
import { readStoredOperatorCode } from "@/lib/showtime/operator-session";
import { displayStoryVideoFilename, resolveStoryVideoUrl } from "@/lib/showtime/video-url";

function readInitialEventCode(storeCode: string): string {
  const stored = readStoredOperatorCode();
  return stored.length >= 3 ? stored : storeCode;
}

export function useScreenSupabaseDisplay() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const storeEventCode = useMockEventStore((s) => s.eventCode);
  const syncSupabaseEventMeta = useMockEventStore((s) => s.syncSupabaseEventMeta);

  const [eventCode, setEventCode] = useState(storeEventCode);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [currentNode, setCurrentNode] = useState<StoryNodeRow | null>(null);
  const [tallies, setTallies] = useState({ a: 0, b: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rtGeneration, setRtGeneration] = useState(0);

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    setEventCode(readInitialEventCode(storeEventCode));
  }, [storeEventCode]);

  useEffect(() => {
    setEventCode((prev) => (storeEventCode && storeEventCode !== prev ? storeEventCode : prev));
  }, [storeEventCode]);

  const eventRef = useRef(event);
  eventRef.current = event;

  const refreshCurrentNode = useCallback(async (ev: EventRow | null) => {
    if (!supabase || !ev?.current_node_id) {
      setCurrentNode(null);
      return;
    }
    try {
      const n = await getStoryNodeById(supabase, ev.current_node_id);
      setCurrentNode(n);
    } catch {
      setCurrentNode(null);
    }
  }, [supabase]);

  const refreshTallies = useCallback(async () => {
    const ev = eventRef.current;
    if (!supabase || !ev?.id || !ev.current_node_id) {
      setTallies({ a: 0, b: 0 });
      return;
    }
    const liveOk = ev.screen_show_live_vote_counts !== false;
    const showTally =
      (ev.status === "voting_open" && liveOk) || (ev.status === "voting_closed" && ev.screen_show_closed_tally === true);
    if (!showTally) {
      setTallies({ a: 0, b: 0 });
      return;
    }
    try {
      const t = await fetchVoteTalliesForNode(supabase, ev.id, ev.current_node_id);
      setTallies(t);
    } catch {
      /* ignore */
    }
  }, [supabase]);

  const bootstrap = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError(null);
      setEvent(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const code = eventCode.trim().toUpperCase();
      if (code.length < 3) {
        setEvent(null);
        setError("Missing room code. Use the link or QR for this screening, or add ?code= to the URL.");
        return;
      }
      const ev = await getEventByCode(supabase, code);
      if (!ev) {
        setEvent(null);
        setError(`No event found for code “${code}”.`);
        return;
      }
      eventRef.current = ev;
      setEvent(ev);
      syncSupabaseEventMeta({ eventId: ev.id, code: ev.code, title: ev.title });
      await refreshCurrentNode(ev);
      await refreshTallies();
    } catch (e) {
      setError(friendlySupabaseError(e));
      setEvent(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, eventCode, syncSupabaseEventMeta, refreshCurrentNode, refreshTallies]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    void refreshTallies();
  }, [refreshTallies, event?.status, event?.current_node_id, event?.screen_show_closed_tally, event?.screen_show_live_vote_counts]);

  useEffect(() => {
    void refreshCurrentNode(event);
  }, [event, refreshCurrentNode]);

  useEffect(() => {
    if (!supabase || !event?.id) return;
    let cancelled = false;
    let retryTimer: number | undefined;

    const scheduleReconnect = () => {
      if (cancelled) return;
      retryTimer = window.setTimeout(() => {
        if (!cancelled) setRtGeneration((g) => g + 1);
      }, 2000);
    };

    const ch = supabase
      .channel(`screen-room-${event.id}-${rtGeneration}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `id=eq.${event.id}` },
        async (payload) => {
          const row = payload.new as EventRow;
          if (row?.id) {
            eventRef.current = row;
            setEvent(row);
            syncSupabaseEventMeta({ eventId: row.id, code: row.code, title: row.title });
            await refreshCurrentNode(row);
            await refreshTallies();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `event_id=eq.${event.id}` },
        () => {
          void refreshTallies();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_nodes", filter: `event_id=eq.${event.id}` },
        async () => {
          await refreshCurrentNode(eventRef.current);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleReconnect();
        }
      });

    const onVis = () => {
      if (document.visibilityState === "visible") void bootstrap();
    };
    const onOnline = () => {
      void bootstrap();
      setRtGeneration((g) => g + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(ch);
    };
  }, [supabase, event?.id, rtGeneration, bootstrap, refreshTallies, refreshCurrentNode, syncSupabaseEventMeta]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const ev = event;
    if (!ev || ev.status !== "voting_open" || !ev.vote_ends_at) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [event?.status, event?.vote_ends_at, event]);

  const countdownSec = useMemo(() => {
    const ev = event;
    if (!ev || ev.status !== "voting_open" || !ev.vote_ends_at) return null;
    const end = new Date(ev.vote_ends_at).getTime();
    if (!Number.isFinite(end)) return null;
    return Math.max(0, Math.ceil((end - nowMs) / 1000));
  }, [event, nowMs]);

  const [nextCueFilename, setNextCueFilename] = useState<string | null>(null);
  const [nextReelSrc, setNextReelSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const ev = event;
      if (!supabase || !ev || ev.status !== "winner_revealed" || !ev.winner || !currentNode) {
        if (!cancelled) {
          setNextCueFilename(null);
          setNextReelSrc(null);
        }
        return;
      }
      const key =
        ev.winner === "A"
          ? (currentNode.option_a_next_node_key ?? "").trim()
          : (currentNode.option_b_next_node_key ?? "").trim();
      if (!key) {
        if (!cancelled) {
          setNextCueFilename(null);
          setNextReelSrc(null);
        }
        return;
      }
      try {
        const next = await getStoryNodeByEventAndKey(supabase, ev.id, key);
        if (cancelled) return;
        const fn = displayStoryVideoFilename(next?.video_url);
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const url = next ? resolveStoryVideoUrl(next.video_url, origin) : null;
        setNextCueFilename(fn || null);
        setNextReelSrc(url || null);
      } catch {
        if (!cancelled) {
          setNextCueFilename(null);
          setNextReelSrc(null);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase, event, currentNode]);

  const winnerLabel = useMemo(() => {
    if (!event?.winner) return null;
    if (!currentNode) return event.winner === "A" ? "Option A" : "Option B";
    if (event.winner === "A") return currentNode.option_a_label?.trim() || "Option A";
    return currentNode.option_b_label?.trim() || "Option B";
  }, [event, currentNode]);

  const totalVotes = tallies.a + tallies.b;
  const pctA = totalVotes ? Math.round((tallies.a / totalVotes) * 1000) / 10 : 50;
  const pctB = totalVotes ? Math.round((tallies.b / totalVotes) * 1000) / 10 : 50;

  return {
    supabase,
    supabaseConfigured: Boolean(supabase),
    loading,
    error,
    event,
    currentNode,
    tallies,
    pctA,
    pctB,
    countdownSec,
    winnerLabel,
    nextCueFilename,
    nextReelSrc,
    reload: bootstrap,
  };
}
