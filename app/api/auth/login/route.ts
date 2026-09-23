import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSessionCookie, toClientRole } from "@/lib/auth";
import { getClientIp } from "@/lib/api-auth";
import { isLoginRateLimited, recordFailedLogin, clearLoginAttempts } from "@/lib/login-rate-limit";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const remember = body?.remember === true;

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 },
    );
  }

  const ip = getClientIp(request);

  if (isLoginRateLimited(username, ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { kvk: true, assignedRole: true, hostOrg: true },
  });

  // Same generic error whether the username doesn't exist or the password is
  // wrong - never leak which one it was.
  const invalid = () => {
    recordFailedLogin(username, ip);
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  };

  if (!user) return invalid();

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return invalid();

  clearLoginAttempts(username, ip);

  await createSessionCookie(
    {
      sub: user.id,
      role: user.role,
      roleId: user.roleId,
      roleSlug: user.assignedRole?.slug ?? null,
      roleScope: user.assignedRole?.scope ?? null,
      zoneId: user.zoneId,
      kvkId: user.kvkId,
      stateId: user.stateId,
      districtId: user.districtId,
      hostOrgId: user.hostOrgId,
      kvkName: user.kvk?.name ?? null,
      hostOrgName: user.hostOrg?.name ?? null,
    },
    remember,
  );

  // Fire-and-forget: a slow/failed audit write must never block or fail a real login.
  prisma.loginActivity
    .create({
      data: {
        userId: user.id,
        username: user.username,
        roleId: user.roleId,
        kvkId: user.kvkId,
        kvkName: user.kvk?.name,
        zoneId: user.zoneId,
        ipAddress: getClientIp(request),
      },
    })
    .catch(() => {});

  return NextResponse.json({
    role: toClientRole(user.role),
    kvkName: user.kvk?.name,
    hostOrgName: user.hostOrg?.name,
  });
}
