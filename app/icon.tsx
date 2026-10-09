import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon — the Showtime target symbol on Theatre Black. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b0b",
          borderRadius: 7,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 100 100">
          <path d="M0.02 48.5A50 50 0 0 1 99.98 48.5L81.97 48.5A32 32 0 0 0 18.03 48.5Z" fill="#f7f1e6" />
          <path d="M0.02 51.5A50 50 0 0 0 99.98 51.5L81.97 51.5A32 32 0 0 1 18.03 51.5Z" fill="#f7f1e6" />
          <circle cx="50" cy="50" r="23" fill="#d62828" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
