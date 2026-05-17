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
