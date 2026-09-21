/**
 * Single source of truth for the session-signing key, used by both
 * lib/auth.ts (route handlers, server components) and proxy.ts (request
 * gate) - kept in its own file with no other imports so the proxy
 * doesn't have to pull in Prisma/bcrypt just to read one env var.
 *
 * Throwing on a missing secret (rather than encoding `undefined` into a
 * weak literal key) matters here specifically because the proxy used to
 * inline this same check without the guard - a misconfigured deployment
 * missing AUTH_SECRET would have silently accepted any cookie signed with
 * the string "undefined" as a valid session instead of failing closed.
 */
export function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}
