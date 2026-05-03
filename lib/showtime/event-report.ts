import type { StoryNodeId, VoteChoice } from "@/types";

export type ShowtimeReportSegment = {
  id: string;
  voteNodeId: StoryNodeId;
  voteNodeTitle: string;
  votesA: number;
  votesB: number;
  winner: VoteChoice;
  landedNodeId: StoryNodeId;
  landedTitle: string;
  at: number;
};

export type ShowtimeEventReportPayload = {
  exportedAt: string;
  eventTitle: string;
  eventCode: string;
  audienceConnected: number;
  /** Current playhead */
  currentNodeId: StoryNodeId;
  currentNodeTitle: string;
  /** Engine phase when exported */
  enginePhase: string;
  /** Completed branches after reveal + advance */
  segments: ShowtimeReportSegment[];
  /** Ordered node ids visited via winning branches */
  winningPathNodeIds: StoryNodeId[];
  /** Live poll snapshot when a vote is still open */
  openPoll: null | {
    voteNodeId: StoryNodeId;
    votesA: number;
    votesB: number;
  };
};

export function buildWinningPathFromSegments(
  graphRootId: StoryNodeId,
  segments: ShowtimeReportSegment[],
): StoryNodeId[] {
  const ids: StoryNodeId[] = [graphRootId];
  for (const seg of segments) {
    if (ids[ids.length - 1] !== seg.voteNodeId) ids.push(seg.voteNodeId);
    ids.push(seg.landedNodeId);
  }
  return ids;
}

export function buildShowtimeEventReportPayload(input: {
  eventTitle: string;
  eventCode: string;
  audienceConnected: number;
  graphRootId: StoryNodeId;
  currentNodeId: StoryNodeId;
  currentNodeTitle: string;
  enginePhase: string;
  segments: ShowtimeReportSegment[];
  voteOpen: boolean;
  voteNodeId: StoryNodeId | null;
  talliesA: number;
  talliesB: number;
}): ShowtimeEventReportPayload {
  const openPoll =
    input.voteOpen && input.voteNodeId
      ? {
          voteNodeId: input.voteNodeId,
          votesA: input.talliesA,
          votesB: input.talliesB,
        }
      : null;

  return {
    exportedAt: new Date().toISOString(),
    eventTitle: input.eventTitle,
    eventCode: input.eventCode,
    audienceConnected: input.audienceConnected,
    currentNodeId: input.currentNodeId,
    currentNodeTitle: input.currentNodeTitle,
    enginePhase: input.enginePhase,
    segments: input.segments,
    winningPathNodeIds: buildWinningPathFromSegments(input.graphRootId, input.segments),
    openPoll,
  };
}

export function formatShowtimeEventReportText(r: ShowtimeEventReportPayload): string {
  const lines: string[] = [
    `Showtime event report`,
    `Exported: ${r.exportedAt}`,
    `Title: ${r.eventTitle}`,
    `Code: ${r.eventCode}`,
    `Audience headcount (mock room): ${r.audienceConnected}`,
    `Playhead: ${r.currentNodeTitle} (${r.currentNodeId})`,
    `Engine phase: ${r.enginePhase}`,
    ``,
  ];
  if (r.openPoll) {
    lines.push(`Open poll (live)`, `  Node: ${r.openPoll.voteNodeId}`, `  Tallies: A=${r.openPoll.votesA} · B=${r.openPoll.votesB}`, ``);
  }
  lines.push(`Winning path (node ids): ${r.winningPathNodeIds.join(" → ") || "—"}`, ``);
  lines.push(`Completed vote rounds (${r.segments.length})`);
  if (r.segments.length === 0) {
    lines.push(
      "  (none — after each reveal, use Advance to log the round in this report.)",
      ``,
    );
  } else {
    for (const s of r.segments) {
      lines.push(
        `— ${s.voteNodeTitle} (${s.voteNodeId})`,
        `    Votes: A=${s.votesA} · B=${s.votesB}`,
        `    Winner: Option ${s.winner}`,
        `    Advanced to: ${s.landedTitle} (${s.landedNodeId})`,
        `    At: ${new Date(s.at).toISOString()}`,
        ``,
      );
    }
  }
  return lines.join("\n");
}
