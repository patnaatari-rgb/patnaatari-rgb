import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { AuthLevel, RoleScope } from "@/lib/generated/prisma/enums";
import { getSecretKey } from "@/lib/auth-secret";

const COOKIE_NAME = "ams_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12h - re-login daily, not a silent-forever session
/** "Remember me" at login: keep the session alive across browser restarts for 30 days instead of the 12h default. */
const REMEMBER_DURATION_SECONDS = 60 * 60 * 24 * 30;

/**
 * `role` stays the real enforcement level every existing check in this app
 * already branches on (unchanged since before Role Management existed).
 * The rest describe the human-facing Role a user is assigned and what it
 * scopes them to - see prisma/schema.prisma's Role model and "Roles based
 * access system 1.0" (client spec): a role with no scope narrower than its
 * `scope` type set here has no data outside it, checked at the API level on
 * every scoped query, not just hidden in the UI.
 */
export type SessionPayload = {
  sub: string;
  role: AuthLevel;
  roleId: string | null;
  roleSlug: string | null;
  roleScope: RoleScope | null;
  zoneId: string;
  kvkId: string | null;
  stateId: string | null;
  districtId: string | null;
  hostOrgId: string | null;
  /**
   * Carried in the token so /api/auth/me (SessionGate's on-mount identity
   * check) never has to hit the DB for it. Older cookies issued before this
   * field existed won't have it - /api/auth/me falls back to a lookup then.
   */
  kvkName?: string | null;
  /** Same convention as kvkName, for a Host Organisation (ORG_ADMIN) session. */
  hostOrgName?: string | null;
};

/**
 * Maps the DB's AuthLevel enum to the client session's role string -
 * lib/session.tsx's Session shape is kept as-is so no consumer needs to
 * change. Shared by the login route and /api/auth/me (previously two
 * separately-maintained copies that could silently drift apart).
 */
export function toClientRole(role: string) {
  if (role === "SUPER_ADMIN") return "super-admin";
  if (role === "ORG_ADMIN") return "host-org-admin";
  if (role === "KVK_ADMIN") return "kvk-admin";
  return "kvk-user";
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionCookie(payload: SessionPayload, remember = false) {
  const durationSeconds = remember ? REMEMBER_DURATION_SECONDS : SESSION_DURATION_SECONDS;
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${durationSeconds}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: durationSeconds,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Reads and verifies the session cookie. Returns null if missing/invalid/expired - callers decide what to do (redirect, 401, etc). */
export async function getSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Loads the full current user (with KVK name for the client session shape) or null if not authenticated. */
export async function getCurrentUser() {
  const payload = await getSessionPayload();
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { kvk: true },
  });
  return user;
}

export { COOKIE_NAME as SESSION_COOKIE_NAME };
