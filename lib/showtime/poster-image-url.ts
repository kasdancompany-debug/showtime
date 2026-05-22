import { canonicalOriginFromEnv } from "@/lib/showtime/canonical-origin";

/** Turn stored poster paths into a browser-loadable URL. */
export function resolvePosterImageUrl(
  raw: string | null | undefined,
  pageOrigin?: string,
): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (t.startsWith("blob:") || t.startsWith("file:")) return null;

  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;

  const origin = (pageOrigin ?? (typeof window !== "undefined" ? window.location.origin : canonicalOriginFromEnv())).replace(
    /\/+$/,
    "",
  );

  if (t.startsWith("/")) return `${origin}${t}`;

  return `${origin}/${t.replace(/^\/+/, "")}`;
}

/** Normalize before saving (prefer absolute https on the live site). */
export function normalizePosterImageUrlInput(
  raw: string | null | undefined,
  pageOrigin?: string,
): string | null {
  const resolved = resolvePosterImageUrl(raw, pageOrigin);
  if (!resolved) return null;
  return resolved;
}
