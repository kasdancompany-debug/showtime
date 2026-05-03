/**
 * Base URL for audience join links and QR codes.
 *
 * When you run Next on `localhost`, `window.location.origin` is not reachable
 * from a phone — set `NEXT_PUBLIC_JOIN_ORIGIN` to your LAN IP, tunnel, or prod URL
 * (no trailing slash), e.g. `http://192.168.1.10:3000` or `https://your-app.vercel.app`.
 */
export function getConfiguredJoinOrigin(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_JOIN_ORIGIN?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/$/, "");
}

/** Raw env value for diagnostics (client-safe `NEXT_PUBLIC_*`). */
export function getJoinOriginEnvRaw(): string {
  return process.env.NEXT_PUBLIC_JOIN_ORIGIN?.trim() ?? "";
}

export function formatJoinOriginEnvDisplay(): string {
  const raw = getJoinOriginEnvRaw();
  return raw ? raw : "(not set — falls back to this page’s origin)";
}

export function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

/**
 * True when the join base URL points at loopback (phones on the LAN cannot open it).
 * Accepts full origins (`http://localhost:3000`) or scheme-relative hostnames.
 */
export function isLoopbackJoinOrigin(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (!trimmed) return false;
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

export type JoinBaseUrlSource = "env" | "window";

/**
 * Rule: prefer `NEXT_PUBLIC_JOIN_ORIGIN` when set; otherwise `window.location.origin`.
 */
export function resolveJoinBaseUrl(windowOrigin: string): {
  baseUrl: string;
  source: JoinBaseUrlSource;
} {
  const configured = getConfiguredJoinOrigin();
  if (configured) {
    return { baseUrl: configured, source: "env" };
  }
  const origin = windowOrigin.trim().replace(/\/$/, "");
  return { baseUrl: origin || windowOrigin, source: "window" };
}
