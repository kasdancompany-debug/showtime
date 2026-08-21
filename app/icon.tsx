import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon — gold Deco sunburst monogram on piano black, matching the kasdan-hollywood theme. */
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
          background: "#0b0b10",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "2px solid #e9c988",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#e9c988",
            fontSize: 13,
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
