import { describe, expect, it } from "vitest";
import { DEMOGRAPHIC_KEYS } from "@/lib/navigation";
import { formLeaves, masterLeaves } from "./helpers/nav";

const allLeaves = [...formLeaves, ...masterLeaves];

describe("navigation tree", () => {
  it("has unique paths within Form Management and within All Masters", () => {
    for (const leaves of [formLeaves, masterLeaves]) {
      const paths = leaves.map((l) => l.path);
      expect(paths.filter((p, i) => paths.indexOf(p) !== i)).toEqual([]);
    }
  });

  it("never repeats a column key inside one leaf", () => {
    const offenders = allLeaves
      .map(({ path, leaf }) => {
        const keys = leaf.columns.map((c) => c.key);
        return { path, dup: keys.filter((k, i) => keys.indexOf(k) !== i) };
      })
      .filter((x) => x.dup.length > 0);
    expect(offenders).toEqual([]);
  });

  it("gives every dropdown at least one option, with no duplicates", () => {
    const offenders = allLeaves.flatMap(({ path, leaf }) =>
      leaf.columns
        .filter((c) => c.staticOptions)
        .filter((c) => c.staticOptions!.length === 0 || new Set(c.staticOptions).size !== c.staticOptions!.length)
        .map((c) => `${path}:${c.key}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("calculated fields", () => {
  const calculated = allLeaves.flatMap(({ path, leaf }) =>
    leaf.columns.filter((c) => c.fieldKind === "calculated").map((column) => ({ path, leaf, column })),
  );

  it("are read-only, so required-field validation never blocks a save on them", () => {
    expect(calculated.filter(({ column }) => !column.readonly).map(({ path, column }) => `${path}:${column.key}`)).toEqual([]);
  });

  it("only reference source fields that exist on the same form", () => {
    const missing: string[] = [];
    for (const { path, leaf, column } of calculated) {
      const keys = new Set(leaf.columns.map((c) => c.key));
      const demographicBlock = leaf.columns.some((c) => c.fieldKind === "demographic-breakdown" && !c.demographicPrefix && !c.demographicKeyOverrides);
      const sources = [...(column.sumOf ?? []), ...(column.diffOf?.flat() ?? []), ...(column.ratioOf ?? [])];
      for (const source of sources) {
        const isDemographicKey = (DEMOGRAPHIC_KEYS as readonly string[]).includes(source);
        if (!(keys.has(source) || (isDemographicKey && demographicBlock))) missing.push(`${path}:${column.key} -> ${source}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("marks every leaf that auto-fills a count from the beneficiary grid with an unprefixed grid to read from", () => {
    const autoTotals = calculated.filter(({ column }) => column.sumOf?.join() === DEMOGRAPHIC_KEYS.join());
    expect(autoTotals.length).toBeGreaterThan(0);
    for (const { path, leaf } of autoTotals) {
      const grid = leaf.columns.find((c) => c.fieldKind === "demographic-breakdown");
      expect(grid, path).toBeDefined();
      expect(grid!.demographicPrefix, path).toBeUndefined();
      expect(grid!.demographicKeyOverrides, path).toBeUndefined();
    }
  });
});

describe("Project Team leaves", () => {
  const projects = formLeaves.filter((l) => l.path.startsWith("projects/"));
  const groups = [...new Set(projects.map((l) => l.path.split("/")[1]))];
  const isTeam = (path: string) => path.endsWith("-team") || path.endsWith("/pi-co-pi-list");

  it("exist in every Project section except Other Programmes", () => {
    const without = groups.filter((g) => !projects.some((l) => l.path.startsWith(`projects/${g}/`) && isTeam(l.path)));
    expect(without).toEqual(["other-programmes"]);
  });

  it("offer the same role choices everywhere (NICRA takes its roles from a master list instead)", () => {
    const roles = projects
      .filter((l) => isTeam(l.path) && !l.path.endsWith("/pi-co-pi-list"))
      .map((l) => ({ path: l.path, options: l.leaf.columns.find((c) => c.key === "projectTeam")?.staticOptions }));
    expect(roles.length).toBe(groups.length - 2); // every section except NICRA and Other Programmes
    for (const { path, options } of roles) expect(options, path).toEqual(["PI", "Co-PI", "Nodal Officer", "Associate Member"]);
  });
});

describe("free-text avoidance", () => {
  const columns = formLeaves.flatMap(({ path, leaf }) => leaf.columns.map((column) => ({ path, column })));

  it("gives every Month field a dropdown", () => {
    const offenders = columns.filter(({ column }) => /^months?$/i.test(column.key) && !column.staticOptions).map(({ path, column }) => `${path}:${column.key}`);
    expect(offenders).toEqual([]);
  });

  it("gives every Season field a dropdown fed by the Season master", () => {
    const offenders = columns
      .filter(({ column }) => /^season(name)?$/i.test(column.key) && column.sourceMaster?.master !== "season")
      .map(({ path, column }) => `${path}:${column.key}`);
    expect(offenders).toEqual([]);
  });
});

describe("label hygiene", () => {
  const labels = allLeaves.flatMap(({ path, leaf }) => leaf.columns.flatMap((c) => [c.label, c.formLabel].filter(Boolean).map((label) => ({ path, key: c.key, label: label as string }))));

  it.each([
    ["a split compound word (Rain Fall)", /\brain fall\b/i],
    ["a split compound word (Short Fall)", /\bshort fall\b/i],
    ["a zero standing in for the degree sign ((0C))", /\(0C\)/],
  ])("has no label with %s", (_name, pattern) => {
    expect(labels.filter((l) => pattern.test(l.label)).map((l) => `${l.path}:${l.key} "${l.label}"`)).toEqual([]);
  });
});
