import { afterEach, describe, expect, it, vi } from "vitest";

describe("getShowtimeSyncMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns local_preview when Supabase env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { getShowtimeSyncMode } = await import("./sync-mode");
    expect(getShowtimeSyncMode()).toBe("local_preview");
  });

  it("returns live_supabase when URL and anon key are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    const { getShowtimeSyncMode } = await import("./sync-mode");
    expect(getShowtimeSyncMode()).toBe("live_supabase");
  });

  it("returns local_preview when only URL is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { getShowtimeSyncMode } = await import("./sync-mode");
    expect(getShowtimeSyncMode()).toBe("local_preview");
  });
});
