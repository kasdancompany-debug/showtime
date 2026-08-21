"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { transcodeVideoToMp4, type TranscodeProgress } from "@/lib/showtime/video-transcode-client";
import { uploadReelVideo } from "@/lib/showtime/upload-reel-client";
import { cn } from "@/lib/utils";

type ReelTranscodeUploadZoneProps = {
  disabled: boolean;
  onUploaded: (publicUrl: string) => void;
};

type Phase = "idle" | "loading" | "encoding" | "uploading";

function phaseLabel(phase: Phase, ratio: number): string {
  if (phase === "loading") return "Preparing encoder…";
  if (phase === "encoding") return `Transcoding… ${Math.round(ratio * 100)}%`;
  if (phase === "uploading") return "Uploading…";
  return "";
}

/**
 * Drop any video file (including camera-original .MOV) → transcodes to a web-delivery H.264 MP4
 * entirely in the browser (ffmpeg.wasm, no paid transcoding service) → uploads the result to
 * Supabase Storage → hands back a public https:// URL. Works in production, not just `npm run dev`
 * (unlike the old public/videos local-file route this replaces).
 */
export function ReelTranscodeUploadZone({ disabled, onUploaded }: ReelTranscodeUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [ratio, setRatio] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle";

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setPhase("loading");
      setRatio(0);
      try {
        const { blob, filename } = await transcodeVideoToMp4(file, (p: TranscodeProgress) => {
          setPhase(p.stage);
          setRatio(p.ratio);
        });
        setPhase("uploading");
        const publicUrl = await uploadReelVideo(blob, filename);
        onUploaded(publicUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setPhase("idle");
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

  const inactive = disabled || busy;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mov"
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
          <div className="space-y-2">
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {phaseLabel(phase, ratio)}
            </p>
            {phase === "encoding" ? (
              <div className="mx-auto h-1 w-full max-w-[16rem] overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <Upload className="mx-auto mb-2 size-8 text-muted-foreground opacity-70" aria-hidden />
            <p className="text-sm font-medium text-foreground">Drop any video file here</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              .MOV, .MP4, camera-original — transcodes to web-ready MP4 in your browser, then uploads. No file leaves your
              device until it&apos;s already a small, playable reel.
            </p>
          </>
        )}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
