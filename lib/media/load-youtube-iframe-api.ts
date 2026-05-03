/**
 * Loads https://www.youtube.com/iframe_api once and resolves when window.YT.Player exists.
 */
export function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  const w = window as Window & {
    YT?: { Player: unknown };
    onYouTubeIframeAPIReady?: () => void;
  };

  if (w.YT?.Player) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeoutMs = 20000;
    let settled = false;

    /** DOM timers are numeric in browsers; avoid NodeJS.Timeout from typing overlap */
    const poll = window.setInterval(() => {
      if (w.YT?.Player) finish();
    }, 32) as unknown as number;

    const t = window.setTimeout(() => fail(new Error("YouTube iframe API timeout")), timeoutMs) as unknown as number;

    function finish() {
      if (settled) return;
      settled = true;
      window.clearTimeout(t);
      window.clearInterval(poll);
      resolve();
    }

    function fail(err: Error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(t);
      window.clearInterval(poll);
      reject(err);
    }

    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* ignore */
      }
      finish();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.head.appendChild(tag);
    }
  });
}
