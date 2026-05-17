import type { EventRealtimePayload } from "@/lib/realtime/payloads";
import { selectVoteDisplayNode } from "@/lib/store/presentation";
import type { MockEventStore } from "@/lib/store/mock-event-store";

type Slice = Pick<
  MockEventStore,
  | "engine"
  | "votePhase"
  | "voteEndsAt"
  | "votesA"
  | "votesB"
  | "revealedWinner"
  | "eventTitle"
  | "allowAnonymousQuickJoin"
  | "pollDurationSec"
>;

export function buildLocalPreviewVotePayload(s: Slice): Extract<EventRealtimePayload, { type: "vote" }> {
  const vn = selectVoteDisplayNode(s.engine);
  const totals = { a: s.votesA, b: s.votesB };
  const t = totals.a + totals.b;
  const pctA = t ? (totals.a / t) * 100 : 50;
  const pctB = t ? (totals.b / t) * 100 : 50;
  return {
    type: "vote",
    phase: s.votePhase,
    endsAt: s.voteEndsAt,
    totals,
    revealedWinner: s.revealedWinner,
    eventTitle: s.eventTitle,
    question: vn?.question ?? null,
    optionALabel: vn?.optionA?.label ?? "Option A",
    optionBLabel: vn?.optionB?.label ?? "Option B",
    voteNodeId: s.engine.voteNodeId ?? null,
    allowAnonymousQuickJoin: s.allowAnonymousQuickJoin,
    pollDurationSec: s.pollDurationSec,
    pctA,
    pctB,
    totalVotes: t,
    serverNowMs: Date.now(),
  };
}
