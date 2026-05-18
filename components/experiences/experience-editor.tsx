"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";

import { ExperienceShell } from "@/components/experiences/experience-shell";
import { ExperienceStatusPill } from "@/components/experiences/status-pill";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import type { ExperienceResultMode, ExperienceStatus } from "@/lib/supabase/database.types";
import {
  getExperienceFull,
  replaceExperienceTimeline,
  updateExperience,
  type ExperienceFull,
} from "@/lib/supabase/experiences";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SceneDraft = {
  clientKey: string;
  dbId?: string;
  orderIndex: number;
  title: string;
  description: string;
  mediaUrl: string;
  durationSeconds: string;
};

type VoteDraft = {
  clientKey: string;
  dbId?: string;
  sceneClientKey: string;
  orderIndex: number;
  question: string;
  choiceA: string;
  choiceB: string;
  countdownSeconds: string;
  resultMode: ExperienceResultMode;
  branchA: string;
  branchB: string;
};

function newKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blankScene(order: number): SceneDraft {
  return {
    clientKey: newKey(),
    orderIndex: order,
    title: "",
    description: "",
    mediaUrl: "",
    durationSeconds: "",
  };
}

function blankVote(order: number, sceneClientKey = ""): VoteDraft {
  return {
    clientKey: newKey(),
    sceneClientKey,
    orderIndex: order,
    question: "",
    choiceA: "",
    choiceB: "",
    countdownSeconds: "45",
    resultMode: "majority",
    branchA: "",
    branchB: "",
  };
}

type Props = { experienceId: string };

