export type VideoSource = { kind: "direct"; url: string } | { kind: "youtube"; videoId: string };

/**
 * Recognize YouTube watch / embed / shorts / youtu.be URLs; otherwise treat as a direct file URL for <video>.
 */
export function resolveVideoSource(raw: string | null | undefined): VideoSource | null {
  const s = raw?.trim();
  if (!s) return null;
  const id = extractYoutubeVideoId(s);
  if (id) return { kind: "youtube", videoId: id };
  return { kind: "direct", url: s };
}

export function extractYoutubeVideoId(input: string): string | null {
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v");
        return v && /^[\w-]{11}$/.test(v) ? v : null;
      }
      const embed = u.pathname.match(/^\/embed\/([\w-]{11})/);
      if (embed) return embed[1] ?? null;
      const shorts = u.pathname.match(/^\/shorts\/([\w-]{11})/);
      if (shorts) return shorts[1] ?? null;
    }

    return null;
  } catch {
    return null;
  }
}
