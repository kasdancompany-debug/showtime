"use client";

import { useEffect, useMemo, useState } from "react";

import { getShowtimeConnectionSnapshot, probeSupabaseReachability, type ShowtimeConnectionSnapshot } from "@/lib/showtime/showtime-connection";

export type ShowtimeReachability = "idle" | "checking" | "ok" | "unreachable";

/**
 * Client snapshot of Showtime connection / env status, plus an optional one-shot Supabase reachability probe in live mode.
 */
export function useShowtimeConnection() {
  const [reachability, setReachability] = useState<ShowtimeReachability>("idle");
  const [reachabilityDetail, setReachabilityDetail] = useState<string | null>(null);

  const snapshot = useMemo((): ShowtimeConnectionSnapshot => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return getShowtimeConnectionSnapshot({ windowOrigin: origin });
  }, []);

  useEffect(() => {
    if (snapshot.mode !== "live_sync") {
      setReachability("idle");
      setReachabilityDetail(null);
      return;
    }
    let cancelled = false;
    setReachability("checking");
    setReachabilityDetail(null);
    void (async () => {
      const r = await probeSupabaseReachability();
      if (cancelled) return;
      if (r.ok) {
        setReachability("ok");
        setReachabilityDetail(r.message);
      } else {
        setReachability("unreachable");
        setReachabilityDetail(r.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot.mode]);

  return { snapshot, reachability, reachabilityDetail };
}
