import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requireSession } from "@/lib/api-auth";
import { CREATABLE_ROLE_SLUGS } from "@/lib/rbac-server";

/**
 * Real per-role scoped list, per the client's "Access & Data Visibility
 * Rule": each role sees only its own scope and the entities under it. Only
 * Super Admin/State/District/Org/KVK Admin ever look at this list (the
 * "User" siblings have no management UI of their own in the spec).
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  /** Server-side pagination + search - the list used to always return every user in scope (fine at a handful of accounts, a real problem once a zone has hundreds+), re-fetched in full on every 20s poll too. `page` is 0-based; `pageSize` capped so a crafted request can't force an unbounded fetch. */
  const page = Math.max(0, Number(url.searchParams.get("page") ?? "0") || 0);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? "10") || 10));
  const search = (url.searchParams.get("search") ?? "").trim();

  const scopeWhere =
    auth.session.role === "SUPER_ADMIN"
      ? { zoneId: auth.session.zoneId }
      : auth.session.roleScope === "STATE" && auth.session.stateId
        ? { stateId: auth.session.stateId }
        : auth.session.roleScope === "DISTRICT" && auth.session.districtId
          ? { districtId: auth.session.districtId }
          : auth.session.roleScope === "ORG" && auth.session.hostOrgId
            ? { hostOrgId: auth.session.hostOrgId }
            : { kvkId: auth.session.kvkId ?? "__none__" };

  const where = search
    ? {
        ...scopeWhere,
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : scopeWhere;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { kvk: true, state: true, district: true, hostOrg: true, assignedRole: true },
      orderBy: { createdAt: "desc" },
      skip: page * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  const lastLogins = await prisma.loginActivity.groupBy({
    by: ["userId"],
    where: { userId: { in: users.map((u) => u.id) } },
    _max: { createdAt: true },
  });
  const lastLoginByUserId = new Map(lastLogins.map((l) => [l.userId, l._max.createdAt]));

  return NextResponse.json({
    total,
    users: users.map((u) => ({
      id: u.id,
      name: u.name ?? u.username,
      email: u.email ?? "",
      phone: u.phone ?? "",
      username: u.username,
      roleName: u.assignedRole?.name ?? u.role,
      roleSlug: u.assignedRole?.slug ?? "",
      stateName: u.state?.name ?? "",
      districtName: u.district?.name ?? "",
      hostOrgName: u.hostOrg?.name ?? "",
      kvkName: u.kvk?.name ?? "",
      createdAt: u.createdAt.toISOString(),
      lastLogin: lastLoginByUserId.get(u.id)?.toISOString() ?? null,
    })),
  });
}

/**
 * Create User - real hierarchical rule from the client spec ("An Admin can
 * create only the next permitted level below them"): Super Admin can create
 * any of the 9 roles; every other Admin can only create the roles listed
 * for them in CREATABLE_ROLE_SLUGS, and only within their own already-
 * assigned scope (a State Admin can't pick a different state's district).
 */
