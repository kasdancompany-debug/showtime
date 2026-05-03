"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Cable,
  CheckCircle2,
  Clapperboard,
  Copy,
  FileJson,
  FolderOpen,
  Library,
  MonitorPlay,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

import { BranchOutline } from "@/components/admin/story/branch-outline";
import { DisplayHeading } from "@/components/cinematic/display-heading";
import { FilmGrain } from "@/components/cinematic/film-grain";
import { SpotlightWash } from "@/components/cinematic/spotlight";
import { StudioBadge } from "@/components/kasdan";
import { kcCopy } from "@/lib/design/kasdan-hollywood-tokens";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { deleteLocalVideoBlob, putLocalVideoBlob } from "@/lib/media/local-video-store";
import { EMPTY_STORY_GRAPH } from "@/lib/mock-data";
import { nodePickerLabel } from "@/lib/showtime/node-picker-label";
import {
  addSavedFilm,
  listSavedFilms,
  removeSavedFilm,
  SAVED_FILMS_CHANGED_EVENT,
  type SavedFilm,
} from "@/lib/showtime/saved-films";
import {
  downloadStoryJson,
  loadStoryBuilderLocal,
  parseImportedStoryJson,
  saveStoryBuilderLocal,
} from "@/lib/showtime/story-builder-storage";
import {
  duplicateNodeInGraph,
  listNodeIds,
  normalizeStoryGraph,
  removeNodeFromGraph,
  renameNodeIdInGraph,
  syncNodeListOrder,
  validateGraph,
} from "@/lib/story-engine";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import type { StoryGraph, StoryNode, StoryNodeId } from "@/types";
import { cn } from "@/lib/utils";

function cloneGraph(g: StoryGraph): StoryGraph {
  return JSON.parse(JSON.stringify(g)) as StoryGraph;
}

const STORY_BUILDER_DRAFT_KEY = "showtime-story-builder-draft-v1";

function readDraftFromSession(): { graph: StoryGraph; selectedId: StoryNodeId } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORY_BUILDER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { graph?: StoryGraph; selectedId?: string };
    const g = parsed.graph ? normalizeStoryGraph(parsed.graph) : null;
    if (!g?.nodes || !g.rootId || !g.nodes[g.rootId]) return null;
    const selectedId =
      parsed.selectedId && g.nodes[parsed.selectedId as StoryNodeId]
        ? (parsed.selectedId as StoryNodeId)
        : g.rootId;
    return { graph: g, selectedId };
  } catch {
    return null;
  }
}

