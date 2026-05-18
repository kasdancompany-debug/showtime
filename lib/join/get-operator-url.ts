import { normalizeJoinEventCode } from "@/lib/join/get-join-url";
import { resolveJoinBaseUrl } from "@/lib/join/join-base-url";

/**
 * Operator desk URL for a show code — separate from audience `/join/[code]` links.
 */
export function getOperatorUrl(roomCode: string, windowOrigin: string): string {
  const code = normalizeJoinEventCode(roomCode);
  if (!code) return "";
  const { baseUrl } = resolveJoinBaseUrl(windowOrigin.trim());
  const cleanBase = baseUrl.replace(/\/$/, "");
  return `${cleanBase}/operator/${encodeURIComponent(code)}`;
}
