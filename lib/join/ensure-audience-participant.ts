"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { joinLifecycleLog } from "@/lib/join/join-lifecycle-log";
import {
  loadRoomParticipant,
  mintParticipantId,
  saveRoomParticipant,
  type RoomParticipantRuntime,
} from "@/lib/join/participant-identity";
import { fetchAudienceMemberIdForCurrentUser } from "@/lib/join/supabase-room";
import type { Database } from "@/lib/supabase/database.types";

export type AudienceRegistrationStatus =
  | "pending"
  | "registered"
  | "needs_rejoin"
  | "fresh";

export type ReconcileAudienceResult = {
  participant: RoomParticipantRuntime;
  registrationStatus: AudienceRegistrationStatus;
  audienceMemberId: string | null;
  resetReason: string | null;
};

export async function reconcileAudienceParticipant(
  supabase: SupabaseClient<Database> | null,
  roomCode: string,
  eventId: string | null,
): Promise<ReconcileAudienceResult> {
  const room = roomCode.trim().toUpperCase();
  joinLifecycleLog("loaded room", { roomCode: room, eventId: eventId ?? null });

  let stored = loadRoomParticipant(room);
  let resetReason: string | null = null;

  if (stored && (stored.roomCode !== room || stored.role !== "audience")) {
    joinLifecycleLog("stored participant invalid for room — creating fresh", {
      roomCode: room,
      storedRoom: stored.roomCode,
      role: stored.role,
    });
    stored = null;
    resetReason = "wrong_room_or_role";
  }

  if (stored) {
    joinLifecycleLog("found stored participant", {
      roomCode: room,
      participantId: stored.participantId,
      joined: stored.joined,
      role: stored.role,
    });
  }

  let audienceMemberId: string | null = null;
  if (supabase && eventId && stored?.participantId) {
    try {
      audienceMemberId = await fetchAudienceMemberIdForCurrentUser(supabase, eventId, stored.participantId);
      joinLifecycleLog("validated participant in database", {
        roomCode: room,
        participantId: stored.participantId,
        audienceMemberId,
      });
    } catch (e) {
      joinLifecycleLog("participant validation failed", {
        roomCode: room,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (stored && stored.role !== "audience") {
    stored = null;
    resetReason = "role_not_audience";
  }

  if (!stored || resetReason) {
    const participantId = mintParticipantId();
    const fresh = {
      participantId,
      roomCode: room,
      role: "audience" as const,
      joined: false,
      displayName: "",
      tableNumber: "",
      votesByNodeId: {},
      voteOutboundStatus: {},
    };
    saveRoomParticipant(fresh);
    joinLifecycleLog("created participant", { roomCode: room, participantId, reason: resetReason });
    return {
      participant: fresh,
      registrationStatus: "fresh",
      audienceMemberId: null,
      resetReason,
    };
  }

  if (stored.joined && !audienceMemberId) {
    const healed = { ...stored, joined: false, audienceMemberId: undefined };
    saveRoomParticipant(healed);
    joinLifecycleLog("stored join missing in database — needs rejoin", {
      roomCode: room,
      participantId: stored.participantId,
    });
    return {
      participant: healed,
      registrationStatus: "needs_rejoin",
      audienceMemberId: null,
      resetReason: "missing_db_row",
    };
  }

  if (audienceMemberId) {
    const updated = { ...stored, joined: true, audienceMemberId };
    saveRoomParticipant(updated);
    joinLifecycleLog("ready to vote", {
      roomCode: room,
      participantId: stored.participantId,
      audienceMemberId,
    });
    return {
      participant: updated,
      registrationStatus: "registered",
      audienceMemberId,
      resetReason: null,
    };
  }

  joinLifecycleLog("participant pending join form", {
    roomCode: room,
    participantId: stored.participantId,
  });
  return {
    participant: stored,
    registrationStatus: stored.joined ? "needs_rejoin" : "pending",
    audienceMemberId: null,
    resetReason: null,
  };
}