export default function AdminStoryPage() {
  const router = useRouter();
  const importRef = useRef<HTMLInputElement>(null);
  const validationRef = useRef<HTMLDivElement>(null);

  const [graph, setGraph] = useState<StoryGraph>(() => normalizeStoryGraph(cloneGraph(EMPTY_STORY_GRAPH)));
  const [selectedId, setSelectedId] = useState<StoryNodeId>(EMPTY_STORY_GRAPH.rootId);
  const [orderedIds, setOrderedIds] = useState<StoryNodeId[]>(() => listNodeIds(EMPTY_STORY_GRAPH));

  const [renameIdInput, setRenameIdInput] = useState("");
  const [deskBanner, setDeskBanner] = useState<string | null>(null);
  const [diskBanner, setDiskBanner] = useState<string | null>(null);
  const [libraryFilmName, setLibraryFilmName] = useState("");
  const [libraryEventTitle, setLibraryEventTitle] = useState("");
  const [savedCatalog, setSavedCatalog] = useState<SavedFilm[]>([]);

  const loadStoryIntoRoom = useMockEventStore((s) => s.loadStoryGraph);
  const refreshCatalog = useCallback(() => setSavedCatalog(listSavedFilms()), []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    const fn = () => refreshCatalog();
    window.addEventListener(SAVED_FILMS_CHANGED_EVENT, fn);
    return () => window.removeEventListener(SAVED_FILMS_CHANGED_EVENT, fn);
  }, [refreshCatalog]);

  useEffect(() => {
    setOrderedIds((prev) => syncNodeListOrder(prev, graph));
  }, [graph]);

  useEffect(() => {
    if (!deskBanner) return;
    const t = window.setTimeout(() => setDeskBanner(null), 8000);
    return () => window.clearTimeout(t);
  }, [deskBanner]);

  useEffect(() => {
    if (!diskBanner) return;
    const t = window.setTimeout(() => setDiskBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [diskBanner]);

  const loadLiveFromStore = useCallback(() => {
    const { graph: g, currentNodeId } = useMockEventStore.getState();
    const ng = normalizeStoryGraph(cloneGraph(g));
    setGraph(ng);
    setSelectedId(ng.nodes[currentNodeId] ? currentNodeId : ng.rootId);
  }, []);

  useLayoutEffect(() => {
    const draft = readDraftFromSession();
    if (draft) {
      setGraph(draft.graph);
      setSelectedId(draft.selectedId);
    } else {
      loadLiveFromStore();
    }
  }, [loadLiveFromStore]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORY_BUILDER_DRAFT_KEY, JSON.stringify({ graph, selectedId }));
    } catch {
      /* ignore */
    }
  }, [graph, selectedId]);

  useEffect(() => {
    setRenameIdInput(selectedId);
  }, [selectedId]);

  const discardLocalDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(STORY_BUILDER_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    loadLiveFromStore();
  }, [loadLiveFromStore]);

  const node = graph.nodes[selectedId];
  const validation = useMemo(() => validateGraph(graph), [graph]);

  const patchNode = useCallback((id: StoryNodeId, patch: Partial<StoryNode>) => {
    setGraph((g) => ({
      ...g,
      nodes: {
        ...g.nodes,
        [id]: { ...g.nodes[id], ...patch },
      },
    }));
  }, []);

  const pushDeskSuccess = (msg: string) => setDeskBanner(msg);

  const loadGraphOnOperator = useCallback(
    (g: StoryGraph, meta?: { displayName?: string; eventTitle?: string }) => {
      loadStoryIntoRoom(cloneGraph(g), meta);
      pushDeskSuccess(
        meta?.displayName
          ? `Loaded “${meta.displayName}” on the operator desk. Open /host to run the show.`
          : "Story loaded on the operator desk. Open /host to run the show.",
      );
    },
    [loadStoryIntoRoom],
  );

  const runTestShow = useCallback(() => {
    loadGraphOnOperator(graph, {
      displayName: "Story builder test",
      eventTitle: libraryEventTitle.trim() || libraryFilmName.trim() || "Test screening",
    });
    router.push("/host");
  }, [graph, libraryEventTitle, libraryFilmName, loadGraphOnOperator, router]);

  const validateAndScroll = () => {
    validationRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const addNode = () => {
    const id = `node_${Math.random().toString(36).slice(2, 8)}` as StoryNodeId;
    setGraph((g) => ({
      ...g,
      nodes: {
        ...g.nodes,
        [id]: {
          id,
          title: "New beat",
          subtitle: null,
          videoUrl: null,
          localVideoKey: null,
          question: null,
          optionA: null,
          optionB: null,
          isEnd: true,
        },
      },
    }));
    setSelectedId(id);
  };

  const duplicateSelected = () => {
    const res = duplicateNodeInGraph(graph, selectedId);
    if (!res) return;
    setGraph(res.graph);
    setSelectedId(res.newId);
  };

  const removeSelectedNode = () => {
    const next = removeNodeFromGraph(graph, selectedId);
    if (!next) return;
    setGraph(next);
    setSelectedId(next.rootId);
  };

  const moveNode = (dir: -1 | 1) => {
    setOrderedIds((order) => {
      const i = order.indexOf(selectedId);
      if (i < 0) return order;
      const j = i + dir;
      if (j < 0 || j >= order.length) return order;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const applyRenameId = () => {
    const next = renameNodeIdInGraph(graph, selectedId, renameIdInput as StoryNodeId);
    if (!next) return;
    setGraph(next);
    const nid = renameIdInput.trim().replace(/\s+/g, "_");
    setSelectedId(nid as StoryNodeId);
  };

  const saveFilmToLibrary = () => {
    const rec = addSavedFilm({
      name: libraryFilmName,
      eventTitle: libraryEventTitle,
      graph,
    });
    if (rec) setLibraryFilmName("");
  };

  const loadFilmIntoBuilder = (film: SavedFilm) => {
    const ng = normalizeStoryGraph(cloneGraph(film.graph));
    setGraph(ng);
    setSelectedId(ng.rootId);
  };

  const sendFilmToOperator = (film: SavedFilm) => {
    const ng = normalizeStoryGraph(cloneGraph(film.graph));
    loadGraphOnOperator(ng, { displayName: film.name, eventTitle: film.eventTitle });
  };

  const handleSaveDisk = () => {
    const ok = saveStoryBuilderLocal(graph, orderedIds);
    setDiskBanner(ok ? "Saved to this browser (localStorage)." : "Could not save — storage may be full or blocked.");
  };

  const handleLoadDisk = () => {
    const data = loadStoryBuilderLocal();
    if (!data) {
      setDiskBanner("No saved story file in localStorage yet.");
      return;
    }
    const ng = normalizeStoryGraph(cloneGraph(data.graph));
    setGraph(ng);
    setOrderedIds(syncNodeListOrder(data.orderedNodeIds, ng));
    setSelectedId(ng.rootId);
    setDiskBanner(`Restored story saved ${data.savedAt ? new Date(data.savedAt).toLocaleString() : ""}.`);
  };

  const handleExportJson = () => {
    downloadStoryJson(graph, orderedIds);
  };

  const handleImportFile = async (f: File | null) => {
    if (!f) return;
    const text = await f.text();
    const parsed = parseImportedStoryJson(text);
    if (!parsed.ok) {
      setDiskBanner(parsed.error);
      return;
    }
    const ng = normalizeStoryGraph(cloneGraph(parsed.graph));
    setGraph(ng);
    setOrderedIds(syncNodeListOrder(parsed.orderedNodeIds, ng));
    setSelectedId(ng.rootId);
    setDiskBanner("Imported JSON — review validation, then load on operator.");
    if (importRef.current) importRef.current.value = "";
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden bg-[var(--kc-bg-deep)] text-foreground">
      <SpotlightWash />
      <FilmGrain />
      <div className="relative z-[2] mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-3 py-4 sm:px-5 sm:py-6">
        <header className="sticky top-0 z-30 mb-4 border-b border-[var(--bn-line)] bg-[var(--kc-bg-deep)]/92 pb-3 pt-1 backdrop-blur-md">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <StudioBadge className="mb-2" showSeal href="/" />
              <DisplayHeading as="h1" className="text-2xl leading-tight sm:text-3xl">
                Story builder
              </DisplayHeading>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Branching reels for /host and /screen on this browser.{" "}
                <strong className="text-foreground/90">IndexedDB video files</strong> never leave this machine — same
                browser only.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={validation.ok ? "secondary" : "destructive"} className="rounded-md font-mono text-[0.65rem]">
                {validation.ok ? "Valid" : `${validation.errors.length} issues`}
              </Badge>
              <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={validateAndScroll}>
                <AlertTriangle className="mr-1.5 size-3.5 opacity-80" />
                Validate story
              </Button>
              <Button type="button" size="sm" variant="secondary" className="rounded-lg" onClick={runTestShow}>
                <MonitorPlay className="mr-1.5 size-3.5" />
                Run test show
              </Button>
              <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={handleSaveDisk}>
                <Save className="mr-1.5 size-3.5" />
                Save
              </Button>
              <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={handleLoadDisk}>
                <FolderOpen className="mr-1.5 size-3.5" />
                Load
              </Button>
              <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={handleExportJson}>
                <FileJson className="mr-1.5 size-3.5" />
                Export JSON
              </Button>
              <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => importRef.current?.click()}>
                <Upload className="mr-1.5 size-3.5" />
                Import
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
              />
              <Separator orientation="vertical" className="hidden h-6 lg:block" />
              <Button
                type="button"
                size="sm"
                className="rounded-lg"
                onClick={() => loadGraphOnOperator(graph, { displayName: libraryFilmName.trim() || "Untitled film", eventTitle: libraryEventTitle.trim() })}
              >
                <Clapperboard className="mr-1.5 size-3.5" />
                Load on operator desk
              </Button>
              <Link href="/host" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-lg no-underline")}>
                Open /host
              </Link>
            </div>
          </div>

          {deskBanner ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <span>{deskBanner}</span>
            </div>
          ) : null}
          {diskBanner ? (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--bn-line)] bg-card/60 px-3 py-2 text-xs text-muted-foreground">
              <span>{diskBanner}</span>
            </div>
          ) : null}
        </header>

        <div ref={validationRef} className="mb-4">
          {!validation.ok ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <p className="font-medium">Fix before going live</p>
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs leading-relaxed">
                {validation.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              <CheckCircle2 className="mr-1 inline size-3 text-emerald-500" />
              Structure checks passed — still confirm media URLs and local files on this device.
            </p>
          )}
        </div>

        <div className="grid flex-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <aside className="flex flex-col gap-3 lg:col-span-4">
            <BranchOutline graph={graph} selectedId={selectedId} onSelect={setSelectedId} />

            <Card className="border-[var(--bn-line)] bg-card/70">
              <CardHeader className="space-y-0 pb-2 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-medium">Beats</CardTitle>
                  <Button type="button" size="sm" variant="secondary" className="h-7 rounded-md text-xs" onClick={addNode}>
                    Add beat
                  </Button>
                </div>
                <CardDescription className="text-[0.65rem]">
                  Reorder changes sidebar order only; branch wiring is unchanged.
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-3 pt-0">
                <div className="mb-2 flex gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-7 flex-1 rounded-md px-1 text-xs" onClick={() => moveNode(-1)}>
                    <ArrowUp className="mx-auto size-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 flex-1 rounded-md px-1 text-xs" onClick={() => moveNode(1)}>
                    <ArrowDown className="mx-auto size-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 flex-[2] rounded-md text-xs" onClick={duplicateSelected}>
                    <Copy className="mr-1 size-3" />
                    Duplicate
                  </Button>
                </div>
                <ScrollArea className="max-h-[min(280px,38vh)] rounded-lg border border-[var(--bn-line)] bg-background/30">
                  <ul className="divide-y divide-[var(--bn-line)] p-1">
                    {orderedIds.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(id)}
                          className={cn(
                            "flex w-full flex-col rounded-md px-2 py-1.5 text-left text-xs transition",
                            id === selectedId ? "bg-primary/15 text-foreground" : "hover:bg-muted/50",
                          )}
                        >
                          <span className="font-mono text-[0.6rem] text-muted-foreground">{id}</span>
                          <span className="truncate font-medium">{graph.nodes[id]?.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="border-[var(--bn-line)] bg-card/70">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Rename beat id</CardTitle>
                <CardDescription className="text-[0.65rem] leading-relaxed">
                  Internal key — updates every branch pointer. Use letters, numbers, underscores.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2 pb-4">
                <Input
                  value={renameIdInput}
                  onChange={(e) => setRenameIdInput(e.target.value)}
                  className="h-8 rounded-md font-mono text-xs"
                />
                <Button type="button" size="sm" className="h-8 shrink-0 rounded-md text-xs" onClick={applyRenameId}>
                  Apply
                </Button>
              </CardContent>
            </Card>

            <details className="rounded-xl border border-[var(--bn-line)] bg-card/50 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Film library</summary>
              <div className="mt-3 space-y-3 pb-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[0.65rem]">Film name</Label>
                    <Input value={libraryFilmName} onChange={(e) => setLibraryFilmName(e.target.value)} className="h-8 rounded-md text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[0.65rem]">Screen title</Label>
                    <Input value={libraryEventTitle} onChange={(e) => setLibraryEventTitle(e.target.value)} className="h-8 rounded-md text-xs" />
                  </div>
                </div>
                <Button type="button" size="sm" variant="secondary" className="h-8 rounded-md text-xs" disabled={!libraryFilmName.trim()} onClick={saveFilmToLibrary}>
                  <Library className="mr-1 size-3" />
                  Save to library
                </Button>
                {savedCatalog.length === 0 ? (
                  <p className="text-[0.65rem] text-muted-foreground">No saved films.</p>
                ) : (
                  <ScrollArea className="max-h-40 rounded-md border border-[var(--bn-line)]">
                    <ul className="divide-y divide-[var(--bn-line)] p-1">
                      {savedCatalog.map((film) => (
                        <li key={film.id} className="flex flex-col gap-1 px-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{film.name}</p>
                            <p className="truncate font-mono text-[0.6rem] text-muted-foreground">{film.eventTitle}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-1">
                            <Button type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-[0.65rem]" onClick={() => loadFilmIntoBuilder(film)}>
                              Edit
                            </Button>
                            <Button type="button" size="sm" className="h-7 rounded-md px-2 text-[0.65rem]" onClick={() => sendFilmToOperator(film)}>
                              Operator
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 rounded-md px-2 text-destructive" onClick={() => removeSavedFilm(film.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            </details>

            <Button type="button" variant="ghost" size="sm" className="h-8 justify-start text-[0.65rem] text-muted-foreground" onClick={discardLocalDraft}>
              <RotateCcw className="mr-1 size-3" />
              Discard builder draft (sync from live room)
            </Button>
          </aside>

          <main className="lg:col-span-8">
            {node ? (
              <Card className="border-[var(--bn-line)] bg-card/80">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
                  <div>
                    <CardTitle className="font-heading text-xl font-normal">{node.title}</CardTitle>
                    <p className="font-mono text-[0.65rem] text-muted-foreground">{node.id}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md border-destructive/40 text-destructive"
                    disabled={selectedId === graph.rootId}
                    onClick={removeSelectedNode}
                  >
                    <Trash2 className="mr-1 size-3.5" />
                    Remove beat
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[0.7rem] leading-relaxed text-amber-950 dark:text-amber-100">
                    <strong className="font-medium">Local video files</strong> are stored in{" "}
                    <span className="font-mono">IndexedDB</span> on this browser only. Other computers, other browsers, or
                    cleared site data cannot play them — use a hosted URL for traveling shows.
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Title</Label>
                      <Input value={node.title} onChange={(e) => patchNode(node.id, { title: e.target.value })} className="h-9 rounded-md text-sm" />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Subtitle / description</Label>
                      <Input
                        value={node.subtitle ?? ""}
                        onChange={(e) => patchNode(node.id, { subtitle: e.target.value.trim() ? e.target.value : null })}
                        placeholder="Optional — shown under the title on screen"
                        className="h-9 rounded-md text-sm"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Video URL</Label>
                      <Input
                        value={node.videoUrl ?? ""}
                        onChange={async (e) => {
                          const v = e.target.value || null;
                          const prevLocal = node.localVideoKey;
                          if (v && prevLocal) {
                            await deleteLocalVideoBlob(prevLocal).catch(() => {});
                            patchNode(node.id, { videoUrl: v, localVideoKey: null });
                          } else {
                            patchNode(node.id, { videoUrl: v });
                          }
                        }}
                        placeholder="Direct MP4/WebM or YouTube watch URL"
                        className="h-9 rounded-md font-mono text-[0.7rem]"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Local file (this browser)</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="file"
                          accept="video/*"
                          className="max-w-xs cursor-pointer text-xs file:mr-2 file:rounded-md file:border file:border-[var(--bn-line)] file:bg-background file:px-2 file:py-1"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            const prevKey = node.localVideoKey;
                            const key = `local-${node.id}-${Date.now().toString(36)}`;
                            try {
                              await putLocalVideoBlob(key, file);
                              if (prevKey && prevKey !== key) await deleteLocalVideoBlob(prevKey).catch(() => {});
                              patchNode(node.id, { localVideoKey: key, videoUrl: null });
                            } catch {
                              /* quota */
                            }
                          }}
                        />
                        {node.localVideoKey ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-md text-xs"
                            onClick={async () => {
                              const k = node.localVideoKey;
                              if (!k) return;
                              patchNode(node.id, { localVideoKey: null });
                              await deleteLocalVideoBlob(k).catch(() => {});
                            }}
                          >
                            Clear local file
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input
                        id="isEnd"
                        type="checkbox"
                        checked={node.isEnd}
                        onChange={(e) => patchNode(node.id, { isEnd: e.target.checked })}
                        className="size-4 rounded border-[var(--bn-line)]"
                      />
                      <Label htmlFor="isEnd" className="text-sm font-normal">
                        End beat (no vote branches)
                      </Label>
                    </div>
                  </div>

                  <Separator className="bg-[var(--bn-line)]" />

                  <div className="space-y-1">
                    <Label className="text-xs">Vote question</Label>
                    <textarea
                      value={node.question ?? ""}
                      onChange={(e) => patchNode(node.id, { question: e.target.value.trim() ? e.target.value : null })}
                      rows={2}
                      placeholder="Required for non-ending beats"
                      className="w-full resize-none rounded-md border border-[var(--bn-line)] bg-background/50 px-3 py-2 text-sm outline-none ring-ring/40 focus-visible:ring-2"
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <BranchFields
                      title="Option A"
                      accent="coral"
                      graph={graph}
                      label={node.optionA?.label ?? ""}
                      nextId={node.optionA?.nextNodeId ?? ""}
                      ids={orderedIds.filter((x) => graph.nodes[x])}
                      onLabel={(v) =>
                        patchNode(node.id, {
                          optionA: v
                            ? { label: v, nextNodeId: (node.optionA?.nextNodeId as StoryNodeId) ?? graph.rootId }
                            : null,
                        })
                      }
                      onNext={(v) =>
                        patchNode(node.id, {
                          optionA: node.optionA
                            ? { ...node.optionA, nextNodeId: v as StoryNodeId }
                            : v
                              ? { label: "Option A", nextNodeId: v as StoryNodeId }
                              : null,
                        })
                      }
                    />
                    <BranchFields
                      title="Option B"
                      accent="teal"
                      graph={graph}
                      label={node.optionB?.label ?? ""}
                      nextId={node.optionB?.nextNodeId ?? ""}
                      ids={orderedIds.filter((x) => graph.nodes[x])}
                      onLabel={(v) =>
                        patchNode(node.id, {
                          optionB: v
                            ? { label: v, nextNodeId: (node.optionB?.nextNodeId as StoryNodeId) ?? graph.rootId }
                            : null,
                        })
                      }
                      onNext={(v) =>
                        patchNode(node.id, {
                          optionB: node.optionB
                            ? { ...node.optionB, nextNodeId: v as StoryNodeId }
                            : v
                              ? { label: "Option B", nextNodeId: v as StoryNodeId }
                              : null,
                        })
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-[var(--bn-line)] pt-4">
                    <Button type="button" size="sm" className="rounded-md" onClick={() => loadGraphOnOperator(graph, { displayName: libraryFilmName.trim() || "Untitled film", eventTitle: libraryEventTitle.trim() })}>
                      <Cable className="mr-1.5 size-3.5" />
                      Load on operator desk
                    </Button>
                    <p className="w-full text-[0.65rem] text-muted-foreground lg:w-auto lg:flex-1">
                      Confirms on the banner above. Use <span className="font-mono">Open /host</span> to drive playback.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">Select a beat.</p>
            )}
          </main>
        </div>

        <p className="mt-6 text-center text-[0.65rem] text-muted-foreground">{kcCopy.presents}</p>
      </div>
    </div>
  );
}

function BranchFields({
  title,
  accent,
  graph,
  label,
  nextId,
  onLabel,
  onNext,
  ids,
}: {
  title: string;
  accent: "coral" | "teal";
  graph: StoryGraph;
  label: string;
  nextId: string;
  onLabel: (v: string) => void;
  onNext: (v: string) => void;
  ids: StoryNodeId[];
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        accent === "coral" ? "border-[var(--bn-coral)]/35 bg-[var(--bn-coral)]/5" : "border-[var(--bn-teal)]/35 bg-[var(--bn-teal)]/5",
      )}
    >
      <p className="font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-1">
        <Label className="text-[0.65rem]">Label</Label>
        <Input value={label} onChange={(e) => onLabel(e.target.value)} className="h-8 rounded-md text-sm" />
      </div>
      <div className="mt-2 space-y-1">
        <Label className="text-[0.65rem]">Next beat</Label>
        <select
          value={nextId}
          onChange={(e) => onNext(e.target.value)}
          className="h-8 w-full rounded-md border border-[var(--bn-line)] bg-background/50 px-2 text-xs outline-none"
        >
          <option value="">— none —</option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {nodePickerLabel(graph, id)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
