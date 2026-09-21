import { describe, expect, it } from "vitest";
import { isNumericLabel } from "@/lib/numeric-field";
import { formLeaves } from "./helpers/nav";
import { loadSchemaFields, NUMERIC_DB_TYPES } from "./helpers/schema";
import { leafModelFor } from "@/lib/form-summary-data";

describe("isNumericLabel", () => {
  it.each([
    "Area (ha)",
    "No. of Farmers",
    "Number of Beneficiaries",
    "Gross Income",
    "Max. Temperature (°C)",
    "Amount (Rs.)",
    "Yield (q/ha)",
  ])("reads %s as a number", (label) => expect(isNumericLabel(label)).toBe(true));

  it.each(["Name of the Farmer", "Registration No.", "Mobile No.", "Crop Name", "Remarks", "Season", "Title of the Training Programme"])(
    "reads %s as text",
    (label) => expect(isNumericLabel(label)).toBe(false),
  );

  it("lets an identifier word win over a numeric one", () => {
    expect(isNumericLabel("Account Number")).toBe(false);
  });
});

/**
 * Whether an Add/Edit field is a number box or a text box is inferred from its
 * label (lib/numeric-field.ts), not from the database column it saves to, so
 * the two can disagree: a numeric column shown as free text quietly stores
 * stray letters as 0, and a text column shown as a number box cannot be typed
 * into ("5 villages" is mangled to "5e"). `numeric: true | false` on a column
 * overrides the guess. Every generic form must agree with its column type.
 */
const schema = loadSchemaFields();

/** Leaves that render through a hand-built form; their columns only drive the list, so the generic-form heuristic does not apply. */
const CUSTOM_FORM_LEAVES = new Set([
  "about-kvk/land-infrastructure/land-details",
  "about-kvk/employee/staff-retired",
  "projects/cfld/technical-parameter",
  "performance/infrastructure-performance/staff-quarters-performance",
]);

function mismatches() {
  const found: string[] = [];
  const deliberate: string[] = [];
  for (const { path, leaf } of formLeaves) {
    if (CUSTOM_FORM_LEAVES.has(path)) continue;
    const fields = schema.get(leafModelFor(path) ?? "");
    if (!fields) continue;
    for (const column of leaf.columns) {
      if (column.readonly || column.formOnly || column.fieldKind || column.staticOptions || column.sourceMaster || column.fileKind) continue;
      const dbType = fields.get(column.key);
      if (!dbType) continue;
      const inForm = column.numeric ?? isNumericLabel(column.label, column.formLabel);
      if (NUMERIC_DB_TYPES.has(dbType) === inForm) continue;
      const entry = `${path}:${column.key} (${dbType} column, ${inForm ? "number" : "text"} box)`;
      (column.numeric === undefined ? found : deliberate).push(entry);
    }
  }
  return { found, deliberate };
}

describe("form input type vs database column type", () => {
  it("has no generic form whose input type disagrees with its column", () => {
    expect(mismatches().found).toEqual([]);
  });

  it("lists every override that knowingly disagrees with the column type", () => {
    // NICRA Details "Area/Unit" is forced to a text box, but its column is Decimal, so text such as "2 ha" fails on save.
    // Left as the client specified it; resolve with the client, then remove this line.
    expect(mismatches().deliberate).toEqual(["projects/nicra/details:areaOrUnit (Decimal column, text box)"]);
  });
});
