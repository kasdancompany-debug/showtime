import type { Metadata } from "next";

import { ExperienceNewForm } from "@/components/experiences/experience-new-form";

export const metadata: Metadata = {
  title: "New experience",
};

export default function NewExperiencePage() {
  return <ExperienceNewForm />;
}
