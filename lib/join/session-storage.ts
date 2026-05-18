/**
 * @deprecated Prefer {@link "@/lib/join/participant-identity"} — thin aliases for legacy imports.
 */
import type { VoteChoice } from "@/types";

import {
  clearAllRoomParticipants,
  clearRoomParticipant,
  loadRoomParticipant,
  markVotePending as markVotePendingInner,
  markVoteSynced as markVoteSyncedInner,
  mintParticipantId,
  participantStorageKey,
  recordVoteForNode as recordVoteForNodeInner,
  saveRoomParticipant,
  type RoomParticipantRuntime,
} from "@/lib/join/participant-identity";

export type JoinSessionDisk = {
  sessionId: string;
  eventCode: string;
  joined: boolean;
  displayName?: string;
  tableNumber?: string;
};

export type JoinSessionPersist = JoinSessionDisk & {
  votesByNodeId: Record<string, VoteChoice>;
  voteOutboundStatus?: Record<string, "pending" | "synced">;
};

export function storageKey(eventCode: string) {
  return participantStorageKey(eventCode);
}

export { mintParticipantId as newSessionId };

function toLegacy(p: RoomParticipantRuntime): JoinSessionPersist {
  return {
    sessionId: p.participantId,
    eventCode: p.roomCode,
    joined: p.joined,
    displayName: p.displayName,
    tableNumber: p.tableNumber,
    votesByNodeId: p.votesByNodeId,
    voteOutboundStatus: p.voteOutboundStatus,
  };
}

export function loadJoinSession(eventCode: string): JoinSessionPersist | null {
  const p = loadRoomParticipant(eventCode);
  return p ? toLegacy(p) : null;
}

export function saveJoinSession(data: JoinSessionPersist): void {
  saveRoomParticipant({
    participantId: data.sessionId,
    roomCode: data.eventCode.toUpperCase(),
    role: "audience",
    joined: data.joined,
    displayName: data.displayName,
    tableNumber: data.tableNumber,
    votesByNodeId: data.votesByNodeId,
    voteOutboundStatus: data.voteOutboundStatus,
  });
}

export function clearJoinSession(eventCode: string): void {
  clearRoomParticipant(eventCode);
}

export function clearAllJoinSessions(): void {
  clearAllRoomParticipants();
}

export function recordVoteForNode(
  prev: JoinSessionPersist | null,
  eventCode: string,
  storyNodeId: string,
  choice: VoteChoice,
): JoinSessionPersist {
  const base = prev
    ? {
        participantId: prev.sessionId,
        roomCode: prev.eventCode,
        role: "audience" as const,
        joined: prev.joined,
        displayName: prev.displayName,
        tableNumber: prev.tableNumber,
        votesByNodeId: prev.votesByNodeId,
        voteOutboundStatus: prev.voteOutboundStatus,
      }
    : null;
  return toLegacy(recordVoteForNodeInner(base, eventCode, storyNodeId, choice));
}

export function markVotePending(
  prev: JoinSessionPersist | null,
  eventCode: string,
  storyNodeId: string,
  choice: VoteChoice,
): JoinSessionPersist {
  const base = prev
    ? {
        participantId: prev.sessionId,
        roomCode: prev.eventCode,
        role: "audience" as const,
        joined: prev.joined,
        displayName: prev.displayName,
        tableNumber: prev.tableNumber,
        votesByNodeId: prev.votesByNodeId,
        voteOutboundStatus: prev.voteOutboundStatus,
      }
    : null;
  return toLegacy(markVotePendingInner(base, eventCode, storyNodeId, choice));
}

export function markVoteSynced(prev: JoinSessionPersist, storyNodeId: string): JoinSessionPersist {
  const base = {
    participantId: prev.sessionId,
    roomCode: prev.eventCode,
    role: "audience" as const,
    joined: prev.joined,
    displayName: prev.displayName,
    tableNumber: prev.tableNumber,
    votesByNodeId: prev.votesByNodeId,
    voteOutboundStatus: prev.voteOutboundStatus,
  };
  return toLegacy(markVoteSyncedInner(base, storyNodeId));
}