export function ExperienceEditor({ experienceId }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLine, setSavedLine] = useState<string | null>(null);
  const [meta, setMeta] = useState<ExperienceFull | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [runtime, setRuntime] = useState("");
  const [status, setStatus] = useState<ExperienceStatus>("draft");
  const [scenes, setScenes] = useState<SceneDraft[]>([blankScene(0)]);
  const [votes, setVotes] = useState<VoteDraft[]>([]);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) throw new Error(anon.message);
      const full = await getExperienceFull(supabase, experienceId);
      if (!full) throw new Error("Experience not found.");
      setMeta(full);
      setTitle(full.title);
      setDescription(full.description);
      setPosterUrl(full.poster_url ?? "");
      setRuntime(full.estimated_runtime_minutes ? String(full.estimated_runtime_minutes) : "");
      setStatus(full.status);

      const sceneDrafts: SceneDraft[] = full.scenes.map((s) => ({
        clientKey: s.id,
        dbId: s.id,
        orderIndex: s.order_index,
        title: s.title,
        description: s.description,
        mediaUrl: s.media_url ?? "",
        durationSeconds: s.duration_seconds ? String(s.duration_seconds) : "",
      }));
      setScenes(sceneDrafts.length ? sceneDrafts : [blankScene(0)]);

      const sceneIdToClient = new Map(full.scenes.map((s) => [s.id, s.id]));
      setVotes(
        full.voteMoments.map((v) => ({
          clientKey: v.id,
          dbId: v.id,
          sceneClientKey: v.scene_id ? (sceneIdToClient.get(v.scene_id) ?? "") : "",
          orderIndex: v.order_index,
          question: v.question,
          choiceA: v.choice_a,
          choiceB: v.choice_b,
          countdownSeconds: String(v.countdown_seconds),
          resultMode: v.result_mode,
          branchA: v.branch_a ?? "",
          branchB: v.branch_b ?? "",
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load experience.");
    } finally {
      setLoading(false);
    }
  }, [supabase, experienceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError(null);
    setSavedLine(null);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) throw new Error(anon.message);
      const runtimeNum = runtime.trim() ? Number.parseInt(runtime, 10) : null;

      await updateExperience(supabase, experienceId, {
        title,
        description,
        posterUrl: posterUrl.trim() || null,
        estimatedRuntimeMinutes: runtimeNum && runtimeNum > 0 ? runtimeNum : null,
        status,
      });

      const titledScenes = scenes.filter((s) => s.title.trim());
      const sceneRows = titledScenes.map((s, i) => ({
        orderIndex: i,
        title: s.title,
        description: s.description,
        mediaUrl: s.mediaUrl.trim() || null,
        durationSeconds: s.durationSeconds.trim() ? Number.parseInt(s.durationSeconds, 10) : null,
      }));

      await replaceExperienceTimeline(supabase, experienceId, sceneRows, []);

      const reloaded = await getExperienceFull(supabase, experienceId);
      if (!reloaded) throw new Error("Could not reload scenes after save.");

      const clientKeyToSceneId = new Map<string, string>();
      titledScenes.forEach((s, i) => {
        const row = reloaded.scenes[i];
        if (row) clientKeyToSceneId.set(s.clientKey, row.id);
      });

      const votePayload = votes
        .filter((v) => v.question.trim() && v.choiceA.trim() && v.choiceB.trim())
        .map((v, i) => ({
          orderIndex: i,
          sceneId: v.sceneClientKey ? (clientKeyToSceneId.get(v.sceneClientKey) ?? null) : null,
          question: v.question,
          choiceA: v.choiceA,
          choiceB: v.choiceB,
          countdownSeconds: Number.parseInt(v.countdownSeconds, 10) || 45,
          resultMode: v.resultMode,
          branchA: v.branchA.trim() || null,
          branchB: v.branchB.trim() || null,
        }));

      await replaceExperienceTimeline(supabase, experienceId, sceneRows, votePayload);
      setSavedLine("Saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ExperienceShell title="Edit experience" backHref="/experiences">
        <div className="flex items-center gap-2 py-16 text-[var(--kc-champagne)]">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Loading…
        </div>
      </ExperienceShell>
    );
  }

  if (!meta) {
    return (
      <ExperienceShell title="Edit experience" backHref="/experiences">
        <p className="text-red-300">{error ?? "Not found."}</p>
      </ExperienceShell>
    );
  }

  return (
    <ExperienceShell
      title={title || meta.title}
      subtitle="Scenes play reels on the projector. Vote moments open audience choices — pair a vote with a scene when they belong on the same beat."
      backHref="/experiences"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ExperienceStatusPill status={status} />
        <Link href={`/experiences/${experienceId}/launch`} className={buttonVariants({ size: "sm" })}>
          Launch room →
        </Link>
      </div>

      <form onSubmit={(e) => void onSave(e)} className="space-y-10">
        <section className="space-y-4 rounded-sm border border-[color-mix(in_oklch,var(--kc-gold-line)_28%,transparent)] bg-[color-mix(in_oklch,var(--kc-panel)_45%,black)] p-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--kc-champagne)]">Details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-desc">Description</Label>
              <textarea
                id="edit-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-black/30 px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ExperienceStatus)}
                className="w-full rounded-md border border-input bg-black/30 px-3 py-2 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-runtime">Runtime (min)</Label>
              <Input id="edit-runtime" value={runtime} onChange={(e) => setRuntime(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-poster">Poster URL</Label>
              <Input id="edit-poster" value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl text-[var(--kc-cream)]">Scenes</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScenes((s) => [...s, blankScene(s.length)])}
            >
              <Plus className="size-4" aria-hidden />
              Add scene
            </Button>
          </div>
          <ul className="space-y-3">
            {scenes.map((scene, idx) => (
              <li
                key={scene.clientKey}
                className="rounded-sm border border-[color-mix(in_oklch,var(--kc-gold-line)_22%,transparent)] bg-black/25 p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-[var(--kc-champagne)]">
                  <GripVertical className="size-4 opacity-40" aria-hidden />
                  <span className="font-mono text-[10px] uppercase tracking-widest">Scene {idx + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-8 text-red-300/80"
                    onClick={() => setScenes((list) => list.filter((x) => x.clientKey !== scene.clientKey))}
                    aria-label="Remove scene"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Scene title"
                    value={scene.title}
                    onChange={(e) =>
                      setScenes((list) =>
                        list.map((x) => (x.clientKey === scene.clientKey ? { ...x, title: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    placeholder="Media URL (https://… or /videos/…)"
                    value={scene.mediaUrl}
                    onChange={(e) =>
                      setScenes((list) =>
                        list.map((x) => (x.clientKey === scene.clientKey ? { ...x, mediaUrl: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    placeholder="Duration seconds (optional)"
                    value={scene.durationSeconds}
                    onChange={(e) =>
                      setScenes((list) =>
                        list.map((x) =>
                          x.clientKey === scene.clientKey ? { ...x, durationSeconds: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Input
                    placeholder="Operator notes"
                    value={scene.description}
                    onChange={(e) =>
                      setScenes((list) =>
                        list.map((x) => (x.clientKey === scene.clientKey ? { ...x, description: e.target.value } : x)),
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl text-[var(--kc-cream)]">Vote moments</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVotes((v) => [...v, blankVote(v.length, scenes[0]?.clientKey ?? "")])}
            >
              <Plus className="size-4" aria-hidden />
              Add vote
            </Button>
          </div>
          {votes.length === 0 ? (
            <p className="text-sm text-[var(--kc-champagne)]/70">No vote moments yet. Add at least one for branching.</p>
          ) : (
            <ul className="space-y-3">
              {votes.map((vote, idx) => (
                <li
                  key={vote.clientKey}
                  className="rounded-sm border border-[color-mix(in_oklch,var(--kc-gold-bright)_18%,transparent)] bg-black/30 p-4"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--kc-gold-bright)]">
                      Vote {idx + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-8 text-red-300/80"
                      onClick={() => setVotes((list) => list.filter((x) => x.clientKey !== vote.clientKey))}
                      aria-label="Remove vote"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    <Input
                      placeholder="Question"
                      value={vote.question}
                      onChange={(e) =>
                        setVotes((list) =>
                          list.map((x) => (x.clientKey === vote.clientKey ? { ...x, question: e.target.value } : x)),
                        )
                      }
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        placeholder="Choice A"
                        value={vote.choiceA}
                        onChange={(e) =>
                          setVotes((list) =>
                            list.map((x) => (x.clientKey === vote.clientKey ? { ...x, choiceA: e.target.value } : x)),
                          )
                        }
                      />
                      <Input
                        placeholder="Choice B"
                        value={vote.choiceB}
                        onChange={(e) =>
                          setVotes((list) =>
                            list.map((x) => (x.clientKey === vote.clientKey ? { ...x, choiceB: e.target.value } : x)),
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Linked scene</Label>
                        <select
                          value={vote.sceneClientKey}
                          onChange={(e) =>
                            setVotes((list) =>
                              list.map((x) =>
                                x.clientKey === vote.clientKey ? { ...x, sceneClientKey: e.target.value } : x,
                              ),
                            )
                          }
                          className="w-full rounded-md border border-input bg-black/30 px-2 py-2 text-sm"
                        >
                          <option value="">— Standalone vote beat —</option>
                          {scenes.map((s, i) => (
                            <option key={s.clientKey} value={s.clientKey}>
                              {s.title.trim() || `Scene ${i + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Input
                        placeholder="Countdown (sec)"
                        value={vote.countdownSeconds}
                        onChange={(e) =>
                          setVotes((list) =>
                            list.map((x) =>
                              x.clientKey === vote.clientKey ? { ...x, countdownSeconds: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <select
                        value={vote.resultMode}
                        onChange={(e) =>
                          setVotes((list) =>
                            list.map((x) =>
                              x.clientKey === vote.clientKey
                                ? { ...x, resultMode: e.target.value as ExperienceResultMode }
                                : x,
                            ),
                          )
                        }
                        className="rounded-md border border-input bg-black/30 px-2 py-2 text-sm"
                      >
                        <option value="majority">Majority wins</option>
                        <option value="host_override">Host can override</option>
                      </select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        placeholder="Branch A → beat key (optional)"
                        value={vote.branchA}
                        onChange={(e) =>
                          setVotes((list) =>
                            list.map((x) => (x.clientKey === vote.clientKey ? { ...x, branchA: e.target.value } : x)),
                          )
                        }
                      />
                      <Input
                        placeholder="Branch B → beat key (optional)"
                        value={vote.branchB}
                        onChange={(e) =>
                          setVotes((list) =>
                            list.map((x) => (x.clientKey === vote.clientKey ? { ...x, branchB: e.target.value } : x)),
                          )
                        }
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {savedLine ? <p className="text-sm text-[var(--kc-gold-bright)]">{savedLine}</p> : null}

        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save experience
        </Button>
      </form>
    </ExperienceShell>
  );
}
