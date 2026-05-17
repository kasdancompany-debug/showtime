import type { StoryNodeId, VoteChoice, VotePhase } from "@/types";

/** Shapes to broadcast on `event:${eventId}` once Supabase Realtime is connected */

export type PlaybackCommand = "play" | "pause" | "restart" | "seek";

export type EventRealtimePayload =
  | {
      type: "playback";
      isPlaying: boolean;
      positionSec: number;
      nodeId: StoryNodeId;
      durationSec?: number | null;
    }
  | { type: "playback_command"; command: PlaybackCommand; offsetSec?: number }
  | { type: "node"; nodeId: StoryNodeId }
  | {
      type: "vote";
      phase: VotePhase;
      endsAt: number | null;
      totals: { a: number; b: number };
      revealedWinner: VoteChoice | null;
      /** Hybrid / local room: lets phones render the live ballot without sharing Zustand */
      eventTitle?: string;
      question?: string | null;
      optionALabel?: string;
      optionBLabel?: string;
      voteNodeId?: StoryNodeId | null;
      /** Hybrid rooms: host allows one-tap join without a custom callsign */
      allowAnonymousQuickJoin?: boolean;
      /** Poll length when opened (seconds); audience countdown ring max. */
      pollDurationSec?: number;
      /** Live share A / B for hero bars (0–100). */
      pctA?: number;
      pctB?: number;
      totalVotes?: number;
      /** Leader clock for countdown drift correction */
      serverNowMs?: number;
    }
  /** Phone → room; ingested once per `clientVoteId` on host + projector tabs */
  | { type: "audience_vote"; clientVoteId: string; choice: VoteChoice }
  /** /screen tab heartbeat so /host can warn when no projector surface is listening */
  | { type: "surface_heartbeat"; surface: "screen"; sentAt: number }
  /** Host → screen: align playback clock after drift or reconnect */
  | {
      type: "playback_resync";
      nodeId: StoryNodeId;
      positionSec: number;
      isPlaying: boolean;
      durationSec?: number | null;
    }
  /** /screen → host: surface playback issues so the operator desk sees them */
  | {
      type: "projection_alert";
      kind: "video_error" | "video_recovered";
      message: string;
      nodeId?: StoryNodeId;
    };
