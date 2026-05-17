import { NextResponse } from "next/server";

import { formatBuilderError } from "@/lib/admin/format-builder-error";
import { armShowRoomAtOpening } from "@/lib/showtime/arm-show-room";
import { NIGHT1_EVENT_CODE } from "@/lib/showtime/night1-demo-graph";
import { createEmptyShow } from "@/lib/supabase/create-empty-show";
import { getEventByCode, listStoryNodesForEvent } from "@/lib/supabase/event-room";
import { resetNight1DemoData } from "@/lib/supabase/seed-night1-demo";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role-client";

type Body = {
  code?: string;
  title?: string;
  /** When true and code is NIGHT1, install the full demo graph. */
  installDemo?: boolean;
};

/**
 * One-shot room bootstrap for show night — uses service role so the operator does not
 * need to click around in Supabase. Requires SUPABASE_SERVICE_ROLE_KEY on the server.
 */
export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (code.length < 3) {
    return NextResponse.json({ ok: false, error: "Show code must be at least 3 characters." }, { status: 400 });
  }

  const client = createSupabaseServiceRoleClient();
  if (!client) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Server cannot reach Supabase with the service role. Add SUPABASE_SERVICE_ROLE_KEY to .env.local and restart `npm run dev`.",
        useClientFallback: true,
      },
      { status: 503 },
    );
  }

  try {
    if (body.installDemo || code === NIGHT1_EVENT_CODE) {
      await resetNight1DemoData(client);
    }

    let event = await getEventByCode(client, code);
    if (!event) {
      event = await createEmptyShow(client, {
        code,
        title: typeof body.title === "string" ? body.title : "",
      });
    }

    const nodes = await listStoryNodesForEvent(client, event.id);
    const armed = await armShowRoomAtOpening(client, event.id, nodes);

    return NextResponse.json({
      ok: true,
      event: armed.event,
      hasOpeningVideo: armed.hasOpeningVideo,
      firstBeatTitle: armed.firstNode.title,
    });
  } catch (e) {
    const { friendly, technical } = formatBuilderError(e);
    return NextResponse.json({ ok: false, error: friendly, technical }, { status: 500 });
  }
}
