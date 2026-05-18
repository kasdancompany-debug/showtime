import type { Metadata } from "next";

import { OperatorRoomDesk } from "@/components/host/operator-room-desk";

type Props = { params: Promise<{ roomCode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roomCode } = await params;
  return {
    title: `Operator · ${roomCode.toUpperCase()}`,
    description: "Showtime operator control desk",
  };
}

export default async function OperatorRoomPage({ params }: Props) {
  const { roomCode } = await params;
  return <OperatorRoomDesk roomCode={roomCode} />;
}
