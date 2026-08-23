"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Eye,
  Film,
  Info,
  ListChecks,
  Monitor,
  Play,
  Plus,
  Radio,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

import { StudioBadge } from "@/components/kasdan";
import { ReelTranscodeUploadZone } from "@/components/admin/reel-transcode-upload-zone";
import { ScreenPosterUploadZone } from "@/components/admin/screen-poster-upload-zone";
import { ShowBuilderExperiencePanel } from "@/components/admin/show-builder-experience-panel";
import { HowShowtimeWorksPanel, InlineHint } from "@/components/admin/show-builder-onboarding";
import { formatBuilderError } from "@/lib/admin/format-builder-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { getJoinUrl } from "@/lib/join/get-join-url";
import { exportBranchStoryDocument, importBranchStoryDocument } from "@/lib/showtime/branch-story-json";
import {
  type BeatLiveStatus,
  type BranchEditorNode,
  repackSortOrder,
  rowsToEditorNodes,
  validateBranchStory,
} from "@/lib/showtime/branch-story-validate";
import { computeShowReadiness } from "@/lib/showtime/show-builder-readiness";
import { readStoredOperatorCode, writeStoredOperatorCode } from "@/lib/showtime/operator-session";
import { slugTitleToShowCode } from "@/lib/showtime/show-code";
import { analyzeStoryBeatVideoUrl, normalizeShowtimeVideoUrlInput, resolveStoryVideoUrl } from "@/lib/showtime/video-url";
import {
  attachVideoAssetIds,
  beatsUsingVideoId,
  inferLibraryFromNodes,
  labelFromUrl,
  libraryEntryById,
  libraryEntryLabel,
  mergeLibraryForLoad,
  newVideoLibraryEntry,
  parseVideoLibrary,
  type VideoLibraryEntry,
} from "@/lib/showtime/video-library";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getEventByCode, listStoryNodesForEvent, updateEvent, type EventRow } from "@/lib/supabase/event-room";
import {
  experienceRehearsalCode,
  loadExperienceBuilderState,
  saveExperienceBuilderSnapshot,
} from "@/lib/supabase/experience-builder-snapshot";
import { getExperienceForEvent, type ExperienceRow } from "@/lib/supabase/experiences";
import { syncEventBuilderToExperience } from "@/lib/showtime/sync-event-to-experience";
import type { ExperienceStatus } from "@/lib/supabase/database.types";
import { normalizePosterImageUrlInput } from "@/lib/showtime/poster-image-url";
import { syncExperienceRehearsalEvent } from "@/lib/showtime/sync-experience-rehearsal";
import { replaceStoryNodesForEvent } from "@/lib/supabase/story-admin";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { useJoinBaseUrl } from "@/hooks/use-join-base-url";
import { cn } from "@/lib/utils";

const EXAMPLE_PUBLIC_VIDEO_PATH = "/videos/01_opening.mp4";
/** Small CC0 clip — works without adding files under `public/videos`. */
const SAMPLE_HOSTED_MP4 = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const textareaClass =
  "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[100px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function blankOpening(sortOrder = 0): BranchEditorNode {
  return {
    node_key: "01_OPENING",
    title: "Opening",
    video_url: "",
    operator_notes: "",
    beat_status: "draft",
    question: "",
    option_a_label: "",
    option_b_label: "",
    option_a_next_node_key: "",
    option_b_next_node_key: "",
    is_ending: false,
    sort_order: sortOrder,
  };
}

function formatBeatPickerLabel(all: BranchEditorNode[], beatCode: string): string {
  const n = all.find((x) => x.node_key === beatCode);
  const title = n?.title?.trim();
  return title ? `${beatCode} · ${title}` : beatCode;
}

function uniqueKey(keys: Set<string>, base: string): string {
  let k = base;
  let n = 2;
  while (keys.has(k)) {
    k = `${base}_${n}`;
    n += 1;
  }
  return k;
}

function runVideoMetadataTest(url: string, onDone: (status: "ok" | "fail") => void) {
  if (!url.trim() || typeof window === "undefined") {
    onDone("fail");
    return;
  }
  const { resolvedUrl } = analyzeStoryBeatVideoUrl(url, window.location.origin);
  if (!resolvedUrl) {
    onDone("fail");
    return;
  }
  const v = document.createElement("video");
  v.preload = "metadata";
  v.muted = true;
  v.playsInline = true;
  let done = false;
  const finish = (status: "ok" | "fail") => {
    if (done) return;
    done = true;
    window.clearTimeout(tid);
    v.removeAttribute("src");
    v.load();
    v.onerror = null;
    v.onloadedmetadata = null;
    onDone(status);
  };
  const tid = window.setTimeout(() => finish("fail"), 25_000);
  v.onloadedmetadata = () => finish("ok");
  v.onerror = () => finish("fail");
  v.src = resolvedUrl;
}

function screenOkStorageKey(eventId: string) {
  return `showtime.builder.screenOk:${eventId}`;
}

