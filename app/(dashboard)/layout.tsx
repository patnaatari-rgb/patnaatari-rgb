import type { Metadata } from "next";
import { headers } from "next/headers";
import { pageTitleFor } from "@/lib/page-title";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AppFooter } from "@/components/layout/app-footer";
import { SessionGate } from "@/components/layout/session-gate";
import { DocumentTitle } from "@/components/layout/document-title";

/** Titles each dashboard page by what it shows (the proxy passes the path in x-pathname). Without this every page carried the same title. */
export async function generateMetadata(): Promise<Metadata> {
  const pathname = (await headers()).get("x-pathname");
  return pathname ? { title: pageTitleFor(pathname) } : {};
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <DocumentTitle />
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
          <AppFooter />
        </div>
      </div>
    </SessionGate>
  );
}
