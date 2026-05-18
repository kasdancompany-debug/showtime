import type { Metadata } from "next";

import { ExperiencesDashboard } from "@/components/experiences/experiences-dashboard";

export const metadata: Metadata = {
  title: "Movie Experiences",
  description: "Saved interactive movie templates for Showtime live rooms.",
};

export default function ExperiencesPage() {
  return <ExperiencesDashboard />;
}
