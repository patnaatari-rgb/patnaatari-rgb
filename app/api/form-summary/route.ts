import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { getTrackedLeaves, yearsWhereFor } from "@/lib/form-summary-data";
import { modelDelegate } from "@/lib/prisma-delegate";

/**
 * Real per-KVK, per-form entry counts across every one of the app's ~108
 * real trackable Form Management leaves (see lib/form-summary-data.ts) -
 * was a 100% static placeholder page before this (every stat hardcoded to
 * 0, every row "Not filled"/"-"). One groupBy per tracked leaf's model,
 * fired together via Promise.all (same discipline as /api/dashboard-stats
 * and the report engine's buildReportSections) - ~109 queries, the same
 * order of magnitude as the already-proven report engine.
 *
 * `?year=` scopes every count to that reporting year (client report,
 * 2026-09-04: the year dropdown showed only the current year and did
 * nothing). Models with a real year/date field are filtered; the ~38 with
 * neither (roster tables etc.) count all-time in every year's view, which
 * is correct - there is no year to scope them by.
 *
 * ~109 groupBys is ~0.6-1s against the (Singapore) DB, so a short
 * in-process TTL cache keyed by scope+year makes the page's own polling,
 * rapid year toggling and multi-tab reloads land instantly instead of
 * re-running the whole fan-out each time (client report, 2026-09-04:
 * "thoda late render ho raha hai ... fast show hona chahie"). 20s is well
 * under the page's 20s poll, so a genuinely new submission still shows up
 * on the next tick.
 */
const CACHE_TTL_MS = 20_000;
const responseCache = new Map<string, { at: number; body: unknown }>();

export async function GET(request: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const kvkId = auth.session.role === "SUPER_ADMIN" ? undefined : auth.session.kvkId ?? undefined;

  // `?year=` accepts a single 4-digit year or a comma-separated list (the
  // page's year filter is a checkbox multi-select). Empty/invalid = all-time.
  const yearParam = new URL(request.url).searchParams.get("year");
  const years = (yearParam ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^\d{4}$/.test(v))
    .map(Number)
    .sort((a, b) => a - b);

  const cacheKey = `${auth.session.zoneId}:${kvkId ?? "all"}:${years.length ? years.join("-") : "all"}`;
  const hit = responseCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body);
  }

  const kvks = await prisma.kvk.findMany({
    where: kvkId ? { id: kvkId } : { zoneId: auth.session.zoneId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const leaves = getTrackedLeaves();

  const countsPerLeaf = await Promise.all(
    leaves.map(async (leaf) => {
      const delegate = modelDelegate(leaf.model);
      const field = leaf.kvkField ?? "kvkId";
      const where: Record<string, unknown> = kvkId
        ? { [field]: kvkId }
        : { zoneId: auth.session.zoneId };
      if (leaf.extraWhere) Object.assign(where, leaf.extraWhere);
      if (years.length > 0) Object.assign(where, yearsWhereFor(leaf.model, years));
      try {
        const groups: { [key: string]: unknown; _count: { _all: number } }[] = await delegate.groupBy({
          by: [field],
          where,
          _count: { _all: true },
        });
        const byKvk = new Map<string, number>();
        for (const g of groups) byKvk.set(String(g[field]), g._count._all);
        return { leaf, byKvk };
      } catch {
        return { leaf, byKvk: new Map<string, number>() };
      }
    }),
  );

  const formsTracked = leaves.length;

  const byKvk = kvks.map((kvk) => {
    const sectionsMap = new Map<string, { path: string; label: string; count: number }[]>();
    let filled = 0;
    for (const { leaf, byKvk: counts } of countsPerLeaf) {
      const count = counts.get(kvk.id) ?? 0;
      if (count > 0) filled += 1;
      const list = sectionsMap.get(leaf.topSection) ?? [];
      list.push({ path: leaf.path, label: leaf.label, count });
      sectionsMap.set(leaf.topSection, list);
    }
    const sections = Array.from(sectionsMap.entries()).map(([sectionLabel, leavesInSection]) => ({
      sectionLabel,
      leaves: leavesInSection,
    }));
    return {
      id: kvk.id,
      name: kvk.name,
      filled,
      total: formsTracked,
      percent: formsTracked === 0 ? 0 : Math.round((filled / formsTracked) * 100),
      sections,
    };
  });

  const totalPossible = kvks.length * formsTracked;
  const totalFilled = byKvk.reduce((sum, k) => sum + k.filled, 0);

  const body = {
    kvks: kvks.map((k) => ({ id: k.id, name: k.name })),
    totalKvks: kvks.length,
    formsTracked,
    totalFilled,
    totalPossible,
    overallProgressPercent: totalPossible === 0 ? 0 : Math.round((totalFilled / totalPossible) * 100),
    byKvk,
    years,
  };

  responseCache.set(cacheKey, { at: Date.now(), body });
  if (responseCache.size > 64) {
    for (const [k, v] of responseCache) {
      if (Date.now() - v.at >= CACHE_TTL_MS) responseCache.delete(k);
    }
  }

  return NextResponse.json(body);
}
