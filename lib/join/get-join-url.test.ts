import { afterEach, describe, expect, it, vi } from "vitest";

import { LOOPBACK_WARNING, analyzeJoinUrlForPhones, normalizeJoinEventCode } from "./get-join-url";

describe("normalizeJoinEventCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeJoinEventCode("  night1 ")).toBe("NIGHT1");
  });
});

describe("getJoinUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses NEXT_PUBLIC_JOIN_ORIGIN when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_JOIN_ORIGIN", "https://show.example.com");
    vi.resetModules();
    const { getJoinUrl: gj } = await import("./get-join-url");
    expect(gj("night1", "http://localhost:3000")).toBe("https://show.example.com/join/NIGHT1");
  });

  it("falls back to window origin when env unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_JOIN_ORIGIN", "");
    vi.resetModules();
    const { getJoinUrl: gj } = await import("./get-join-url");
    expect(gj("abc", "http://192.168.1.5:3000")).toBe("http://192.168.1.5:3000/join/ABC");
  });
});

describe("analyzeJoinUrlForPhones", () => {
  it("flags localhost", () => {
    const a = analyzeJoinUrlForPhones("http://localhost:3000/join/NIGHT1");
    expect(a.phoneSafe).toBe(false);
    expect(a.recommendedFix).toContain("Phones usually cannot open localhost");
    expect(LOOPBACK_WARNING).toContain("Phones usually cannot open localhost");
  });

  it("accepts LAN-style origins", () => {
    const a = analyzeJoinUrlForPhones("http://192.168.1.10:3000/join/NIGHT1");
    expect(a.phoneSafe).toBe(true);
  });
});
