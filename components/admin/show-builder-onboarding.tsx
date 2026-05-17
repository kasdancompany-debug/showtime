import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const WORKFLOW_STEPS: readonly string[] = [
  "Build your show — create or load it in this builder.",
  "Add videos and reels to your library (files you can play).",
  "Create beats — each beat is one step in the night.",
  "Add the audience vote question and the two choices for each beat that needs a vote.",
  "Assign A and B branches so each choice leads to the next beat.",
  "Validate the show — fix anything “Check show” flags before opening night.",
  "Open /host on the operator’s laptop or tablet — that’s the control desk.",
  "Open /screen on the projector — only the big picture, no controls.",
  "Audience joins with the QR code or join link on their phones.",
  "The operator runs the night — load reels, open voting, reveal the winner, advance the story.",
];

/** Short, non-technical line next to a field or section title. */
export function InlineHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-muted-foreground text-xs font-normal leading-snug tracking-normal", className)}>{children}</p>
  );
}

export function HowShowtimeWorksPanel() {
  return (
    <Card size="sm" className="border-primary/20 bg-primary/5 shadow-md dark:bg-primary/10">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="font-heading text-base">How Showtime works</CardTitle>
        <CardDescription>From this page to a live room — no manual required.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <ol className="list-decimal space-y-2 pl-4 text-sm leading-snug text-foreground marker:font-semibold">
          {WORKFLOW_STEPS.map((step, i) => (
            <li key={i} className="pl-1">
              {step}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
