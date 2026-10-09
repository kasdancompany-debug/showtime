"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ShowtimeWordmark } from "@/components/brand";
import { HostLocalPreviewDesk } from "@/components/host/host-local-preview-desk";
import { HostRemoteDesk } from "@/components/host/host-remote-desk";
import { useHostSupabaseRoomSync } from "@/hooks/use-host-supabase-room-sync";
import { useIngestBroadcastAudienceVotes } from "@/hooks/use-ingest-broadcast-audience-votes";
import { useLocalMockVoteBroadcast } from "@/hooks/use-local-mock-vote-broadcast";
import { getShowtimeSyncMode } from "@/lib/showtime/sync-mode";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Live host desk — remote control for `/screen` only (see {@link HostRemoteDesk}).
 */
export function HostControlDesk({ boundRoomCode }: { boundRoomCode?: string } = {}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const eventId = useMockEventStore((s) => s.eventId);
  const syncMode = useMemo(() => getShowtimeSyncMode(), []);
  const isLive = syncMode === "live_supabase";

  useHostSupabaseRoomSync();
  useLocalMockVoteBroadcast();
  useIngestBroadcastAudienceVotes(eventId);

  return (
    <div className="host-operator-root showtime-functional flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-[var(--kc-cream)] antialiased">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--host-divider)] bg-[color-mix(in_oklch,var(--kc-panel)_48%,black)] px-4 py-2.5 md:px-5">
        <span className={cn("kc-mode-pill", isLive && "kc-mode-pill--live")}>{isLive ? "Live room" : "Rehearsal"}</span>
        <Link
          href="/"
          aria-label="Showtime home"
          className="transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sh-cream)]"
        >
          <ShowtimeWordmark compact className="text-[1.1rem]" />
        </Link>
      </div>
      {supabase ? <HostRemoteDesk boundRoomCode={boundRoomCode} /> : <HostLocalPreviewDesk />}
    </div>
  );
}
