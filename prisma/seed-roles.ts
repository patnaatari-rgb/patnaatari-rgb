/**
 * Seeds the 9 real system roles and their default permissions from the
 * client's "Roles based access system 1.0" spec (hierarchy, scope, and the
 * Action Control table), then backfills every existing User's roleId - they
 * predate Role Management and were created against the old fixed 3-value
 * role enum directly.
 *
 * System roles are zone-independent (zoneId: null) - every zone shares the
 * same 9 base roles, matching how a Super Admin's "Add Role" only ever adds
 * to their own zone on top of these.
 */
import { config } from "dotenv";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import type { AuthLevel, PermissionType, RoleScope } from "../lib/generated/prisma/enums";

config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type SystemRoleSeed = {
  slug: string;
  name: string;
  hierarchyLevel: number;
  scope: RoleScope;
  authLevel: AuthLevel;
  description: string;
  permissions: PermissionType[];
};

const VIEW_ONLY: PermissionType[] = ["VIEW"];
const ALL_PERMISSIONS: PermissionType[] = [
  "VIEW",
  "ADD_CREATE",
  "EDIT",
  "DELETE",
  "APPROVE",
  "EXPORT",
  "MANAGE_USERS",
  "MANAGE_MASTERS",
  "MANAGE_FORMS",
  "MANAGE_PERMISSIONS",
];
/** KVK Admin's real Action Control row: View + Add/Edit/Delete KVK Users. */
const KVK_ADMIN_PERMISSIONS: PermissionType[] = ["VIEW", "ADD_CREATE", "EDIT", "DELETE", "MANAGE_USERS"];

/**
 * Every authLevel below SUPER_ADMIN/ORG_ADMIN/KVK_ADMIN/KVK_USER (the only 4
 * this app's authorization checks understand) defaults to KVK_USER - the
 * most restrictive, not a guess at broader access. State/District Admin/User
 * still have no built scoped view anywhere in this app (the spec defines
 * their data-visibility rules but no page implements a state/district-scoped
 * dashboard) - safe-by-default until that's built, rather than over-granting
 * real access no UI enforces yet. Org Admin/org_admin got its real
 * ORG_ADMIN authLevel + a scoped view 2026-09-24 (client request) - org_user
 * stays on the KVK_USER default, not asked for.
 */
const SYSTEM_ROLES: SystemRoleSeed[] = [
  {
    slug: "super_admin",
    name: "Super Admin",
    hierarchyLevel: 1,
    scope: "SYSTEM",
    authLevel: "SUPER_ADMIN",
    description: "Full system-wide access - all states, districts, organisations, KVKs and users.",
    permissions: ALL_PERMISSIONS,
  },
  {
    slug: "state_admin",
    name: "State Admin",
    hierarchyLevel: 2,
    scope: "STATE",
    authLevel: "KVK_USER",
    description: "Manages districts and users within their assigned State only.",
    permissions: VIEW_ONLY,
  },
  {
    slug: "district_admin",
    name: "District Admin",
    hierarchyLevel: 3,
    scope: "DISTRICT",
    authLevel: "KVK_USER",
    description: "Manages organisations/institutions within their assigned District only.",
    permissions: VIEW_ONLY,
  },
  {
    slug: "org_admin",
    name: "Org Admin",
    hierarchyLevel: 4,
    scope: "ORG",
    authLevel: "ORG_ADMIN",
    description: "Manages KVKs under their assigned Organisation/Institution only.",
    permissions: KVK_ADMIN_PERMISSIONS,
  },
  {
    slug: "kvk_admin",
    name: "KVK Admin",
    hierarchyLevel: 5,
    scope: "KVK",
    authLevel: "KVK_ADMIN",
    description: "Manages users and data belonging to their assigned KVK.",
    permissions: KVK_ADMIN_PERMISSIONS,
  },
  {
    slug: "kvk_user",
    name: "KVK User",
    hierarchyLevel: 6,
    scope: "KVK",
    authLevel: "KVK_USER",
    description: "Views/edits only the modules and data allowed through assigned permissions, within their KVK.",
    permissions: VIEW_ONLY,
  },
  {
    slug: "state_user",
    name: "State User",
    hierarchyLevel: 7,
    scope: "STATE",
    authLevel: "KVK_USER",
    description: "Assigned to a State Admin's State.",
    permissions: VIEW_ONLY,
  },
  {
    slug: "district_user",
    name: "District User",
    hierarchyLevel: 8,
    scope: "DISTRICT",
    authLevel: "KVK_USER",
    description: "Assigned to a District Admin's District.",
    permissions: VIEW_ONLY,
  },
  {
    slug: "org_user",
    name: "Org User",
    hierarchyLevel: 9,
    scope: "ORG",
    authLevel: "KVK_USER",
    description: "Assigned to an Org Admin's Organisation.",
    permissions: VIEW_ONLY,
  },
];

async function main() {
  const roleIdBySlug = new Map<string, string>();

  for (const seed of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({ where: { zoneId: null, slug: seed.slug } });
    const role = await prisma.role.upsert({
      where: { id: existing?.id ?? "__none__" },
      update: {
        name: seed.name,
        hierarchyLevel: seed.hierarchyLevel,
        scope: seed.scope,
        authLevel: seed.authLevel,
        description: seed.description,
        isSystemRole: true,
      },
      create: {
        slug: seed.slug,
        name: seed.name,
        hierarchyLevel: seed.hierarchyLevel,
        scope: seed.scope,
        authLevel: seed.authLevel,
        description: seed.description,
        isSystemRole: true,
        zoneId: null,
      },
    });
    roleIdBySlug.set(seed.slug, role.id);

    for (const type of seed.permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_type: { roleId: role.id, type } },
        update: {},
        create: { roleId: role.id, type },
      });
    }
    console.log(`Role ready: ${seed.name} (${role.id})`);
  }

  const superAdminRoleId = roleIdBySlug.get("super_admin")!;
  const kvkAdminRoleId = roleIdBySlug.get("kvk_admin")!;

  const superAdminBackfill = await prisma.user.updateMany({
    where: { role: "SUPER_ADMIN", roleId: null },
    data: { roleId: superAdminRoleId },
  });
  const kvkAdminBackfill = await prisma.user.updateMany({
    where: { role: "KVK_ADMIN", roleId: null },
    data: { roleId: kvkAdminRoleId },
  });
  console.log(`Backfilled roleId: ${superAdminBackfill.count} Super Admin, ${kvkAdminBackfill.count} KVK Admin user(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
