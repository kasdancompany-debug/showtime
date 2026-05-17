import { afterEach, describe, expect, it, vi } from "vitest";

import { getShowtimeConnectionSnapshot } from "./showtime-connection";

describe("getShowtimeConnectionSnapshot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("local_preview with missing env lists blocking issues", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const s = getShowtimeConnectionSnapshot({ windowOrigin: "http://localhost:3000" });
    expect(s.mode).toBe("local_preview");
    expect(s.badgeLabel).toBe("Local preview");
    expect(s.blockingIssues.length).toBeGreaterThanOrEqual(1);
  });

  it("live_sync when URL and anon are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    const s = getShowtimeConnectionSnapshot({ windowOrigin: "http://localhost:3000" });
    expect(s.mode).toBe("live_sync");
    expect(s.badgeLabel).toBe("Live sync");
    expect(s.warnings.some((w) => w.id === "join_origin_phones")).toBe(true);
  });
});
