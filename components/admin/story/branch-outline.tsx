"use client";

import { GitBranch } from "lucide-react";

import { nodePickerLabel } from "@/lib/showtime/node-picker-label";
import type { StoryGraph, StoryNodeId } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  graph: StoryGraph;
  selectedId: StoryNodeId;
  onSelect: (id: StoryNodeId) => void;
};

function OutlineRows({
  graph,
  id,
  depth,
  selectedId,
  onSelect,
  pathVisited,
}: {
  graph: StoryGraph;
  id: StoryNodeId;
  depth: number;
  selectedId: StoryNodeId;
  onSelect: (id: StoryNodeId) => void;
  pathVisited: Set<string>;
}) {
  const n = graph.nodes[id];
  if (!n) return null;

  if (pathVisited.has(id)) {
    return (
      <li className="font-mono text-[0.65rem] text-amber-600 dark:text-amber-400" style={{ paddingLeft: depth * 12 }}>
        ↻ cycle · {id}
      </li>
    );
  }

  const nextPath = new Set(pathVisited);
  nextPath.add(id);

  const label = nodePickerLabel(graph, id);
  const endTag = n.isEnd ? " · end" : "";

  return (
    <li className="list-none" style={{ paddingLeft: depth * 12 }}>
      <button
        type="button"
        onClick={() => onSelect(id)}
        className={cn(
          "mb-1 w-full max-w-full rounded-md border px-2 py-1 text-left text-[0.7rem] transition",
          id === selectedId
            ? "border-primary/60 bg-primary/10 text-foreground"
            : "border-transparent bg-muted/30 text-muted-foreground hover:border-[var(--bn-line)] hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <span className="font-mono text-[0.6rem] opacity-70">{id}</span>
        <span className="ml-2">{label}</span>
        <span className="text-[0.6rem] opacity-80">{endTag}</span>
      </button>
      {(n.optionA || n.optionB) && (
        <ul className="mt-1 space-y-1 border-l border-[var(--bn-line)]/60 pl-2">
          {n.optionA ? (
            <li className="list-none">
              <span className="font-mono text-[0.6rem] text-[var(--bn-coral)]">A →</span>
              <ul className="mt-0.5">
                <OutlineRows
                  graph={graph}
                  id={n.optionA.nextNodeId}
                  depth={depth + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  pathVisited={nextPath}
                />
              </ul>
            </li>
          ) : null}
          {n.optionB ? (
            <li className="list-none">
              <span className="font-mono text-[0.6rem] text-[var(--bn-teal)]">B →</span>
              <ul className="mt-0.5">
                <OutlineRows
                  graph={graph}
                  id={n.optionB.nextNodeId}
                  depth={depth + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  pathVisited={nextPath}
                />
              </ul>
            </li>
          ) : null}
        </ul>
      )}
    </li>
  );
}

/** Compact branch tree from root — cycles along a path are flagged. */
export function BranchOutline({ graph, selectedId, onSelect }: Props) {
  const root = graph.nodes[graph.rootId];
  if (!root) {
    return <p className="text-xs text-muted-foreground">No root beat.</p>;
  }

  return (
    <div className="rounded-xl border border-[var(--bn-line)] bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        <GitBranch className="size-3.5" />
        Branch map
      </div>
      <ul className="space-y-1">
        <OutlineRows
          graph={graph}
          id={graph.rootId}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          pathVisited={new Set()}
        />
      </ul>
      <p className="mt-2 text-[0.65rem] leading-snug text-muted-foreground">
        Beats that never appear here are unreachable from the root — link them from a branch or remove them.
      </p>
    </div>
  );
}
