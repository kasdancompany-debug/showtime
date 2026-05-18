import { NextResponse } from "next/server";

import { formatBuilderError } from "@/lib/admin/format-builder-error";
import { launchExperienceToLiveRoom } from "@/lib/showtime/launch-experience";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role-client";

type Body = { roomCode?: string };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "Experience id is required." }, { status: 400 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const client = createSupabaseServiceRoleClient();
  if (!client) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Launch needs SUPABASE_SERVICE_ROLE_KEY on the server (Vercel → Project → Settings → Environment Variables). Trying your browser session instead…",
        useClientFallback: true,
      },
      { status: 503 },
    );
  }

  try {
    const result = await launchExperienceToLiveRoom(client, id.trim(), {
      roomCode: typeof body.roomCode === "string" ? body.roomCode : undefined,
    });
    return NextResponse.json({
      ok: true,
      roomCode: result.roomCode,
      event: result.event,
      experience: result.experience,
      hasOpeningVideo: result.hasOpeningVideo,
    });
  } catch (e) {
    const { friendly, technical } = formatBuilderError(e);
    return NextResponse.json({ ok: false, error: friendly, technical }, { status: 500 });
  }
}
