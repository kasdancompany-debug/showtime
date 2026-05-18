import type { Metadata } from "next";

import { ExperienceEditor } from "@/components/experiences/experience-editor";

export const metadata: Metadata = {
  title: "Edit experience",
};

type Props = { params: Promise<{ id: string }> };

export default async function EditExperiencePage({ params }: Props) {
  const { id } = await params;
  return <ExperienceEditor experienceId={id} />;
}
