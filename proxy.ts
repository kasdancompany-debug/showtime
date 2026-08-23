import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { GATE_COOKIE_NAME, isValidGateCookie } from "@/lib/gate/gate-auth";

/**
 * Gates every operator/admin surface (/, /show, /experiences, /host, /admin, ...) behind a
 * shared passcode — anyone with the URL could otherwise reach the builder, the operator desk,
 * and the ability to delete/overwrite show data. Audience-facing routes (/join, /screen, the
 * vote API, and static/meta assets) are excluded so guests and the unattended projector never
 * see a login prompt.
 */
export function proxy(request: NextRequest) {
  const cookie = request.cookies.get(GATE_COOKIE_NAME)?.value;
  if (isValidGateCookie(cookie)) return NextResponse.next();

  const url = new URL("/gate", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!join|screen|gate|api/gate|api/join|_next/static|_next/image|favicon\\.ico|icon|apple-icon|manifest\\.webmanifest).*)",
  ],
};
