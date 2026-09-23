import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { resolveKvkScope } from "@/lib/host-org-scope";

const dec = (v: string | undefined) => (v?.trim() ? Number(v) : undefined);
const numStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Real "Add Result" tab for View FLD, confirmed live 2026-08-15 ("project over" reference) - Yield (Demo/Check/%Increase auto-calc) + Economics (Gross Cost/Return/Net Return auto-calc/BCR auto-calc), stored directly on Fld (see schema.prisma's Fld model comment). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const kvkScope = await resolveKvkScope(auth.session);

  const record = await prisma.fld.findFirst({ where: { id, ...kvkScope } });
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });

  return NextResponse.json({
    values: {
      yieldDemoQha: numStr(record.yieldDemoQha),
      yieldCheckQha: numStr(record.yieldCheckQha),
      percentIncrease: numStr(record.percentIncrease),
      grossCostDemo: numStr(record.grossCostDemo),
      grossReturnDemo: numStr(record.grossReturnDemo),
      netReturnDemo: numStr(record.netReturnDemo),
      bcrDemo: numStr(record.bcrDemo),
    },
    status: record.status,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(["KVK_ADMIN", "ORG_ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const kvkScope = await resolveKvkScope(auth.session);

  const body = await request.json().catch(() => null);
  const v: Record<string, string> = body?.values ?? {};
  const markCompleted = body?.markCompleted === true;

  const yieldDemoQha = dec(v.yieldDemoQha);
  const yieldCheckQha = dec(v.yieldCheckQha);
  const grossCostDemo = dec(v.grossCostDemo);
  const grossReturnDemo = dec(v.grossReturnDemo);

  /** Same auto-calc convention already established for CFLD Technical Parameter (lib/cfld-formulas.ts) and its Economic Parameters (Net Return = Gross Return - Gross Cost, B:C ratio = Gross Return / Gross Cost) - never trusted from the client. */
  const percentIncrease =
    yieldDemoQha !== undefined && yieldCheckQha
      ? ((yieldDemoQha - yieldCheckQha) / yieldCheckQha) * 100
      : undefined;
  const netReturnDemo =
    grossReturnDemo !== undefined && grossCostDemo !== undefined ? grossReturnDemo - grossCostDemo : undefined;
  const bcrDemo = grossReturnDemo !== undefined && grossCostDemo ? grossReturnDemo / grossCostDemo : undefined;

  const result = await prisma.fld.updateMany({
    where: { id, ...kvkScope },
    data: {
      yieldDemoQha,
      yieldCheckQha,
      percentIncrease,
      grossCostDemo,
      grossReturnDemo,
      netReturnDemo,
      bcrDemo,
      ...(markCompleted ? { status: "COMPLETED" } : {}),
    },
  });
  if (result.count === 0) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
