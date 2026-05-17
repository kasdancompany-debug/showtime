import type { Json } from "@/lib/supabase/database.types";

import type { BranchEditorNode } from "@/lib/showtime/branch-story-validate";

export type VideoLibraryEntry = {
  id: string;
  label: string;
  url: string;
  durationSec?: number | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export function newVideoLibraryEntry(partial?: Partial<Pick<VideoLibraryEntry, "label" | "url">>): VideoLibraryEntry {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `vid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    label: (partial?.label ?? "New reel").trim() || "New reel",
    url: (partial?.url ?? "").trim(),
    durationSec: null,
  };
}

export function labelFromUrl(url: string): string {
  const t = url.trim();
  if (!t) return "Reel";
  try {
    if (/^https?:\/\//i.test(t)) {
      const p = new URL(t).pathname.split("/").filter(Boolean).pop();
      if (p) return decodeURIComponent(p.replace(/\.(mp4|webm)$/i, ""));
    }
  } catch {
    /* ignore */
  }
  const noq = t.split(/[?#]/)[0] ?? t;
  const seg = noq.split("/").filter(Boolean).pop();
  return seg ? seg.replace(/\.(mp4|webm)$/i, "") : "Reel";
}

export function parseVideoLibrary(raw: unknown): VideoLibraryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: VideoLibraryEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : newVideoLibraryEntry().id;
    const label = typeof item.label === "string" ? item.label : "";
    const url = typeof item.url === "string" ? item.url : "";
    const ds = item.durationSec;
    let durationSec: number | null = null;
    if (typeof ds === "number" && Number.isFinite(ds)) durationSec = ds;
    else if (typeof ds === "string" && ds.trim()) {
      const n = Number(ds);
      if (Number.isFinite(n)) durationSec = n;
    }
    if (!url.trim()) continue;
    out.push({
      id,
      label: label.trim() || labelFromUrl(url),
      url: url.trim(),
      durationSec,
    });
  }
  return out;
}

export function inferLibraryFromNodes(nodes: BranchEditorNode[]): VideoLibraryEntry[] {
  const seen = new Set<string>();
  const out: VideoLibraryEntry[] = [];
  for (const n of nodes) {
    const u = n.video_url?.trim() ?? "";
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(newVideoLibraryEntry({ label: labelFromUrl(u), url: u }));
  }
  return out;
}

export function mergeLibraryForLoad(stored: VideoLibraryEntry[], nodes: BranchEditorNode[]): VideoLibraryEntry[] {
  if (stored.length > 0) return stored;
  return inferLibraryFromNodes(nodes);
}

export function attachVideoAssetIds(nodes: BranchEditorNode[], library: VideoLibraryEntry[]): BranchEditorNode[] {
  const byUrl = new Map(library.map((e) => [e.url.trim(), e.id]));
  return nodes.map((n) => {
    const u = n.video_url?.trim() ?? "";
    const id = u ? (byUrl.get(u) ?? "") : "";
    return { ...n, video_asset_id: id || undefined };
  });
}

export function beatsUsingVideoId(nodes: BranchEditorNode[], assetId: string, entryUrl: string): string[] {
  const keys: string[] = [];
  const url = entryUrl.trim();
  for (const n of nodes) {
    const nk = n.node_key.trim();
    if (!nk) continue;
    if (n.video_asset_id === assetId) {
      keys.push(nk);
      continue;
    }
    if (!n.video_asset_id && n.video_url?.trim() === url) keys.push(nk);
  }
  return keys;
}

export function libraryEntryLabel(library: VideoLibraryEntry[], assetId: string | undefined): string {
  if (!assetId) return "—";
  const e = library.find((x) => x.id === assetId);
  return e?.label?.trim() || e?.url || "—";
}

export function libraryEntryById(library: VideoLibraryEntry[], id: string): VideoLibraryEntry | undefined {
  return library.find((e) => e.id === id);
}

export function toEventVideoLibraryJson(entries: VideoLibraryEntry[]): Json {
  return JSON.parse(JSON.stringify(entries)) as Json;
}
