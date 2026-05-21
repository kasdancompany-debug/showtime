/** Production site URL — must match Vercel custom domain and `NEXT_PUBLIC_JOIN_ORIGIN`. */
export const SHOWTIME_CANONICAL_ORIGIN = "https://kasdanshowtime.com";

export function canonicalOriginFromEnv(): string {
  const raw = process.env.NEXT_PUBLIC_JOIN_ORIGIN?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return SHOWTIME_CANONICAL_ORIGIN;
}
