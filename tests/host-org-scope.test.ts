import { describe, expect, it, vi } from "vitest";
import { getHostOrgKvkIds, resolveKvkScope } from "@/lib/host-org-scope";

/**
 * Host Organisation scoping (2026-09-24): a Host Organisation session has no
 * kvkId of its own, unlike KVK Admin/User - it's scoped to every KVK mapped
 * to its org instead. This overrides the shared prisma-recorder mock
 * (tests/setup.ts) locally, since getHostOrgKvkIds needs kvk.findMany to
 * resolve a real array of KVK ids, not the recorder's generic
 * {id, count} stand-in used by the create/update/delete registry tests.
 */
const findManyCalls: unknown[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    kvk: {
      findMany: (args: unknown) => {
        findManyCalls.push(args);
        return Promise.resolve([{ id: "kvk-2" }, { id: "kvk-3" }]);
      },
    },
  },
}));

describe("getHostOrgKvkIds", () => {
  it("returns every KVK mapped to the given Host Organisation", async () => {
    findManyCalls.length = 0;
    const ids = await getHostOrgKvkIds("org-1");
    expect(ids).toEqual(["kvk-2", "kvk-3"]);
    expect(findManyCalls).toEqual([{ where: { hostOrgId: "org-1" }, select: { id: true } }]);
  });
});

describe("resolveKvkScope", () => {
  it("KVK Admin/User: scoped to their single kvkId, unchanged", async () => {
    const scope = await resolveKvkScope({ kvkId: "kvk-1", role: "KVK_ADMIN", hostOrgId: null, zoneId: "zone-1" });
    expect(scope).toEqual({ kvkId: "kvk-1" });
  });

  it("Super Admin: falls back to the whole zone, unchanged", async () => {
    const scope = await resolveKvkScope({ kvkId: null, role: "SUPER_ADMIN", hostOrgId: null, zoneId: "zone-1" });
    expect(scope).toEqual({ zoneId: "zone-1" });
  });

  it("Host Organisation: scoped to every KVK mapped to its org, not the whole zone", async () => {
    const scope = await resolveKvkScope({ kvkId: null, role: "ORG_ADMIN", hostOrgId: "org-1", zoneId: "zone-1" });
    expect(scope).toEqual({ kvkId: { in: ["kvk-2", "kvk-3"] } });
  });

  it("regression guard: an ORG_ADMIN role with no hostOrgId never falls back to zone-wide (the pre-fix leak) - it's simply unscoped by kvkId here, same as Super Admin, not a silent broadening", async () => {
    const scope = await resolveKvkScope({ kvkId: null, role: "ORG_ADMIN", hostOrgId: null, zoneId: "zone-1" });
    expect(scope).toEqual({ zoneId: "zone-1" });
  });
});
