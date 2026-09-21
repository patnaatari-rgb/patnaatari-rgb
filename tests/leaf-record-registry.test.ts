import { beforeEach, describe, expect, it } from "vitest";
import { DEMOGRAPHIC_KEYS } from "@/lib/navigation";
import { LEAF_DELETE_REGISTRY, LEAF_RECORD_REGISTRY, LEAF_UPDATE_REGISTRY } from "@/lib/leaf-record-registry";
import { calls, resetCalls, simulateForeignRecords } from "./helpers/prisma-recorder";
import { formLeaves } from "./helpers/nav";

const KVK_CTX = { kvkId: "kvk-1", zoneId: "zone-1" };
const ADMIN_CTX = { kvkId: null, zoneId: "zone-1" };

beforeEach(resetCalls);

/** 3+4+5+5+3+5+3+3 = 31 */
const GRID = Object.fromEntries(DEMOGRAPHIC_KEYS.map((key, i) => [key, String([3, 4, 5, 5, 3, 5, 3, 3][i])]));
const GRID_TOTAL = 31;

const autoTotals = formLeaves.flatMap(({ path, leaf }) =>
  leaf.columns.filter((c) => c.fieldKind === "calculated" && c.sumOf?.join() === DEMOGRAPHIC_KEYS.join()).map((column) => ({ path, key: column.key })),
);

function lastWrite() {
  const write = [...calls].reverse().find((c) => ["create", "update", "updateMany"].includes(c.method));
  if (!write) throw new Error("no write recorded");
  return write.args.data as Record<string, unknown>;
}

describe("counts auto-filled from the beneficiary grid", () => {
  it("covers every leaf that declares one", () => {
    expect(autoTotals.length).toBe(11);
  });

  describe.each(autoTotals)("$path ($key)", ({ path, key }) => {
    it("stores the grid total on create, ignoring whatever total the browser sent", async () => {
      await LEAF_RECORD_REGISTRY[path]({ ...GRID, [key]: "999" }, KVK_CTX);
      expect(lastWrite()[key]).toBe(GRID_TOTAL);
    });

    it("re-derives the grid total on update", async () => {
      await LEAF_UPDATE_REGISTRY[path]("rec-1", { ...GRID, stFemale: "10", [key]: "1" }, KVK_CTX);
      expect(lastWrite()[key]).toBe(GRID_TOTAL + 7);
    });
  });
});

const WRITE_METHODS = new Set(["create", "createMany", "update", "updateMany", "delete", "deleteMany"]);

function mentions(value: unknown, needle: string) {
  return JSON.stringify(value ?? null).includes(needle);
}

/** Runs a handler; a handler that rejects bad input by throwing has written nothing, which is fine here. */
async function run(fn: () => Promise<unknown> | unknown) {
  try {
    await fn();
  } catch {
    // validation errors are irrelevant to scoping
  }
}

/**
 * Security property: a KVK must never be able to change another KVK's data by
 * sending that record's id (a KVK Admin is limited to their own KVK, a Super
 * Admin to their own zone). The "foreign record" simulation makes every scoped
 * lookup come back empty, exactly as it would for someone else's id, and then
 * checks that nothing else was written - no child rows, no images - and that
 * any write attempted carried the caller's scope.
 */
describe("a record the caller does not own is left untouched", () => {
  const FILLER = { image: "https://example.test/image.png" };

  function assertOnlyScopedWrites(scopeValue: string) {
    const writes = calls.filter((c) => WRITE_METHODS.has(c.method));
    for (const w of writes) {
      const scoped = ["update", "updateMany", "delete", "deleteMany"].includes(w.method) && mentions(w.args?.where, scopeValue);
      expect(scoped, `${w.model}.${w.method} wrote without the caller's scope (${scopeValue})`).toBe(true);
    }
  }

  describe.each([
    ["KVK Admin", KVK_CTX, "kvk-1"],
    ["Super Admin", ADMIN_CTX, "zone-1"],
  ] as const)("as a %s", (_who, ctx, scopeValue) => {
    it.each(Object.keys(LEAF_DELETE_REGISTRY))("delete %s", async (path) => {
      simulateForeignRecords();
      await run(() => LEAF_DELETE_REGISTRY[path]("someone-elses-id", ctx));
      assertOnlyScopedWrites(scopeValue);
    });

    it.each(Object.keys(LEAF_UPDATE_REGISTRY))("update %s", async (path) => {
      simulateForeignRecords();
      await run(() => LEAF_UPDATE_REGISTRY[path]("someone-elses-id", FILLER, ctx));
      assertOnlyScopedWrites(scopeValue);
    });
  });
});

describe("deleting a record the caller owns", () => {
  it.each(["achievements/oft", "achievements/front-line-demonstration/view-fld", "achievements/trainings", "achievements/extension/extension-activities"])(
    "%s removes the record and its Module Images together",
    async (path) => {
      const result = await LEAF_DELETE_REGISTRY[path]("rec-1", KVK_CTX);
      expect(result).toEqual({ id: "test-id", count: 1 });
      const models = calls.filter((c) => c.method === "deleteMany").map((c) => c.model);
      expect(models).toContain("moduleImage");
      expect(models.length).toBe(2);
      expect(calls.find((c) => c.model === "moduleImage")!.args.where).toEqual({ formRecordId: "rec-1" });
    },
  );
});

describe("Project Team leaves", () => {
  const teamPaths = formLeaves.map((l) => l.path).filter((p) => p.endsWith("-team"));

  it("finds all eleven", () => {
    expect(teamPaths.length).toBe(11);
  });

  it.each(teamPaths)("%s saves the role and name it was given, against the caller's KVK", async (path) => {
    await LEAF_RECORD_REGISTRY[path]({ startDate: "2026-09-01", endDate: "2026-09-30", projectTeam: "Co-PI", name: "A. Person" }, KVK_CTX);
    const data = lastWrite();
    expect(data).toMatchObject({ projectTeam: "Co-PI", name: "A. Person", kvkId: "kvk-1", zoneId: "zone-1" });
  });
});
