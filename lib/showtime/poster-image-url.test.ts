import { describe, expect, it } from "vitest";

import { normalizePosterImageUrlInput, resolvePosterImageUrl } from "@/lib/showtime/poster-image-url";

describe("poster-image-url", () => {
  it("resolves root-relative paths", () => {
    expect(resolvePosterImageUrl("/screen-posters/foo.png", "https://kasdanshowtime.com")).toBe(
      "https://kasdanshowtime.com/screen-posters/foo.png",
    );
  });

  it("keeps https URLs", () => {
    expect(resolvePosterImageUrl("https://cdn.example.com/p.jpg", "https://kasdanshowtime.com")).toBe(
      "https://cdn.example.com/p.jpg",
    );
  });

  it("rejects blob URLs", () => {
    expect(resolvePosterImageUrl("blob:http://localhost/x", "https://kasdanshowtime.com")).toBeNull();
  });

  it("normalizes relative to absolute", () => {
    expect(normalizePosterImageUrlInput("/screen-posters/x.webp", "https://kasdanshowtime.com")).toBe(
      "https://kasdanshowtime.com/screen-posters/x.webp",
    );
  });
});
