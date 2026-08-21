import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for attendees who add the /join ballot to their phone for the night. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #0b0b10 0%, #16141c 100%)",
        }}
      >
        <div
          style={{
            width: 108,
            height: 108,
            borderRadius: "50%",
            border: "4px solid #e9c988",
            boxShadow: "inset 0 0 0 2px rgba(233,201,136,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#e9c988",
            fontSize: 62,
            fontFamily: "Georgia, serif",
          }}
        >
          K
        </div>
      </div>
    ),
    { ...size },
  );
}
