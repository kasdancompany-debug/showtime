import type { Metadata } from "next";

import { JoinMobileExperience } from "@/components/join/join-mobile-experience";

type Props = { params: Promise<{ eventCode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { eventCode } = await params;
  return {
    title: `Join ${eventCode.toUpperCase()}`,
    description: "Showtime audience vote",
  };
}

export default async function JoinEventPage({ params }: Props) {
  const { eventCode } = await params;
  return <JoinMobileExperience eventCode={eventCode} />;
}
