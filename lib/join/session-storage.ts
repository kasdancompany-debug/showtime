import type { VoteChoice } from "@/types";

const PREFIX = "showtime.join.v2";

export function storageKey(eventCode: string) {
  return `${PREFIX}.${eventCode.toUpperCase()}`;
}

/** Persisted to localStorage: session identity only (Supabase is source of truth for votes). */
export interface JoinSessionDisk {
  sessionId: string;
  eventCode: string;
  joined: boolean;
  displayName?: string;
  tableNumber?: string;
}

/** Runtime join state (votes tracked in memory until synced to Supabase). */
export interface JoinSessionPersist extends JoinSessionDisk {
  /** story_node_id → choice (UI / optimistic; not authoritative). */
  votesByNodeId: Record<string, VoteChoice>;
  voteOutboundStatus?: Record<string, "pending" | "synced">;
}

function toDisk(p: JoinSessionPersist): JoinSessionDisk {
  return {
    sessionId: p.sessionId,
    eventCode: p.eventCode.toUpperCase(),
    joined: p.joined,
    displayName: p.displayName,
    tableNumber: p.tableNumber,
  };
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
    const parsed = JSON.parse(raw) as Partial<JoinSessionPersist> & Partial<{ audienceMemberId?: string }>;
    if (parsed.eventCode?.toUpperCase() !== eventCode.toUpperCase()) return null;
    const mintedSession = !parsed.sessionId;
    if (!parsed.sessionId) parsed.sessionId = newSessionId();
    const result: JoinSessionPersist = {
      sessionId: parsed.sessionId,
      eventCode: eventCode.toUpperCase(),
      joined: Boolean(parsed.joined),
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : "",
      tableNumber: typeof parsed.tableNumber === "string" ? parsed.tableNumber : "",
      votesByNodeId: {},
      voteOutboundStatus: {},
    };
    if (mintedSession) {
      try {
        window.localStorage.setItem(storageKey(eventCode), JSON.stringify(toDisk(result)));
      } catch {
        /* quota */
      }
    }
    return result;
  } catch {
    return null;
  }
}

export function saveJoinSession(data: JoinSessionPersist): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(data.eventCode), JSON.stringify(toDisk(data)));
  } catch {
    /* quota */
  }
}

export function clearJoinSession(eventCode: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(eventCode));
    /* legacy v1 keys */
    window.localStorage.removeItem(`showtime.join.v1.${eventCode.toUpperCase()}`);
  } catch {
    /* ignore */
  }
}

export function clearAllJoinSessions(): void {
  if (typeof window === "undefined") return;
  try {
    const drop: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(`${PREFIX}.`) || k?.startsWith("showtime.join.v1.")) drop.push(k);
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
      joined: false,
      displayName: "",
      tableNumber: "",
      votesByNodeId: {},
      voteOutboundStatus: {},
    } satisfies JoinSessionPersist);
  return {
    ...base,
    votesByNodeId: { ...base.votesByNodeId, [storyNodeId]: choice },
    voteOutboundStatus: base.voteOutboundStatus ?? {},
  };
}

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
