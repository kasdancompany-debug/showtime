"use client";

import { useMemo } from "react";
import QRCode from "qrcode";

import { cn } from "@/lib/utils";

import { FilmFrame } from "./motifs";

type Props = {
  /** The full join URL to encode */
  url: string;
  className?: string;
  /** Alt text for assistive tech */
  label?: string;
};

/** Quiet zone, in modules, drawn inside the SVG (the spec asks for 4; the card padding supplies the rest). */
const MARGIN = 2;

/**
 * "Scan to join" code, drawn locally — no third-party QR service, so the projector keeps working on
 * a flaky venue network. Reel Cream card, Theatre Black modules, Showtime Red corner marks.
 */
export function JoinQr({ url, className, label = "QR code to join the show" }: Props) {
  const { size, d } = useMemo(() => {
    const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const data = qr.modules.data;
    let path = "";
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (!data[y * n + x]) {
          x++;
          continue;
        }
        let run = 1;
        while (x + run < n && data[y * n + x + run]) run++;
        path += `M${x + MARGIN} ${y + MARGIN}h${run}v1h-${run}z`;
        x += run;
      }
    }
    return { size: n + MARGIN * 2, d: path };
  }, [url]);

  return (
    <FilmFrame color="var(--sh-red)" className={cn("bg-[var(--sh-cream)] p-[6%]", className)}>
      <svg viewBox={`0 0 ${size} ${size}`} className="block h-auto w-full" shapeRendering="crispEdges" role="img" aria-label={label}>
        <path d={d} fill="#0b0b0b" />
      </svg>
    </FilmFrame>
  );
}
