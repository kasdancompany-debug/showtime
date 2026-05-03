"use client";

import { Flag } from "lucide-react";

import { branchOutlookFromNode, pathFromRoot } from "@/lib/showtime/host-story-path";
import { nodePickerLabel } from "@/lib/showtime/node-picker-label";
import type { StoryGraph, StoryNodeId } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  graph: StoryGraph;
  currentNodeId: StoryNodeId;
  className?: string;
};

export function HostStoryTimeline({ graph, currentNodeId, className }: Props) {
  const path = pathFromRoot(graph, currentNodeId);
  const outlook = branchOutlookFromNode(graph, currentNodeId);

  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--bn-line)] bg-black/25 px-4 py-4 backdrop-blur-md md:px-6 md:py-5",
        className,
      )}
      aria-label="Story path"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.28em] text-muted-foreground">Story path</p>
        {outlook.kind === "end" ? (
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--kc-gold-muted)]/40 bg-[var(--kc-gold-muted)]/12 px-3 py-1 font-mono text-[0.7rem] uppercase tracking-wider text-[var(--kc-champagne)]">
            <Flag className="size-3.5" aria-hidden />
            Ending beat
          </span>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <ol className="flex min-w-max items-center gap-2">
          {(path ?? [currentNodeId]).map((id, i, arr) => {
            const isCurrent = id === currentNodeId;
            const isLast = i === arr.length - 1;
            return (
              <li key={`${id}-${i}`} className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-xl border px-3 py-2 font-mono text-sm md:text-base md:px-4 md:py-2.5",
                    isCurrent
                      ? "border-primary/50 bg-primary/20 font-semibold text-foreground"
                      : "border-[var(--bn-line)] bg-card/40 text-muted-foreground",
                  )}
                >
                  {nodePickerLabel(graph, id)}
                </span>
                {!isLast ? <span className="text-muted-foreground">→</span> : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-5 border-t border-[var(--bn-line)]/80 pt-4">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.28em] text-muted-foreground">Upcoming branches</p>
        {outlook.kind === "end" ? (
          <p className="mt-2 text-base text-muted-foreground">No branches — audience ride finishes on this beat.</p>
        ) : outlook.kind === "leaf" ? (
          <p className="mt-2 text-base text-muted-foreground">Connect Option A/B in Story builder to show forks here.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <BranchCard
              side="A"
              entry={outlook.a}
              graph={graph}
            />
            <BranchCard
              side="B"
              entry={outlook.b}
              graph={graph}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function BranchCard({
  side,
  entry,
  graph,
}: {
  side: "A" | "B";
  entry: { nextId: StoryNodeId; branchLabel: string; beatTitle: string } | null;
  graph: StoryGraph;
}) {
  const tone =
    side === "A"
      ? "border-[var(--bn-coral)]/40 bg-[var(--bn-coral)]/8"
      : "border-[var(--bn-teal)]/40 bg-[var(--bn-teal)]/8";
  if (!entry) {
    return (
      <div className={cn("rounded-xl border border-dashed px-4 py-3 text-muted-foreground", tone)}>
        <span className="font-mono text-xs uppercase tracking-wider">Option {side}</span>
        <p className="mt-1 text-sm">Not wired</p>
      </div>
    );
  }
  const nextNode = graph.nodes[entry.nextId];
  const endsHere = nextNode?.isEnd === true;
  return (
    <div className={cn("rounded-xl border px-4 py-3", tone)}>
      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {side} · {entry.branchLabel}
      </span>
      <p className="mt-1 font-heading text-lg text-foreground">{entry.beatTitle}</p>
      <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">{entry.nextId}</p>
      {endsHere ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--kc-gold-muted)]/15 px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-wider text-[var(--kc-champagne)]">
          <Flag className="size-3" aria-hidden />
          Ends show
        </p>
      ) : null}
    </div>
  );
}
