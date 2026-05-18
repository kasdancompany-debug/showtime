import type { VoteChoice } from "@/types";

/** Per-room audience identity — never use a single global participant id across rooms. */
export const PARTICIPANT_STORAGE_PREFIX = "showtime:participant:";

const LEGACY_JOIN_PREFIX = "showtime.join.v2.";

export type ParticipantRole = "audience";

export type RoomParticipantRecord = {
  participantId: string;
  roomCode: string;
  role: ParticipantRole;
  joined: boolean;
  displayName?: string;
  tableNumber?: string;
  /** Cached Supabase `audience_members.id` when known. */
  audienceMemberId?: string;
};

/** Runtime-only vote mirrors (not persisted). */
export type RoomParticipantRuntime = RoomParticipantRecord & {
  votesByNodeId: Record<string, VoteChoice>;
  voteOutboundStatus?: Record<string, "pending" | "synced">;
};

export function participantStorageKey(roomCode: string): string {
  return `${PARTICIPANT_STORAGE_PREFIX}${roomCode.trim().toUpperCase()}`;
}

export function mintParticipantId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function toPersisted(record: RoomParticipantRuntime): RoomParticipantRecord {
  return {
    participantId: record.participantId,
    roomCode: record.roomCode.toUpperCase(),
    role: "audience",
    joined: record.joined,
    displayName: record.displayName,
    tableNumber: record.tableNumber,
    audienceMemberId: record.audienceMemberId,
  };
}

function emptyRuntime(roomCode: string, participantId: string): RoomParticipantRuntime {
  return {
    participantId,
    roomCode: roomCode.toUpperCase(),
    role: "audience",
    joined: false,
    displayName: "",
    tableNumber: "",
    votesByNodeId: {},
    voteOutboundStatus: {},
  };
}

function parseRecord(raw: string, expectedRoom: string): RoomParticipantRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RoomParticipantRecord> & {
      sessionId?: string;
      eventCode?: string;
      role?: string;
    };
    const room = expectedRoom.toUpperCase();
    const code = (parsed.roomCode ?? parsed.eventCode)?.toUpperCase();
    if (code && code !== room) return null;
    const participantId = (parsed.participantId ?? parsed.sessionId)?.trim();
    if (!participantId) return null;
    if (parsed.role && parsed.role !== "audience") return null;
    return {
      participantId,
      roomCode: room,
      role: "audience",
      joined: Boolean(parsed.joined),
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : "",
      tableNumber: typeof parsed.tableNumber === "string" ? parsed.tableNumber : "",
      audienceMemberId:
        typeof parsed.audienceMemberId === "string" && parsed.audienceMemberId.trim()
          ? parsed.audienceMemberId.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

function loadLegacyJoinSession(roomCode: string): RoomParticipantRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${LEGACY_JOIN_PREFIX}${roomCode.toUpperCase()}`);
    if (!raw) return null;
    return parseRecord(raw, roomCode);
  } catch {
    return null;
  }
}

export function loadRoomParticipant(roomCode: string): RoomParticipantRuntime | null {
  if (typeof window === "undefined") return null;
  const room = roomCode.trim().toUpperCase();
  if (!room) return null;

  let disk: RoomParticipantRecord | null = null;
  try {
    const raw = window.localStorage.getItem(participantStorageKey(room));
    if (raw) disk = parseRecord(raw, room);
  } catch {
    disk = null;
  }

  if (!disk) disk = loadLegacyJoinSession(room);

  if (!disk) {
    const minted = mintParticipantId();
    const created = emptyRuntime(room, minted);
    saveRoomParticipant(created);
    return created;
  }

  return {
    ...disk,
    votesByNodeId: {},
    voteOutboundStatus: {},
  };
}

export function saveRoomParticipant(data: RoomParticipantRuntime): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(participantStorageKey(data.roomCode), JSON.stringify(toPersisted(data)));
    /* Drop legacy key once migrated */
    window.localStorage.removeItem(`${LEGACY_JOIN_PREFIX}${data.roomCode.toUpperCase()}`);
  } catch {
    /* quota */
  }
}

export function clearRoomParticipant(roomCode: string): void {
  if (typeof window === "undefined") return;
  const room = roomCode.trim().toUpperCase();
  try {
    window.localStorage.removeItem(participantStorageKey(room));
    window.localStorage.removeItem(`${LEGACY_JOIN_PREFIX}${room}`);
    window.localStorage.removeItem(`showtime.join.v1.${room}`);
  } catch {
    /* ignore */
  }
}

export function clearAllRoomParticipants(): void {
  if (typeof window === "undefined") return;
  try {
    const drop: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (
        k?.startsWith(PARTICIPANT_STORAGE_PREFIX) ||
        k?.startsWith(LEGACY_JOIN_PREFIX) ||
        k?.startsWith("showtime.join.v1.")
      ) {
        drop.push(k);
      }
    }
    for (const k of drop) window.localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function isAudienceRecordForRoom(
  record: RoomParticipantRecord | null | undefined,
  roomCode: string,
): record is RoomParticipantRecord {
  if (!record) return false;
  const room = roomCode.trim().toUpperCase();
  return record.roomCode === room && record.role === "audience" && Boolean(record.participantId?.trim());
}

export function recordVoteForNode(
  prev: RoomParticipantRuntime | null,
  roomCode: string,
  storyNodeId: string,
  choice: VoteChoice,
): RoomParticipantRuntime {
  const base =
    prev ??
    emptyRuntime(roomCode.toUpperCase(), mintParticipantId());
  return {
    ...base,
    votesByNodeId: { ...base.votesByNodeId, [storyNodeId]: choice },
    voteOutboundStatus: base.voteOutboundStatus ?? {},
  };
}

export function markVotePending(
  prev: RoomParticipantRuntime | null,
  roomCode: string,
  storyNodeId: string,
  choice: VoteChoice,
): RoomParticipantRuntime {
  const withVote = recordVoteForNode(prev, roomCode, storyNodeId, choice);
  return {
    ...withVote,
    voteOutboundStatus: { ...(withVote.voteOutboundStatus ?? {}), [storyNodeId]: "pending" },
  };
}

export function markVoteSynced(prev: RoomParticipantRuntime, storyNodeId: string): RoomParticipantRuntime {
  return {
    ...prev,
    voteOutboundStatus: { ...(prev.voteOutboundStatus ?? {}), [storyNodeId]: "synced" },
  };
}

/** @deprecated Use participantId — alias for session-storage compat */
export function sessionIdFromParticipant(record: RoomParticipantRuntime | null): string | null {
  return record?.participantId ?? null;
}
