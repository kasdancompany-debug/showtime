import { NextResponse } from "next/server";

import { GATE_COOKIE_NAME, gateCookieToken, verifyGateCode } from "@/lib/gate/gate-auth";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const code = body && typeof body === "object" && "code" in body ? (body as { code: unknown }).code : null;
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ ok: false, error: "Enter the code." }, { status: 400 });
  }

  if (!verifyGateCode(code.trim())) {
    return NextResponse.json({ ok: false, error: "Incorrect code." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(GATE_COOKIE_NAME, gateCookieToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
