"use client";

import { useCallback, useEffect, useMemo } from "react";

import { broadcastEventSync, subscribeEventSync } from "@/lib/realtime/event-sync";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { selectVoteDisplayNode } from "@/lib/store/presentation";
import { useMockEventStore } from "@/lib/store/mock-event-store";

/**
 * Host + projector: push vote phase / copy / tallies so phones on the same Realtime channel stay aligned.
 */
export function useVoteStateBroadcaster() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const eventId = useMockEventStore((s) => s.eventId);
  const eventTitle = useMockEventStore((s) => s.eventTitle);
  const votePhase = useMockEventStore((s) => s.votePhase);
  const voteEndsAt = useMockEventStore((s) => s.voteEndsAt);
  const votesA = useMockEventStore((s) => s.votesA);
  const votesB = useMockEventStore((s) => s.votesB);
  const revealedWinner = useMockEventStore((s) => s.revealedWinner);
  const engine = useMockEventStore((s) => s.engine);

  const voteNode = useMemo(() => selectVoteDisplayNode(engine), [engine]);
  const allowAnonymousQuickJoin = useMockEventStore((s) => s.allowAnonymousQuickJoin);
  const pollDurationSec = useMockEventStore((s) => s.pollDurationSec);

  const pushVotePayload = useCallback(() => {
    if (!client) return;
    const ta = useMockEventStore.getState().votesA;
    const tb = useMockEventStore.getState().votesB;
    const tot = ta + tb;
    const pctA = tot ? Math.round((ta / tot) * 1000) / 10 : 50;
    const pctB = tot ? Math.round((tb / tot) * 1000) / 10 : 50;
    const st = useMockEventStore.getState();
    const vn = selectVoteDisplayNode(st.engine);
    void broadcastEventSync(client, st.eventId, {
      type: "vote",
      phase: st.votePhase,
      endsAt: st.voteEndsAt,
      totals: { a: ta, b: tb },
      revealedWinner: st.revealedWinner,
      eventTitle: st.eventTitle,
      question: vn?.question ?? null,
      optionALabel: vn?.optionA?.label ?? "Option A",
      optionBLabel: vn?.optionB?.label ?? "Option B",
      voteNodeId: st.engine.voteNodeId,
      allowAnonymousQuickJoin: st.allowAnonymousQuickJoin,
      pollDurationSec: st.pollDurationSec,
      pctA,
      pctB,
      totalVotes: tot,
      serverNowMs: Date.now(),
    });
  }, [client]);

  useEffect(() => {
    pushVotePayload();
  }, [
    pushVotePayload,
    eventId,
    eventTitle,
    votePhase,
    voteEndsAt,
    votesA,
    votesB,
    revealedWinner,
    voteNode,
    engine.voteNodeId,
    allowAnonymousQuickJoin,
    pollDurationSec,
  ]);

  /** ~1 Hz clock + tally heartbeat during open polls (WebSocket fan-out; keeps phones aligned). */
  useEffect(() => {
    if (!client || votePhase !== "open") return;
    const id = window.setInterval(() => pushVotePayload(), 1000);
    return () => window.clearInterval(id);
  }, [client, votePhase, pushVotePayload]);
}

/**
 * Apply audience votes received from phones (deduped in the store).
 */
export function useAudienceVoteIngest() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const eventId = useMockEventStore((s) => s.eventId);
  const recordRemoteAudienceVote = useMockEventStore((s) => s.recordRemoteAudienceVote);

  useEffect(() => {
    return subscribeEventSync(client, eventId, (p) => {
      if (p.type === "audience_vote") {
        recordRemoteAudienceVote(p.clientVoteId, p.choice);
      }
    });
  }, [client, eventId, recordRemoteAudienceVote]);
}

/** Host desk: log projection surface alerts broadcast from /screen. */
export function useProjectionAlertIngest() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const eventId = useMockEventStore((s) => s.eventId);
  const appendActivityLog = useMockEventStore((s) => s.appendActivityLog);
  const setProjectionSurfaceFault = useMockEventStore((s) => s.setProjectionSurfaceFault);

  useEffect(() => {
    return subscribeEventSync(client, eventId, (p) => {
      if (p.type === "projection_alert") {
        appendActivityLog(p.message);
        if (p.kind === "video_error") setProjectionSurfaceFault(p.message);
        if (p.kind === "video_recovered") setProjectionSurfaceFault(null);
      }
    });
  }, [client, eventId, appendActivityLog, setProjectionSurfaceFault]);
}
