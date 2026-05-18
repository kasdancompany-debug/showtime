import { describe, expect, it } from "vitest";

import { getOperatorUrl } from "./get-operator-url";

describe("getOperatorUrl", () => {
  it("builds /operator/[code] path", () => {
    expect(getOperatorUrl("night1", "https://show.example.com")).toBe("https://show.example.com/operator/NIGHT1");
  });
});
