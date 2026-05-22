"use client";

import { useMemo, useState } from "react";
import { Film } from "lucide-react";

import { resolvePosterImageUrl } from "@/lib/showtime/poster-image-url";
import { cn } from "@/lib/utils";

type Props = {
  url: string | null | undefined;
  title: string;
  className?: string;
};

export function ExperienceThumbnail({ url, title, className }: Props) {
  const [broken, setBroken] = useState(false);
  const src = useMemo(() => resolvePosterImageUrl(url), [url]);

  if (!src || broken) {
    return (
      <div
        className={cn("flex size-full items-center justify-center bg-black/50 text-[var(--kc-champagne)]/40", className)}
        aria-hidden
      >
        <Film className="size-10" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- dynamic poster URLs (Supabase, CDN, /public)
    <img
      src={src}
      alt={title ? `${title} thumbnail` : ""}
      className={cn("size-full object-cover opacity-90", className)}
      onError={() => setBroken(true)}
    />
  );
}
