import type { VotePhase } from "./event";

export type VoteChoice = "A" | "B";

export interface VoteTotals {
  a: number;
  b: number;
}

export interface VoteSessionState {
  phase: VotePhase;
  endsAt: number | null;
  revealedWinner: VoteChoice | null;
}
