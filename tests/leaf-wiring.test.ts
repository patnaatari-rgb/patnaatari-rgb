import { describe, expect, it } from "vitest";
import { LEAF_DELETE_REGISTRY, LEAF_RECORD_REGISTRY, LEAF_UPDATE_REGISTRY } from "@/lib/leaf-record-registry";
import { leafModelFor } from "@/lib/form-summary-data";
import { REPORT_SUBSECTION_BY_LEAF } from "@/lib/report-section-map";
import { formLeaves } from "./helpers/nav";
import { loadSchemaFields } from "./helpers/schema";

/**
 * Every Form Management leaf that saves rows has to be wired in five separate
 * places (create / update / delete registries, the Form Summary model map, the
 * per-form report map). Nothing forces them to stay in step, and they have
 * drifted before, so this pins them together.
 *
 * KNOWN_GAPS documents leaves that are missing from a map today. It is a
 * ratchet: a leaf that is fixed must be removed from the list (the "stale"
 * test fails otherwise), and a new gap can never slip in unlisted.
 */
const KNOWN_GAPS = {
  reportMap: [
    "achievements/soil-water/soil-testing-equipment",
    "performance/district-village-performance/district-monthly-weather",
    "miscellaneous/nyk-training",
  ],
} as const;

const dbBacked = formLeaves.filter(({ path }) => LEAF_RECORD_REGISTRY[path]);

describe("Form Management leaf wiring", () => {
  it("covers a realistic number of leaves (guards against the maps silently emptying)", () => {
    expect(dbBacked.length).toBeGreaterThan(100);
  });

  it("has no registry entry without a matching navigation leaf", () => {
    const paths = new Set(formLeaves.map((l) => l.path));
    for (const registry of [LEAF_RECORD_REGISTRY, LEAF_UPDATE_REGISTRY, LEAF_DELETE_REGISTRY]) {
      expect(Object.keys(registry).filter((p) => !paths.has(p))).toEqual([]);
    }
  });

  it("gives every saveable leaf update and delete handlers", () => {
    expect(dbBacked.filter(({ path }) => !LEAF_UPDATE_REGISTRY[path]).map((l) => l.path)).toEqual([]);
    expect(dbBacked.filter(({ path }) => !LEAF_DELETE_REGISTRY[path]).map((l) => l.path)).toEqual([]);
  });

  it("counts every saveable leaf in Form Summary", () => {
    expect(dbBacked.filter(({ path }) => !leafModelFor(path)).map((l) => l.path)).toEqual([]);
  });

  it("maps every saveable leaf to a report subsection (except the documented gaps)", () => {
    const missing = dbBacked.filter(({ path }) => !REPORT_SUBSECTION_BY_LEAF[path]).map((l) => l.path);
    expect(missing).toEqual([...KNOWN_GAPS.reportMap]);
  });
});

describe("Form Summary model map", () => {
  const schema = loadSchemaFields();

  it("only names Prisma models that exist", () => {
    const unknown = dbBacked
      .map(({ path }) => ({ path, model: leafModelFor(path) }))
      .filter(({ model }) => model && !schema.has(model))
      .map(({ path, model }) => `${path} -> ${model}`);
    expect(unknown).toEqual([]);
  });

  it("gives each model exactly one leaf, apart from the two kinds that share a table", () => {
    const byModel = new Map<string, string[]>();
    for (const { path } of dbBacked) {
      const model = leafModelFor(path);
      if (model) byModel.set(model, [...(byModel.get(model) ?? []), path]);
    }
    const shared = [...byModel.entries()].filter(([, paths]) => paths.length > 1).map(([model]) => model);
    // Sewa and Pakhwada are two views of the same SwachhtaObservance table (told apart by `kind`).
    expect(shared.sort()).toEqual(["swachhtaObservance"]);
  });
});
