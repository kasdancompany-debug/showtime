"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Rocket, Trash2 } from "lucide-react";

import { ExperienceShell } from "@/components/experiences/experience-shell";
import { ExperienceThumbnail } from "@/components/experiences/experience-thumbnail";
import { ExperienceStatusPill } from "@/components/experiences/status-pill";
import { Button, buttonVariants } from "@/components/ui/button";
import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { deleteExperienceFully, listExperiences, type ExperienceRow } from "@/lib/supabase/experiences";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function ExperiencesDashboard() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [items, setItems] = useState<ExperienceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      const rows = await listExperiences(supabase);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load experiences.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (exp: ExperienceRow) => {
      if (!supabase) return;
      setDeletingId(exp.id);
      setError(null);
      try {
        const anon = await tryEnsureAnonymousSession(supabase);
        if (!anon.ok) throw new Error(anon.message);
        await deleteExperienceFully(supabase, exp.id);
        setItems((prev) => prev.filter((row) => row.id !== exp.id));
        setConfirmDeleteId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete this experience.");
      } finally {
        setDeletingId(null);
      }
    },
    [supabase],
  );

  return (
    <ExperienceShell
      title="Movie Experiences"
      subtitle="Same show builder as Edit show — build at home, rehearse on your laptop, launch the identical night at the venue."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--kc-champagne)]">
          {items.length === 0 && !loading ? "No experiences yet." : `${items.length} saved`}
        </p>
        <Link href="/experiences/new" className={buttonVariants({ variant: "default" })}>
          <Plus className="size-4" aria-hidden />
          New experience
        </Link>
      </div>

      {error ? (
        <p className="rounded-sm border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-[var(--kc-champagne)]">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((exp) => (
            <li key={exp.id}>
              <article
                className={cn(
                  "group flex h-full flex-col overflow-hidden rounded-sm border bg-[color-mix(in_oklch,var(--kc-panel)_55%,black)]",
                  "border-[color-mix(in_oklch,var(--kc-gold-line)_35%,transparent)]",
                  "shadow-[inset_0_1px_0_color-mix(in_oklch,var(--kc-gold-bright)_10%,transparent)]",
                  "transition-colors hover:border-[color-mix(in_oklch,var(--kc-gold-bright)_40%,transparent)]",
                )}
              >
                <div className="relative aspect-[2.4/1] bg-black/50">
                  <ExperienceThumbnail url={exp.poster_url} title={exp.title} className="size-full" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--kc-piano)] via-transparent to-transparent" />
                  <div className="absolute left-3 top-3">
                    <ExperienceStatusPill status={exp.status} />
                  </div>
                  {confirmDeleteId !== exp.id ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-2 h-8 w-8 p-0 text-[var(--kc-champagne)]/70 hover:bg-red-950/50 hover:text-red-200"
                      disabled={deletingId !== null}
                      aria-label={`Delete ${exp.title}`}
                      onClick={() => setConfirmDeleteId(exp.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <h2 className="font-serif text-xl font-light text-[var(--kc-cream)]">{exp.title}</h2>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--kc-champagne)]">
                      {exp.slug}
                    </p>
                  </div>
                  {exp.description ? (
                    <p className="line-clamp-2 text-sm leading-relaxed text-[var(--kc-champagne)]">{exp.description}</p>
                  ) : (
                    <p className="text-sm italic text-[var(--kc-champagne)]/50">No description</p>
                  )}
                  {exp.estimated_runtime_minutes ? (
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--kc-champagne)]/70">
                      ~{exp.estimated_runtime_minutes} min
                    </p>
                  ) : null}
                  {confirmDeleteId === exp.id ? (
                    <div
                      className="mt-auto rounded-sm border border-red-500/35 bg-red-950/25 px-3 py-3"
                      role="alertdialog"
                      aria-labelledby={`delete-title-${exp.id}`}
                    >
                      <p
                        id={`delete-title-${exp.id}`}
                        className="text-sm font-medium text-red-100"
                      >
                        Delete &ldquo;{exp.title}&rdquo;?
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-red-200/80">
                        This removes the saved experience and any venue launch link tied to it. Live event
                        history on the big screen is not erased.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === exp.id}
                          onClick={() => void handleDelete(exp)}
                        >
                          {deletingId === exp.id ? (
                            <>
                              <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
                              Deleting…
                            </>
                          ) : (
                            "Delete permanently"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={deletingId === exp.id}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-auto flex flex-wrap gap-2 pt-2">
                      <Link
                        href={`/experiences/${exp.id}/edit`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Open builder
                      </Link>
                      <Link
                        href={`/experiences/${exp.id}/launch`}
                        className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
                      >
                        <Rocket className="size-3.5" aria-hidden />
                        Launch
                      </Link>
                    </div>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {!loading && items.length === 0 && !error ? (
        <div className="rounded-sm border border-dashed border-[color-mix(in_oklch,var(--kc-gold-line)_30%,transparent)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--kc-champagne)]">Create your first interactive movie experience.</p>
          <Link href="/experiences/new" className={cn(buttonVariants(), "mt-4 inline-flex")}>
            <Plus className="size-4" aria-hidden />
            New experience
          </Link>
        </div>
      ) : null}

      <div className="border-t border-[color-mix(in_oklch,var(--kc-gold-line)_20%,transparent)] pt-6">
        <Link href="/show" className="text-xs text-[var(--kc-champagne)] hover:text-[var(--kc-gold-bright)]">
          ← Back to show night
        </Link>
      </div>
    </ExperienceShell>
  );
}

