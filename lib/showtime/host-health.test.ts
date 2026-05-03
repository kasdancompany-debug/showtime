import { describe, expect, it } from "vitest";

import { MOCK_EVENT } from "@/lib/mock-data";

import { shouldWarnRealtimeDisconnected, shouldWarnRemoteEventMissing } from "./host-health";

describe("shouldWarnRemoteEventMissing", () => {
  it("is false for hybrid mock event code when row is missing", () => {
    expect(shouldWarnRemoteEventMissing("missing", MOCK_EVENT.eventCode)).toBe(false);
  });

  it("is true when missing and code is not the hybrid mock", () => {
    expect(shouldWarnRemoteEventMissing("missing", "OTHER")).toBe(true);
  });

  it("is false when lookup is ok", () => {
    expect(shouldWarnRemoteEventMissing("ok", "OTHER")).toBe(false);
  });
});

describe("shouldWarnRealtimeDisconnected", () => {
  it("is false in local_preview even when probe errors", () => {
    expect(shouldWarnRealtimeDisconnected("local_preview", "error")).toBe(false);
  });

  it("is true in live_supabase when probe errors", () => {
    expect(shouldWarnRealtimeDisconnected("live_supabase", "error")).toBe(true);
  });

  it("is false in live_supabase while connecting", () => {
    expect(shouldWarnRealtimeDisconnected("live_supabase", "connecting")).toBe(false);
  });

  it("is false in live_supabase when subscribed", () => {
    expect(shouldWarnRealtimeDisconnected("live_supabase", "subscribed")).toBe(false);
  });
});
