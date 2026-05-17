import { NextResponse } from "next/server";

import { formatBuilderError } from "@/lib/admin/format-builder-error";
import { createEmptyShow } from "@/lib/supabase/create-empty-show";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role-client";

type Body = { code?: string; title?: string };

/**
 * Creates a new event + opening beat. Prefer the `create_show_for_builder` RPC (anon-safe) after migrations;
 * this route uses the service role when present for backwards compatibility or server-side tools.
 */
export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON.", technical: "" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  const title = typeof body.title === "string" ? body.title : "";

  const client = createSupabaseServiceRoleClient();
  if (!client) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Creating a show needs either the database function from the latest migrations (`create_show_for_builder`) or SUPABASE_SERVICE_ROLE_KEY on the server. Run `supabase db push` / apply migrations from this repo, or add the service role key to .env.local and restart.",
        technical: "createSupabaseServiceRoleClient() returned null",
      },
      { status: 503 },
    );
  }

  try {
    const event = await createEmptyShow(client, { code, title });
    return NextResponse.json({ ok: true, event });
  } catch (e) {
    const { friendly, technical } = formatBuilderError(e);
    if (e instanceof Error && e.message === "CODE_TAKEN") {
      return NextResponse.json(
        {
          ok: false,
          error: "That show code already exists. Tap “Load show” to open it, or pick a different code.",
          technical: "unique events.code",
        },
        { status: 409 },
      );
    }
    const status = /characters|letters|underscores|Use only/i.test(friendly) ? 400 : 500;
    return NextResponse.json({ ok: false, error: friendly, technical }, { status });
  }
}
