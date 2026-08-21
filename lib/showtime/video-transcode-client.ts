"use client";

/**
 * In-browser video transcoding via ffmpeg.wasm — no paid transcoding service (Mux, Cloudflare
 * Stream) required. Takes whatever a phone/camera exports (.MOV, high-bitrate H.264, ProRes-in-MOV,
 * etc.) and re-encodes it to a web-delivery H.264 MP4 the app's own validator already accepts
 * (see hasAllowedVideoExtension in video-url.ts). Runs entirely client-side: works from `npm run
 * dev` AND from the deployed site, unlike the old dev-only public/videos upload route.
 *
 * The ffmpeg-core WASM/JS is fetched from a public CDN (unpkg) at first use and cached by the
 * browser — no npm package bloat, no server infra, no account.
 */

const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

/** Source files larger than this are impractical to transcode in a browser tab — ask for a trim/compress first. */
export const MAX_TRANSCODE_INPUT_BYTES = 500 * 1024 * 1024; // 500MB

export type TranscodeProgress = { ratio: number; stage: "loading" | "encoding" };

let ffmpegSingleton: import("@ffmpeg/ffmpeg").FFmpeg | null = null;
let loadPromise: Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null = null;

async function getFFmpeg(onProgress?: (p: TranscodeProgress) => void) {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (!loadPromise) {
    loadPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
      const instance = new FFmpeg();
      onProgress?.({ ratio: 0, stage: "loading" });
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      ]);
      await instance.load({ coreURL, wasmURL });
      ffmpegSingleton = instance;
      return instance;
    })();
  }
  return loadPromise;
}

export type TranscodeResult = {
  blob: Blob;
  /** Suggested filename (always .mp4 — matches this app's video URL validator). */
  filename: string;
};

/**
 * Re-encode any browser-readable video file to a web-delivery H.264/AAC MP4:
 * - downscale to a max of 1080p tall (never upscale)
 * - CRF 23 (visually near-lossless, far below camera-original bitrate)
 * - faststart so playback can begin before the whole file downloads
 */
export async function transcodeVideoToMp4(
  file: File,
  onProgress?: (p: TranscodeProgress) => void,
): Promise<TranscodeResult> {
  if (file.size > MAX_TRANSCODE_INPUT_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new Error(
      `This file is ${mb}MB — too large to transcode reliably in a browser tab. Trim it or compress it first (a phone screen-recording tool or "Export → Smaller file" in your camera app both work), then try again.`,
    );
  }

  const ffmpeg = await getFFmpeg(onProgress);

  const unsubscribe = onProgress
    ? (() => {
        const handler = ({ progress }: { progress: number }) => {
          onProgress({ ratio: Math.max(0, Math.min(1, progress)), stage: "encoding" });
        };
        ffmpeg.on("progress", handler);
        return () => ffmpeg.off("progress", handler);
      })()
    : null;

  try {
    const { fetchFile } = await import("@ffmpeg/util");
    const inputName = `in${extname(file.name) || guessExt(file.type)}`;
    const outputName = "out.mp4";

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    await ffmpeg.exec([
      "-i",
      inputName,
      "-vf",
      "scale=-2:'min(1080,ih)'",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-y",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const blob = new Blob([new Uint8Array(bytes)], { type: "video/mp4" });

    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    const stem = file.name.replace(/\.[^.]+$/, "") || "reel";
    return { blob, filename: `${safeStem(stem)}.mp4` };
  } finally {
    unsubscribe?.();
  }
}

function extname(name: string): string {
  const m = name.match(/\.[^.]+$/);
  return m ? m[0] : "";
}

function guessExt(mime: string): string {
  if (mime.includes("quicktime")) return ".mov";
  if (mime.includes("webm")) return ".webm";
  return ".mp4";
}

function safeStem(stem: string): string {
  return stem.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "reel";
}
