import type { VoteChoice } from "@/types";

const PREFIX = "showtime.join.v1";

export function storageKey(eventCode: string) {
  return `${PREFIX}.${eventCode.toUpperCase()}`;
}

export interface JoinSessionPersist {
  /** Stable client id for this phone (survives refresh). */
  sessionId: string;
  eventCode: string;
  displayName: string;
  tableNumber: string;
  joined: boolean;
  /** Supabase audience_members.id after insert */
  audienceMemberId?: string;
  /** story_node_id → choice for this session (prevents double vote per node). */
  votesByNodeId: Record<string, VoteChoice>;
  /**
   * Hosted Supabase / hybrid: whether the choice has been acknowledged by the server (or hybrid broadcast).
   * Missing entries for a saved vote are treated as synced (legacy sessions).
   */
  voteOutboundStatus?: Record<string, "pending" | "synced">;
}

export function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function loadJoinSession(eventCode: string): JoinSessionPersist | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(eventCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JoinSessionPersist;
    if (parsed.eventCode?.toUpperCase() !== eventCode.toUpperCase()) return null;
    if (!parsed.sessionId) parsed.sessionId = newSessionId();
    if (!parsed.votesByNodeId) parsed.votesByNodeId = {};
    if (!parsed.voteOutboundStatus) parsed.voteOutboundStatus = {};
    return parsed;
  } catch {
    return null;
  }
}

export function saveJoinSession(data: JoinSessionPersist): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(data.eventCode), JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function clearJoinSession(eventCode: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(eventCode));
  } catch {
    /* ignore */
  }
}

/** Remove every persisted join session for this origin (prefix scan). */
export function clearAllJoinSessions(): void {
  if (typeof window === "undefined") return;
  try {
    const drop: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(`${PREFIX}.`)) drop.push(k);
    }
    for (const k of drop) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function recordVoteForNode(
  prev: JoinSessionPersist | null,
  eventCode: string,
  storyNodeId: string,
  choice: VoteChoice,
): JoinSessionPersist {
  const base: JoinSessionPersist =
    prev ??
    ({
      sessionId: newSessionId(),
      eventCode: eventCode.toUpperCase(),
      displayName: "",
      tableNumber: "",
      joined: false,
      votesByNodeId: {},
      voteOutboundStatus: {},
    } satisfies JoinSessionPersist);
  return {
    ...base,
    votesByNodeId: { ...base.votesByNodeId, [storyNodeId]: choice },
    voteOutboundStatus: base.voteOutboundStatus ?? {},
  };
}

/** Persist choice immediately and mark delivery as pending (unstable network). */
export function markVotePending(
  prev: JoinSessionPersist | null,
  eventCode: string,
  storyNodeId: string,
  choice: VoteChoice,
): JoinSessionPersist {
  const withVote = recordVoteForNode(prev, eventCode, storyNodeId, choice);
  return {
    ...withVote,
    voteOutboundStatus: { ...(withVote.voteOutboundStatus ?? {}), [storyNodeId]: "pending" },
  };
}

export function markVoteSynced(prev: JoinSessionPersist, storyNodeId: string): JoinSessionPersist {
  return {
    ...prev,
    voteOutboundStatus: { ...(prev.voteOutboundStatus ?? {}), [storyNodeId]: "synced" },
  };
}
