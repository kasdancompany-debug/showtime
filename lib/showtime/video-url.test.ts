import { describe, expect, it } from "vitest";

import {
  analyzeStoryBeatVideoUrl,
  displayStoryVideoFilename,
  hasAllowedVideoExtension,
  hasStoryVideoUrl,
  normalizeShowtimeVideoUrlInput,
  resolveStoryVideoUrl,
} from "@/lib/showtime/video-url";

describe("resolveStoryVideoUrl", () => {
  it("rejects blob and file in video_url", () => {
    expect(resolveStoryVideoUrl("blob:x", "https://x.com")).toBeNull();
    expect(resolveStoryVideoUrl("file:///x", "https://x.com")).toBeNull();
  });

  it("joins root-relative and origin", () => {
    expect(resolveStoryVideoUrl("/videos/a.mp4", "https://show.example")).toBe("https://show.example/videos/a.mp4");
  });

  it("uses https URL as-is", () => {
    expect(resolveStoryVideoUrl("https://cdn.example/a.mp4", "https://x.com")).toBe("https://cdn.example/a.mp4");
  });

  it("maps bare filename to /videos/", () => {
    expect(resolveStoryVideoUrl("clip.mp4", "https://show.example")).toBe("https://show.example/videos/clip.mp4");
  });

  it("rejects unfinished Windows paths", () => {
    expect(resolveStoryVideoUrl(String.raw`C:\only\clip.mp4`, "http://localhost:3000")).toBeNull();
  });

  it("normalizes Windows public/videos path to URL", () => {
    const winPath = String.raw`C:\Dev\Kasdan Co. Player\public\videos\IMG_4259.MOV`;
    expect(normalizeShowtimeVideoUrlInput(winPath)).toBe("/videos/IMG_4259.MOV");
    expect(resolveStoryVideoUrl(winPath, "http://localhost:3000")).toBe("http://localhost:3000/videos/IMG_4259.MOV");
  });

  it("hasStoryVideoUrl", () => {
    expect(hasStoryVideoUrl("")).toBe(false);
    expect(hasStoryVideoUrl("/v/a.mp4")).toBe(true);
  });
});

describe("displayStoryVideoFilename", () => {
  it("returns last path segment without query", () => {
    expect(displayStoryVideoFilename("https://cdn.example/folder/clip.mp4?q=1")).toBe("clip.mp4");
    expect(displayStoryVideoFilename("/videos/foo.webm")).toBe("foo.webm");
  });
});

describe("hasAllowedVideoExtension", () => {
  it("accepts mp4 webm mov in path or URL", () => {
    expect(hasAllowedVideoExtension("https://x.com/a/b.mp4")).toBe(true);
    expect(hasAllowedVideoExtension("https://x.com/v.webm?x=1")).toBe(true);
    expect(hasAllowedVideoExtension("/videos/foo.WEBM")).toBe(true);
    expect(hasAllowedVideoExtension("/videos/x.mov")).toBe(true);
  });

  it("rejects other extensions", () => {
    expect(hasAllowedVideoExtension("https://x.com/a.mkv")).toBe(false);
  });
});

describe("analyzeStoryBeatVideoUrl", () => {
  const origin = "https://show.example";

  it("warns when video URL empty", () => {
    const r = analyzeStoryBeatVideoUrl("", origin);
    expect(r.resolvedUrl).toBeNull();
    expect(r.issues.some((i) => i.message.toLowerCase().includes("empty"))).toBe(true);
  });

  it("warns when extension is not in the recommended set", () => {
    const r = analyzeStoryBeatVideoUrl("/videos/x.mkv", origin);
    expect(r.issues.some((i) => i.message.includes(".mp4") || i.message.includes(".webm"))).toBe(true);
  });

  it("returns clean mp4 without extension warning", () => {
    const r = analyzeStoryBeatVideoUrl("/videos/x.mp4", origin);
    expect(r.resolvedUrl).toContain("x.mp4");
    expect(r.issues).toEqual([]);
  });
});
