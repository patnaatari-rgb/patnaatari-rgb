import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getSecretKey } from "@/lib/auth-secret";

const COOKIE_NAME = "ams_session";

/**
 * Route prefixes only a Super Admin may open. Already dropped from the
 * sidebar and Ctrl+K search for KVK roles (KVK_HIDDEN_SLUGS in
 * lib/navigation.ts) and user/role-management already bounce a KVK session
 * client-side (client direction, 2026-09-07) - but /masters had no client
 * guard at all, and all three still rendered server-side (full RSC payload)
 * on a direct URL. This is the backend half of the same, already-decided
 * rule. To re-open a section to KVK roles later, remove it here and from
 * KVK_HIDDEN_SLUGS together.
 */
const SUPER_ADMIN_ONLY_PREFIXES = ["/masters", "/user-management", "/role-management"];

/**
 * Real session check at the edge - without this, typing a dashboard URL
 * directly bypasses login entirely (the old mock only gated the UI's
 * *appearance*, not access). Verifies the JWT itself (not just presence)
 * so a tampered/expired cookie still redirects to /login.
 *
 * Shares getSecretKey() with lib/auth.ts (security audit finding, 2026-09-02)
 * rather than re-deriving the key inline - the old inline version had no
 * guard for a missing AUTH_SECRET, so `encode(undefined)` would have
 * silently become a valid (if weak) signing key instead of failing closed.
 */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecretKey());
      const { pathname } = request.nextUrl;
      const superAdminOnly = SUPER_ADMIN_ONLY_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      );
      if (superAdminOnly && payload.role !== "SUPER_ADMIN") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      return NextResponse.next();
    } catch {
      // fall through to redirect
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/form-summary/:path*",
    "/forms/:path*",
    "/masters/:path*",
    "/role-management/:path*",
    "/user-management/:path*",
    "/module-images/:path*",
    "/targets/:path*",
    "/log-history/:path*",
    "/notifications/:path*",
    "/reports/:path*",
  ],
};
