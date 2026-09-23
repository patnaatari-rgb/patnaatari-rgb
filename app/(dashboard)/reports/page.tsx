"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useSession } from "@/lib/session";
import { KvkReportView } from "@/components/reports/kvk-report-view";
import { SuperAdminReportView } from "@/components/reports/super-admin-report-view";

/** Which report screen renders is decided by the session role set at login (lib/session.ts) - not switchable from inside the app. */
export default function ReportsPage() {
  const session = useSession();

  return (
    <div>
      <PageHeader trail={[{ label: "Reports" }]} />
      {session.role !== "super-admin" ? (
        <KvkReportView kvkName={session.kvkName} hostOrgName={session.hostOrgName} />
      ) : (
        <SuperAdminReportView />
      )}
    </div>
  );
}
