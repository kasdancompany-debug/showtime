"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { ExperiencePosterUploadZone } from "@/components/experiences/experience-poster-upload-zone";
import { ExperienceShell } from "@/components/experiences/experience-shell";
import { normalizePosterImageUrlInput } from "@/lib/showtime/poster-image-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugifyExperienceTitle } from "@/lib/experiences/slug";
import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { createExperience } from "@/lib/supabase/experiences";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ExperienceNewForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [runtime, setRuntime] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugPreview = slugifyExperienceTitle(title || "experience");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) throw new Error(anon.message);
      const runtimeNum = runtime.trim() ? Number.parseInt(runtime, 10) : null;
      const created = await createExperience(supabase, {
        title,
        description,
        posterUrl:
          normalizePosterImageUrlInput(
            posterUrl,
            typeof window !== "undefined" ? window.location.origin : undefined,
          ) || null,
        estimatedRuntimeMinutes: runtimeNum && runtimeNum > 0 ? runtimeNum : null,
        status: "draft",
      });
      router.push(`/experiences/${created.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create experience.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ExperienceShell
      title="New experience"
      subtitle="Name your interactive movie. You will add scenes and vote moments on the next screen."
      backHref="/experiences"
    >
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="max-w-lg space-y-6 rounded-sm border border-[color-mix(in_oklch,var(--kc-gold-line)_30%,transparent)] bg-[color-mix(in_oklch,var(--kc-panel)_50%,black)] p-6"
      >
        <div className="space-y-2">
          <Label htmlFor="exp-title">Title</Label>
          <Input
            id="exp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Midnight at the Bijou"
            required
            className="border-[color-mix(in_oklch,var(--kc-gold-line)_25%,transparent)] bg-black/30"
          />
          <p className="font-mono text-[10px] tracking-wider text-[var(--kc-champagne)]">Slug: {slugPreview}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="exp-desc">Description</Label>
          <textarea
            id="exp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="A short blurb for your team and lobby screen."
            className="w-full rounded-md border border-[color-mix(in_oklch,var(--kc-gold-line)_25%,transparent)] bg-black/30 px-3 py-2 text-sm text-[var(--kc-cream)]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="exp-runtime">Runtime (minutes)</Label>
          <Input
            id="exp-runtime"
            type="number"
            min={1}
            value={runtime}
            onChange={(e) => setRuntime(e.target.value)}
            placeholder="90"
            className="border-[color-mix(in_oklch,var(--kc-gold-line)_25%,transparent)] bg-black/30"
          />
        </div>

        <div className="space-y-2 border-t border-[color-mix(in_oklch,var(--kc-gold-line)_20%,transparent)] pt-4">
          <Label>Thumbnail (optional)</Label>
          <ExperiencePosterUploadZone
            kind="experience"
            currentUrl={posterUrl}
            onUploaded={(publicUrl) => setPosterUrl(publicUrl)}
          />
          <Input
            id="exp-poster"
            value={posterUrl}
            onChange={(e) => setPosterUrl(e.target.value)}
            placeholder="https://…"
            className="border-[color-mix(in_oklch,var(--kc-gold-line)_25%,transparent)] bg-black/30 font-mono text-xs"
          />
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <Button type="submit" disabled={busy || !title.trim()} className="w-full sm:w-auto">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Create & edit timeline
        </Button>
      </form>
    </ExperienceShell>
  );
}
