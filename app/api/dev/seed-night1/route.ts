import { NextResponse } from "next/server";

import { resetNight1DemoData } from "@/lib/supabase/seed-night1-demo";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role-client";

/**
 * Dev-only: (re)create `NIGHT1` and the canonical five-beat graph using the service role.
 * Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` for hosted Supabase.
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development." }, { status: 403 });
  }
  const client = createSupabaseServiceRoleClient();
  if (!client) {
    return NextResponse.json(
      { error: "Configure NEXT_PUBLIC_SUPABASE_* and SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }
  try {
    const { eventId } = await resetNight1DemoData(client);
    return NextResponse.json({ ok: true, eventId, code: "NIGHT1" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
