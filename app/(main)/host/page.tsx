import type { Metadata } from "next";

import { HostConsole } from "@/components/host/host-console";

export const metadata: Metadata = {
  title: "Operator",
  description: "Showtime live control desk",
};

export default function HostPage() {
  return <HostConsole />;
}
