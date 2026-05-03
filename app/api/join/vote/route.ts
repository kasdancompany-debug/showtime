import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSupabaseConfig } from "@/lib/supabase/env";
import type { Database, VoteOption } from "@/lib/supabase/database.types";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) {
    return NextResponse.json({ error: "Live database not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const { eventId, storyNodeId, audienceMemberId, choice } = body as Record<string, unknown>;
  if (typeof eventId !== "string" || typeof storyNodeId !== "string" || typeof audienceMemberId !== "string") {
    return NextResponse.json({ error: "eventId, storyNodeId, and audienceMemberId are required" }, { status: 400 });
  }
  if (choice !== "A" && choice !== "B") {
    return NextResponse.json({ error: "choice must be A or B" }, { status: 400 });
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const row: Database["public"]["Tables"]["votes"]["Insert"] = {
    event_id: eventId,
    story_node_id: storyNodeId,
    audience_member_id: audienceMemberId,
    vote_option: choice as VoteOption,
  };

  const { error } = await client.from("votes").insert(row);

  if (error) {
    if ("code" in error && error.code === "23505") {
      return NextResponse.json({ duplicate: true }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
