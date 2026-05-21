"use client";

import Link from "next/link";
import { Copy, Monitor, Play } from "lucide-react";

import { ScreenPosterUploadZone } from "@/components/admin/screen-poster-upload-zone";
import { InlineHint } from "@/components/admin/show-builder-onboarding";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getJoinUrl } from "@/lib/join/get-join-url";
import type { ExperienceRow } from "@/lib/supabase/experiences";
import type { EventRow } from "@/lib/supabase/event-room";
import type { ExperienceStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Props = {
  experience: ExperienceRow;
  experienceId: string;
  beatCount: number;
  rehearsalEvent: EventRow | null;
  rehearsalCode: string | null;
  joinBaseUrl: string;
  titleDraft: string;
  descriptionDraft: string;
  posterDraft: string;
  statusDraft: ExperienceStatus;
  metaBusy: boolean;
  metaError: string | null;
  rehearsalBusy: boolean;
  joinUrlCopied: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onPosterChange: (v: string) => void;
  onStatusChange: (v: ExperienceStatus) => void;
  onSaveMeta: () => void;
  onPosterApply: (url: string | null) => void;
  onTestRehearsal: () => void;
  onCopyJoin: () => void;
};

export function ShowBuilderExperiencePanel({
  experience,
  experienceId,
  beatCount,
  rehearsalEvent,
  rehearsalCode,
  joinBaseUrl,
  titleDraft,
  descriptionDraft,
  posterDraft,
  statusDraft,
  metaBusy,
  metaError,
  rehearsalBusy,
  joinUrlCopied,
  onTitleChange,
  onDescriptionChange,
  onPosterChange,
  onStatusChange,
  onSaveMeta,
  onPosterApply,
  onTestRehearsal,
  onCopyJoin,
}: Props) {
  const joinUrl =
    rehearsalCode && joinBaseUrl ? getJoinUrl(rehearsalCode, joinBaseUrl) : "";

  return (
    <Card
      id="show-builder-event"
      size="sm"
      className="border-amber-950/15 bg-gradient-to-br from-card to-amber-950/[0.06] shadow-md ring-amber-950/10"
    >
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="font-heading text-base">Saved experience</CardTitle>
        <CardDescription>Build at home, rehearse on this laptop, launch the same show at the venue.</CardDescription>
        <InlineHint className="mt-2">
          This is the same editor as <span className="font-mono text-foreground">Edit show</span> — beats, reels, votes, and branches are identical.
        </InlineHint>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-xs leading-relaxed",
            "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-50",
          )}
          role="status"
        >
          <strong className="font-semibold">Editing:</strong> {experience.title}
          <span className="text-muted-foreground"> · {beatCount} beats · </span>
          <span className="font-mono uppercase">{experience.slug}</span>
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="exp-title">Title</Label>
          <Input id="exp-title" value={titleDraft} onChange={(e) => onTitleChange(e.target.value)} disabled={metaBusy} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-desc">Description</Label>
          <textarea
            id="exp-desc"
            value={descriptionDraft}
            onChange={(e) => onDescriptionChange(e.target.value)}
            disabled={metaBusy}
            rows={2}
            className="border-input bg-background flex w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exp-status">Status</Label>
          <select
            id="exp-status"
            value={statusDraft}
            onChange={(e) => onStatusChange(e.target.value as ExperienceStatus)}
            disabled={metaBusy}
            className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="ready">Ready for venue</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <Label htmlFor="exp-poster">Walk-in / screen image (optional)</Label>
          <Input
            id="exp-poster"
            value={posterDraft}
            onChange={(e) => onPosterChange(e.target.value)}
            disabled={metaBusy}
            className="font-mono text-xs"
            placeholder="https://… or /screen-posters/…"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={metaBusy} onClick={() => onPosterApply(posterDraft.trim() || null)}>
              Save image URL
            </Button>
            {posterDraft.trim() ? (
              <Button type="button" size="sm" variant="outline" disabled={metaBusy} onClick={() => onPosterApply(null)}>
                Clear
              </Button>
            ) : null}
          </div>
          <ScreenPosterUploadZone
            disabled={metaBusy}
            onUploaded={(publicPath) => {
              onPosterChange(publicPath);
              onPosterApply(publicPath);
            }}
          />
        </div>
        <Button type="button" size="sm" variant="secondary" className="w-full" disabled={metaBusy} onClick={onSaveMeta}>
          Save experience details
        </Button>
        {metaError ? (
          <p className="text-destructive text-xs">{metaError}</p>
        ) : null}

        <div className="space-y-2 border-t border-border/60 pt-3">
          <Label className="text-xs">Home laptop rehearsal</Label>
          <InlineHint>
            Writes this graph to a rehearsal room ({rehearsalCode ? <span className="font-mono">{rehearsalCode}</span> : "auto code"}) so /host and /screen match venue night.
          </InlineHint>
          <Button type="button" size="sm" className="w-full" disabled={rehearsalBusy || beatCount === 0} onClick={onTestRehearsal}>
            <Play className="mr-1 size-4" />
            {rehearsalBusy ? "Syncing rehearsal…" : "Test on this laptop"}
          </Button>
          {rehearsalEvent && rehearsalCode ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`/operator/${encodeURIComponent(rehearsalCode)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Operator
              </Link>
              <Link href="/screen" target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Monitor className="mr-1 size-3" />
                Projector
              </Link>
            </div>
          ) : null}
          {joinUrl ? (
            <>
              <p className="break-all font-mono text-[11px]">{joinUrl}</p>
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={onCopyJoin}>
                <Copy className="mr-1 size-3" />
                {joinUrlCopied ? "Copied" : "Copy join link"}
              </Button>
            </>
          ) : null}
        </div>

        <Link
          href={`/experiences/${experienceId}/launch`}
          className={cn(buttonVariants({ variant: "default", size: "sm" }), "w-full justify-center")}
        >
          Launch at venue →
        </Link>
      </CardContent>
    </Card>
  );
}
