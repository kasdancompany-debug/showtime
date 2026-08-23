import { createHmac, timingSafeEqual } from "crypto";

export const GATE_COOKIE_NAME = "kc_gate";

function requireSecret(): string {
  const secret = process.env.GATE_SECRET;
  if (!secret) throw new Error("GATE_SECRET is not configured.");
  return secret;
}

/** Deterministic token derived from GATE_SECRET — same value every time, no per-session state to store. */
export function gateCookieToken(): string {
  return createHmac("sha256", requireSecret()).update("kc-gate-v1").digest("hex");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isValidGateCookie(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    return timingSafeStringEqual(value, gateCookieToken());
  } catch {
    return false;
  }
}

export function verifyGateCode(code: string): boolean {
  const configured = process.env.GATE_CODE;
  if (!configured) return false;
  try {
    return timingSafeStringEqual(code, configured);
  } catch {
    return false;
  }
}
