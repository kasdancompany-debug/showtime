export type StoryNodeId = string;

export interface StoryBranch {
  label: string;
  nextNodeId: StoryNodeId;
  /** Filename the operator plays manually after this branch wins (e.g. `02A_follow_david.mp4`). */
  nextClipName: string;
}

export interface StoryNode {
  id: StoryNodeId;
  title: string;
  /** Optional subtitle for builder / exports only. */
  subtitle: string | null;
  /**
   * Operator cue: filename for the reel playing on this beat (played externally — not by this app).
   * Example: `01_Opening.mp4`
   */
  operatorClipName: string;
  /**
   * Optional: video file stored in this browser’s IndexedDB (Story builder / film library).
   * Same machine + browser only. Live /host and /screen do not play this file.
   */
  localVideoKey: string | null;
  question: string | null;
  optionA: StoryBranch | null;
  optionB: StoryBranch | null;
  /** True when this node has no outgoing branches */
  isEnd: boolean;
}

export interface StoryGraph {
  nodes: Record<StoryNodeId, StoryNode>;
  rootId: StoryNodeId;
}
