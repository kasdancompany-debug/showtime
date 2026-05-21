import type { Metadata } from "next";

import { ShowBuilder } from "@/components/admin/show-builder";

export const metadata: Metadata = {
  title: "Edit experience",
  description: "Build beats, reels, and votes — same editor as Edit show.",
};

type Props = { params: Promise<{ id: string }> };

export default async function EditExperiencePage({ params }: Props) {
  const { id } = await params;
  return <ShowBuilder experienceId={id} />;
}
