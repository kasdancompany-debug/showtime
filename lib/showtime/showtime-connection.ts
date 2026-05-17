import { getConfiguredJoinOrigin, getJoinOriginEnvRaw, isLoopbackJoinOrigin, resolveJoinBaseUrl } from "@/lib/join/join-base-url";
import { getSupabaseConfig } from "@/lib/supabase/env";

export type ShowtimeConnectionMode = "local_preview" | "live_sync";

export type ShowtimeConnectionIssue = {
  id: string;
  severity: "blocking" | "warning";
  title: string;
  detail: string;
  nextStep: string;
};

export type ShowtimeConnectionSnapshot = {
  mode: ShowtimeConnectionMode;
  /** Short label for badges */
  badgeLabel: string;
  supabaseUrlPresent: boolean;
  supabaseAnonPresent: boolean;
  joinOriginEnvSet: boolean;
  /** Effective join base URL when `windowOrigin` was passed to the snapshot builder */
  resolvedJoinBaseUrl: string;
  joinBaseIsLoopback: boolean;
  issues: ShowtimeConnectionIssue[];
  blockingIssues: ShowtimeConnectionIssue[];
  warnings: ShowtimeConnectionIssue[];
};

function issue(
  id: string,
  severity: ShowtimeConnectionIssue["severity"],
  title: string,
  detail: string,
  nextStep: string,
): ShowtimeConnectionIssue {
  return { id, severity, title, detail, nextStep };
}

/**
 * Central, non-throwing snapshot of how Showtime is configured on this device.
 * Pass `windowOrigin` (usually `window.location.origin`) from client components for accurate join / loopback hints.
 */
export function getShowtimeConnectionSnapshot(params?: { windowOrigin?: string }): ShowtimeConnectionSnapshot {
  const cfg = getSupabaseConfig();
  const mode: ShowtimeConnectionMode = cfg.isConfigured ? "live_sync" : "local_preview";
  const badgeLabel = mode === "live_sync" ? "Live sync" : "Local preview";

  const joinOriginEnvSet = Boolean(getJoinOriginEnvRaw());
  const win = (params?.windowOrigin ?? "").trim().replace(/\/$/, "");
  const resolvedJoin = win ? resolveJoinBaseUrl(win).baseUrl : getConfiguredJoinOrigin() ?? win;
  const joinBaseIsLoopback = resolvedJoin ? isLoopbackJoinOrigin(resolvedJoin) : false;

  const issues: ShowtimeConnectionIssue[] = [];

  if (mode === "local_preview") {
    if (!cfg.url.trim()) {
      issues.push(
        issue(
          "missing_url",
          "blocking",
          "Supabase URL is not set",
          "NEXT_PUBLIC_SUPABASE_URL is empty, so this build runs in local preview only.",
          "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to switch to live sync.",
        ),
      );
    }
    if (!cfg.anonKey.trim()) {
      issues.push(
        issue(
          "missing_anon",
          "blocking",
          "Supabase anon key is not set",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY is empty. The URL alone is not enough to open a client.",
          "Add NEXT_PUBLIC_SUPABASE_ANON_KEY from your Supabase project settings.",
        ),
      );
    }
  }

  if (mode === "live_sync") {
    if (!joinOriginEnvSet && joinBaseIsLoopback) {
      issues.push(
        issue(
          "join_origin_phones",
          "warning",
          "Phones may not reach your join links",
          "NEXT_PUBLIC_JOIN_ORIGIN is not set and this page is on localhost. Guest devices on Wi‑Fi cannot open localhost URLs.",
          "Set NEXT_PUBLIC_JOIN_ORIGIN to your machine’s LAN URL (e.g. http://192.168.1.10:3000) or your deployed site origin.",
        ),
      );
    }
    if (joinOriginEnvSet && joinBaseIsLoopback) {
      issues.push(
        issue(
          "join_origin_loopback",
          "warning",
          "Join origin points at loopback",
          "NEXT_PUBLIC_JOIN_ORIGIN looks like localhost or 127.0.0.1. Phones on another network cannot use that.",
          "Point NEXT_PUBLIC_JOIN_ORIGIN at a LAN-reachable host, tunnel, or production URL.",
        ),
      );
    }
  }

  const blockingIssues = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity === "warning");

  return {
    mode,
    badgeLabel,
    supabaseUrlPresent: Boolean(cfg.url.trim()),
    supabaseAnonPresent: Boolean(cfg.anonKey.trim()),
    joinOriginEnvSet,
    resolvedJoinBaseUrl: resolvedJoin,
    joinBaseIsLoopback,
    issues,
    blockingIssues,
    warnings,
  };
}

/** Optional lightweight reachability check (never throws). */
export async function probeSupabaseReachability(): Promise<{ ok: boolean; message: string }> {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return { ok: true, message: "Supabase is not configured." };
  const base = url.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: anonKey },
      cache: "no-store",
    });
    if (res.ok) return { ok: true, message: "Supabase auth endpoint responded." };
    return { ok: false, message: `Supabase returned HTTP ${res.status} from the auth health check.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { ok: false, message: `Could not reach Supabase (${msg}). Check URL, firewall, and ad blockers.` };
  }
}
