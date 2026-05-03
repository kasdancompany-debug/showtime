import { isLoopbackHostname, resolveJoinBaseUrl } from "@/lib/join/join-base-url";

/** Normalize event code for URLs (uppercase, trimmed). */
export function normalizeJoinEventCode(eventCode: string): string {
  return eventCode.trim().toUpperCase();
}

/**
 * Full audience URL for a code. Prefer `NEXT_PUBLIC_JOIN_ORIGIN` when set; otherwise `windowOrigin`
 * (typically `window.location.origin`). Must run on the client when relying on page origin.
 */
export function getJoinUrl(eventCode: string, windowOrigin: string): string {
  const code = normalizeJoinEventCode(eventCode);
  if (!code) return "";
  const { baseUrl } = resolveJoinBaseUrl(windowOrigin.trim());
  const cleanBase = baseUrl.replace(/\/$/, "");
  return `${cleanBase}/join/${encodeURIComponent(code)}`;
}

export type JoinUrlPhoneAnalysis = {
  /** False when hostname is localhost / 127.0.0.1 / ::1 — phones on cellular or another LAN usually cannot reach it. */
  phoneSafe: boolean;
  recommendedFix: string;
};

const LOOPBACK_WARNING =
  "Phones usually cannot open localhost. Use LAN IP, Cloudflare tunnel, or production URL.";

/**
 * Analyze a full join URL (or any HTTP(S) URL) for phone reachability of the host.
 */
export function analyzeJoinUrlForPhones(joinUrl: string): JoinUrlPhoneAnalysis {
  const trimmed = joinUrl.trim();
  if (!trimmed) {
    return {
      phoneSafe: false,
      recommendedFix: "Set NEXT_PUBLIC_JOIN_ORIGIN or open /host from a reachable origin, then copy the join link again.",
    };
  }
  try {
    const u = new URL(trimmed);
    const phoneSafe = !isLoopbackHostname(u.hostname);
    return {
      phoneSafe,
      recommendedFix: phoneSafe
        ? "No change needed for typical phones on Wi‑Fi or cellular."
        : `${LOOPBACK_WARNING} Set NEXT_PUBLIC_JOIN_ORIGIN (e.g. LAN IP or tunnel URL) and restart the app.`,
    };
  } catch {
    return {
      phoneSafe: false,
      recommendedFix: "This does not look like a valid URL — check NEXT_PUBLIC_JOIN_ORIGIN and the event code.",
    };
  }
}

export { LOOPBACK_WARNING };
