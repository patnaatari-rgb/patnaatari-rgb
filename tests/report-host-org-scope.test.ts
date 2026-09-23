import { describe, expect, it } from "vitest";
import { kvkOrZoneWhere } from "@/lib/report-data";

/**
 * Host Organisation reports (2026-09-24): `ReportScope.kvkId` was widened
 * in place to accept `{in: [...]}` (every KVK mapped to the org) alongside
 * its existing plain-string shape (one KVK), so the report engine's ~69
 * `scope.kvkId`-driven builders treat a Host Organisation exactly like a
 * KVK - same structural branch (KVK_TREE, single-KVK-style columns/labels),
 * just combined across several real KVK ids instead of one. This tests the
 * shared `kvkOrZoneWhere` chokepoint (used by every model without its own
 * flat `kvkId` column too - Vehicle/Equipment Status, Staff Transferred,
 * FLD Extension Training) for all three real sessions: Super Admin, KVK
 * Admin/User, Host Organisation.
 */
describe("kvkOrZoneWhere", () => {
  const zoneId = "zone-1";

  it("Super Admin (no kvkId): scoped to the whole zone", () => {
    expect(kvkOrZoneWhere("oft", { zoneId })).toEqual({ zoneId });
  });

  it("KVK Admin/User (single kvkId): unchanged flat-column models", () => {
    expect(kvkOrZoneWhere("oft", { kvkId: "kvk-1", zoneId })).toEqual({ kvkId: "kvk-1" });
  });

  it("Host Organisation ({in: [...]}): flat-column models", () => {
    expect(kvkOrZoneWhere("oft", { kvkId: { in: ["kvk-2", "kvk-3"] }, zoneId })).toEqual({
      kvkId: { in: ["kvk-2", "kvk-3"] },
    });
  });

  it.each([
    ["vehicleStatus", (kvkId: unknown) => ({ vehicle: { kvkId } })],
    ["equipmentStatus", (kvkId: unknown) => ({ equipment: { kvkId } })],
    ["staffTransfer", (kvkId: unknown) => ({ fromKvkId: kvkId })],
    ["fldExtensionTraining", (kvkId: unknown) => ({ fld: { kvkId } })],
  ] as const)("Host Organisation ({in: [...]}): relation-nested model %s", (model, expected) => {
    const kvkId = { in: ["kvk-2", "kvk-3"] };
    expect(kvkOrZoneWhere(model, { kvkId, zoneId })).toEqual(expected(kvkId));
    // Same override, unchanged for a single-KVK session - regression guard.
    expect(kvkOrZoneWhere(model, { kvkId: "kvk-1", zoneId })).toEqual(expected("kvk-1"));
  });
});
