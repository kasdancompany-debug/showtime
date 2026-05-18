import { describe, expect, it } from "vitest";

import { participantStorageKey } from "./participant-identity";

describe("participant-identity", () => {
  it("uses per-room storage keys", () => {
    expect(participantStorageKey("night1")).toBe("showtime:participant:NIGHT1");
  });
});
