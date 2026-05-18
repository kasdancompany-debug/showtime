import type { Metadata } from "next";

import { ExperienceLaunchPanel } from "@/components/experiences/experience-launch-panel";

export const metadata: Metadata = {
  title: "Launch experience",
};

type Props = { params: Promise<{ id: string }> };

export default async function LaunchExperiencePage({ params }: Props) {
  const { id } = await params;
  return <ExperienceLaunchPanel experienceId={id} />;
}
