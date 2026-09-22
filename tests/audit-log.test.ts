import { beforeEach, describe, expect, it } from "vitest";
import { logDataChange } from "@/lib/audit-log";
import { FORM_MANAGEMENT, ALL_MASTERS, flattenLeafPaths } from "@/lib/navigation";
import { formLeaves, masterLeaves } from "./helpers/nav";
import { calls, resetCalls } from "./helpers/prisma-recorder";

/**
 * path -> "<group> - <leaf>", built the same way lib/audit-log.ts builds
 * its own lookup - used to check logDataChange resolves the real label, not
 * a hardcoded guess at its text. Masters are keyed by bare slug because
 * that is genuinely what the Masters screen sends as `path` (see
 * lib/audit-log.ts's own comment on LABEL_BY_PATH for why) - this is not a
 * simplification for the test, it is what production sends.
 */
const EXPECTED_LABEL = new Map<string, string>([
  ...flattenLeafPaths(FORM_MANAGEMENT).map((l): [string, string] => [l.path, `${l.groupLabel} - ${l.label}`]),
  ...flattenLeafPaths(ALL_MASTERS).map((l): [string, string] => [l.path.split("/").pop()!, `${l.groupLabel} - ${l.label}`]),
]);

/** Masters real paths, bare-slug real paths, and Form Management full paths, for the wiring checks below. */
const mastersFullPaths = flattenLeafPaths(ALL_MASTERS).map((l) => l.path);
const mastersBareSlugs = mastersFullPaths.map((p) => p.split("/").pop()!);

const SESSION = {
  sub: "user-1",
  role: "KVK_ADMIN",
  roleId: "role-1",
  roleSlug: "kvk-admin",
  roleScope: null,
  zoneId: "zone-1",
  kvkId: "kvk-1",
  stateId: null,
  districtId: null,
  hostOrgId: null,
  kvkName: "KVK Test",
} as const;

/** logDataChange is fire-and-forget (never awaited by its callers - an audit write must never block or fail the real save), so a test has to let its microtasks run before checking what it wrote. */
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(resetCalls);

describe("logDataChange", () => {
  it("looks up the username, then writes one DataChangeLog row carrying the caller's scope", async () => {
    logDataChange({ session: SESSION, action: "CREATE", formPath: "projects/nicra/details", recordId: "rec-1", values: { cropName: "Wheat" } });
    await flush();

    expect(calls.map((c) => `${c.model}.${c.method}`)).toEqual(["user.findUnique", "dataChangeLog.create"]);
    const write = calls[1].args.data;
    expect(write).toMatchObject({
      userId: "user-1",
      roleId: "role-1",
      kvkId: "kvk-1",
      kvkName: "KVK Test",
      zoneId: "zone-1",
      action: "CREATE",
      formPath: "projects/nicra/details",
      recordId: "rec-1",
      values: { cropName: "Wheat" },
    });
    expect(typeof write.username).toBe("string");
  });

  it("never throws when the write itself fails (the real save must never depend on this)", async () => {
    expect(() => logDataChange({ session: SESSION, action: "DELETE", formPath: "achievements/oft", recordId: "rec-2" })).not.toThrow();
    await flush();
  });

  it("omits values for a DELETE (nothing meaningful was submitted)", async () => {
    logDataChange({ session: SESSION, action: "DELETE", formPath: "achievements/oft", recordId: "rec-2" });
    await flush();
    expect(calls[1].args.data.values).toBeUndefined();
  });

  it("strips the :action suffix (mark-completed, transfer) before looking up the form's label", async () => {
    logDataChange({ session: SESSION, action: "UPDATE", formPath: "achievements/oft:transfer", recordId: "rec-3", values: { toReportingYear: 2027 } });
    await flush();
    const write = calls[1].args.data;
    expect(write.formPath).toBe("achievements/oft:transfer");
    expect(write.formLabel).toBe(EXPECTED_LABEL.get("achievements/oft"));
  });

  it("resolves the real form label for a Form Management leaf logged by its full path", async () => {
    // Spot-check a handful rather than all ~250, to keep this fast.
    for (const { path } of formLeaves.slice(0, 5)) {
      resetCalls();
      logDataChange({ session: SESSION, action: "CREATE", formPath: path, recordId: "r" });
      await flush();
      expect(calls[1]?.args.data.formLabel, path).toBe(EXPECTED_LABEL.get(path));
    }
  });

  it("resolves the real form label for a Masters leaf logged by its bare slug (what the Masters screen actually sends)", async () => {
    for (const { leaf } of masterLeaves.slice(0, 5)) {
      resetCalls();
      logDataChange({ session: SESSION, action: "CREATE", formPath: leaf.slug, recordId: "r" });
      await flush();
      expect(calls[1]?.args.data.formLabel, leaf.slug).toBe(EXPECTED_LABEL.get(leaf.slug));
    }
  });

  it("would NOT resolve a Masters leaf logged by its full nested path (documents why bare slug matters - see lib/audit-log.ts)", async () => {
    const someMaster = mastersFullPaths.find((p) => p.includes("/"));
    expect(someMaster, "expected at least one nested Masters path").toBeDefined();
    logDataChange({ session: SESSION, action: "CREATE", formPath: someMaster!, recordId: "r" });
    await flush();
    expect(calls[1].args.data.formLabel).toBeNull();
  });

  it("falls back to the raw path when it has no matching leaf (never leaves formLabel silently wrong)", async () => {
    logDataChange({ session: SESSION, action: "CREATE", formPath: "not/a/real/leaf", recordId: "r" });
    await flush();
    expect(calls[1].args.data.formLabel).toBeNull();
  });
});

describe("Masters slugs stay safe to key by bare slug", () => {
  it("never lets two Masters leaves share a bare slug (the whole labelling scheme relies on this)", () => {
    const seen = new Map<string, string[]>();
    for (const path of mastersFullPaths) {
      const bare = path.split("/").pop()!;
      seen.set(bare, [...(seen.get(bare) ?? []), path]);
    }
    const collisions = [...seen.entries()].filter(([, paths]) => paths.length > 1);
    expect(collisions).toEqual([]);
  });

  it("never lets a Masters bare slug collide with a Form Management full path (the two trees share one label map)", () => {
    const formsFullPaths = new Set(flattenLeafPaths(FORM_MANAGEMENT).map((l) => l.path));
    const clashes = mastersBareSlugs.filter((slug) => formsFullPaths.has(slug));
    expect(clashes).toEqual([]);
  });
});
