"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { ExperienceThumbnail } from "@/components/experiences/experience-thumbnail";
import { resolvePosterImageUrl } from "@/lib/showtime/poster-image-url";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  experienceId?: string;
  /** `experience` = Movie Experiences card; `screen` = walk-in projector image */
  kind?: "experience" | "screen";
  currentUrl?: string;
  onUploaded: (publicUrl: string) => void;
};

export function ExperiencePosterUploadZone({
  disabled = false,
  experienceId,
  kind = "experience",
  currentUrl,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewSrc = resolvePosterImageUrl(currentUrl);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("kind", kind);
        if (experienceId) fd.set("experienceId", experienceId);

        const res = await fetch("/api/media/upload-poster", { method: "POST", body: fd });
        const data = (await res.json()) as { ok?: boolean; error?: string; publicUrl?: string };
        if (!data.ok || !data.publicUrl) {
          throw new Error(data.error ?? "Upload failed.");
        }
        onUploaded(data.publicUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setBusy(false);
        setDragOver(false);
      }
    },
    [experienceId, kind, onUploaded],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) void uploadFile(f);
    },
    [uploadFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled || busy) return;
      const f = e.dataTransfer.files?.[0];
      if (f) void uploadFile(f);
    },
    [disabled, busy, uploadFile],
  );

  const inactive = disabled || busy;

  return (
    <div className="space-y-2">
      {previewSrc ? (
        <div className="overflow-hidden rounded-md border border-[color-mix(in_oklch,var(--kc-gold-line)_30%,transparent)]">
          <ExperienceThumbnail url={previewSrc} title="Preview" className="aspect-[2.4/1] w-full" />
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={onPick}
        disabled={inactive}
      />
      <button
        type="button"
        disabled={inactive}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!inactive) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border/70 bg-muted/20 hover:bg-muted/35",
          inactive && "cursor-not-allowed opacity-60",
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4 opacity-80" aria-hidden />}
        {kind === "experience" ? "Upload thumbnail (shows on Experiences list)" : "Upload walk-in image"}
      </button>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Or paste a full <span className="font-mono">https://…</span> image link below. Local-only paths like{" "}
        <span className="font-mono">/screen-posters/…</span> work after you upload on this site, not from your laptop alone.
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
