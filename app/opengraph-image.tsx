import { ImageResponse } from "next/og";

export const alt = "Showtime — The story is ours.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Fetches the brand display face (Noto Serif Display, extra-condensed Black) for the share image.
 * Build-time only; if the font host is unreachable the image falls back to a bold system serif.
 */
async function loadWordmarkFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=Noto+Serif+Display:wdth,wght@62.5,900&text=${encodeURIComponent(text)}`,
      )
    ).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const font = await loadWordmarkFont("SHOWTIME");
  const family = font ? "Wordmark" : "Georgia, serif";
  const letter = { fontFamily: family, fontSize: 168, fontWeight: 900, color: "#f7f1e6", lineHeight: 1 } as const;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse at 50% 38%, #1d1b19 0%, #0b0b0b 68%)",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 90, background: "linear-gradient(90deg, #7d1515, #0b0b0b)", display: "flex" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 90, background: "linear-gradient(270deg, #7d1515, #0b0b0b)", display: "flex" }} />

        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ ...letter, display: "flex" }}>SH</div>
          <svg width="128" height="128" viewBox="0 0 100 100" style={{ margin: "0 6px" }}>
            <path d="M0.02 48.5A50 50 0 0 1 99.98 48.5L81.97 48.5A32 32 0 0 0 18.03 48.5Z" fill="#f7f1e6" />
            <path d="M0.02 51.5A50 50 0 0 0 99.98 51.5L81.97 51.5A32 32 0 0 1 18.03 51.5Z" fill="#f7f1e6" />
            <circle cx="50" cy="50" r="23" fill="#d62828" />
          </svg>
          <div style={{ ...letter, display: "flex" }}>WTIME</div>
        </div>

        <div style={{ width: 84, height: 5, background: "#d62828", marginTop: 34, display: "flex" }} />
        <div
          style={{
            marginTop: 30,
            fontSize: 30,
            letterSpacing: 14,
            color: "#f7f1e6",
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          The story is ours.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "Wordmark", data: font, weight: 900, style: "normal" }] : undefined,
    },
  );
}
