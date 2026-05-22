"use client";

import { useEffect } from "react";

import { HostControlDesk } from "@/components/host/host-control-desk";
import { normalizeJoinEventCode } from "@/lib/join/get-join-url";
import { writeStoredOperatorCode } from "@/lib/showtime/operator-session";

type Props = { roomCode: string };

/**
 * Operator desk bound to `/operator/[roomCode]` — does not use audience participant storage.
 */
export function OperatorRoomDesk({ roomCode }: Props) {
  const code = normalizeJoinEventCode(roomCode);

  useEffect(() => {
    if (code.length >= 3) writeStoredOperatorCode(code);
  }, [code]);

  return <HostControlDesk boundRoomCode={code} />;
}
