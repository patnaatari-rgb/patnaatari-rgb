const BADGE_COLORS = [
  "border-sky-300 text-sky-700",
  "border-emerald-300 text-emerald-700",
  "border-violet-300 text-violet-700",
  "border-amber-300 text-amber-700",
] as const;

const BAR_COLORS = [
  "bg-sky-300",
  "bg-emerald-300",
  "bg-violet-300",
  "bg-amber-300",
] as const;

/**
 * Preferred display order for the known sanctioned-post designations (from
 * the Dashboard reference screenshot + the client's KVK staff export). Any
 * post present in the real `counts` data but not listed here still shows -
 * it's just sorted after these, by count. Client asked (2026-09-07) for
 * every sanctioned post to appear, not just this curated subset.
 */
const STAFF_ROLE_ORDER = [
  "Senior Scientist & Head",
  "SMS (Subject Matter Specialist)",
  "Programme Assistant (Lab Technician)",
  "Programme Assistant (Computer)",
  "Farm Manager",
  "Assistant",
  "Stenographer",
  "Driver",
  "Supporting staff",
];

type StaffSummaryCardProps = {
  /** Staff.sanctionedPost -> count, from /api/dashboard-stats. */
  counts?: Record<string, number>;
};

/** Fixed to 450px so this card matches the real rendered height of the OFT/FLD/Training/Extension progress cards above it - this dashboard's other row of content cards - rather than drifting to whatever height its own content happens to need. The row list scrolls inside that height once there are more posts than fit. */
export function StaffSummaryCard({ counts = {} }: StaffSummaryCardProps) {
  /** Every sanctioned post that has staff, plus any known post with none - so the card is the full roster, not a fixed 7. Ordered by the preferred list above, then by count (busiest first), then name. */
  const roles = Array.from(new Set([...STAFF_ROLE_ORDER, ...Object.keys(counts)]))
    .filter((role) => (counts[role] ?? 0) > 0 || STAFF_ROLE_ORDER.includes(role))
    .sort((a, b) => {
      const ia = STAFF_ROLE_ORDER.indexOf(a);
      const ib = STAFF_ROLE_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      const d = (counts[b] ?? 0) - (counts[a] ?? 0);
      return d !== 0 ? d : a.localeCompare(b);
    });
  const maxCount = Math.max(1, ...roles.map((role) => counts[role] ?? 0));

  return (
    <div className="flex h-[450px] flex-col rounded-lg border border-border bg-card p-5">
      <p className="text-xs font-bold tracking-wide text-primary uppercase">
        Staff Summary
      </p>
      <div role="region" aria-label="Staff summary" tabIndex={0} className="mt-3 min-h-0 flex-1 -mx-5 overflow-y-auto border-t border-border">
        {roles.map((role, index) => {
          const count = counts[role] ?? 0;
          return (
            <div
              key={role}
              className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0"
            >
              <span className="w-4 shrink-0 text-sm text-muted-foreground">
                {index + 1}
              </span>
              <span className="flex-1 text-sm font-semibold text-foreground">
                {role}
              </span>
              <div className="hidden h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                <div
                  className={`h-full rounded-full ${BAR_COLORS[index % BAR_COLORS.length]}`}
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span
                className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${BADGE_COLORS[index % BADGE_COLORS.length]}`}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
