import type { Metadata } from "next";

import { ShowNightHub } from "@/components/show-night/show-night-hub";

export const metadata: Metadata = {
  title: "Show night",
  description: "Load your show, open operator and projector, share the audience link.",
};

export default function ShowNightPage() {
  return <ShowNightHub />;
}
