"use client";

import { useEffect, useMemo } from "react";

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

  useEffect(() => {
    if (!client) return;
    void broadcastEventSync(client, eventId, {
      type: "vote",
      phase: votePhase,
      endsAt: voteEndsAt,
      totals: { a: votesA, b: votesB },
      revealedWinner,
      eventTitle,
      question: voteNode?.question ?? null,
      optionALabel: voteNode?.optionA?.label ?? "Option A",
      optionBLabel: voteNode?.optionB?.label ?? "Option B",
      voteNodeId: engine.voteNodeId,
      allowAnonymousQuickJoin,
    });
  }, [
    client,
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
  ]);
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
