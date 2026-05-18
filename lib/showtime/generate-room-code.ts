const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Six-character room code (no ambiguous 0/O/1/I). */
export function generateRoomCode(length = 6): string {
  const n = Math.max(4, Math.min(12, length));
  let out = "";
  const bytes = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < n; i++) {
      out += ALPHABET[bytes[i]! % ALPHABET.length];
    }
    return out;
  }
  for (let i = 0; i < n; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
