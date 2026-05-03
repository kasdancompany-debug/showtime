import type { Metadata } from "next";

import { ManualJoinClient } from "@/components/join/manual-join-client";

export const metadata: Metadata = {
  title: "Join Showtime",
  description: "Enter an event code to join the live screening",
};

export default function ManualJoinPage() {
  return <ManualJoinClient />;
}
