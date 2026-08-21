/**
 * Resolve a playable URL from `story_nodes.video_url` only.
 * Accepts https(s), root-relative paths, or a bare filename (mapped to `/videos/…` on the same origin).
 * Rejects blob: and file:. Normalizes accidental Windows paths pasted from Explorer.
 */
export function normalizeShowtimeVideoUrlInput(raw: string): string {
  const t = raw.trim().replace(/^["']+|["']+$/g, "");
  if (!t) return t;

  if (/^https?:\/\//i.test(t) || t.startsWith("/")) return t;
  if (t.startsWith("blob:") || t.startsWith("file:")) return t;

  const unified = t.replace(/\\/g, "/");
  const lower = unified.toLowerCase();
  const marker = "/public/videos/";
  const j = lower.indexOf(marker);
  if (j >= 0) {
    const rest = unified.slice(j + marker.length).replace(/^\/+/, "");
    if (rest && !rest.includes("..")) {
      return `/videos/${rest}`;
    }
  }

  if (/^[a-z]:\//i.test(unified)) {
    const parts = unified.split("/").filter(Boolean);
    const vi = parts.findIndex((p) => p.toLowerCase() === "videos");
    if (vi >= 0 && vi < parts.length - 1) {
      const after = parts.slice(vi + 1).join("/");
      if (after && !after.includes("..")) {
        return `/videos/${after}`;
      }
    }
  }

  return t;
}

export function resolveStoryVideoUrl(videoUrl: string | null | undefined, pageOrigin: string): string | null {
  const origin = pageOrigin.replace(/\/$/, "");

  const reject = (s: string) => s.startsWith("blob:") || s.startsWith("file:");

  const normalized = normalizeShowtimeVideoUrlInput((videoUrl ?? "").trim());
  const t = normalized;
  if (!t || reject(t)) return null;
  /** Unresolved local path — cannot be played in the browser */
  if (/^[a-zA-Z]:[/\\]/.test(t) || t.includes("\\")) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/")) return `${origin}${t}`;
  return `${origin}/videos/${t.replace(/^\/+/, "")}`;
}

export function hasStoryVideoUrl(videoUrl: string | null | undefined): boolean {
  return resolveStoryVideoUrl(videoUrl, "https://origin.invalid") !== null;
}

/** Last path segment for projector / operator readouts (no query string). */
export function displayStoryVideoFilename(videoUrl: string | null | undefined): string {
  const t = normalizeShowtimeVideoUrlInput((videoUrl ?? "").trim());
  if (!t) return "";
  const noq = t.split(/[?#]/)[0] ?? t;
  const segs = noq.split("/").filter(Boolean);
  return segs.length ? (segs[segs.length - 1] ?? t) : t;
}

const ALLOWED_VIDEO_EXT = /\.(mp4|webm)(\?|#|$)/i;

/** Path or absolute URL pathname must end in .mp4 or .webm (case-insensitive). */
export function hasAllowedVideoExtension(resolvedUrl: string): boolean {
  let path = resolvedUrl.split(/[?#]/)[0] ?? resolvedUrl;
  try {
    if (/^https?:\/\//i.test(resolvedUrl)) {
      path = new URL(resolvedUrl).pathname;
    }
  } catch {
    /* keep path as trimmed string */
  }
  return ALLOWED_VIDEO_EXT.test(path);
}

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return Boolean(u.hostname);
  } catch {
    return false;
  }
}

export type VideoUrlIssue = {
  severity: "warn";
  message: string;
};

export type StoryBeatVideoAnalysis = {
  resolvedUrl: string | null;
  issues: VideoUrlIssue[];
};

/**
 * Editor/screen hints: empty, blocked scheme, malformed absolute URL, or non-.mp4/.webm pathname.
 */
export function analyzeStoryBeatVideoUrl(
  videoUrl: string | null | undefined,
  pageOrigin: string,
): StoryBeatVideoAnalysis {
  const issues: VideoUrlIssue[] = [];
  const vu = (videoUrl ?? "").trim();

  if (!vu) {
    issues.push({ severity: "warn", message: "Video URL is empty." });
    return { resolvedUrl: null, issues };
  }

  const resolvedUrl = resolveStoryVideoUrl(videoUrl, pageOrigin);
  if (!resolvedUrl) {
    issues.push({
      severity: "warn",
      message: "This URL is invalid or uses a blocked scheme (blob/file).",
    });
    return { resolvedUrl: null, issues };
  }

  if (/^https?:\/\//i.test(resolvedUrl) && !isValidHttpUrl(resolvedUrl)) {
    issues.push({ severity: "warn", message: "This does not look like a valid http(s) URL." });
  }

  if (!hasAllowedVideoExtension(resolvedUrl)) {
    issues.push({
      severity: "warn",
      message: "For reliable playback use a hosted .mp4 or .webm file (check the file extension).",
    });
  }

  return { resolvedUrl, issues };
}
