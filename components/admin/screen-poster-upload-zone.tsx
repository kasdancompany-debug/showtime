"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

type ScreenPosterUploadZoneProps = {
  disabled: boolean;
  onUploaded: (publicPath: string) => void;
};

/** Drag / browse → dev API → `public/screen-posters/` */
export function ScreenPosterUploadZone({ disabled, onUploaded }: ScreenPosterUploadZoneProps) {
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
        const res = await fetch("/api/dev/upload-screen-poster", { method: "POST", body: fd });
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
        <strong className="font-medium text-foreground">Production:</strong> use a full <span className="font-mono">https://…</span> image URL below, or upload while running{" "}
        <span className="font-mono">npm run dev</span> locally.
      </div>
    );
  }

  const inactive = disabled || busy;

  return (
    <div className="space-y-2">
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
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4 opacity-80" />}
        Drop an image or click to upload
      </button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
