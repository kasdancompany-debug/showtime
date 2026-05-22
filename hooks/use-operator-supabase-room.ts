"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { broadcastEventSync } from "@/lib/realtime/event-sync";
import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { openOrFocusProjector } from "@/lib/showtime/projector-arm";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { friendlySupabaseError } from "@/lib/supabase/operator-errors";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database, ShowtimeEventStatus, VoteAb } from "@/lib/supabase/database.types";
import {
  deleteAudienceMembersForEvent,
  deleteVotesForEvent,
  fetchAudienceMemberCount,
  fetchVoteTalliesForNode,
  getEventByCode,
  listStoryNodesForEvent,
  updateEvent,
  type EventRow,
  type StoryNodeRow,
} from "@/lib/supabase/event-room";
import { withPlaybackCommand } from "@/lib/supabase/playback-command";
import { hasStoryVideoUrl, resolveStoryVideoUrl } from "@/lib/showtime/video-url";

import { readStoredOperatorCode, writeStoredOperatorCode } from "@/lib/showtime/operator-session";

function pageOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function sortNodes(nodes: StoryNodeRow[]): StoryNodeRow[] {
  return [...nodes].sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key));
}

function isVoteableNode(n: StoryNodeRow | null | undefined): boolean {
  if (!n) return false;
  return Boolean(
    n.question?.trim() &&
      n.option_a_label?.trim() &&
      n.option_b_label?.trim() &&
      n.option_a_next_node_key?.trim() &&
      n.option_b_next_node_key?.trim(),
  );
}