export async function POST(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const roleSlug = typeof body?.roleSlug === "string" ? body.roleSlug : "";
  const stateName = typeof body?.stateName === "string" ? body.stateName.trim() : "";
  const districtName = typeof body?.districtName === "string" ? body.districtName.trim() : "";
  const hostOrgName = typeof body?.hostOrgName === "string" ? body.hostOrgName.trim() : "";
  const kvkName = typeof body?.kvkName === "string" ? body.kvkName.trim() : "";

  if (!name || !username || !password || !roleSlug) {
    return NextResponse.json({ error: "Name, username, password and role are required." }, { status: 400 });
  }

  const isSuperAdmin = auth.session.role === "SUPER_ADMIN";
  const requesterSlug = auth.session.roleSlug ?? "";
  const allowedSlugs = isSuperAdmin ? null : (CREATABLE_ROLE_SLUGS[requesterSlug] ?? []);
  if (!isSuperAdmin && !allowedSlugs!.includes(roleSlug)) {
    return NextResponse.json({ error: "You are not permitted to create this role." }, { status: 403 });
  }

  const targetRole = await prisma.role.findFirst({
    where: { slug: roleSlug, OR: [{ zoneId: null }, { zoneId: auth.session.zoneId }] },
  });
  if (!targetRole) return NextResponse.json({ error: `Unknown role: ${roleSlug}` }, { status: 400 });

  // Resolve scope fields - a non-Super-Admin creator's own scope is inherited wherever the target role's scope matches theirs (creating their own paired User role, or a level they're already confined to); anything narrower needs a real selection, validated against their own scope.
  let stateId: string | null = null;
  let districtId: string | null = null;
  let hostOrgId: string | null = null;
  let kvkId: string | null = null;

  if (targetRole.scope === "STATE") {
    if (isSuperAdmin) {
      if (!stateName) return NextResponse.json({ error: "State is required." }, { status: 400 });
      const state = await prisma.state.findFirst({ where: { zoneId: auth.session.zoneId, name: stateName } });
      if (!state) return NextResponse.json({ error: `Unknown state: ${stateName}` }, { status: 400 });
      stateId = state.id;
    } else {
      stateId = auth.session.stateId;
    }
  } else if (targetRole.scope === "DISTRICT") {
    if (!auth.session.stateId && !isSuperAdmin) {
      return NextResponse.json({ error: "Your account has no assigned state." }, { status: 403 });
    }
    if (!districtName) return NextResponse.json({ error: "District is required." }, { status: 400 });
    const district = await prisma.district.findFirst({
      where: { name: districtName, ...(isSuperAdmin ? {} : { stateId: auth.session.stateId ?? undefined }) },
      include: { state: true },
    });
    if (!district) return NextResponse.json({ error: `Unknown district: ${districtName}` }, { status: 400 });
    districtId = district.id;
    stateId = district.stateId;
  } else if (targetRole.scope === "ORG") {
    if (!hostOrgName) return NextResponse.json({ error: "Organisation is required." }, { status: 400 });
    const hostOrg = await prisma.hostOrganization.findFirst({ where: { zoneId: auth.session.zoneId, name: hostOrgName } });
    if (!hostOrg) return NextResponse.json({ error: `Unknown organisation: ${hostOrgName}` }, { status: 400 });
    if (!isSuperAdmin && auth.session.districtId) {
      // District Admin's scope: only orgs with at least one KVK in their district (HostOrganization itself carries no district of its own - a real org can span several).
      const kvkInDistrict = await prisma.kvk.findFirst({ where: { hostOrgId: hostOrg.id, districtId: auth.session.districtId } });
      if (!kvkInDistrict) {
        return NextResponse.json({ error: "That organisation has no KVK in your assigned district." }, { status: 403 });
      }
    }
    hostOrgId = hostOrg.id;
    districtId = auth.session.districtId ?? null;
    stateId = auth.session.stateId ?? null;
  } else if (targetRole.scope === "KVK") {
    if (!kvkName) return NextResponse.json({ error: "KVK is required." }, { status: 400 });
    const kvk = await prisma.kvk.findFirst({
      where: { zoneId: auth.session.zoneId, name: kvkName, ...(isSuperAdmin ? {} : { hostOrgId: auth.session.hostOrgId ?? undefined }) },
    });
    if (!kvk) return NextResponse.json({ error: `Unknown KVK: ${kvkName}` }, { status: 400 });
    kvkId = kvk.id;
    hostOrgId = kvk.hostOrgId;
    districtId = kvk.districtId;
    stateId = kvk.stateId;
  }

  // KVK Admin creating a KVK User inherits the admin's own KVK directly - no picker needed, matches "KVK Admin should manage users belonging to that KVK."
  if (!isSuperAdmin && requesterSlug === "kvk_admin" && roleSlug === "kvk_user") {
    kvkId = auth.session.kvkId;
    hostOrgId = auth.session.hostOrgId;
    districtId = auth.session.districtId;
    stateId = auth.session.stateId;
  }

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) return NextResponse.json({ error: "That username is already taken." }, { status: 400 });
  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) return NextResponse.json({ error: "That email is already in use." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      name,
      username,
      email: email || null,
      phone: phone || null,
      passwordHash,
      role: targetRole.authLevel,
      roleId: targetRole.id,
      zoneId: auth.session.zoneId,
      stateId,
      districtId,
      hostOrgId,
      kvkId,
    },
  });

  return NextResponse.json({ ok: true, id: user.id }, { status: 201 });
}
