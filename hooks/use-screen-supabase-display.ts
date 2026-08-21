"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { debounce } from "@/lib/debounce";
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
import { readStoredOperatorCode, readUrlRoomCode, writeStoredOperatorCode } from "@/lib/showtime/operator-session";
import { displayStoryVideoFilename, resolveStoryVideoUrl } from "@/lib/showtime/video-url";

function resolveScreenRoomCode(): string {
  const url = readUrlRoomCode();
  if (url.length >= 3) return url;
  const stored = readStoredOperatorCode();
  if (stored.length >= 3) return stored;
  return "";
}

/** Debounce window for re-fetching vote tallies after a raw `votes` row change. */
const VOTE_TALLY_DEBOUNCE_MS = 300;

export function useScreenSupabaseDisplay() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const syncSupabaseEventMeta = useMockEventStore((s) => s.syncSupabaseEventMeta);

  const urlBoundCode = useMemo(() => readUrlRoomCode(), []);
  const [eventCode, setEventCode] = useState(() => resolveScreenRoomCode());
  const [event, setEvent] = useState<EventRow | null>(null);
  const [currentNode, setCurrentNode] = useState<StoryNodeRow | null>(null);
  const [tallies, setTallies] = useState({ a: 0, b: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rtGeneration, setRtGeneration] = useState(0);

  const bootstrapGenerationRef = useRef(0);

  useEffect(() => {
    if (urlBoundCode.length >= 3) {
      setEventCode((prev) => (prev === urlBoundCode ? prev : urlBoundCode));
      try {
        writeStoredOperatorCode(urlBoundCode);
      } catch {
        /* ignore */
      }
    }
  }, [urlBoundCode]);

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
    const generation = ++bootstrapGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      const code = (urlBoundCode.length >= 3 ? urlBoundCode : eventCode).trim().toUpperCase();
      if (code.length < 3) {
        if (generation !== bootstrapGenerationRef.current) return;
        setEvent(null);
        setError("Missing room code. Use the link or QR for this screening, or add ?code= to the URL.");
        return;
      }
      const ev = await getEventByCode(supabase, code);
      if (generation !== bootstrapGenerationRef.current) return;
      if (!ev) {
        setEvent(null);
        setError(`No event found for code “${code}”.`);
        return;
      }
      eventRef.current = ev;
      setEvent(ev);
      setEventCode(ev.code);
      syncSupabaseEventMeta({ eventId: ev.id, code: ev.code, title: ev.title });
      try {
        writeStoredOperatorCode(ev.code);
      } catch {
        /* ignore */
      }
      await refreshCurrentNode(ev);
      if (generation !== bootstrapGenerationRef.current) return;
      await refreshTallies();
    } catch (e) {
      if (generation !== bootstrapGenerationRef.current) return;
      setError(friendlySupabaseError(e));
      setEvent(null);
    } finally {
      if (generation === bootstrapGenerationRef.current) setLoading(false);
    }
  }, [supabase, eventCode, urlBoundCode, syncSupabaseEventMeta, refreshCurrentNode, refreshTallies]);

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

    const debouncedRefreshTallies = debounce(refreshTallies, VOTE_TALLY_DEBOUNCE_MS);
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
        () => debouncedRefreshTallies(),
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
      debouncedRefreshTallies.cancel();
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

  /**
   * Warm BOTH branch candidates while voting is open — branching is always A/B, so both possible
   * next reels are already knowable the moment a beat starts. This is what actually removes the
   * between-beat spinner: by the time the winner is revealed, the browser already has it cached.
   */
  const [voteWindowPrefetchSrcs, setVoteWindowPrefetchSrcs] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const ev = event;
      if (!supabase || !ev || ev.status !== "voting_open" || !currentNode) {
        if (!cancelled) setVoteWindowPrefetchSrcs([]);
        return;
      }
      const keys = [
        (currentNode.option_a_next_node_key ?? "").trim(),
        (currentNode.option_b_next_node_key ?? "").trim(),
      ].filter(Boolean);
      if (!keys.length) {
        if (!cancelled) setVoteWindowPrefetchSrcs([]);
        return;
      }
      try {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const nodes = await Promise.all(keys.map((k) => getStoryNodeByEventAndKey(supabase, ev.id, k)));
        if (cancelled) return;
        const urls = nodes
          .map((n) => (n ? resolveStoryVideoUrl(n.video_url, origin) : null))
          .filter((u): u is string => Boolean(u));
        setVoteWindowPrefetchSrcs(Array.from(new Set(urls)));
      } catch {
        if (!cancelled) setVoteWindowPrefetchSrcs([]);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [supabase, event, currentNode]);

  /** Prefetch set for the video element: both candidates while voting, the winner once revealed. */
  const prefetchReelSrcs = useMemo(() => {
    if (event?.status === "voting_open") return voteWindowPrefetchSrcs;
    if (event?.status === "winner_revealed" && nextReelSrc) return [nextReelSrc];
    return [];
  }, [event?.status, voteWindowPrefetchSrcs, nextReelSrc]);

  const winnerLabel = useMemo(() => {
    if (!event?.winner) return null;
    if (!currentNode) return event.winner === "A" ? "Option A" : "Option B";
    if (event.winner === "A") return currentNode.option_a_label?.trim() || "Option A";
    return currentNode.option_b_label?.trim() || "Option B";
  }, [event, currentNode]);

  const totalVotes = tallies.a + tallies.b;
  const pctA = totalVotes ? Math.round((tallies.a / totalVotes) * 1000) / 10 : 50;
  const pctB = totalVotes ? Math.round((tallies.b / totalVotes) * 1000) / 10 : 50;

  const displayCode = event?.code ?? (urlBoundCode.length >= 3 ? urlBoundCode : eventCode);

  return {
    supabase,
    supabaseConfigured: Boolean(supabase),
    loading,
    error,
    event,
    roomCode: displayCode,
    currentNode,
    tallies,
    pctA,
    pctB,
    countdownSec,
    winnerLabel,
    nextCueFilename,
    nextReelSrc,
    prefetchReelSrcs,
    reload: bootstrap,
  };
}
