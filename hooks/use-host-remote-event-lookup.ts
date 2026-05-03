"use client";

import { useEffect, useState } from "react";

import { MOCK_EVENT } from "@/lib/mock-data";
import { fetchEventByCode } from "@/lib/join/supabase-room";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { HostRemoteEventLookupStatus } from "@/lib/showtime/host-health";

/**
 * Optional DB check on /host when Supabase is configured — warns if code has no row (unless hybrid mock code).
 */
export function useHostRemoteEventLookup(eventCode: string, supabaseEnabled: boolean) {
  const [status, setStatus] = useState<HostRemoteEventLookupStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseEnabled) {
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    const client = createSupabaseBrowserClient();
    if (!client) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setErrorMessage(null);

    void fetchEventByCode(client, eventCode)
      .then((row) => {
        if (cancelled) return;
        if (row) {
          setStatus("ok");
          return;
        }
        setStatus(eventCode === MOCK_EVENT.eventCode ? "ok" : "missing");
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(e instanceof Error ? e.message : "Could not verify event");
      });

    return () => {
      cancelled = true;
    };
  }, [eventCode, supabaseEnabled]);

  return { status, errorMessage };
}
