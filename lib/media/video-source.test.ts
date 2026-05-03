import { describe, expect, it } from "vitest";

import { extractYoutubeVideoId, resolveVideoSource } from "./video-source";

describe("video-source", () => {
  it("extracts watch URL id", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=B9qug1rEQnM")).toBe("B9qug1rEQnM");
  });

  it("extracts short youtu.be id", () => {
    expect(extractYoutubeVideoId("https://youtu.be/B9qug1rEQnM")).toBe("B9qug1rEQnM");
  });

  it("resolves youtube vs direct", () => {
    expect(resolveVideoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
    expect(resolveVideoSource("https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")).toEqual({
      kind: "direct",
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    });
  });
});
