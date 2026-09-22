import "server-only";
import { prisma } from "@/lib/prisma";
import { FORM_MANAGEMENT, ALL_MASTERS, flattenLeafPaths, type NavLeafPath } from "@/lib/navigation";
import type { SessionPayload } from "@/lib/auth";
import type { DataChangeAction } from "@/lib/generated/prisma/enums";

/**
 * path -> "<group> - <leaf>", covering both Form Management and All
 * Masters, so a Masters write logs a real label too (leafCategoryLabel in
 * leaf-record-registry.ts only covers Form Management).
 *
 * The two trees are keyed differently because their own client screens send
 * different things as `path`: a Form Management leaf's Add/Edit form sends
 * its full nested path (`slug.join("/")` - forms/[...slug]/page.tsx), but a
 * Masters leaf sends only its own bare slug (`node.slug` -
 * masters/[...slug]/page.tsx; MASTER_CREATE_REGISTRY's own keys are bare
 * slugs too, the same shape). Keying Masters by full path here would look
 * right in a hand-written test yet never match a real request. Safe only
 * because every Masters slug is unique zone-wide, confirmed by the
 * `no two masters share a bare slug` test in tests/audit-log.test.ts.
 */
const LABEL_BY_PATH = new Map<string, string>([
  ...flattenLeafPaths(FORM_MANAGEMENT).map((l: NavLeafPath): [string, string] => [l.path, `${l.groupLabel} - ${l.label}`]),
  ...flattenLeafPaths(ALL_MASTERS).map((l: NavLeafPath): [string, string] => [l.path.split("/").pop()!, `${l.groupLabel} - ${l.label}`]),
]);

function labelFor(path: string): string | undefined {
  // "achievements/oft:transfer" (mark-completed/transfer) - look the leaf path up without the action suffix.
  return LABEL_BY_PATH.get(path.split(":")[0]);
}

/**
 * Records one row change for the audit trail (security review, 2026-09-22).
 * Fire-and-forget, same convention as the login-activity write in
 * /api/auth/login: an audit write must never block or fail the real save,
 * so callers never `await` this. Call after the real write has already
 * succeeded, from the 8 generic CRUD routes (leaf-record and master-record
 * create/update/delete) plus the two OFT/FLD actions that bypass those
 * registries (mark-completed, transfer - both logged as UPDATE with a
 * ":action" suffix on `formPath`).
 *
 * `SessionPayload` (the JWT) carries no username, unlike the login route
 * (which already has the full User row in hand when it writes
 * LoginActivity) - this does one extra lookup for it. Never awaited by the
 * caller, so it costs nothing on the request's own critical path.
 */
export function logDataChange(args: {
  session: SessionPayload;
  action: DataChangeAction;
  formPath: string;
  recordId?: string | null;
  /** Raw submitted values for CREATE/UPDATE - see the model's own schema.prisma comment for what this does and does not capture. Omitted for DELETE. */
  values?: Record<string, unknown> | null;
}) {
  const { session, action, formPath, recordId, values } = args;
  (async () => {
    const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { username: true } });
    await prisma.dataChangeLog.create({
      data: {
        userId: session.sub,
        username: user?.username ?? session.sub,
        roleId: session.roleId,
        kvkId: session.kvkId,
        kvkName: session.kvkName ?? null,
        zoneId: session.zoneId,
        action,
        formPath,
        formLabel: labelFor(formPath) ?? null,
        recordId: recordId ?? null,
        values: values ? JSON.parse(JSON.stringify(values)) : undefined,
      },
    });
  })().catch(() => {});
}
