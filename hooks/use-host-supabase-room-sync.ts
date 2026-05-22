"use client";

import { useEffect, useMemo } from "react";

import { fetchAudienceMemberCount, fetchEventByCode } from "@/lib/join/supabase-room";
import { MOCK_EVENT } from "@/lib/mock-data";
import { readStoredOperatorCode } from "@/lib/showtime/operator-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMockEventStore } from "@/lib/store/mock-event-store";

const POLL_MS = 4000;

/**
 * Live nights: resolve `events.id` for the desk `eventCode` and keep audience headcount in sync with Postgres.
 * Mount on the host and screen routes so every tab subscribes to the same Realtime channel (the store default
 * `evt_local_*` would otherwise strand sync, heartbeats, and audience count while phones use the real row).
 */
export function useHostSupabaseRoomSync() {
  const client = useMemo(() => createSupabaseBrowserClient(), []);
  const storeEventCode = useMockEventStore((s) => s.eventCode);
  const setEventId = useMockEventStore((s) => s.setEventId);
  const setAudienceConnected = useMockEventStore((s) => s.setAudienceConnected);

  useEffect(() => {
    if (!client) return;

    let cancelled = false;

    const tick = async () => {
      try {
        const code = readStoredOperatorCode() || storeEventCode;
        const row = await fetchEventByCode(client, code);
        if (cancelled) return;

        if (!row) {
          if (code.toUpperCase() === MOCK_EVENT.eventCode) {
            setEventId(MOCK_EVENT.id);
          }
          return;
        }

        setEventId(row.id);
        const count = await fetchAudienceMemberCount(client, row.id);
        if (!cancelled) setAudienceConnected(count);
      } catch {
        /* network / RPC not migrated yet — leave counts as-is */
      }
    };

    void tick();
    const interval = window.setInterval(tick, POLL_MS);
    const onFocus = () => {
      void tick();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [client, storeEventCode, setEventId, setAudienceConnected]);
}