function clipLabelFromUrl(url: string): string {
  const noq = url.split(/[?#]/)[0] ?? url;
  const seg = noq.split("/").filter(Boolean).pop();
  return seg || url;
}

function playNextLine(event: EventRow, nodesByKey: Map<string, StoryNodeRow>, nodesById: Map<string, StoryNodeRow>): string {
  const origin = pageOrigin();
  if (event.status === "playing") {
    return "Video is playing on /screen.";
  }
  if (event.status === "paused") {
    return "Playback is paused on /screen.";
  }
  if (event.status === "video_ended") {
    return "Open vote when you are ready.";
  }
  if (event.status === "winner_revealed" && event.winner && event.current_node_id) {
    const vn = nodesById.get(event.current_node_id);
    if (!vn) return "Advance when you have cued the room.";
    const nextKey = event.winner === "A" ? vn.option_a_next_node_key : vn.option_b_next_node_key;
    const next = nextKey?.trim() ? nodesByKey.get(nextKey.trim()) : null;
    const url = next && resolveStoryVideoUrl(next.video_url, origin);
    if (next && url) return `Tap Play next reel — ${clipLabelFromUrl(url)} will start on /screen`;
    if (next && !url) return "Cue next beat (no playable reel URL on that beat yet).";
    return "Advance to apply the winning branch.";
  }
  if (event.current_node_id) {
    const cur = nodesById.get(event.current_node_id);
    const url = cur && resolveStoryVideoUrl(cur.video_url, origin);
    if (url) return `Play on screen: ${clipLabelFromUrl(url)}`;
    const title = cur?.title?.trim();
    if (title) {
      return `This beat (“${title}”) has no playable video. Open Show builder and assign a reel.`;
    }
    return "This beat has no playable video. Open Show builder and assign a reel.";
  }
  return "Load a show on this page to see the next operator step.";
}

function resolveInitialOperatorCode(boundRoomCode?: string): string {
  const bound = boundRoomCode?.trim().toUpperCase() ?? "";
  if (bound.length >= 3) return bound;
  if (typeof window !== "undefined") {
    const stored = readStoredOperatorCode();
    if (stored.length >= 3) return stored;
  }
  return "";
}

export function useOperatorSupabaseRoom(options?: { boundRoomCode?: string }) {
  const boundRoomCode = options?.boundRoomCode?.trim().toUpperCase() ?? "";
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const syncSupabaseEventMeta = useMockEventStore((s) => s.syncSupabaseEventMeta);

  const [eventCode, setEventCode] = useState(() => resolveInitialOperatorCode(boundRoomCode));
  const [event, setEvent] = useState<EventRow | null>(null);
  const [nodes, setNodes] = useState<StoryNodeRow[]>([]);
  const [tallies, setTallies] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  const [audienceCount, setAudienceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGenerationRef = useRef(0);

  useEffect(() => {
    if (boundRoomCode.length < 3) return;
    setEventCode((prev) => (prev === boundRoomCode ? prev : boundRoomCode));
    try {
      writeStoredOperatorCode(boundRoomCode);
    } catch {
      /* ignore */
    }
  }, [boundRoomCode]);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const nodesByKey = useMemo(() => new Map(nodes.map((n) => [n.node_key, n])), [nodes]);

  const currentNode = event?.current_node_id ? nodesById.get(event.current_node_id) ?? null : null;

  const voteNode = useMemo(() => {
    if (!event) return null;
    if (["voting_open", "voting_closed", "winner_revealed"].includes(event.status)) return currentNode;
    return null;
  }, [event, currentNode]);

  const eventRef = useRef(event);
  eventRef.current = event;

  const refreshTallies = useCallback(async () => {
    const ev = eventRef.current;
    if (!supabase || !ev?.id || !ev.current_node_id || ev.status !== "voting_open") {
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

  const loadEvent = useCallback(async () => {
    if (!supabase) {
      setBootError(null);
      setEvent(null);
      setNodes([]);
      setLoading(false);
      return;
    }
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setBootError(null);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) {
        if (generation !== loadGenerationRef.current) return;
        setBootError(anon.message);
        setEvent(null);
        setNodes([]);
        return;
      }
      const code = eventCode.trim().toUpperCase();
      if (code.length < 3) {
        if (generation !== loadGenerationRef.current) return;
        setBootError("Enter an event code of at least three letters.");
        setEvent(null);
        setNodes([]);
        return;
      }
      const ev = await getEventByCode(supabase, code);
      if (generation !== loadGenerationRef.current) return;
      if (!ev) {
        setBootError(`No live event is published for code “${code}”. Launch this experience first, or check the code.`);
        setEvent(null);
        setNodes([]);
        return;
      }
      const list = await listStoryNodesForEvent(supabase, ev.id);
      if (generation !== loadGenerationRef.current) return;
      setEvent(ev);
      setNodes(list);
      syncSupabaseEventMeta({ eventId: ev.id, code: ev.code, title: ev.title });
      try {
        writeStoredOperatorCode(ev.code);
      } catch {
        /* ignore */
      }
      const count = await fetchAudienceMemberCount(supabase, ev.id);
      if (generation !== loadGenerationRef.current) return;
      setAudienceCount(count);
      if (ev.current_node_id && ev.status === "voting_open") {
        const t = await fetchVoteTalliesForNode(supabase, ev.id, ev.current_node_id);
        if (generation !== loadGenerationRef.current) return;
        setTallies(t);
      } else {
        setTallies({ a: 0, b: 0 });
      }
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      setBootError(friendlySupabaseError(e));
      setEvent(null);
      setNodes([]);
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [supabase, eventCode, syncSupabaseEventMeta]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    if (!supabase || !event?.id) return;
    const ch = supabase
      .channel(`operator-event-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `id=eq.${event.id}` },
        (payload) => {
          const row = payload.new as EventRow;
          if (row?.id) {
            setEvent(row);
            syncSupabaseEventMeta({ eventId: row.id, code: row.code, title: row.title });
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
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, event?.id, refreshTallies, syncSupabaseEventMeta]);

  useEffect(() => {
    if (!supabase || !event?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const n = await fetchAudienceMemberCount(supabase, event.id);
        if (!cancelled) setAudienceCount(n);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [supabase, event?.id]);

  useEffect(() => {
    void refreshTallies();
  }, [refreshTallies, event?.status, event?.current_node_id]);

  const performFullReset = useCallback(async () => {
    if (!supabase || !event) throw new Error("No event loaded.");
    const sorted = sortNodes(nodes);
    const first = sorted[0];
    if (!first) throw new Error("This event has no story beats to reset to.");
    await deleteVotesForEvent(supabase, event.id);
    await deleteAudienceMembersForEvent(supabase, event.id);
    await updateEvent(supabase, event.id, {
      status: "setup",
      current_node_id: first.id,
      winner: null,
      vote_ends_at: null,
      screen_show_closed_tally: false,
      screen_show_live_vote_counts: true,
      ...withPlaybackCommand("load", { playback_position_seconds: 0 }),
    });
  }, [supabase, event, nodes]);

  const primary = useMemo(() => {
    if (!event) return { label: "Load show" as const, disabled: true, reason: "Enter the event code in the drawer and tap Load show.", run: null as (() => Promise<void>) | null };
    const st = event.status;
    if (st === "setup") {
      return {
        label: "Open pre-show on projector" as const,
        disabled: false,
        reason: null as string | null,
        run: async () => {
          await updateEvent(supabase!, event.id, {
            status: "ready",
            ...withPlaybackCommand("load", { playback_position_seconds: 0 }),
          });
        },
      };
    }
    if (st === "ready") {
      const canPlay = Boolean(
        currentNode && hasStoryVideoUrl(currentNode.video_url),
      );
      const label = currentNode?.is_ending ? ("Play finale reel on projector" as const) : ("Start this reel on projector" as const);
      return {
        label,
        disabled: !canPlay,
        reason: !canPlay
          ? "This beat needs a working video URL in Show builder (https://… or /videos/…)."
          : null,
        run: async () => {
          await updateEvent(supabase!, event.id, {
            status: "playing",
            ...withPlaybackCommand("play", { playback_position_seconds: 0 }),
          });
        },
      };
    }
    if (st === "playing") {
      return {
        label: "Stop reel and go to vote" as const,
        disabled: false,
        reason: null as string | null,
        run: async () => {
          await updateEvent(supabase!, event.id, {
            status: "video_ended",
            ...withPlaybackCommand("pause"),
          });
        },
      };
    }
    if (st === "paused") {
      return {
        label: "Continue reel on projector" as const,
        disabled: false,
        reason: null as string | null,
        run: async () => {
          await updateEvent(supabase!, event.id, {
            status: "playing",
            ...withPlaybackCommand("play", { playback_position_seconds: event.playback_position_seconds ?? 0 }),
          });
        },
      };
    }
    if (st === "video_ended") {
      const ok = isVoteableNode(currentNode);
      return {
        label: "Open voting on phones" as const,
        disabled: !ok,
        reason: !ok
          ? "Add the question, both choices, and next beats in Show builder for this beat."
          : null,
        run: async () => {
          await updateEvent(supabase!, event.id, {
            status: "voting_open",
            vote_ends_at: null,
          });
        },
      };
    }
    if (st === "voting_open") {
      return {
        label: "Close voting (lock phones)" as const,
        disabled: false,
        reason: null as string | null,
        run: async () => {
          await updateEvent(supabase!, event.id, { status: "voting_closed" });
        },
      };
    }
    if (st === "voting_closed") {
      return {
        label: "Reveal vote winner" as const,
        disabled: false,
        reason: null as string | null,
        run: async () => {
          if (!event.current_node_id) return;
          if (event.winner) {
            await updateEvent(supabase!, event.id, { status: "winner_revealed" });
            return;
          }
          const { a, b } = await fetchVoteTalliesForNode(supabase!, event.id, event.current_node_id);
          if (a === 0 && b === 0) {
            throw new Error(
              "No votes yet. Tap Force A or Force B under Winner (or in Audience vote below), then reveal again.",
            );
          }
          if (a === b) {
            throw new Error(
              "The vote is tied. Tap Force A or Force B under Winner (or in Audience vote below), then reveal again.",
            );
          }
          const w: VoteAb = a > b ? "A" : "B";
          await updateEvent(supabase!, event.id, { status: "winner_revealed", winner: w });
        },
      };
    }
    if (st === "winner_revealed") {
      const currentId = event.current_node_id;
      const ok = Boolean(event.winner && currentId);
      const vn = ok && currentId ? nodesById.get(currentId) : undefined;
      const nextKeyRaw =
        vn && event.winner ? (event.winner === "A" ? vn.option_a_next_node_key : vn.option_b_next_node_key) : null;
      const nextBeat = nextKeyRaw?.trim() ? nodesByKey.get(nextKeyRaw.trim()) : null;
      const canFollowBranch = Boolean(nextBeat);
      const playableNextReel = Boolean(nextBeat && hasStoryVideoUrl(nextBeat.video_url));

      let label = "Cue next beat on projector";
      if (playableNextReel && nextBeat?.is_ending) label = "Play finale reel on projector";
      else if (playableNextReel) label = "Play next reel on projector";

      return {
        label,
        disabled: !ok || !canFollowBranch,
        reason: !ok ? "Reveal a winner before advancing." : !canFollowBranch ? "Link the winner to a next beat in Show builder." : null,
        run: async () => {
          if (!event.winner || !event.current_node_id) return;
          const voteNode = nodesById.get(event.current_node_id);
          if (!voteNode) throw new Error("Vote beat is missing from the story.");
          const nk =
            event.winner === "A" ? voteNode.option_a_next_node_key : voteNode.option_b_next_node_key;
          const next = nk?.trim() ? nodesByKey.get(nk.trim()) : null;
          if (!next) throw new Error("The winning choice does not point to a next beat.");
          const playable = hasStoryVideoUrl(next.video_url);
          const base: Pick<
            Database["public"]["Tables"]["events"]["Update"],
            "current_node_id" | "winner" | "vote_ends_at"
          > = {
            current_node_id: next.id,
            winner: null,
            vote_ends_at: null,
          };
          if (playable) {
            await updateEvent(supabase!, event.id, {
              ...base,
              status: "playing",
              ...withPlaybackCommand("play", { playback_position_seconds: 0 }),
            });
          } else {
            await updateEvent(supabase!, event.id, {
              ...base,
              status: "ready",
              ...withPlaybackCommand("load", { playback_position_seconds: 0 }),
            });
          }
        },
      };
    }
    if (st === "ended") {
      return {
        label: "Reset show to start" as const,
        disabled: false,
        reason: null as string | null,
        run: performFullReset,
      };
    }
    return { label: "Continue" as const, disabled: true, reason: "Unknown status.", run: null };
  }, [event, currentNode, nodesById, nodesByKey, supabase, performFullReset]);

  const nextInstruction = useMemo(() => {
    if (!event) return "Load an event to see the next step.";
    return playNextLine(event, nodesByKey, nodesById);
  }, [event, nodesByKey, nodesById]);

  const showForce = Boolean(event && (event.status === "voting_open" || event.status === "voting_closed"));

  const runPrimary = useCallback(async () => {
    if (!supabase || !primary.run) return;
    setBusy(true);
    setActionError(null);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) throw new Error(anon.message);
      await primary.run();
      await loadEvent();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : friendlySupabaseError(e));
    } finally {
      setBusy(false);
    }
  }, [supabase, primary, loadEvent]);

  const resetEventToStart = useCallback(async () => {
    if (!supabase || !event) return;
    setBusy(true);
    setActionError(null);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) throw new Error(anon.message);
      await performFullReset();
      await loadEvent();
    } catch (e) {
      setActionError(friendlySupabaseError(e));
    } finally {
      setBusy(false);
    }
  }, [supabase, event, performFullReset, loadEvent]);

  const setScreenShowClosedTally = useCallback(
    async (value: boolean) => {
      if (!supabase || !event) return;
      setBusy(true);
      setActionError(null);
      try {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) throw new Error(anon.message);
        await updateEvent(supabase, event.id, { screen_show_closed_tally: value });
        await loadEvent();
      } catch (e) {
        setActionError(friendlySupabaseError(e));
      } finally {
        setBusy(false);
      }
    },
    [supabase, event, loadEvent],
  );

  const setScreenShowLiveVoteCounts = useCallback(
    async (value: boolean) => {
      if (!supabase || !event) return;
      setBusy(true);
      setActionError(null);
      try {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) throw new Error(anon.message);
        await updateEvent(supabase, event.id, { screen_show_live_vote_counts: value });
        await loadEvent();
      } catch (e) {
        setActionError(friendlySupabaseError(e));
      } finally {
        setBusy(false);
      }
    },
    [supabase, event, loadEvent],
  );

  const setScreenIdlePosterUrl = useCallback(
    async (url: string | null) => {
      if (!supabase || !event) return;
      setBusy(true);
      setActionError(null);
      try {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) throw new Error(anon.message);
        await updateEvent(supabase, event.id, { screen_idle_poster_url: url });
        await loadEvent();
      } catch (e) {
        setActionError(friendlySupabaseError(e));
      } finally {
        setBusy(false);
      }
    },
    [supabase, event, loadEvent],
  );

  const forceWinner = useCallback(
    async (choice: VoteAb) => {
      if (!supabase || !event) return;
      setBusy(true);
      setActionError(null);
      try {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) throw new Error(anon.message);
        const patch: Database["public"]["Tables"]["events"]["Update"] =
          event.status === "voting_open" ? { winner: choice, status: "voting_closed" } : { winner: choice };
        await updateEvent(supabase, event.id, patch);
        await loadEvent();
      } catch (e) {
        setActionError(friendlySupabaseError(e));
      } finally {
        setBusy(false);
      }
    },
    [supabase, event, loadEvent],
  );

  const runPlaybackPatch = useCallback(
    async (patch: Database["public"]["Tables"]["events"]["Update"]) => {
      if (!supabase || !event) return;
      setBusy(true);
      setActionError(null);
      try {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) throw new Error(anon.message);
        await updateEvent(supabase, event.id, patch);
        await loadEvent();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : friendlySupabaseError(e));
      } finally {
        setBusy(false);
      }
    },
    [supabase, event, loadEvent],
  );

  const playbackLoadOnScreen = useCallback(async () => {
    if (!event) return;
    if (event.status === "setup") {
      await runPlaybackPatch({
        status: "ready",
        ...withPlaybackCommand("load", { playback_position_seconds: 0 }),
      });
      return;
    }
    await runPlaybackPatch(withPlaybackCommand("load", { playback_position_seconds: 0 }));
  }, [event, runPlaybackPatch]);

  const playbackPlay = useCallback(async () => {
    if (!event) return;
    openOrFocusProjector(true);
    if (supabase && event.id) {
      void broadcastEventSync(supabase, event.id, { type: "projector_play_gesture", sentAt: Date.now() });
    }
    await runPlaybackPatch({
      status: "playing",
      ...withPlaybackCommand("play", { playback_position_seconds: 0 }),
    });
  }, [event, runPlaybackPatch, supabase]);

  const playbackPause = useCallback(async () => {
    if (!event) return;
    await runPlaybackPatch({
      status: "paused",
      ...withPlaybackCommand("pause"),
    });
  }, [event, runPlaybackPatch]);

  const playbackRestart = useCallback(async () => {
    if (!event) return;
    openOrFocusProjector(true);
    if (supabase && event.id) {
      void broadcastEventSync(supabase, event.id, { type: "projector_play_gesture", sentAt: Date.now() });
    }
    await runPlaybackPatch({
      ...withPlaybackCommand("restart"),
    });
  }, [event, runPlaybackPatch, supabase]);

  const markVideoEnded = useCallback(async () => {
    if (!event) return;
    await runPlaybackPatch({
      status: "video_ended",
      ...withPlaybackCommand("pause"),
    });
  }, [event, runPlaybackPatch]);

  const statusLabel = useMemo(() => {
    if (!event) return "No event loaded yet";
    const m: Record<ShowtimeEventStatus, string> = {
      setup: "Pre-show — projector idle",
      ready: "Reel loaded — press play when ready",
      playing: "Reel is playing on projector",
      paused: "Reel paused on projector",
      video_ended: "Reel finished — time to vote",
      voting_open: "Audience is voting",
      voting_closed: "Voting closed — reveal when ready",
      winner_revealed: "Winner on screen — play next reel when ready",
      ended: "Show finished",
    };
    return m[event.status] ?? "Status unclear; try reloading the event.";
  }, [event]);

  const winnerDisplay = useMemo(() => {
    if (!event) return "";
    if (event.status === "winner_revealed" || event.status === "ended") {
      return event.winner ? `Option ${event.winner}` : "Winner not recorded yet";
    }
    if (event.status === "voting_open") {
      if (tallies.a === tallies.b) return tallies.a === 0 ? "No votes yet" : "Tied";
      return tallies.a > tallies.b ? "Option A leading" : "Option B leading";
    }
    if (event.status === "voting_closed") {
      if (event.winner) return `Locked: Option ${event.winner} (operator)`;
      if (tallies.a === tallies.b) return tallies.a === 0 ? "No votes" : "Tied: use Override A or B";
      return tallies.a > tallies.b ? "Would win: A" : "Would win: B";
    }
    return "";
  }, [event, tallies]);

  const advanceEndsShow = useMemo(() => {
    if (!event || event.status !== "winner_revealed" || !event.winner || !event.current_node_id) return false;
    const vn = nodesById.get(event.current_node_id);
    const nextKey = event.winner === "A" ? vn?.option_a_next_node_key : vn?.option_b_next_node_key;
    const next = nextKey?.trim() ? nodesByKey.get(nextKey.trim()) : null;
    return Boolean(next?.is_ending);
  }, [event, nodesById, nodesByKey]);

  const currentBeatVoteable = useMemo(() => isVoteableNode(currentNode), [currentNode]);

  return {
    supabaseConfigured: Boolean(supabase),
    eventCode,
    setEventCode,
    reload: loadEvent,
    loading,
    bootError,
    actionError,
    clearActionError: () => setActionError(null),
    busy,
    event,
    nodes,
    currentNode,
    voteNode,
    tallies,
    audienceCount,
    primary,
    runPrimary,
    forceWinner,
    showForce,
    nextInstruction,
    statusLabel,
    winnerDisplay,
    nodesByKey,
    advanceEndsShow,
    currentBeatVoteable,
    resetEventToStart,
    setScreenShowClosedTally,
    setScreenShowLiveVoteCounts,
    setScreenIdlePosterUrl,
    playbackLoadOnScreen,
    playbackPlay,
    playbackPause,
    playbackRestart,
    markVideoEnded,
  };
}
