/** Last show code used on operator, screen, and show-night hub (shared across tabs). */
export const OPERATOR_CODE_LS = "showtime.operator.eventCode";

export function readStoredOperatorCode(): string {
  if (typeof window === "undefined") return "";
  try {
    const url = new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase();
    if (url && url.length >= 3) return url;
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
