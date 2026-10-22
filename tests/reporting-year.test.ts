import { beforeEach, describe, expect, it } from "vitest";
import { LEAF_RECORD_REGISTRY, LEAF_UPDATE_REGISTRY } from "@/lib/leaf-record-registry";
import { calls, resetCalls } from "./helpers/prisma-recorder";
import { formLeaves } from "./helpers/nav";

const KVK_CTX = { kvkId: "kvk-1", zoneId: "zone-1" };

/** Leaves that had no year or date column at all, so their year filter and year-wise report scoping never worked. */
const YEAR_LEAVES = [
  "performance/district-village-performance/district-crop-productivity",
  "performance/district-village-performance/district-monthly-weather",
  "performance/district-village-performance/district-livestock-production",
  "performance/infrastructure-performance/rain-water-harvesting",
  "projects/cfld/budget-utilization",
  "projects/cfld/crop-wise-images",
  "projects/nicra/details",
  "projects/nicra/others/custom-hiring-farm-implement",
  "projects/natural-farming/nf-demonstration",
  "projects/natural-farming/nf-soil-data",
  "projects/natural-farming/nf-budget-expenditure",
  "projects/tsp-scsp/view-sub-plan-activity",
  "projects/nari/nari-nutrition-garden",
  "projects/nari/nari-bio-fortified",
  "projects/nari/nari-value-addition",
  "projects/nari/nari-training",
  "projects/nari/nari-extension",
  "projects/fpo-cbbo/fpo-cbbo-details",
  "projects/drmr/drmr-details",
  "projects/cra/cra-details",
  "projects/seed-hub/seed-hub-program",
];

/** Crop-wise Images insists on an image before anything else; unrelated to the year, so every case supplies one. */
const FILLER = { image: "https://example.test/image.png" };

const BAD_YEARS = ["", "   ", "20", "202", "20261", "2026abc", "99999999999", "1899", "2101", "-2026", "20.26"];

beforeEach(resetCalls);

/** The route awaits a handler inside try/catch, so a synchronous throw and a rejected promise are handled the same; this lets the tests treat both alike. */
const attempt = async (fn: () => unknown) => fn();

function lastWrite() {
  const write = [...calls].reverse().find((c) => ["create", "update", "updateMany"].includes(c.method));
  if (!write) throw new Error("no write recorded");
  return write.args.data as Record<string, unknown>;
}

describe.each(YEAR_LEAVES)("%s", (path) => {
  it("asks for a required Reporting Year in the form", () => {
    const leaf = formLeaves.find((l) => l.path === path)?.leaf;
    const column = leaf?.columns.find((c) => c.key === "reportingYear");
    expect(column?.required).toBe(true);
  });

  it("stores the year as a number on create and on update", async () => {
    await LEAF_RECORD_REGISTRY[path]({ ...FILLER, reportingYear: "2026" }, KVK_CTX);
    expect(lastWrite().reportingYear).toBe(2026);
    await LEAF_UPDATE_REGISTRY[path]("rec-1", { ...FILLER, reportingYear: " 2025 " }, KVK_CTX);
    expect(lastWrite().reportingYear).toBe(2025);
  });

  it.each(BAD_YEARS)("rejects Reporting Year %j without writing anything", async (year) => {
    resetCalls();
    await expect(attempt(() => LEAF_RECORD_REGISTRY[path]({ ...FILLER, reportingYear: year }, KVK_CTX))).rejects.toThrow(/Reporting Year/);
    await expect(attempt(() => LEAF_UPDATE_REGISTRY[path]("rec-1", { ...FILLER, reportingYear: year }, KVK_CTX))).rejects.toThrow(/Reporting Year/);
    expect(calls.some((c) => ["create", "update", "updateMany"].includes(c.method))).toBe(false);
  });

  it("rejects a missing Reporting Year", async () => {
    await expect(attempt(() => LEAF_RECORD_REGISTRY[path]({ ...FILLER }, KVK_CTX))).rejects.toThrow(/Reporting Year/);
  });
});
