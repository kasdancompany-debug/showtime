"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

type ReelLibraryUploadZoneProps = {
  disabled: boolean;
  onUploaded: (publicPath: string) => void;
};

/**
 * Drag / browse → POST to dev-only API → file lands in `public/videos/`.
 */
export function ReelLibraryUploadZone({ disabled, onUploaded }: ReelLibraryUploadZoneProps) {
  const isDev = process.env.NODE_ENV === "development";
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/dev/upload-public-video", { method: "POST", body: fd });
        const data = (await res.json()) as { ok?: boolean; error?: string; publicPath?: string };
        if (!data.ok || !data.publicPath) {
          throw new Error(data.error ?? "Upload failed.");
        }
        onUploaded(data.publicPath);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setBusy(false);
        setDragOver(false);
      }
    },
    [onUploaded],
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

  if (!isDev) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <strong className="font-medium text-foreground">Production / hosted build:</strong> this app cannot write to <span className="font-mono">public/videos</span> on the
        server. Use full <span className="font-mono">https://…</span> links to your CDN or storage bucket, or run <span className="font-mono">npm run dev</span> locally and
        upload files there.
      </div>
    );
  }

  const inactive = disabled || busy;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.webm,video/mp4,video/webm"
        className="sr-only"
        tabIndex={-1}
        onChange={onPick}
        disabled={inactive}
      />
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!inactive) inputRef.current?.click();
          }
        }}
        onClick={() => {
          if (!inactive) inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!inactive) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!inactive) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "cursor-pointer rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors",
          inactive ? "cursor-not-allowed opacity-50" : "hover:border-primary/50 hover:bg-primary/5",
          dragOver && !inactive ? "border-primary bg-primary/10" : "border-border bg-muted/20",
        )}
      >
        {busy ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Copying to public/videos…
          </p>
        ) : (
          <>
            <Upload className="mx-auto mb-2 size-8 text-muted-foreground opacity-70" aria-hidden />
            <p className="text-sm font-medium text-foreground">Drop MP4 or WebM here</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              or click to browse — saves into <span className="font-mono">public/videos</span> and fills the path
            </p>
          </>
        )}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
