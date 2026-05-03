export type StoryNodeId = string;

export interface StoryBranch {
  label: string;
  nextNodeId: StoryNodeId;
}

export interface StoryNode {
  id: StoryNodeId;
  title: string;
  /** Short line under the title on screen / in outlines */
  subtitle: string | null;
  /** URL to hosted video (HLS/MP4), YouTube watch URL, or blob: URL */
  videoUrl: string | null;
  /** IndexedDB key for a file chosen in Story builder on this browser (same origin as /host and /screen). */
  localVideoKey?: string | null;
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
