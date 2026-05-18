"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Monitor, Rocket } from "lucide-react";

import { ExperienceShell } from "@/components/experiences/experience-shell";
import { ExperienceStatusPill } from "@/components/experiences/status-pill";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getJoinUrl } from "@/lib/join/get-join-url";
import { useJoinBaseUrl } from "@/hooks/use-join-base-url";
import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { openShowNightSurfaces } from "@/lib/showtime/go-live";
import {
  formatLaunchError,
  launchExperienceViaApi,
  launchExperienceViaClient,
} from "@/lib/showtime/launch-experience-client";
import { writeStoredOperatorCode } from "@/lib/showtime/operator-session";
import { getExperienceFull, type ExperienceFull } from "@/lib/supabase/experiences";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = { experienceId: string };

export function ExperienceLaunchPanel({ experienceId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const joinBase = useJoinBaseUrl();
  const [exp, setExp] = useState<ExperienceFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomCodeDraft, setRoomCodeDraft] = useState("");
  const [launchedCode, setLaunchedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) throw new Error(anon.message);
      const full = await getExperienceFull(supabase, experienceId);
      if (!full) throw new Error("Experience not found.");
      setExp(full);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load experience.");
    } finally {
      setLoading(false);
    }
  }, [supabase, experienceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const joinUrl = useMemo(() => {
    if (!launchedCode || !joinBase.joinBaseUrl) return "";
    return getJoinUrl(launchedCode, joinBase.joinBaseUrl);
  }, [launchedCode, joinBase.joinBaseUrl]);

  async function onLaunch(openSurfaces: boolean) {
    if (!supabase || !exp) return;
    setBusy(true);
    setError(null);
    try {
      const anon = await tryEnsureAnonymousSession(supabase);
      if (!anon.ok) throw new Error(anon.message);

      const preferred = roomCodeDraft.trim().toUpperCase();
      let code = "";

      const api = await launchExperienceViaApi(experienceId, preferred || undefined);
      if (api.ok && api.roomCode) {
        code = api.roomCode;
      } else if (api.useClientFallback) {
        try {
          const launched = await launchExperienceViaClient(supabase, experienceId, preferred || undefined);
          code = launched.roomCode;
        } catch (clientErr) {
          throw new Error(formatLaunchError(api, clientErr));
        }
      } else {
        throw new Error(formatLaunchError(api));
      }

      setLaunchedCode(code);
      writeStoredOperatorCode(code);

      if (openSurfaces) {
        openShowNightSurfaces(code);
      } else {
        router.push(`/operator/${encodeURIComponent(code)}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyJoin() {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <ExperienceShell title="Launch" backHref={`/experiences/${experienceId}/edit`} backLabel="Edit">
        <div className="flex items-center gap-2 py-16 text-[var(--kc-champagne)]">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Loading…
        </div>
      </ExperienceShell>
    );
  }

  if (!exp) {
    return (
      <ExperienceShell title="Launch" backHref="/experiences">
        <p className="text-red-300">{error ?? "Not found."}</p>
      </ExperienceShell>
    );
  }

  const beatCount = exp.scenes.length + exp.voteMoments.length;

  return (
    <ExperienceShell
      title={`Launch — ${exp.title}`}
      subtitle="Creates a live room, materializes your timeline into the show engine, and arms the projector at the opening beat."
      backHref={`/experiences/${experienceId}/edit`}
      backLabel="Edit timeline"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ExperienceStatusPill status={exp.status} />
        <span className="text-xs text-[var(--kc-champagne)]">
          {exp.scenes.length} scenes · {exp.voteMoments.length} votes
        </span>
      </div>

      {exp.status === "archived" ? (
        <p className="rounded-sm border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          Archived experiences cannot launch. Set status to draft or ready on the edit page.
        </p>
      ) : beatCount === 0 ? (
        <p className="rounded-sm border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          Add at least one scene or vote moment before launching.{" "}
          <Link href={`/experiences/${experienceId}/edit`} className="underline">
            Edit timeline
          </Link>
        </p>
      ) : null}

      <div className="max-w-lg space-y-4 rounded-sm border border-[color-mix(in_oklch,var(--kc-gold-line)_30%,transparent)] bg-[color-mix(in_oklch,var(--kc-panel)_50%,black)] p-6">
        <div className="space-y-2">
          <Label htmlFor="room-code">Room code (optional)</Label>
          <Input
            id="room-code"
            value={roomCodeDraft}
            onChange={(e) => setRoomCodeDraft(e.target.value.toUpperCase())}
            placeholder="Auto-generate"
            maxLength={12}
            className="font-mono tracking-widest"
          />
          <p className="text-xs text-[var(--kc-champagne)]">Leave blank for a random six-letter code.</p>
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={busy || exp.status === "archived" || beatCount === 0}
            onClick={() => void onLaunch(true)}
            className="gap-2"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
            Launch & open operator
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || exp.status === "archived" || beatCount === 0}
            onClick={() => void onLaunch(false)}
          >
            Launch only
          </Button>
        </div>
      </div>

      {launchedCode ? (
        <div className="space-y-4 rounded-sm border border-[color-mix(in_oklch,var(--kc-gold-bright)_35%,transparent)] bg-black/40 p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--kc-gold-bright)]">Room live</p>
          <p className="font-mono text-3xl tracking-[0.35em] text-[var(--kc-cream)]">{launchedCode}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/operator/${encodeURIComponent(launchedCode)}`} className={buttonVariants()}>
              Operator desk
            </Link>
            <Link href="/screen" target="_blank" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
              <Monitor className="size-4" aria-hidden />
              Projector
            </Link>
            {joinUrl ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void copyJoin()} className="gap-2">
                <Copy className="size-4" aria-hidden />
                {copied ? "Copied" : "Copy join link"}
              </Button>
            ) : null}
          </div>
          {joinUrl ? (
            <p className="break-all font-mono text-xs text-[var(--kc-champagne)]">{joinUrl}</p>
          ) : null}
        </div>
      ) : null}
    </ExperienceShell>
  );
}
