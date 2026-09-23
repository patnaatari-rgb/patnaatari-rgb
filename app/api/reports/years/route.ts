import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { distinctReportingYears } from "@/lib/report-data";
import { getHostOrgKvkIds } from "@/lib/host-org-scope";

/**
 * Real years for the Reports / Form Management "Reporting Year" checkbox
 * list - KVK Admin/User get their own KVK's years, Super Admin gets every
 * year present anywhere in the zone. Replaces the old hardcoded
 * REPORT_YEAR_LIST (current year back 5), which silently made any year
 * outside that fixed window impossible to select even though real data
 * existed for it.
 *
 * Optional `?model=<prisma model name>` (client direction, 2026-09-13):
 * scopes to one specific model's own years - e.g. OFT's own Reporting Year
 * field should only ever offer years OFT itself has, not every year this
 * KVK has entered anything in, anywhere in the app. Omit it for the Reports
 * page's own cross-model checklist, which genuinely wants the union across
 * everything. Safe by construction against an arbitrary/unknown value -
 * distinctReportingYears only ever narrows its own hardcoded model maps, it
 * can't be made to query a model outside them.
 */
export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const isRestrictedToOwnKvk = auth.session.role === "KVK_ADMIN" || auth.session.role === "KVK_USER";
  const kvkId: string | { in: string[] } | undefined = isRestrictedToOwnKvk
    ? auth.session.kvkId ?? undefined
    : auth.session.role === "ORG_ADMIN" && auth.session.hostOrgId
      ? { in: await getHostOrgKvkIds(auth.session.hostOrgId) }
      : undefined;
  const model = new URL(request.url).searchParams.get("model") ?? undefined;

  const years = await distinctReportingYears({ kvkId, zoneId: auth.session.zoneId, model });
  return NextResponse.json({ years });
}
