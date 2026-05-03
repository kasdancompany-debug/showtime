import type { StoryNodeId } from "./story";

export type VotePhase = "idle" | "countdown" | "open" | "closed" | "reveal";

export interface ShowtimeEvent {
  id: string;
  title: string;
  /** Short code printed on QR collateral */
  eventCode: string;
  storyGraphId: string;
  currentNodeId: StoryNodeId;
  createdAt: string;
}

export interface EventPlaybackState {
  isPlaying: boolean;
  positionSec: number;
  /** Known when the projector loads media metadata or receives telemetry */
  durationSec: number | null;
}
