import { describe, expect, it } from "vitest";
import { MODEL_FIELDS, MODEL_PERIOD_DATE_FIELDS, MODEL_PERIOD_YEAR_FIELD } from "@/lib/report-data";
import { loadSchemaFields } from "./helpers/schema";

/**
 * The report engine keeps hand-written per-model lists of column names. A typo
 * there does not fail loudly: the report just prints an empty column or skips
 * the period filter. These tests check every name against schema.prisma.
 */
const schema = loadSchemaFields();

/**
 * Keys that are not a Prisma model of their own but a named view of one table,
 * used only to give the period filter a date column to work on. "Staff
 * Retired" is the Staff table narrowed to rows with a dateOfRetirement, so its
 * columns are checked against `staff`.
 */
const TABLE_ALIASES: Record<string, string> = { staffRetired: "staff" };

function unknownEntries(map: Record<string, string | string[]>) {
  const problems: string[] = [];
  for (const [model, value] of Object.entries(map)) {
    const fields = schema.get(TABLE_ALIASES[model] ?? model);
    if (!fields) {
      problems.push(`${model}: not a Prisma model`);
      continue;
    }
    for (const field of Array.isArray(value) ? value : [value]) {
      if (!fields.has(field)) problems.push(`${model}.${field}: no such field`);
    }
  }
  return problems;
}

describe("report engine config vs prisma/schema.prisma", () => {
  it("MODEL_FIELDS lists only real models and fields", () => {
    expect(unknownEntries(MODEL_FIELDS)).toEqual([]);
  });

  it("MODEL_PERIOD_YEAR_FIELD points at real integer year columns", () => {
    expect(unknownEntries(MODEL_PERIOD_YEAR_FIELD)).toEqual([]);
    const notInt = Object.entries(MODEL_PERIOD_YEAR_FIELD).filter(([model, field]) => schema.get(model)?.get(field) !== "Int");
    expect(notInt).toEqual([]);
  });

  it("MODEL_PERIOD_DATE_FIELDS points at real DateTime columns", () => {
    expect(unknownEntries(MODEL_PERIOD_DATE_FIELDS)).toEqual([]);
    const notDate = Object.entries(MODEL_PERIOD_DATE_FIELDS).flatMap(([model, fields]) =>
      fields.filter((f) => schema.get(TABLE_ALIASES[model] ?? model)?.get(f) !== "DateTime").map((f) => `${model}.${f}`),
    );
    expect(notDate).toEqual([]);
  });
});
