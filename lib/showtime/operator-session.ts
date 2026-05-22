/** Last show code used on operator, screen, and show-night hub (shared across tabs). */
export const OPERATOR_CODE_LS = "showtime.operator.eventCode";

function readOperatorCodeFromPath(): string {
  if (typeof window === "undefined") return "";
  const m = window.location.pathname.match(/^\/operator\/([^/]+)/i);
  if (!m?.[1]) return "";
  try {
    return decodeURIComponent(m[1]).trim().toUpperCase();
  } catch {
    return m[1].trim().toUpperCase();
  }
}

/** `?code=` on /screen or shared join links — highest priority for projector binding. */
export function readUrlRoomCode(): string {
  if (typeof window === "undefined") return "";
  try {
    const url = new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase();
    if (url && url.length >= 3) return url;
  } catch {
    /* ignore */
  }
  return "";
}

/** Operator show code from URL path, `?code=`, or last desk entry — never from audience participant keys. */
export function readStoredOperatorCode(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromQuery = readUrlRoomCode();
    if (fromQuery.length >= 3) return fromQuery;
    const fromPath = readOperatorCodeFromPath();
    if (fromPath.length >= 3) return fromPath;
    return window.localStorage.getItem(OPERATOR_CODE_LS)?.trim().toUpperCase() ?? "";
  } catch {
    return "";
  }
}

export function writeStoredOperatorCode(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OPERATOR_CODE_LS, code.trim().toUpperCase());
  } catch {
    /* ignore */
  }
}
