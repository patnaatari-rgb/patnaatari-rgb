"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ReportHeaderBar } from "@/components/reports/report-header-bar";
import { ReportPreviewCard } from "@/components/reports/report-preview-card";
import { ReportPreviewDocument } from "@/components/reports/report-preview-document";
import { DownloadReportButtons } from "@/components/reports/download-report-buttons";
import { useReportPreview } from "@/components/reports/use-report-preview";
import { formatDisplayDate } from "@/lib/reports";
import { downloadBlob } from "@/lib/utils";
import { reportTableRowCount, type ReportSection } from "@/lib/report-types";

type ReportData = { zoneLabel: string; kvkNames: string[]; sections: ReportSection[]; periodLabel?: string };

/**
 * Generate Preview navigates here instead of updating the filter page
 * in-place - a real page/URL for the report, not just inline state, per
 * explicit direction. Reads the filters the previous screen already
 * validated (passed as query params) purely for display; it doesn't
 * re-validate them itself.
 *
 * The full report (every section/subsection/table) is fetched once on load,
 * held in state, rendered on screen for reading via ReportPreviewDocument,
 * and reused by all three Download buttons - previously each button
 * re-fetched the entire 100+ query report independently and the preview
 * only ever showed a record count, never the report itself.
 */
export default function ReportPreviewPage() {
  return (
    <Suspense fallback={null}>
      <ReportPreviewContent />
    </Suspense>
  );
}

function ReportPreviewContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { phase, reportId, totalRecords, errorMessage, generate } = useReportPreview();

  const type = params.get("type") === "kvk" ? "kvk" : "admin";
  const backHref = "/reports";
  const [report, setReport] = useState<ReportData | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [wordLoading, setWordLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function fetchReportData(): Promise<ReportData> {
    const kvkFilter = params.get("kvk");
    const q = new URLSearchParams();
    if (kvkFilter && kvkFilter !== "All KVKs") q.set("kvk", kvkFilter);
    const from = params.get("from");
    const to = params.get("to");
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    // "Reporting Year" checkbox multi-select - scopes every table to exactly
    // these calendar years; the server prefers it over from/to.
    const years = params.get("years");
    if (years) q.set("years", years);
    // "Select Form" checklist - scope the report to exactly the checked forms.
    const forms = params.get("forms");
    if (forms) q.set("forms", forms);
    const query = q.toString() ? `?${q.toString()}` : "";
    const response = await fetch(`/api/reports/generate${query}`);
    const data: ReportData | { error: string } = await response.json();
    if (!response.ok || "error" in data) {
      throw new Error("error" in data ? data.error : "Could not generate the report.");
    }
    return data;
  }

  function countRecords(sections: ReportSection[]) {
    return sections
      .flatMap((s) => s.subsections)
      .flatMap((sub) => sub.tables)
      .reduce((sum, table) => sum + reportTableRowCount(table), 0);
  }

  useEffect(() => {
    let cancelled = false;
    generate(
      () => null,
      async () => {
        const data = await fetchReportData();
        if (!cancelled) setReport(data);
        return countRecords(data.sections);
      },
    );
    return () => {
      cancelled = true;
    };
    // Loads once when the preview opens. The loader helpers above are redeclared on every render, so listing them would re-run the load each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDownloadPdf() {
    setDownloadError(null);
    setPdfLoading(true);
    try {
      const data = report ?? (await fetchReportData());
      const [{ generateReportPdf }, { prefetchReportImages }] = await Promise.all([
        import("@/lib/report-pdf"),
        import("@/lib/report-images"),
      ]);
      const doc = generateReportPdf({
        title: "ATARI AMS REPORT",
        zoneLabel: data.zoneLabel,
        reportingYearLabel: data.periodLabel ?? "All Data",
        kvkNames: data.kvkNames,
        sections: data.sections,
        images: await prefetchReportImages(data.sections),
      });
      doc.save(`ATARI-AMS-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not reach the server. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleDownloadExcel() {
    setDownloadError(null);
    setExcelLoading(true);
    try {
      const data = report ?? (await fetchReportData());
      const [{ generateReportExcel }, { prefetchReportImages }] = await Promise.all([
        import("@/lib/report-excel"),
        import("@/lib/report-images"),
      ]);
      const wb = await generateReportExcel({
        title: "ATARI AMS REPORT",
        zoneLabel: data.zoneLabel,
        reportingYearLabel: data.periodLabel ?? "All Data",
        kvkNames: data.kvkNames,
        sections: data.sections,
        images: await prefetchReportImages(data.sections),
      });
      const buffer = await wb.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `ATARI-AMS-Report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not reach the server. Please try again.");
    } finally {
      setExcelLoading(false);
    }
  }

  async function handleDownloadWord() {
    setDownloadError(null);
    setWordLoading(true);
    try {
      const data = report ?? (await fetchReportData());
      const [{ generateReportWord }, { prefetchReportImages }] = await Promise.all([
        import("@/lib/report-word"),
        import("@/lib/report-images"),
      ]);
      const blob = await generateReportWord({
        title: "ATARI AMS REPORT",
        zoneLabel: data.zoneLabel,
        reportingYearLabel: data.periodLabel ?? "All Data",
        kvkNames: data.kvkNames,
        sections: data.sections,
        images: await prefetchReportImages(data.sections),
      });
      downloadBlob(blob, `ATARI-AMS-Report-${new Date().toISOString().slice(0, 10)}.docx`);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not reach the server. Please try again.");
    } finally {
      setWordLoading(false);
    }
  }

  /** "Reporting Year" checkbox multi-select - when set, the report is scoped to exactly these years and the From/To rows are replaced by a single "Reporting Year" row. */
  const yearsParam = (params.get("years") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^\d{4}$/.test(v));
  const fromParam = params.get("from") ?? "";
  const toParam = params.get("to") ?? "";
  const dateRows = yearsParam.length
    ? [{ label: "Reporting Year", value: yearsParam.sort().join(", ") }]
    : !fromParam && !toParam
      ? // No period bound at all - the report covers every reporting year.
        [{ label: "Reporting Year", value: "All Data" }]
      : [
          { label: "From Date", value: formatDisplayDate(fromParam) },
          { label: "To Date", value: formatDisplayDate(toParam) },
        ];

  // For a KVK Admin the report is scoped server-side to their own KVK, so the
  // authoritative name is the one the generate route returns, not the query
  // param (which is only a display hint and can be a neutral placeholder when
  // the session has no KVK name).
  const kvkNameForMeta =
    (type === "kvk" ? report?.kvkNames?.[0] : undefined) ??
    params.get("kvk") ??
    "";

  const metaColumns =
    type === "kvk"
      ? [
          [
            { label: "KVK Name", value: kvkNameForMeta },
            { label: "Form", value: params.get("form") ?? "All Forms" },
          ],
          dateRows,
        ]
      : [
          [
            { label: "Zone", value: params.get("zone") ?? "" },
            { label: "State", value: params.get("state") ?? "" },
            { label: "Host Organisation", value: params.get("hostOrg") ?? "" },
            { label: "District", value: params.get("district") ?? "" },
          ],
          [
            { label: "KVK", value: params.get("kvk") ?? "" },
            { label: "Form", value: params.get("form") ?? "All Forms" },
          ],
          [...dateRows, { label: "Generated By", value: "Super Admin" }],
        ];

  return (
    <div className="space-y-4">
      <PageHeader
        trail={[
          { label: "Reports", href: "/reports" },
          { label: "Report Preview" },
        ]}
      />

      <ReportHeaderBar
        title={
          type === "kvk" ? "KVK REPORT PREVIEW" : "SUPER ADMIN REPORT PREVIEW"
        }
      />

      <Button variant="outline" size="sm" onClick={() => router.push(backHref)}>
        <ChevronLeft className="size-3.5" />
        Back to Filters
      </Button>

      <div>
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
          <Eye className="size-3.5" />
          Report Preview
        </div>
        <ReportPreviewCard
          heading={type === "kvk" ? "KVK REPORT PREVIEW" : "REPORT SUMMARY"}
          reportId={reportId}
          phase={phase}
          totalRecords={totalRecords}
          errorMessage={errorMessage}
          metaColumns={metaColumns}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Download Report
          </p>
          <DownloadReportButtons
            onDownloadPdf={handleDownloadPdf}
            onDownloadExcel={handleDownloadExcel}
            onDownloadWord={handleDownloadWord}
            pdfLoading={pdfLoading}
            excelLoading={excelLoading}
            wordLoading={wordLoading}
          />
          {downloadError && (
            <p role="alert" className="mt-2 text-sm font-medium text-destructive">
              {downloadError}
            </p>
          )}
        </div>
      </div>

      {phase === "ready" && report && (
        <ReportPreviewDocument
          zoneLabel={report.zoneLabel}
          kvkNames={report.kvkNames}
          sections={report.sections}
        />
      )}
    </div>
  );
}
