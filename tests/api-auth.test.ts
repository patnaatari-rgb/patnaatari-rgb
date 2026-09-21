import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiRoot = fileURLToPath(new URL("../app/api", import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

const routes = routeFiles(apiRoot).map((file) => ({
  name: relative(apiRoot, file).split(sep).join("/").slice(0, -"/route.ts".length),
  source: readFileSync(file, "utf8"),
}));

/**
 * Routes that are deliberately reachable without a session, and how each one
 * is protected instead. Adding a route here is a security decision: say why.
 */
const OPEN_BY_DESIGN: Record<string, string> = {
  "auth/login": "issues the session; throttled by lib/login-rate-limit.ts",
  "auth/logout": "only clears the caller's own cookie",
  "cron/auto-transfer-oft-fld": "Vercel Cron; checks the CRON_SECRET bearer token",
};

const authenticates = (source: string) => /\brequireSession\(|\bgetSessionPayload\(/.test(source);

describe("API routes", () => {
  it("finds the routes (guards against the scan silently matching nothing)", () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it("require a signed-in session unless they are listed as open by design", () => {
    const unauthenticated = routes.filter((r) => !authenticates(r.source) && !(r.name in OPEN_BY_DESIGN)).map((r) => r.name);
    expect(unauthenticated).toEqual([]);
  });

  it("do not list an open route that has since been removed or started authenticating", () => {
    const stale = Object.keys(OPEN_BY_DESIGN).filter((name) => {
      const route = routes.find((r) => r.name === name);
      return !route || authenticates(route.source);
    });
    expect(stale).toEqual([]);
  });

  it("keep login throttling and the cron token check in place", () => {
    expect(routes.find((r) => r.name === "auth/login")!.source).toContain("isLoginRateLimited");
    expect(routes.find((r) => r.name === "cron/auto-transfer-oft-fld")!.source).toContain("CRON_SECRET");
  });
});
