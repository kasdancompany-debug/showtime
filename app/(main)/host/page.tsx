import type { Metadata } from "next";

import { HostControlDesk } from "@/components/host/host-control-desk";

export const metadata: Metadata = {
  title: "Operator",
  description: "Showtime live control desk",
};

export default function HostPage() {
  return <HostControlDesk />;
}
