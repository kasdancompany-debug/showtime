"use client";

import { useEffect, useState } from "react";

import {
  isLoopbackJoinOrigin,
  resolveJoinBaseUrl,
  type JoinBaseUrlSource,
} from "@/lib/join/join-base-url";

export type UseJoinBaseUrlResult = {
  /** Resolved base (no trailing slash) used for QR + join links */
  joinBaseUrl: string;
  /** `window.location.origin` after mount */
  windowOrigin: string;
  /** Whether `NEXT_PUBLIC_JOIN_ORIGIN` was set */
  joinOriginSource: JoinBaseUrlSource | "";
  /** Phones usually cannot open localhost / 127.0.0.1 — warn on /host */
  loopbackJoinWarning: boolean;
};

/**
 * Client-only: resolves QR/join base URL per product rules (env override → page origin).
 */
export function useJoinBaseUrl(): UseJoinBaseUrlResult {
  const [joinBaseUrl, setJoinBaseUrl] = useState("");
  const [windowOrigin, setWindowOrigin] = useState("");
  const [joinOriginSource, setJoinOriginSource] = useState<JoinBaseUrlSource | "">("");

  useEffect(() => {
    const loc = window.location;
    setWindowOrigin(loc.origin);
    const resolved = resolveJoinBaseUrl(loc.origin);
    setJoinBaseUrl(resolved.baseUrl);
    setJoinOriginSource(resolved.source);
  }, []);

  const loopbackJoinWarning = Boolean(joinBaseUrl && isLoopbackJoinOrigin(joinBaseUrl));

  return { joinBaseUrl, windowOrigin, joinOriginSource, loopbackJoinWarning };
}
