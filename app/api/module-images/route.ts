import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { REPORT_FORM_LEAVES } from "@/lib/reports";
import { resolveKvkScope } from "@/lib/host-org-scope";

/**
 * Real backend for "Module Images UI.pdf" (2026-08-28) - was UI-only before
 * (lib/module-images.ts's MODULE_IMAGE_ROWS stayed a hardcoded empty
 * array). A KVK Admin uploads photographs against a Form Management
 * category and sees only their own KVK's uploads (any publish state);
 * Super Admin browses/downloads every KVK's uploads across the zone, never
 * uploads (spec section 1) - GET serves both, POST is KVK-only.
 */
export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const where = await resolveKvkScope(auth.session);

  const rows = await prisma.moduleImage.findMany({
    where,
    // Only the columns the response below actually reads - this gallery has
    // no pagination (every row feeds the page's client-side filters and the
    // "Download By" ZIP, see the module-images view components), so keeping
    // each row's DB/wire payload small is what keeps it scaling as uploads
    // grow rather than cutting rows the UI still needs.
    select: {
      id: true,
      kvk: { select: { name: true } },
      reportingYear: true,
      activityDate: true,
      categoryPath: true,
      categoryLabel: true,
      caption: true,
      published: true,
      imageUrl: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      kvk: r.kvk.name,
      reportingYear: String(r.reportingYear),
      date: r.activityDate.toISOString().slice(0, 10),
      categoryPath: r.categoryPath,
      categoryLabel: r.categoryLabel,
      caption: r.caption,
      published: r.published,
      previewUrl: `/api/files/view?url=${encodeURIComponent(r.imageUrl)}`,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireSession(["KVK_ADMIN"]);
  if (!auth.ok) return auth.response;
  if (!auth.session.kvkId) {
    return NextResponse.json({ error: "No KVK on this account." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const categoryPath = typeof body?.categoryPath === "string" ? body.categoryPath : "";
  const reportingYear = Number(body?.reportingYear);
  const activityDate = typeof body?.activityDate === "string" ? body.activityDate : "";
  const caption = typeof body?.caption === "string" ? body.caption.trim() : "";
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl : "";
  const published = body?.published === true;

  const leaf = REPORT_FORM_LEAVES.find((l) => l.path === categoryPath);
  if (!leaf) {
    return NextResponse.json({ error: "Unknown category / form." }, { status: 400 });
  }
  if (!Number.isFinite(reportingYear) || !activityDate || !caption || !imageUrl) {
    return NextResponse.json(
      { error: "Reporting year, date of activity, caption and image are all required." },
      { status: 400 },
    );
  }

  const image = await prisma.moduleImage.create({
    data: {
      kvkId: auth.session.kvkId,
      zoneId: auth.session.zoneId,
      categoryPath,
      categoryLabel: `${leaf.groupLabel} - ${leaf.label}`,
      reportingYear,
      activityDate: new Date(activityDate),
      caption,
      imageUrl,
      published,
      uploadedById: auth.session.sub,
    },
  });

  return NextResponse.json({ id: image.id }, { status: 201 });
}
