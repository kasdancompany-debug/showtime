import type { SupabaseClient } from "@supabase/supabase-js";

import { tryEnsureAnonymousSession } from "@/lib/join/supabase-room";
import { armShowRoomAtOpening } from "@/lib/showtime/arm-show-room";
import { NIGHT1_EVENT_CODE } from "@/lib/showtime/night1-demo-graph";
import { slugTitleToShowCode } from "@/lib/showtime/show-code";
import type { Database } from "@/lib/supabase/database.types";
import { createEmptyShow } from "@/lib/supabase/create-empty-show";
import { getEventByCode, listStoryNodesForEvent, type EventRow } from "@/lib/supabase/event-room";

export type GoLiveApiResponse = {
  ok: boolean;
  error?: string;
  technical?: string;
  useClientFallback?: boolean;
  event?: EventRow;
  hasOpeningVideo?: boolean;
  firstBeatTitle?: string;
};

export type GoLiveParams = {
  code: string;
  title?: string;
  installDemo?: boolean;
};

/** Server-side bootstrap (service role) — preferred when available. */
export async function goLiveViaApi(params: GoLiveParams): Promise<GoLiveApiResponse> {
  const res = await fetch("/api/show/go-live", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: params.code,
      title: params.title,
      installDemo: params.installDemo ?? params.code === NIGHT1_EVENT_CODE,
    }),
  });
  return (await res.json()) as GoLiveApiResponse;
}

/** Browser client fallback when service role route is unavailable. */
export async function goLiveViaClient(
  client: SupabaseClient<Database>,
  params: GoLiveParams,
): Promise<{ event: EventRow; hasOpeningVideo: boolean }> {
  const code = params.code.trim().toUpperCase();
  const anon = await tryEnsureAnonymousSession(client);
  if (!anon.ok) {
    throw new Error(anon.message);
  }

  let event = await getEventByCode(client, code);
  if (!event) {
    const title = params.title?.trim() || `Live show ${code}`;
    const { data: newId, error: rpcError } = await client.rpc("create_show_for_builder", {
      p_code: code,
      p_title: title,
    });
    if (rpcError?.message?.includes("CODE_TAKEN")) {
      event = await getEventByCode(client, code);
    } else if (!rpcError && newId) {
      event = await getEventByCode(client, code);
    }
    if (!event) {
      const res = await fetch("/api/admin/create-show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, title }),
      });
      const data = (await res.json()) as { ok?: boolean; event?: EventRow; error?: string };
      if (!data.ok || !data.event) {
        throw new Error(data.error ?? rpcError?.message ?? "Could not create show.");
      }
      event = data.event;
    }
  }

  const nodes = await listStoryNodesForEvent(client, event.id);
  const armed = await armShowRoomAtOpening(client, event.id, nodes);
  return { event: armed.event, hasOpeningVideo: armed.hasOpeningVideo };
}

export function resolveGoLiveCode(codeInput: string, titleDraft: string): string {
  const typed = codeInput.trim().toUpperCase();
  if (typed.length >= 3) return typed;
  return slugTitleToShowCode(titleDraft);
}

export function openShowNightSurfaces(code: string): { screenWindow: Window | null } {
  const hostUrl = `/operator/${encodeURIComponent(code)}`;
  const screenWindow = window.open("/screen", "showtime-screen", "noopener,noreferrer");
  window.location.assign(hostUrl);
  return { screenWindow };
}