export function ShowBuilder({ experienceId }: { experienceId?: string } = {}) {
  const isExperienceMode = Boolean(experienceId);
  const router = useRouter();
  const joinBase = useJoinBaseUrl();
  const syncSupabaseEventMeta = useMockEventStore((s) => s.syncSupabaseEventMeta);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [experience, setExperience] = useState<ExperienceRow | null>(null);
  const [experienceTitleDraft, setExperienceTitleDraft] = useState("");
  const [experienceDescDraft, setExperienceDescDraft] = useState("");
  const [experiencePosterDraft, setExperiencePosterDraft] = useState("");
  const [experienceStatusDraft, setExperienceStatusDraft] = useState<ExperienceStatus>("draft");
  const [experienceMetaBusy, setExperienceMetaBusy] = useState(false);
  const [experienceMetaError, setExperienceMetaError] = useState<string | null>(null);
  const [rehearsalBusy, setRehearsalBusy] = useState(false);

  const [eventCodeInput, setEventCodeInput] = useState("");
  const [newShowTitle, setNewShowTitle] = useState("");
  const [event, setEvent] = useState<EventRow | null>(null);
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryEntry[]>([]);
  const [nodes, setNodes] = useState<BranchEditorNode[]>([blankOpening()]);
  const [selectedKey, setSelectedKey] = useState<string>("01_OPENING");
  const [loadErrorFriendly, setLoadErrorFriendly] = useState<string | null>(null);
  const [loadErrorTechnical, setLoadErrorTechnical] = useState<string | null>(null);
  const [saveErrorFriendly, setSaveErrorFriendly] = useState<string | null>(null);
  const [saveErrorTechnical, setSaveErrorTechnical] = useState<string | null>(null);
  const [createErrorFriendly, setCreateErrorFriendly] = useState<string | null>(null);
  const [createErrorTechnical, setCreateErrorTechnical] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [linkedExperience, setLinkedExperience] = useState<ExperienceRow | null>(null);
  const [pageOrigin, setPageOrigin] = useState("https://origin.invalid");
  const [libraryTestId, setLibraryTestId] = useState<string | null>(null);
  const [libraryTestStatus, setLibraryTestStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [beatTestStatus, setBeatTestStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [previewLibraryId, setPreviewLibraryId] = useState<string | null>(null);
  const [previewBeatOpen, setPreviewBeatOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importJsonError, setImportJsonError] = useState<string | null>(null);
  const [examplePathCopied, setExamplePathCopied] = useState(false);
  const [eventTitleDraft, setEventTitleDraft] = useState("");
  const [screenIdlePosterDraft, setScreenIdlePosterDraft] = useState("");
  const [eventMetaBusy, setEventMetaBusy] = useState(false);
  const [eventMetaError, setEventMetaError] = useState<string | null>(null);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [screenTestAck, setScreenTestAck] = useState(false);
  const [joinUrlCopied, setJoinUrlCopied] = useState(false);

  const canEdit = isExperienceMode ? Boolean(experience) : Boolean(event);
  const activeEvent = event;

  const joinUrlForEvent = useMemo(() => {
    if (!event || !joinBase.joinBaseUrl) return "";
    return getJoinUrl(event.code, joinBase.joinBaseUrl);
  }, [event, joinBase.joinBaseUrl]);

  const sortedNodes = useMemo(
    () => [...nodes].sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key)),
    [nodes],
  );

  const selected = useMemo(() => nodes.find((n) => n.node_key === selectedKey) ?? null, [nodes, selectedKey]);

  useEffect(() => {
    setPageOrigin(typeof window !== "undefined" ? window.location.origin : "https://origin.invalid");
  }, []);

  useEffect(() => {
    setBeatTestStatus("idle");
    setPreviewBeatOpen(false);
  }, [selectedKey, selected?.video_url]);

  useEffect(() => {
    if (event) {
      setEventTitleDraft(event.title);
      setScreenIdlePosterDraft(event.screen_idle_poster_url?.trim() ?? "");
    }
  }, [event]);

  useEffect(() => {
    if (!event?.id) {
      setScreenTestAck(false);
      return;
    }
    try {
      setScreenTestAck(sessionStorage.getItem(screenOkStorageKey(event.id)) === "1");
    } catch {
      setScreenTestAck(false);
    }
  }, [event?.id]);

  /** Full-graph validation on every keystroke made the UI feel janky; debounce while editing. */
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  useEffect(() => {
    const ms = 240;
    const id = window.setTimeout(() => {
      const { errors, warnings } = validateBranchStory(nodesRef.current);
      setValidationErrors(errors);
      setValidationWarnings(warnings);
    }, ms);
    return () => window.clearTimeout(id);
  }, [nodes]);

  const selectedResolvedUrl = useMemo(() => {
    if (!selected?.video_url?.trim()) return null;
    return resolveStoryVideoUrl(selected.video_url, pageOrigin);
  }, [selected, pageOrigin]);

  const beatVideoSelectValue = useMemo(() => {
    if (!selected) return "";
    if (selected.video_asset_id) return selected.video_asset_id;
    const u = selected.video_url?.trim();
    if (!u) return "";
    const match = videoLibrary.find((e) => e.url.trim() === u);
    return match?.id ?? "";
  }, [selected, videoLibrary]);

  const runValidate = useCallback(() => {
    const { ok, errors, warnings } = validateBranchStory(nodes);
    setValidationErrors(errors);
    setValidationWarnings(warnings);
    return ok;
  }, [nodes]);

  const readinessRows = useMemo(
    () =>
      computeShowReadiness({
        nodes,
        structuralErrors: validationErrors,
        screenTestAcknowledged: screenTestAck,
      }),
    [nodes, validationErrors, screenTestAck],
  );

  const hydrateFromEvent = useCallback(
    async (ev: EventRow) => {
      if (!supabase) return;
      const rows = await listStoryNodesForEvent(supabase, ev.id);
      const editor = rows.length === 0 ? [blankOpening()] : rowsToEditorNodes(rows);
      const packed = repackSortOrder(editor);
      const storedLib = parseVideoLibrary(ev.video_library);
      const lib = mergeLibraryForLoad(storedLib, packed);
      setEvent(ev);
      setVideoLibrary(lib);
      setNodes(attachVideoAssetIds(packed, lib));
      setSelectedKey(packed[0]?.node_key ?? "");
      setEventTitleDraft(ev.title);
      setScreenIdlePosterDraft(ev.screen_idle_poster_url?.trim() ?? "");
      syncSupabaseEventMeta({ eventId: ev.id, code: ev.code, title: ev.title });
      try {
        const linked = await getExperienceForEvent(supabase, ev.id);
        setLinkedExperience(linked);
      } catch {
        setLinkedExperience(null);
      }
      try {
        writeStoredOperatorCode(ev.code);
      } catch {
        /* ignore */
      }
    },
    [supabase, syncSupabaseEventMeta],
  );

  const handleLoad = useCallback(async (overrideCode?: string) => {
    setLoadErrorFriendly(null);
    setLoadErrorTechnical(null);
    setSaveErrorFriendly(null);
    setSaveErrorTechnical(null);
    if (!supabase) {
      setLoadErrorFriendly("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      setLoadErrorTechnical("createSupabaseBrowserClient missing env");
      return;
    }
    const code = (overrideCode ?? eventCodeInput).trim().toUpperCase();
    if (overrideCode) setEventCodeInput(code);
    if (!code) {
      setLoadErrorFriendly("Type a show code first (the same code printed on your QR sheet).");
      setLoadErrorTechnical("");
      return;
    }
    setBusy(true);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) {
        setLoadErrorFriendly(anon.message);
        setLoadErrorTechnical(anon.technical ?? "");
        setEvent(null);
        setVideoLibrary([]);
        return;
      }
      const ev = await getEventByCode(supabase, code);
      if (!ev) {
        setLoadErrorFriendly(`No show exists with code “${code}”. Create a new show below, or check the spelling.`);
        setLoadErrorTechnical(`getEventByCode returned null for ${code}`);
        setEvent(null);
        setVideoLibrary([]);
        return;
      }
      await hydrateFromEvent(ev);
    } catch (e) {
      const { friendly, technical } = formatBuilderError(e);
      setLoadErrorFriendly(friendly);
      setLoadErrorTechnical(technical);
      setEvent(null);
      setVideoLibrary([]);
    } finally {
      setBusy(false);
    }
  }, [supabase, eventCodeInput, hydrateFromEvent]);

  const autoLoadAttemptedRef = useRef(false);
  useEffect(() => {
    if (isExperienceMode || autoLoadAttemptedRef.current || !supabase || event) return;
    const stored = readStoredOperatorCode();
    if (stored.length < 3) return;
    autoLoadAttemptedRef.current = true;
    void handleLoad(stored);
  }, [supabase, event, handleLoad, isExperienceMode]);

  const hydrateFromExperience = useCallback(
    async (id: string) => {
      if (!supabase) return;
      setLoadErrorFriendly(null);
      setLoadErrorTechnical(null);
      setBusy(true);
      try {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) {
          setLoadErrorFriendly(anon.message);
          setLoadErrorTechnical(anon.technical ?? "");
          return;
        }
        const state = await loadExperienceBuilderState(supabase, id);
        if (!state) {
          setLoadErrorFriendly("Experience not found.");
          return;
        }
        setExperience(state.experience);
        setExperienceTitleDraft(state.experience.title);
        setExperienceDescDraft(state.experience.description);
        setExperiencePosterDraft(state.experience.poster_url?.trim() ?? "");
        setExperienceStatusDraft(state.experience.status);
        setVideoLibrary(state.videoLibrary);
        setNodes(state.nodes);
        setSelectedKey(state.nodes[0]?.node_key ?? "");
        if (state.rehearsalEvent) {
          setEvent(state.rehearsalEvent);
          setEventTitleDraft(state.rehearsalEvent.title);
          setScreenIdlePosterDraft(state.rehearsalEvent.screen_idle_poster_url?.trim() ?? "");
          syncSupabaseEventMeta({
            eventId: state.rehearsalEvent.id,
            code: state.rehearsalEvent.code,
            title: state.rehearsalEvent.title,
          });
          try {
            writeStoredOperatorCode(state.rehearsalEvent.code);
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        const { friendly, technical } = formatBuilderError(e);
        setLoadErrorFriendly(friendly);
        setLoadErrorTechnical(technical);
      } finally {
        setBusy(false);
      }
    },
    [supabase, syncSupabaseEventMeta],
  );

  const experienceLoadRef = useRef(false);
  useEffect(() => {
    if (!isExperienceMode || !experienceId || !supabase || experienceLoadRef.current) return;
    experienceLoadRef.current = true;
    void hydrateFromExperience(experienceId);
  }, [isExperienceMode, experienceId, supabase, hydrateFromExperience]);

  const handleCreateShow = useCallback(async () => {
    setCreateErrorFriendly(null);
    setCreateErrorTechnical(null);
    const typed = eventCodeInput.trim().toUpperCase();
    const fromTitle = slugTitleToShowCode(newShowTitle);
    const code = typed.length >= 3 ? typed : fromTitle;
    if (typed.length < 3 && fromTitle.length >= 3) {
      setEventCodeInput(fromTitle);
    }
    if (code.length < 3) {
      setCreateErrorFriendly(
        "Add a show code (e.g. DAVOD) in the field above, or a title with at least 3 letters/numbers so we can build a code — the code is the short QR word, not the same box as the title.",
      );
      return;
    }
    if (!supabase) {
      setCreateErrorFriendly(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }
    setCreateBusy(true);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) {
        setCreateErrorFriendly(anon.message);
        setCreateErrorTechnical(anon.technical ?? "");
        return;
      }

      const titleArg = newShowTitle.trim() || null;
      const { data: newEventId, error: rpcError } = await supabase.rpc("create_show_for_builder", {
        p_code: code,
        p_title: titleArg,
      });

      if (!rpcError && newEventId) {
        const ev = await getEventByCode(supabase, code);
        if (!ev) {
          setCreateErrorFriendly("The show was created but could not be reloaded. Tap “Load show”.");
          setCreateErrorTechnical(`getEventByCode returned null for ${code}`);
          return;
        }
        setEventCodeInput(ev.code);
        await hydrateFromEvent(ev);
        setNewShowTitle("");
        return;
      }

      const rpcMsg = rpcError?.message ?? "";
      if (rpcMsg.includes("CODE_TAKEN")) {
        setCreateErrorFriendly(
          "That show code already exists. Tap “Load show” to open it, or pick a different code.",
        );
        setCreateErrorTechnical("unique events.code");
        return;
      }
      if (
        rpcMsg.includes("Show codes must") ||
        rpcMsg.includes("Use only letters") ||
        rpcMsg.includes("letters and numbers")
      ) {
        setCreateErrorFriendly(rpcMsg);
        setCreateErrorTechnical(rpcError?.details ?? "");
        return;
      }

      const res = await fetch("/api/admin/create-show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, title: newShowTitle.trim() || undefined }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        technical?: string;
        event?: EventRow;
      };
      if (!data.ok || !data.event) {
        const rpcHint =
          rpcError && rpcMsg && !rpcMsg.includes("CODE_TAKEN")
            ? ` (${rpcMsg})`
            : "";
        setCreateErrorFriendly(
          (data.error ?? "Could not create the show.") +
            rpcHint +
            " Check: SUPABASE_SERVICE_ROLE_KEY in .env.local (no quotes), NEXT_PUBLIC_SUPABASE_URL matches this project, dev server restarted after editing env.",
        );
        setCreateErrorTechnical(
          [data.technical ?? `HTTP ${res.status}`, rpcError ? `rpc: ${rpcMsg}` : ""].filter(Boolean).join(" | "),
        );
        return;
      }
      setEventCodeInput(data.event.code);
      await hydrateFromEvent(data.event);
      setNewShowTitle("");
    } catch (e) {
      const { friendly, technical } = formatBuilderError(e);
      setCreateErrorFriendly(friendly);
      setCreateErrorTechnical(technical);
    } finally {
      setCreateBusy(false);
    }
  }, [eventCodeInput, newShowTitle, supabase, hydrateFromEvent]);

  const handleSaveEventTitle = useCallback(async () => {
    setEventMetaError(null);
    if (!supabase || !event) return;
    setEventMetaBusy(true);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) {
        setEventMetaError(anon.message);
        return;
      }
      const nextTitle = eventTitleDraft.trim() || event.title;
      await updateEvent(supabase, event.id, { title: nextTitle });
      const ev = await getEventByCode(supabase, event.code);
      if (ev) {
        setEvent(ev);
        syncSupabaseEventMeta({ eventId: ev.id, code: ev.code, title: ev.title });
      }
    } catch (e) {
      setEventMetaError(formatBuilderError(e).friendly);
    } finally {
      setEventMetaBusy(false);
    }
  }, [supabase, event, eventTitleDraft, syncSupabaseEventMeta]);

  const applyScreenIdlePosterUrl = useCallback(
    async (nextRaw: string | null) => {
      setEventMetaError(null);
      if (!supabase || !event) return;
      setEventMetaBusy(true);
      try {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) {
          setEventMetaError(anon.message);
          return;
        }
        const next = nextRaw?.trim() ? nextRaw.trim() : null;
        await updateEvent(supabase, event.id, { screen_idle_poster_url: next });
        const ev = await getEventByCode(supabase, event.code);
        if (ev) {
          setEvent(ev);
          syncSupabaseEventMeta({ eventId: ev.id, code: ev.code, title: ev.title });
          setScreenIdlePosterDraft(ev.screen_idle_poster_url?.trim() ?? "");
        }
      } catch (e) {
        setEventMetaError(formatBuilderError(e).friendly);
      } finally {
        setEventMetaBusy(false);
      }
    },
    [supabase, event, syncSupabaseEventMeta],
  );

  const handleSave = useCallback(async () => {
    setSaveErrorFriendly(null);
    setSaveErrorTechnical(null);
    if (!supabase) {
      setSaveErrorFriendly("Supabase is not configured.");
      return;
    }
    if (isExperienceMode) {
      if (!experience || !experienceId) {
        setSaveErrorFriendly("Experience is still loading.");
        return;
      }
    } else if (!event) {
      setSaveErrorFriendly("Load or create a show before saving.");
      return;
    }
    const ok = runValidate();
    if (!ok) {
      setSaveErrorFriendly("Fix the blocking issues in “Check show” before saving.");
      return;
    }
    setBusy(true);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) {
        setSaveErrorFriendly(anon.message);
        setSaveErrorTechnical(anon.technical ?? "");
        return;
      }
      if (isExperienceMode && experienceId) {
        const updated = await saveExperienceBuilderSnapshot(supabase, experienceId, nodes, videoLibrary, {
          title: experienceTitleDraft,
          description: experienceDescDraft,
          posterUrl: normalizePosterImageUrlInput(experiencePosterDraft, pageOrigin) || null,
          status: experienceStatusDraft,
        });
        setExperience(updated);
        setExperiencePosterDraft(updated.poster_url?.trim() ?? "");
        setLastSavedAt(Date.now());
      } else if (event) {
        await replaceStoryNodesForEvent(supabase, event.id, repackSortOrder(nodes), { videoLibrary });
        const synced = await syncEventBuilderToExperience(supabase, event, nodes, videoLibrary, {
          title: eventTitleDraft.trim() || event.title,
        });
        setLinkedExperience(synced);
        const ev = await getEventByCode(supabase, event.code);
        if (ev) setEvent(ev);
        setLastSavedAt(Date.now());
      }
      const { errors, warnings } = validateBranchStory(nodes);
      setValidationErrors(errors);
      setValidationWarnings(warnings);
    } catch (e) {
      const { friendly, technical } = formatBuilderError(e);
      setSaveErrorFriendly(friendly);
      setSaveErrorTechnical(technical);
    } finally {
      setBusy(false);
    }
  }, [
    supabase,
    event,
    experience,
    experienceId,
    isExperienceMode,
    nodes,
    videoLibrary,
    runValidate,
    experienceTitleDraft,
    experienceDescDraft,
    experiencePosterDraft,
    experienceStatusDraft,
    eventTitleDraft,
    screenIdlePosterDraft,
  ]);

  const handleTestRehearsal = useCallback(async () => {
    if (!supabase || !experience || !experienceId) return;
    setRehearsalBusy(true);
    setSaveErrorFriendly(null);
    setSaveErrorTechnical(null);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) {
        setSaveErrorFriendly(anon.message);
        return;
      }
      const ok = runValidate();
      if (!ok) {
        setSaveErrorFriendly("Fix blocking issues in “Check show” before rehearsing.");
        return;
      }
      await saveExperienceBuilderSnapshot(supabase, experienceId, nodes, videoLibrary, {
        title: experienceTitleDraft,
        description: experienceDescDraft,
        posterUrl: normalizePosterImageUrlInput(experiencePosterDraft, pageOrigin) || null,
        status: experienceStatusDraft,
      });
      const synced = await syncExperienceRehearsalEvent(supabase, experience, nodes, videoLibrary);
      setEvent(synced.event);
      setEventTitleDraft(synced.event.title);
      setScreenIdlePosterDraft(synced.event.screen_idle_poster_url?.trim() ?? "");
      syncSupabaseEventMeta({ eventId: synced.event.id, code: synced.event.code, title: synced.event.title });
      writeStoredOperatorCode(synced.code);
      setLastSavedAt(Date.now());
    } catch (e) {
      const { friendly, technical } = formatBuilderError(e);
      setSaveErrorFriendly(friendly);
      setSaveErrorTechnical(technical);
    } finally {
      setRehearsalBusy(false);
    }
  }, [
    supabase,
    experience,
    experienceId,
    nodes,
    videoLibrary,
    runValidate,
    experienceTitleDraft,
    experienceDescDraft,
    experiencePosterDraft,
    experienceStatusDraft,
    syncSupabaseEventMeta,
  ]);

  const handleSaveExperienceMeta = useCallback(
    async (overrides?: { posterUrl?: string | null }) => {
      if (!supabase || !experienceId) return;
      setExperienceMetaError(null);
      setExperienceMetaBusy(true);
      try {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) {
          setExperienceMetaError(anon.message);
          return;
        }
        const posterRaw =
          overrides?.posterUrl !== undefined ? overrides.posterUrl : experiencePosterDraft;
        const updated = await saveExperienceBuilderSnapshot(supabase, experienceId, nodes, videoLibrary, {
          title: experienceTitleDraft,
          description: experienceDescDraft,
          posterUrl: normalizePosterImageUrlInput(posterRaw, pageOrigin) || null,
          status: experienceStatusDraft,
        });
        setExperience(updated);
        setExperiencePosterDraft(updated.poster_url?.trim() ?? "");
      } catch (e) {
        setExperienceMetaError(formatBuilderError(e).friendly);
        throw e;
      } finally {
        setExperienceMetaBusy(false);
      }
    },
    [
    supabase,
    experienceId,
    nodes,
    videoLibrary,
    experienceTitleDraft,
    experienceDescDraft,
    experiencePosterDraft,
    experienceStatusDraft,
    pageOrigin,
  ]);

  const handleLoadIntoHost = useCallback(() => {
    if (!event) return;
    try {
      writeStoredOperatorCode(event.code);
    } catch {
      /* ignore */
    }
    syncSupabaseEventMeta({ eventId: event.id, code: event.code, title: event.title });
    router.push("/host");
  }, [event, router, syncSupabaseEventMeta]);

  const copyExampleVideoPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_PUBLIC_VIDEO_PATH);
      setExamplePathCopied(true);
      window.setTimeout(() => setExamplePathCopied(false), 2000);
    } catch {
      setExamplePathCopied(false);
    }
  }, []);

  const updateNode = useCallback((key: string, patch: Partial<BranchEditorNode>) => {
    const p = { ...patch };
    if (typeof p.video_url === "string") {
      p.video_url = normalizeShowtimeVideoUrlInput(p.video_url);
    }
    if (p.node_key !== undefined && p.node_key !== key && selectedKey === key) {
      setSelectedKey(p.node_key);
    }
    setNodes((prev) => prev.map((n) => (n.node_key === key ? { ...n, ...p } : n)));
  }, [selectedKey]);

  const updateLibraryEntry = useCallback((id: string, patch: Partial<VideoLibraryEntry>) => {
    const normalizedPatch =
      patch.url !== undefined ? { ...patch, url: normalizeShowtimeVideoUrlInput(patch.url) } : patch;
    setVideoLibrary((prev) => prev.map((e) => (e.id === id ? { ...e, ...normalizedPatch } : e)));
    if (normalizedPatch.url !== undefined) {
      const nextUrl = normalizedPatch.url.trim();
      setNodes((prev) => prev.map((n) => (n.video_asset_id === id ? { ...n, video_url: nextUrl } : n)));
    }
  }, []);

  const handleExportJson = useCallback(() => {
    if (!canEdit || typeof window === "undefined") return;
    const json = exportBranchStoryDocument(nodes, videoLibrary);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = isExperienceMode && experience ? experience.slug : event?.code.toLowerCase() ?? "show";
    a.download = `show-backup-${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [canEdit, isExperienceMode, experience, event, nodes, videoLibrary]);

  const handleImportJson = useCallback(() => {
    setImportJsonError(null);
    const r = importBranchStoryDocument(importJsonText);
    if (!r.ok) {
      setImportJsonError(r.errors.join(" "));
      return;
    }
    const lib = r.videoLibrary.length ? r.videoLibrary : inferLibraryFromNodes(r.nodes);
    setVideoLibrary(lib);
    setNodes(attachVideoAssetIds(repackSortOrder(r.nodes), lib));
    setSelectedKey(r.nodes[0]?.node_key ?? "");
    setImportJsonText("");
  }, [importJsonText]);

  const addLibraryVideo = useCallback(() => {
    const entry = newVideoLibraryEntry({ label: "New reel", url: "" });
    setVideoLibrary((prev) => [...prev, entry]);
  }, []);

  const addSampleHostedReel = useCallback(() => {
    if (!canEdit) return;
    setVideoLibrary((prev) => {
      const empty = prev.find((e) => !e.url.trim());
      if (empty) {
        return prev.map((e) =>
          e.id === empty.id ? { ...e, url: SAMPLE_HOSTED_MP4, label: e.label?.trim() === "New reel" ? "Sample (HTTPS)" : e.label } : e,
        );
      }
      return [...prev, newVideoLibraryEntry({ label: "Sample (HTTPS)", url: SAMPLE_HOSTED_MP4 })];
    });
  }, [event]);

  const onReelFileUploaded = useCallback((publicPath: string) => {
    setVideoLibrary((prev) => {
      const empty = prev.find((e) => !e.url.trim());
      const label = labelFromUrl(publicPath);
      if (empty) {
        return prev.map((e) =>
          e.id === empty.id
            ? {
                ...e,
                url: publicPath,
                label: e.label.trim() === "New reel" || !e.label.trim() ? label : e.label,
              }
            : e,
        );
      }
      return [...prev, newVideoLibraryEntry({ label, url: publicPath })];
    });
  }, []);

  const deleteLibraryVideo = useCallback(
    (id: string) => {
      const entry = videoLibrary.find((e) => e.id === id);
      if (!entry) return;
      setVideoLibrary((prev) => prev.filter((e) => e.id !== id));
      setNodes((prev) =>
        prev.map((n) =>
          n.video_asset_id === id || (!n.video_asset_id && n.video_url.trim() === entry.url.trim())
            ? { ...n, video_url: "", video_asset_id: undefined }
            : n,
        ),
      );
      if (previewLibraryId === id) setPreviewLibraryId(null);
    },
    [videoLibrary, previewLibraryId],
  );

  const testLibraryVideo = useCallback((entry: VideoLibraryEntry) => {
    setLibraryTestId(entry.id);
    setLibraryTestStatus("checking");
    runVideoMetadataTest(entry.url, (s) => {
      setLibraryTestStatus(s);
      setLibraryTestId(null);
    });
  }, []);

  const testBeatVideo = useCallback(() => {
    if (!selected?.video_url) return;
    setBeatTestStatus("checking");
    runVideoMetadataTest(selected.video_url, setBeatTestStatus);
  }, [selected]);

  const addNode = useCallback(() => {
    setNodes((prev) => {
      const keys = new Set(prev.map((p) => p.node_key.trim()).filter(Boolean));
      const maxSort = prev.reduce((m, n) => Math.max(m, n.sort_order), -1);
      const nk = uniqueKey(keys, `NEW_${String(prev.length + 1).padStart(2, "0")}`);
      const next: BranchEditorNode = {
        node_key: nk,
        title: "New beat",
        video_url: "",
        operator_notes: "",
        beat_status: "draft",
        question: "",
        option_a_label: "",
        option_b_label: "",
        option_a_next_node_key: "",
        option_b_next_node_key: "",
        is_ending: false,
        sort_order: maxSort + 1,
      };
      setSelectedKey(nk);
      return [...prev, next];
    });
  }, []);

  const duplicateNode = useCallback(() => {
    if (!selected) return;
    setNodes((prev) => {
      const keys = new Set(prev.map((p) => p.node_key.trim()).filter(Boolean));
      const nk = uniqueKey(keys, `${selected.node_key}_COPY`);
      const maxSort = prev.reduce((m, n) => Math.max(m, n.sort_order), -1);
      const copy: BranchEditorNode = {
        ...selected,
        node_key: nk,
        title: selected.title ? `${selected.title} (copy)` : "Copy",
        sort_order: maxSort + 1,
      };
      setSelectedKey(nk);
      return [...prev, copy];
    });
  }, [selected]);

  const deleteNode = useCallback(() => {
    if (!selected || nodes.length <= 1) return;
    const k = selected.node_key;
    setNodes((prev) => {
      const filtered = prev.filter((n) => n.node_key !== k);
      const packed = repackSortOrder(filtered);
      if (selectedKey === k) {
        setSelectedKey(packed[0]?.node_key ?? "");
      }
      return packed;
    });
  }, [selected, nodes.length, selectedKey]);

  const moveSort = useCallback((key: string, dir: -1 | 1) => {
    setNodes((prev) => {
      const sorted = [...prev].sort((a, b) => a.sort_order - b.sort_order || a.node_key.localeCompare(b.node_key));
      const i = sorted.findIndex((n) => n.node_key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return prev;
      const a = sorted[i]!;
      const b = sorted[j]!;
      const swapped = prev.map((n) => {
        if (n.node_key === a.node_key) return { ...n, sort_order: b.sort_order };
        if (n.node_key === b.node_key) return { ...n, sort_order: a.sort_order };
        return n;
      });
      return repackSortOrder(swapped);
    });
  }, []);

  const nextKeyOptions = useMemo(() => sortedNodes.map((n) => n.node_key).filter((k) => k.trim()), [sortedNodes]);

  const markScreenTested = useCallback(() => {
    if (!event?.id) return;
    try {
      sessionStorage.setItem(screenOkStorageKey(event.id), "1");
    } catch {
      /* ignore */
    }
    setScreenTestAck(true);
  }, [event]);

  const operatorLines = useMemo(() => {
    if (!selected) {
      return { current: "—", ifA: "—", ifB: "—" };
    }
    const byKey = new Map(sortedNodes.map((b) => [b.node_key.trim(), b]));
    const reelLabel = libraryEntryLabel(videoLibrary, selected.video_asset_id);
    const reelLine =
      selected.video_url.trim() ? `${reelLabel || labelFromUrl(selected.video_url)}` : "No reel assigned yet";

    const describeNext = (nextKey: string) => {
      const k = nextKey.trim();
      if (!k) return "—";
      const b = byKey.get(k);
      if (!b) return `Unknown beat “${k}”`;
      const lab = libraryEntryLabel(videoLibrary, b.video_asset_id) || labelFromUrl(b.video_url);
      const t = b.title?.trim() || k;
      const u = b.video_url?.trim() || "no URL";
      return `${t} → ${lab} (${u})`;
    };

    if (selected.is_ending) {
      return { current: reelLine, ifA: "— (final beat)", ifB: "— (final beat)" };
    }
    return {
      current: reelLine,
      ifA: describeNext(selected.option_a_next_node_key ?? ""),
      ifB: describeNext(selected.option_b_next_node_key ?? ""),
    };
  }, [selected, sortedNodes, videoLibrary]);

  const anyTechnical =
    loadErrorTechnical || saveErrorTechnical || createErrorTechnical
      ? [loadErrorTechnical, saveErrorTechnical, createErrorTechnical].filter(Boolean).join("\n---\n")
      : null;

  if (!supabase) {
    return (
      <div className="show-builder-shell showtime-functional mx-auto max-w-2xl space-y-4 p-6">
        <StudioBadge />
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Show builder</h1>
        <p className="text-muted-foreground text-sm">Configure Supabase in the environment to edit shows.</p>
        <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
          Back to admin
        </Link>
      </div>
    );
  }

  return (
    <div className="show-builder-shell showtime-functional flex min-h-[calc(100dvh-4rem)] flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card/80 px-4 py-3 sm:px-5 md:px-6">
        <StudioBadge />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground">
            {isExperienceMode ? "Experience builder" : "Show builder"}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {isExperienceMode
              ? "Same editor as Edit show — save your graph here, rehearse at home, launch the identical beats at the venue."
              : "Kasdan Showtime — cue your live cinema night, reels, branches, and booth notes in one place."}
          </p>
          <InlineHint className="mt-1.5">
            {isExperienceMode ? (
              <>
                Use <span className="font-semibold text-foreground">Save experience</span> then{" "}
                <span className="font-semibold text-foreground">Test on this laptop</span> before doors open.
              </>
            ) : (
              <>
                <span className="font-semibold text-foreground">Save show</span> also saves this graph to{" "}
                <span className="font-semibold text-foreground">Movie Experiences</span> for launch and rehearsal.
              </>
            )}
          </InlineHint>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={!canEdit || busy}>
            <Save className="mr-1 size-4" />
            {isExperienceMode ? "Save experience" : "Save show"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={runValidate} disabled={!canEdit || busy}>
            <ListChecks className="mr-1 size-4" />
            Check show
          </Button>
          {isExperienceMode && experienceId ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleTestRehearsal()} disabled={!canEdit || rehearsalBusy || busy}>
                <Play className="mr-1 size-4" />
                Test on laptop
              </Button>
              <Link href={`/experiences/${experienceId}/launch`} className={buttonVariants({ variant: "default", size: "sm" })}>
                <Radio className="mr-1 size-4" />
                Launch at venue
              </Link>
              <Link href="/experiences" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                ← Experiences
              </Link>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoadIntoHost}
                disabled={!activeEvent}
                title="Opens the live operator desk (/host) for this show code."
              >
                <Cable className="mr-1 size-4" />
                Operator desk
              </Button>
              <Link href="/show" className={buttonVariants({ variant: "default", size: "sm" })}>
                <Radio className="mr-1 size-4" />
                Go live
              </Link>
              <Link
                href={linkedExperience ? `/experiences/${linkedExperience.id}/edit` : "/experiences"}
                className={buttonVariants({ variant: "outline", size: "sm" })}
                title={
                  linkedExperience
                    ? "Open this show in Movie Experiences"
                    : "Save the show once to add it to Movie Experiences"
                }
              >
                <Film className="mr-1 size-4" />
                Experiences
              </Link>
              <Link href="/admin" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                ← Admin
              </Link>
            </>
          )}
        </div>
      </header>

      {!canEdit && !busy && !isExperienceMode ? (
        <div className="shrink-0 border-b border-primary/25 bg-primary/10 px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-semibold text-foreground">No show open — reels and beats are locked</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                For show night, use <strong className="font-semibold text-foreground">Go live</strong> first (one button). Come back here only to edit reels and story before doors open.
              </p>
            </div>
            <Link href="/show" className={cn(buttonVariants({ size: "lg" }), "shrink-0 no-underline")}>
              <Play className="mr-2 size-4 fill-current" />
              Open show night
            </Link>
          </div>
        </div>
      ) : null}

      {(loadErrorFriendly || saveErrorFriendly || createErrorFriendly) && (
        <div className="kc-showtime-banner kc-showtime-banner--warn shrink-0">
          <div className="mx-auto flex max-w-6xl flex-col gap-2.5 text-sm text-foreground">
            {loadErrorFriendly ? (
              <p className="leading-relaxed">
                <span className="font-semibold text-foreground">Could not load show.</span> {loadErrorFriendly}
              </p>
            ) : null}
            {createErrorFriendly ? (
              <p className="leading-relaxed">
                <span className="font-semibold text-foreground">Could not create show.</span> {createErrorFriendly}
              </p>
            ) : null}
            {saveErrorFriendly ? (
              <p className="leading-relaxed">
                <span className="font-semibold text-foreground">Save did not complete.</span> {saveErrorFriendly}
              </p>
            ) : null}
            {anyTechnical ? (
              <details
                open={devPanelOpen}
                onToggle={(e) => setDevPanelOpen((e.target as HTMLDetailsElement).open)}
                className="rounded-md border border-[color-mix(in_oklch,var(--kc-gold-line)_55%,transparent)] bg-card/60"
              >
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                  Technical details (for developers)
                </summary>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all px-3 pb-3 font-mono text-[11px] text-muted-foreground">
                  {anyTechnical}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      )}

      <div className="mx-auto grid min-h-0 w-full max-w-[1920px] flex-1 grid-cols-1 gap-0 lg:grid-cols-12 lg:divide-x lg:divide-border/80">
        {/* Left: event + readiness + library */}
        <aside className="flex min-h-[320px] flex-col border-b bg-card/30 lg:col-span-3 lg:min-h-0 lg:border-b-0">
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 p-4">
              <HowShowtimeWorksPanel />

              {isExperienceMode && experience && experienceId ? (
                <ShowBuilderExperiencePanel
                  experience={experience}
                  experienceId={experienceId}
                  beatCount={sortedNodes.length}
                  rehearsalEvent={activeEvent}
                  rehearsalCode={experienceRehearsalCode(experience.slug)}
                  joinBaseUrl={joinBase.joinBaseUrl}
                  titleDraft={experienceTitleDraft}
                  descriptionDraft={experienceDescDraft}
                  posterDraft={experiencePosterDraft}
                  statusDraft={experienceStatusDraft}
                  metaBusy={experienceMetaBusy}
                  metaError={experienceMetaError}
                  rehearsalBusy={rehearsalBusy}
                  joinUrlCopied={joinUrlCopied}
                  onTitleChange={setExperienceTitleDraft}
                  onDescriptionChange={setExperienceDescDraft}
                  onPosterChange={setExperiencePosterDraft}
                  onStatusChange={setExperienceStatusDraft}
                  onSaveMeta={() => void handleSaveExperienceMeta()}
                  onPosterApply={async (url) => {
                    const next = url?.trim() ?? "";
                    setExperiencePosterDraft(next);
                    await handleSaveExperienceMeta({ posterUrl: next || null });
                  }}
                  onTestRehearsal={() => void handleTestRehearsal()}
                  onCopyJoin={() => {
                    const code = experienceRehearsalCode(experience.slug);
                    const url = joinBase.joinBaseUrl ? getJoinUrl(code, joinBase.joinBaseUrl) : "";
                    if (!url) return;
                    void navigator.clipboard.writeText(url).then(() => {
                      setJoinUrlCopied(true);
                      window.setTimeout(() => setJoinUrlCopied(false), 2000);
                    });
                  }}
                />
              ) : null}

              {!isExperienceMode ? (
              <Card
                id="show-builder-event"
                size="sm"
                className="border-amber-950/15 bg-gradient-to-br from-card to-amber-950/[0.06] shadow-md ring-amber-950/10"
              >
                <CardHeader className="border-b border-border/60 pb-3">
                  <CardTitle className="font-heading text-base">Event</CardTitle>
                  <CardDescription>Load or create the room everyone shares.</CardDescription>
                  <InlineHint className="mt-2">
                    Event code is the short word on posters and QR; guests type it so their phones land in the same room as your screen.
                  </InlineHint>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <p
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs leading-relaxed",
                      event
                        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-50"
                        : "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-50",
                    )}
                    role="status"
                  >
                    {event ? (
                      <>
                        <strong className="font-semibold">Show open.</strong> Editing{" "}
                        <span className="font-mono">{event.code}</span> — reel and beat buttons are enabled below.
                      </>
                    ) : (
                      <>
                        <strong className="font-semibold">No show open yet.</strong> Tap <span className="font-semibold">Load show</span> or{" "}
                        <span className="font-semibold">Create new show</span> first. Until then, Add reel stays disabled.
                      </>
                    )}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor="show-code">Show code</Label>
                      <InlineHint>
                        Same code the operator types in /host and /screen. If you leave this empty, “Create new show” uses
                        letters/numbers from the new title below (e.g. Davod → DAVOD).
                      </InlineHint>
                      <Input
                        id="show-code"
                        className="font-mono uppercase"
                        value={eventCodeInput}
                        onChange={(e) => setEventCodeInput(e.target.value.toUpperCase())}
                        placeholder="e.g. NIGHT1 or leave blank if title becomes the code"
                        disabled={busy || createBusy}
                      />
                    </div>
                    <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={() => void handleLoad()} disabled={busy || createBusy}>
                      Load show
                    </Button>
                  </div>
                  <div className="space-y-1.5 border-t border-border/60 pt-3">
                    <Label htmlFor="new-title">New show title (optional)</Label>
                    <Input
                      id="new-title"
                      value={newShowTitle}
                      onChange={(e) => setNewShowTitle(e.target.value)}
                      placeholder="Working title for a brand-new show"
                      disabled={createBusy}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => void handleCreateShow()}
                      disabled={
                        createBusy ||
                        (eventCodeInput.trim().length < 3 && slugTitleToShowCode(newShowTitle).length < 3)
                      }
                    >
                      {createBusy ? "Creating…" : "Create new show with this code"}
                    </Button>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Creating a show uses a database function (no service role needed) after you run this repo&apos;s Supabase
                      migrations. Optional: add <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> for the legacy API
                      fallback if your database is older.
                    </p>
                  </div>
                  {event ? (
                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <Label htmlFor="event-title">Display title</Label>
                      <Input id="event-title" value={eventTitleDraft} onChange={(e) => setEventTitleDraft(e.target.value)} disabled={eventMetaBusy} />
                      {eventMetaError ? (
                        <div className="rounded-md border border-[color-mix(in_oklch,var(--kc-gold-line)_45%,transparent)] kc-showtime-banner--warn px-3 py-2 text-xs leading-relaxed text-foreground">
                          {eventMetaError}
                        </div>
                      ) : null}
                      <Button type="button" size="sm" variant="secondary" onClick={() => void handleSaveEventTitle()} disabled={eventMetaBusy}>
                        Save title
                      </Button>
                      <div className="space-y-1.5 border-t border-border/60 pt-3">
                        <Label htmlFor="screen-idle-poster">Walk-in / screen image (optional)</Label>
                        <InlineHint>Shown full-screen on /screen before the first reel. Use a 16∶9 image; HTTPS URL or a site path (e.g. after dev upload).</InlineHint>
                        <Input
                          id="screen-idle-poster"
                          value={screenIdlePosterDraft}
                          onChange={(e) => setScreenIdlePosterDraft(e.target.value)}
                          disabled={eventMetaBusy}
                          className="font-mono text-xs"
                          placeholder="https://… or /screen-posters/…"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={eventMetaBusy}
                            onClick={() => void applyScreenIdlePosterUrl(screenIdlePosterDraft)}
                          >
                            Save image URL
                          </Button>
                          {screenIdlePosterDraft.trim() ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={eventMetaBusy}
                              onClick={() => void applyScreenIdlePosterUrl(null)}
                            >
                              Clear
                            </Button>
                          ) : null}
                        </div>
                        <ScreenPosterUploadZone
                          disabled={eventMetaBusy}
                          onUploaded={(publicPath) => {
                            setScreenIdlePosterDraft(publicPath);
                            void applyScreenIdlePosterUrl(publicPath);
                          }}
                        />
                      </div>
                      <p className="text-muted-foreground font-mono text-xs">
                        Loaded: <span className="text-foreground">{event.code}</span>
                      </p>
                      <div className="space-y-1.5 border-t border-border/60 pt-3">
                        <Label className="text-xs">Audience join link</Label>
                        <InlineHint>Phones open this address (or a QR made from it) to vote during the show.</InlineHint>
                        {joinUrlForEvent ? (
                          <>
                            <p className="break-all font-mono text-[11px] leading-relaxed text-foreground">{joinUrlForEvent}</p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => {
                                void (async () => {
                                  try {
                                    await navigator.clipboard.writeText(joinUrlForEvent);
                                    setJoinUrlCopied(true);
                                    window.setTimeout(() => setJoinUrlCopied(false), 2000);
                                  } catch {
                                    setJoinUrlCopied(false);
                                  }
                                })();
                              }}
                            >
                              <Copy className="mr-1 size-3" />
                              {joinUrlCopied ? "Copied" : "Copy join link"}
                            </Button>
                          </>
                        ) : (
                          <InlineHint>Save this app on a URL your guests can reach; the join link uses that address.</InlineHint>
                        )}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              ) : null}

              {activeEvent ? (
              <Card size="sm" className="shadow-md">
                <CardHeader className="border-b border-border/60 pb-3">
                  <CardTitle className="font-heading text-base">Show readiness</CardTitle>
                  <CardDescription>Green checks mean you are closer to a safe live night.</CardDescription>
                  <InlineHint className="mt-2">
                    Screen is the projector page (<span className="font-mono text-foreground">/screen</span>) — picture only, for the room to watch.
                  </InlineHint>
                </CardHeader>
                <CardContent className="space-y-2 pt-3">
                  <ul className="space-y-2">
                    {readinessRows.map((row) => (
                      <li key={row.id} className="flex gap-2 text-sm">
                        {row.ok ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                        ) : (
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                        )}
                        <div>
                          <p className={cn("font-medium leading-tight", row.ok ? "text-foreground" : "text-amber-950 dark:text-amber-100")}>{row.label}</p>
                          <p className="text-muted-foreground text-xs leading-snug">{row.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {event ? (
                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => window.open("/screen", "_blank", "noopener,noreferrer")}
                      >
                        <Monitor className="mr-1 size-4" />
                        Open /screen (projector)
                      </Button>
                      <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 rounded border"
                          checked={screenTestAck}
                          onChange={(e) => {
                            if (e.target.checked) markScreenTested();
                            else {
                              try {
                                if (event.id) sessionStorage.removeItem(screenOkStorageKey(event.id));
                              } catch {
                                /* ignore */
                              }
                              setScreenTestAck(false);
                            }
                          }}
                        />
                        <span>I opened the projector page and it loaded (same Wi‑Fi / URL as show night).</span>
                      </label>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">Load a show to track projector testing.</p>
                  )}
                </CardContent>
              </Card>
              ) : null}

              <Card size="sm" className="shadow-md">
                <CardHeader className="border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Film className="text-muted-foreground size-4" />
                    <CardTitle className="font-heading text-base">Reel library</CardTitle>
                  </div>
                  <CardDescription>Filename path or hosted MP4 URL — assign to beats on the right.</CardDescription>
                  <InlineHint className="mt-2">
                    Reel is the clip that plays for a beat — add it here once, then pick it on each beat’s cue sheet.
                  </InlineHint>
                </CardHeader>
                <CardContent className="space-y-3 pt-3">
                  {!canEdit ? (
                    <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs leading-relaxed text-amber-950 dark:text-amber-50">
                      <p>
                        <strong className="font-semibold">Locked until a show is open.</strong>{" "}
                        {isExperienceMode ? (
                          <>Wait for the experience to load, or open from <Link href="/experiences" className="underline">Experiences</Link>.</>
                        ) : (
                          <>
                            Use the{" "}
                            <a href="#show-builder-event" className="font-semibold underline">
                              Event
                            </a>{" "}
                            card above, or:
                          </>
                        )}
                      </p>
                      {!isExperienceMode ? (
                        <Link href="/show" className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "w-full no-underline")}>
                          <Play className="mr-1 size-3 fill-current" />
                          Open show night
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                  <section className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs dark:bg-primary/10">
                    <div className="flex gap-2">
                      <Info className="text-primary mt-0.5 size-3.5 shrink-0" />
                      <p className="text-muted-foreground leading-relaxed">
                        <strong className="text-foreground">Drag & drop</strong> any video file below — it transcodes to a
                        web-ready MP4 in your browser and uploads automatically, or paste a direct{" "}
                        <span className="font-mono">https://…mp4</span> / <span className="font-mono">.webm</span>. Try{" "}
                        <span className="font-semibold text-foreground">Add sample (HTTPS)</span> for an instant test clip.
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="mt-2 h-8" onClick={() => void copyExampleVideoPath()}>
                      <Copy className="mr-1 size-3" />
                      {examplePathCopied ? "Copied" : "Copy example path"}
                    </Button>
                  </section>
                  {canEdit ? <ReelTranscodeUploadZone disabled={busy} onUploaded={onReelFileUploaded} /> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={addLibraryVideo} disabled={!canEdit || busy}>
                      <Plus className="mr-1 size-4" />
                      Add reel
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={addSampleHostedReel} disabled={!canEdit || busy}>
                      <Film className="mr-1 size-4" />
                      Add sample (HTTPS)
                    </Button>
                  </div>
                  <ul className="space-y-3">
                    {videoLibrary.map((entry) => {
                      const usedBy = beatsUsingVideoId(nodes, entry.id, entry.url);
                      const testing = libraryTestId === entry.id && libraryTestStatus === "checking";
                      return (
                        <li key={entry.id} className="rounded-lg border bg-card p-3 shadow-sm">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Reel</span>
                            {usedBy.length > 0 ? (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="size-3 shrink-0" aria-hidden />
                                In use · {usedBy.join(", ")}
                              </span>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            <Input className="h-8 text-sm" value={entry.label} onChange={(e) => updateLibraryEntry(entry.id, { label: e.target.value })} disabled={!canEdit || busy} />
                            <Input
                              className="h-8 font-mono text-xs"
                              value={entry.url}
                              onChange={(e) => updateLibraryEntry(entry.id, { url: e.target.value })}
                              disabled={!canEdit || busy}
                              placeholder="/videos/scene.mp4"
                            />
                            <div className="flex flex-wrap gap-1">
                              <Button type="button" size="sm" variant="outline" className="h-8" disabled={!event || busy || !entry.url.trim()} onClick={() => testLibraryVideo(entry)}>
                                <Play className="mr-1 size-3" />
                                Test
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={!canEdit || !resolveStoryVideoUrl(entry.url, pageOrigin)}
                                onClick={() => setPreviewLibraryId((id) => (id === entry.id ? null : entry.id))}
                              >
                                <Eye className="mr-1 size-3" />
                                Preview
                              </Button>
                              <Button type="button" size="sm" variant="destructive" className="h-8" disabled={!canEdit || busy} onClick={() => deleteLibraryVideo(entry.id)}>
                                <Trash2 className="mr-1 size-3" />
                              </Button>
                            </div>
                            {testing ? <p className="text-muted-foreground text-xs">Checking…</p> : null}
                            {previewLibraryId === entry.id && resolveStoryVideoUrl(entry.url, pageOrigin) ? (
                              <video
                                key={entry.id + entry.url}
                                className="aspect-video max-h-36 w-full rounded-md border bg-black object-contain"
                                src={resolveStoryVideoUrl(entry.url, pageOrigin) ?? undefined}
                                controls
                                playsInline
                                muted
                                preload="metadata"
                              />
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {videoLibrary.length === 0 ? <p className="text-muted-foreground text-center text-xs">No reels yet.</p> : null}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </aside>

        {/* Middle: timeline */}
        <aside className="flex min-h-[200px] flex-col border-b bg-muted/20 lg:col-span-3 lg:min-h-0 lg:border-b-0">
          <div className="border-b border-border/80 bg-card/50 px-4 py-3">
            <h2 className="font-heading text-sm font-semibold tracking-tight">Show timeline</h2>
            <p className="text-muted-foreground text-xs">Order = play order from the top. First beat opens the show.</p>
            <InlineHint className="mt-1.5">
              Beat is one step in the night — a title, a reel, and sometimes a vote before the story moves on.
            </InlineHint>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-3">
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="secondary" onClick={addNode} disabled={!canEdit || busy}>
                  <Plus className="mr-1 size-3.5" />
                  Add beat
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={duplicateNode} disabled={!canEdit || !selected}>
                  <Copy className="mr-1 size-3.5" />
                  Duplicate
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={deleteNode} disabled={!canEdit || !selected || nodes.length <= 1}>
                  <Trash2 className="mr-1 size-3.5" />
                </Button>
              </div>
              <ul className="space-y-1.5">
                {sortedNodes.map((n, idx) => (
                  <li key={`${n.node_key}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(n.node_key)}
                      className={cn(
                        "flex w-full flex-col rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                        n.node_key === selectedKey
                          ? "border-amber-700/50 bg-amber-950/10 shadow-sm ring-1 ring-amber-700/25 dark:bg-amber-950/20"
                          : "border-transparent bg-card/80 hover:border-border hover:bg-card",
                      )}
                    >
                      <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-widest">Cue {idx + 1}</span>
                      <span className="truncate font-medium">{n.title?.trim() || "Untitled beat"}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">{n.node_key.trim() || "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollArea>
        </aside>

        {/* Right: cue sheet editor */}
        <main className="flex min-h-[400px] flex-col bg-background lg:col-span-6 lg:min-h-0">
          <div className="border-b border-border/80 px-4 py-3">
            <h2 className="font-heading text-sm font-semibold tracking-tight">Beat cue sheet</h2>
            <p className="text-muted-foreground text-xs">What the booth runs — mirrored on phones after each reel.</p>
            <InlineHint className="mt-1.5">Edit the selected beat here; the timeline on the left is the order of the night.</InlineHint>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4 pb-24">
              {!canEdit ? (
                <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {isExperienceMode
                      ? "Loading your saved experience…"
                      : "Beats and reels unlock after a show is loaded. For show night, start on Show night — one button opens operator + projector."}
                  </p>
                  {!isExperienceMode ? (
                    <>
                      <Link href="/show" className={cn(buttonVariants({ size: "lg" }), "no-underline")}>
                        <Play className="mr-2 size-4 fill-current" />
                        Go live
                      </Link>
                      <a href="#show-builder-event" className="text-xs text-muted-foreground underline">
                        Or load a show in the sidebar
                      </a>
                    </>
                  ) : null}
                </div>
              ) : !selected ? (
                <p className="text-muted-foreground text-sm">Select a beat in the timeline.</p>
              ) : (
                <div className="relative mx-auto max-w-2xl space-y-0 border border-amber-950/20 bg-[linear-gradient(to_bottom,oklch(0.99_0.01_85),oklch(0.985_0.005_85))] shadow-[0_1px_0_oklch(0.85_0.02_75)] dark:border-amber-900/30 dark:bg-[linear-gradient(to_bottom,oklch(0.16_0.02_265),oklch(0.14_0.02_265))] dark:shadow-none">
                  <div className="absolute left-0 top-0 h-full w-1 bg-amber-700/70" aria-hidden />
                  <div className="space-y-6 p-6 pl-8">
                    <header className="border-b border-dashed border-amber-950/25 pb-4 dark:border-amber-200/15">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-800 dark:text-amber-200/90">Live cinema cue</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Show{" "}
                        <span className="font-mono text-foreground">
                          {activeEvent?.code ?? experience?.slug ?? "—"}
                        </span>{" "}
                        · Beat order #{selected.sort_order + 1}
                      </p>
                    </header>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => moveSort(selected.node_key, -1)}>
                        Move up
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => moveSort(selected.node_key, 1)}>
                        Move down
                      </Button>
                    </div>

                    <section className="space-y-3">
                      <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Identity</h3>
                      <div className="space-y-1.5">
                        <Label htmlFor="beat-title">Cue title</Label>
                        <Input id="beat-title" value={selected.title} onChange={(e) => updateNode(selectedKey, { title: e.target.value })} placeholder="e.g. House to half" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="beat-code">Beat code (slug)</Label>
                        <Input
                          id="beat-code"
                          className="font-mono uppercase"
                          value={selected.node_key}
                          onChange={(e) => updateNode(selectedKey, { node_key: e.target.value.toUpperCase() })}
                          spellCheck={false}
                        />
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Picture</h3>
                      <div className="space-y-1.5">
                        <Label htmlFor="video-pick">Reel from library</Label>
                        <InlineHint>Pick a saved clip, or type a URL / path below — both set what plays for this beat.</InlineHint>
                        <select
                          id="video-pick"
                          className="border-input bg-background flex h-9 w-full rounded-md border px-2 text-sm"
                          value={beatVideoSelectValue}
                          onChange={(e) => {
                            const id = e.target.value;
                            if (!id) {
                              updateNode(selectedKey, { video_asset_id: undefined, video_url: "" });
                              return;
                            }
                            const ent = libraryEntryById(videoLibrary, id);
                            updateNode(selectedKey, {
                              video_asset_id: id,
                              video_url: ent?.url.trim() ?? "",
                            });
                          }}
                        >
                          <option value="">Choose reel…</option>
                          {videoLibrary.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.label || e.url || e.id}
                            </option>
                          ))}
                        </select>
                        <div className="space-y-1.5">
                          <Label htmlFor="beat-video-url">Direct reel URL or path</Label>
                          <Input
                            id="beat-video-url"
                            className="font-mono text-xs"
                            value={selected.video_url}
                            onChange={(e) =>
                              updateNode(selectedKey, {
                                video_url: e.target.value,
                                video_asset_id: undefined,
                              })
                            }
                            placeholder={`${EXAMPLE_PUBLIC_VIDEO_PATH} or https://…/clip.mp4`}
                            spellCheck={false}
                          />
                          <p className="text-muted-foreground text-[10px] leading-snug">
                            Overrides the dropdown while typed. Must end in <span className="font-mono">.mp4</span> or{" "}
                            <span className="font-mono">.webm</span> for validation.
                          </p>
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground break-all">Resolved: {selected.video_url.trim() || "—"}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" disabled={!selected.video_url.trim()} onClick={testBeatVideo}>
                            <Play className="mr-1 size-3.5" />
                            Test load
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={!selectedResolvedUrl} onClick={() => setPreviewBeatOpen((o) => !o)}>
                            <Eye className="mr-1 size-3.5" />
                            Preview
                          </Button>
                        </div>
                        {beatTestStatus === "checking" ? <p className="text-muted-foreground text-xs">Checking…</p> : null}
                        {beatTestStatus === "ok" ? <p className="text-xs font-medium text-emerald-600">Browser can read this file.</p> : null}
                        {beatTestStatus === "fail" ? <p className="text-destructive text-xs">Could not load metadata — check URL, CORS, and format.</p> : null}
                        {previewBeatOpen && selectedResolvedUrl ? (
                          <video className="aspect-video max-h-48 w-full rounded-md border bg-black" src={selectedResolvedUrl} controls playsInline muted preload="metadata" />
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="is-ending"
                          type="checkbox"
                          className="size-4 rounded border"
                          checked={selected.is_ending}
                          onChange={(e) => updateNode(selectedKey, { is_ending: e.target.checked })}
                        />
                        <Label htmlFor="is-ending" className="cursor-pointer text-sm font-normal">
                          Final beat (no audience vote after this reel)
                        </Label>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Booth script</h3>
                      <div className="space-y-1.5">
                        <Label htmlFor="op-notes">Booth notes (optional)</Label>
                        <textarea
                          id="op-notes"
                          className={textareaClass}
                          rows={4}
                          value={selected.operator_notes}
                          onChange={(e) => updateNode(selectedKey, { operator_notes: e.target.value })}
                          placeholder="Lights, comms, when to roll, what to say over comms…"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="beat-live-status">Readiness</Label>
                        <select
                          id="beat-live-status"
                          className="border-input bg-background flex h-9 w-full rounded-md border px-2 text-sm"
                          value={selected.beat_status}
                          onChange={(e) => updateNode(selectedKey, { beat_status: e.target.value as BeatLiveStatus })}
                        >
                          <option value="draft">Draft</option>
                          <option value="ready">Ready for audience</option>
                        </select>
                      </div>
                    </section>

                    {!selected.is_ending ? (
                      <>
                        <section className="space-y-3">
                          <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Audience</h3>
                          <InlineHint className="-mt-1">What appears on phones and the wall when it is time to vote.</InlineHint>
                          <div className="space-y-1.5">
                            <Label htmlFor="question">Question (phones + wall)</Label>
                            <Input id="question" value={selected.question} onChange={(e) => updateNode(selectedKey, { question: e.target.value })} />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor="opt-a">Option A</Label>
                              <Input id="opt-a" value={selected.option_a_label} onChange={(e) => updateNode(selectedKey, { option_a_label: e.target.value })} />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="opt-b">Option B</Label>
                              <Input id="opt-b" value={selected.option_b_label} onChange={(e) => updateNode(selectedKey, { option_b_label: e.target.value })} />
                            </div>
                          </div>
                        </section>
                        <section className="space-y-3">
                          <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Branching</h3>
                          <InlineHint className="-mt-1">
                            Branch is where the story goes next — pick which beat follows if the crowd chooses A or B.
                          </InlineHint>
                          <div className="space-y-1.5">
                            <Label htmlFor="next-a">If A wins → next beat</Label>
                            <select
                              id="next-a"
                              className="border-input bg-background flex h-9 w-full rounded-md border px-2 text-sm"
                              value={selected.option_a_next_node_key}
                              onChange={(e) => updateNode(selectedKey, { option_a_next_node_key: e.target.value })}
                            >
                              <option value="">Select…</option>
                              {nextKeyOptions
                                .filter((k) => k !== selected.node_key)
                                .map((k) => (
                                  <option key={k} value={k}>
                                    {formatBeatPickerLabel(nodes, k)}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="next-b">If B wins → next beat</Label>
                            <select
                              id="next-b"
                              className="border-input bg-background flex h-9 w-full rounded-md border px-2 text-sm"
                              value={selected.option_b_next_node_key}
                              onChange={(e) => updateNode(selectedKey, { option_b_next_node_key: e.target.value })}
                            >
                              <option value="">Select…</option>
                              {nextKeyOptions
                                .filter((k) => k !== selected.node_key)
                                .map((k) => (
                                  <option key={`b-${k}`} value={k}>
                                    {formatBeatPickerLabel(nodes, k)}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </section>
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm italic">Ending beat — no vote block on this cue.</p>
                    )}

                    <footer className="border-t border-dashed border-amber-950/25 pt-4 font-mono text-xs leading-relaxed text-muted-foreground dark:border-amber-200/15">
                      <p>
                        <span className="text-amber-900/80 dark:text-amber-200/80">ROLL:</span> {operatorLines.current}
                      </p>
                      <p>
                        <span className="text-amber-900/80 dark:text-amber-200/80">IF A:</span> {operatorLines.ifA}
                      </p>
                      <p>
                        <span className="text-amber-900/80 dark:text-amber-200/80">IF B:</span> {operatorLines.ifB}
                      </p>
                    </footer>
                  </div>
                </div>
              )}

              {event ? (
                <div className="mx-auto mt-8 max-w-2xl space-y-3">
                  <h3 className="text-sm font-semibold">Check show</h3>
                  <InlineHint>Catches missing reels, branches, or votes before you save — step 6 in “How Showtime works.”</InlineHint>
                  {validationErrors.length > 0 ? (
                    <ul className="list-inside list-disc space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                      {validationErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">No structural blockers.</p>
                  )}
                  {validationWarnings.length > 0 ? (
                    <ul className="list-inside list-disc space-y-1 rounded-md border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-sm">
                      {validationWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  {lastSavedAt ? (
                    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                        Saved {new Date(lastSavedAt).toLocaleString()}
                      </span>
                      {!isExperienceMode && linkedExperience ? (
                        <Link
                          href={`/experiences/${linkedExperience.id}/edit`}
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Also in Movie Experiences
                        </Link>
                      ) : null}
                    </p>
                  ) : null}
                  <details className="rounded-lg border bg-card">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
                      <ChevronDown className="size-4 opacity-60" />
                      Backup JSON (advanced)
                    </summary>
                    <div className="space-y-3 border-t p-3">
                      <Button type="button" variant="outline" size="sm" onClick={handleExportJson}>
                        <Download className="mr-1 size-4" />
                        Download
                      </Button>
                      <textarea className={textareaClass} value={importJsonText} onChange={(e) => setImportJsonText(e.target.value)} spellCheck={false} />
                      <Button type="button" variant="secondary" size="sm" onClick={handleImportJson} disabled={!importJsonText.trim()}>
                        <Upload className="mr-1 size-4" />
                        Import
                      </Button>
                      {importJsonError ? <p className="text-destructive text-sm">{importJsonError}</p> : null}
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
