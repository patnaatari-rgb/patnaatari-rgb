import { jsPDF } from "jspdf";
import autoTable, { type CellHookData, type RowInput } from "jspdf-autotable";
import { lastTableBottom } from "@/lib/pdf-autotable";
import {
  buildHeaderMatrix,
  isRedundantTableHeading,
  splitNoteLabel,
  type ReportColumn,
  type ReportGrid,
  type ReportImage,
  type ReportSection,
} from "./report-types";

export type ReportPdfOptions = {
  title: string; // "ATARI AMS REPORT"
  zoneLabel: string; // "ATARI ZONE-4"
  reportingYearLabel: string; // "All Data" or a specific year
  kvkNames: string[];
  sections: ReportSection[];
  /** Module-Image url -> data-URL (pre-fetched by the caller, since the file proxy needs the browser session). */
  images?: Map<string, string>;
};

const GREEN: [number, number, number] = [40, 108, 74];
const BORDER_GRAY: [number, number, number] = [190, 190, 190];
const LINE_GRAY: [number, number, number] = [170, 170, 170];
const MARGIN = 12;
const TOC_START_Y = 28;
const TOC_CONT_Y = 18;
const SECTION_ROW_H = 10;
const SUB_ROW_H = 8;
const TABLE_ROW_H = 7;
const SECTION_GAP = 5;

/** Inserts a thin space between characters, matching the reference PDF's tracked-caps headings ("A T A R I   Z O N E - 4"). */
function spaced(text: string) {
  return text.split("").join(" ");
}

/** "4" -> "IV" etc, for the running-header zone segment (the client's export uses roman there even though the cover title uses the arabic form). */
const ARABIC_TO_ROMAN: Record<string, string> = {
  "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V",
  "6": "VI", "7": "VII", "8": "VIII", "9": "IX", "10": "X",
};

/** Uppercase, non-alphanumerics collapsed to single dashes, trimmed - "KVK Bhagalpur" -> "KVK-BHAGALPUR", "All Data" -> "ALL-DATA". */
function headerToken(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The running-header slug printed top-right on every page, matching the
 * client's own export exactly: `ICAR-ATARI/ZONE-IV/KVK-BHAGALPUR/REPORT-ALL-DATA`.
 * Zone comes from the "ATARI ZONE-4" cover label (arabic -> roman); the KVK
 * segment is the single KVK when the report is scoped to one, else "ALL-KVKS";
 * the period segment is the same "All Data" / year label the cover shows.
 */
function reportRunningHeader(opts: ReportPdfOptions): string {
  const zoneNum = /(\d+)\s*$/.exec(opts.zoneLabel.trim())?.[1];
  const zoneSeg = zoneNum
    ? `ZONE-${ARABIC_TO_ROMAN[zoneNum] ?? zoneNum}`
    : headerToken(opts.zoneLabel.replace(/^ATARI\s+/i, ""));
  const kvkSeg =
    opts.kvkNames.length === 1 ? headerToken(opts.kvkNames[0]) : "ALL-KVKS";
  const periodSeg = headerToken(opts.reportingYearLabel || "All Data");
  return `ICAR-ATARI/${zoneSeg}/${kvkSeg}/REPORT-${periodSeg}`;
}

/** jspdf-autotable `head` from the shared N-row header matrix (super-v2-prod.pdf's pivots go up to ~6 levels). */
function buildHead(columns: ReportColumn[], serial: boolean): RowInput[] {
  return buildHeaderMatrix(columns, serial ? "Sl. No." : undefined).map((row) =>
    row.map((cell) => ({
      content: cell.text,
      colSpan: cell.colSpan,
      rowSpan: cell.rowSpan,
      styles: cell.colSpan > 1 ? { halign: "center" } : {},
    })),
  );
}

const GRID_STYLES = {
  fontSize: 7,
  cellPadding: 1.2,
  lineColor: [140, 140, 140] as [number, number, number],
  lineWidth: 0.1,
  textColor: [0, 0, 0] as [number, number, number],
};
const HEAD_STYLES = {
  fillColor: [242, 242, 242] as [number, number, number],
  textColor: [0, 0, 0] as [number, number, number],
  fontStyle: "bold" as const,
  lineColor: [120, 120, 120] as [number, number, number],
  lineWidth: 0.1,
};

/** Renders one grid (main table body, or a part inside a composite block) and returns the Y to continue at. */
function renderGrid(doc: jsPDF, grid: ReportGrid, startY: number): number {
  const serial = !grid.noSerial;
  // A caption line above the grid (super-v2-prod.pdf's "Performance of ..." sub-headings).
  if (grid.caption) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    for (const line of doc.splitTextToSize(grid.caption, doc.internal.pageSize.getWidth() - MARGIN * 2)) {
      doc.text(line, MARGIN, startY);
      startY += 5;
    }
    startY += 1;
  }
  if (grid.rows.length === 0 && !grid.totalRow && !grid.keepEmpty) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text("No data available in table", MARGIN + 2, startY);
    return startY + 8;
  }

  const totalCols = (serial ? 1 : 0) + grid.columns.length;
  const bands: RowInput[] = (grid.titleBands ?? []).map((band, i) => [
    {
      content: band,
      colSpan: totalCols,
      styles: { halign: "left", fontStyle: "bold", fillColor: i === 0 ? [235, 235, 235] : [245, 245, 245] },
    },
  ]);
  const head = [...bands, ...buildHead(grid.columns, serial)];
  const body: RowInput[] = grid.rows.map((row, i) => [
    ...(serial ? [String(i + 1)] : []),
    ...grid.columns.map((c) => row[c.key] ?? ""),
  ]);
  if (grid.totalRow) {
    body.push([
      ...(serial ? [""] : []),
      ...grid.columns.map((c) => grid.totalRow![c.key] ?? ""),
    ]);
  }
  const totalRowIndex = grid.totalRow ? body.length - 1 : -1;
  /**
   * "Group header" body rows - only the first data column has text, every
   * other column is blank (the A-E sector labels in the OFT summary, the
   * "Training Area" bands in 2.4.A, "Crop Production" in the FLD sector
   * breakdown, ...). Builders push these straight into `rows`; without this
   * they render as a confusing blank row. super-v2-prod.pdf shades + bolds
   * them so they read as a heading. Skipped for 1-column tables.
   */
  // A band row carries a single label - in the first column, or the second when
  // the table leads with an S.No column (blank on band rows).
  const labelColIdx = /^s[lr]?\.?\s*no\.?$/i.test(grid.columns[0]?.label ?? "") ? 1 : 0;
  const bandRowIdx = new Set<number>();
  if (grid.columns.length >= labelColIdx + 2) {
    grid.rows.forEach((row, i) => {
      const label = String(row[grid.columns[labelColIdx].key] ?? "").trim();
      const restBlank = grid.columns.every(
        (c, idx) => idx === labelColIdx || String(row[c.key] ?? "").trim() === "",
      );
      if (label !== "" && restBlank) bandRowIdx.add(i);
    });
  }
  const contentW = doc.internal.pageSize.getWidth() - MARGIN * 2;

  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    // Always fill the page width and let long headers wrap, rather than
    // letting one text-heavy column blow out while the numeric columns get
    // squeezed - matches super-v2-prod.pdf's balanced column widths.
    tableWidth: contentW,
    head,
    body,
    styles: { ...GRID_STYLES, overflow: "linebreak", valign: "middle", minCellWidth: 6 },
    headStyles: { ...HEAD_STYLES, overflow: "linebreak", valign: "middle", halign: "center" },
    theme: "grid",
    didParseCell: (data: CellHookData) => {
      if (data.section !== "body") return;
      // The dedicated `totalRow`.
      if (data.row.index === totalRowIndex) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [235, 235, 235];
        return;
      }
      // Any inline "Sub Total" / "Sub-total — X" / "Grand Total (F)" / "Total"
      // row (the A-E sector matrices, FLD/Training consolidations, Production
      // blocks, ... push these straight into `rows`, so they used to render
      // as plain rows). super-v2-prod.pdf always bolds + shades them.
      const cells: string[] = Array.isArray(data.row.raw) ? data.row.raw.map((c: unknown) => String(c ?? "")) : [];
      if (cells.some((t) => /^\s*(sub[-\s]?total|subtotal|grand\s*total|total)\b/i.test(t))) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [235, 235, 235];
        return;
      }
      // Group-header band rows (only the first column has text).
      if (bandRowIdx.has(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [244, 244, 244];
        // Blank the auto serial number on a heading row.
        if (serial && data.column.index === 0) data.cell.text = [""];
      }
    },
  });
  return lastTableBottom(doc) + 6;
}

/** Renders a numbered label/value list (the 18-point OFT detail layout) as a borderless two-column table, or, when `flow`, as wrapped "label value" lines (2.2.C "Result:" / "Remark:"). */
function renderPairs(
  doc: jsPDF,
  pairs: { num?: string; label: string; value: string }[],
  startY: number,
  pageW: number,
  flow?: boolean,
): number {
  if (flow) {
    let y = startY;
    const contentW = pageW - MARGIN * 2;
    for (const p of pairs) {
      doc.setFont("helvetica", "bolditalic");
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      const labelW = doc.getTextWidth(p.label + " ");
      doc.text(p.label, MARGIN, y);
      doc.setFont("helvetica", "normal");
      const wrapped = doc.splitTextToSize(p.value, contentW - labelW);
      doc.text(wrapped, MARGIN + labelW, y);
      y += Math.max(wrapped.length, 1) * 3.9 + 2;
    }
    return y + 4;
  }
  autoTable(doc, {
    startY,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: pageW - MARGIN * 2,
    body: pairs.map((p) => [p.num ? `${p.num} ${p.label}` : p.label, p.value]),
    columnStyles: {
      0: { cellWidth: (pageW - MARGIN * 2) * 0.42, fontStyle: "bold" },
    },
    styles: { ...GRID_STYLES, fontSize: 8, cellPadding: 1.4, overflow: "linebreak", valign: "middle" },
    theme: "grid",
  });
  return lastTableBottom(doc) + 6;
}

type TocLine = {
  pageIndex: number; // 0-based, relative to the first TOC page
  y: number;
  level: "section" | "subsection" | "table";
  text: string;
  x: number;
  rowHeight: number;
  targetKey: string;
};

/**
 * Walks the same section/subsection/table tree the content pages render, in
 * the same order, purely to compute (a) how many TOC pages are needed and
 * (b) each line's exact page/x/y - all before any content page exists. This
 * lets the real render pass below pre-reserve the right number of blank TOC
 * pages, render content after them, and then go back and draw the TOC with
 * real internal `doc.link()` navigation to the page each entry landed on.
 * The TOC stops at the `1.1.A` grouping level: a run of sub-tables sharing a
 * `groupCode` contributes one line (the group), not one per sub-table.
 */
function layoutToc(sections: ReportSection[], pageH: number): { pageCount: number; lines: TocLine[] } {
  const lines: TocLine[] = [];
  let pageIndex = 0;
  let y = TOC_START_Y;

  function breakIfNeeded() {
    if (y > pageH - 15) {
      pageIndex += 1;
      y = TOC_CONT_Y;
    }
  }

  for (const section of sections) {
    breakIfNeeded();
    lines.push({ pageIndex, y, level: "section", text: `${section.num}. ${section.title}`, x: MARGIN, rowHeight: SECTION_ROW_H, targetKey: `sec-${section.num}` });
    y += SECTION_ROW_H;

    for (const sub of section.subsections) {
      breakIfNeeded();
      lines.push({ pageIndex, y, level: "subsection", text: `${sub.num}   ${sub.title}`, x: MARGIN + 6, rowHeight: SUB_ROW_H, targetKey: `sub-${sub.num}` });
      y += SUB_ROW_H;

      let lastGroupCode: string | null = null;
      for (const table of sub.tables) {
        if (isRedundantTableHeading(sub, table)) continue;
        if (table.groupCode) {
          if (table.groupCode !== lastGroupCode) {
            breakIfNeeded();
            lines.push({ pageIndex, y, level: "table", text: `${table.groupCode}   ${table.groupTitle ?? ""}`, x: MARGIN + 12, rowHeight: TABLE_ROW_H, targetKey: `grp-${table.groupCode}` });
            y += TABLE_ROW_H;
            lastGroupCode = table.groupCode;
          }
          continue;
        }
        lastGroupCode = null;
        breakIfNeeded();
        lines.push({ pageIndex, y, level: "table", text: `${table.code}   ${table.title}`, x: MARGIN + 12, rowHeight: TABLE_ROW_H, targetKey: `tab-${table.code}` });
        y += TABLE_ROW_H;
      }
    }
    y += SECTION_GAP;
  }

  return { pageCount: pageIndex + 1, lines };
}

/**
 * Real multi-section PDF matching the client's own "ATARI AMS REPORT" export
 * (super-v2-prod.pdf) - cover page with the KVKS INCLUDED list, a Table of
 * Contents whose every row is a real clickable internal link jumping to that
 * section/subsection/table's actual page, then the section bodies: grids get
 * an S.No. lead column and optional grouped headers / total row; composite
 * tables repeat a heading + parts per entity; pair tables render as a
 * numbered label/value list. Empty grids print "No data available in table",
 * the same as the reference.
 */
export function generateReportPdf(opts: ReportPdfOptions) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;

  // --- Cover page ---
  doc.setDrawColor(...BORDER_GRAY);
  doc.setLineWidth(0.4);
  doc.rect(6, 6, pageW - 12, pageH - 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...GREEN);
  doc.text(spaced(opts.zoneLabel), pageW / 2, 24, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(spaced("INDIAN COUNCIL OF AGRICULTURAL RESEARCH"), pageW / 2, 32, { align: "center" });
  doc.setDrawColor(...BORDER_GRAY);
  doc.setLineWidth(0.2);
  doc.line(pageW * 0.25, 37, pageW * 0.75, 37);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text("Agricultural Technology Application", pageW / 2, 45, { align: "center" });
  doc.text("Research Institute (ATARI)", pageW / 2, 52, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...GREEN);
  doc.text(opts.title, pageW / 2, 68, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text(`Reporting Year: ${opts.reportingYearLabel}`, pageW / 2, 76, { align: "center" });

  // The "KVKS INCLUDED" box hugs its content - a single-KVK / per-section
  // download shouldn't stretch a near-empty box down the whole page.
  const boxTop = 86;
  const cols = opts.kvkNames.length <= 6 ? 1 : 4;
  const perCol = Math.ceil(opts.kvkNames.length / cols);
  const boxBottom = Math.min(boxTop + 18 + perCol * 5.2 + 4, pageH - 16);
  doc.setDrawColor(...BORDER_GRAY);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN, boxTop, contentW, boxBottom - boxTop);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`KVKS INCLUDED (${opts.kvkNames.length})`, MARGIN + 4, boxTop + 8);
  doc.line(MARGIN + 4, boxTop + 11, pageW - MARGIN - 4, boxTop + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const colW = (contentW - 8) / cols;
  opts.kvkNames.forEach((name, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    doc.text(`${i + 1}. ${name}`, MARGIN + 4 + col * colW, boxTop + 18 + row * 5.2);
  });

  // --- Reserve blank TOC pages, sized exactly by a dry-run layout pass ---
  const toc = layoutToc(opts.sections, pageH);
  for (let i = 0; i < toc.pageCount; i++) doc.addPage();

  // --- Section/subsection/table content pages - recording each entry's real page number for the TOC links ---
  const targetPageByKey: Record<string, number> = {};

  for (const section of opts.sections) {
    doc.addPage();
    targetPageByKey[`sec-${section.num}`] = doc.getNumberOfPages();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...GREEN);
    doc.text(section.title, pageW / 2, 16, { align: "center" });
    let cursorY = 26;

    const ensureSpace = (needed: number) => {
      if (cursorY > pageH - needed) {
        doc.addPage();
        cursorY = 16;
      }
    };

    for (const sub of section.subsections) {
      ensureSpace(25);
      targetPageByKey[`sub-${sub.num}`] = doc.getNumberOfPages();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 20, 20);
      doc.text(`${sub.num}  ${sub.title}`, MARGIN, cursorY);
      doc.setDrawColor(...LINE_GRAY);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, cursorY + 1.5, pageW - MARGIN, cursorY + 1.5);
      cursorY += 8;

      let lastGroupCode: string | null = null;
      for (const table of sub.tables) {
        ensureSpace(24);

        if (table.groupCode && table.groupCode !== lastGroupCode) {
          targetPageByKey[`grp-${table.groupCode}`] = doc.getNumberOfPages();
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(20, 20, 20);
          doc.text(`${table.groupCode}  ${table.groupTitle ?? ""}`, MARGIN, cursorY);
          cursorY += 6.5;
          lastGroupCode = table.groupCode;
        }
        if (!table.groupCode) lastGroupCode = null;

        targetPageByKey[`tab-${table.code}`] = doc.getNumberOfPages();
        if (!isRedundantTableHeading(sub, table)) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          doc.text(`${table.code}  ${table.title}`, MARGIN, cursorY);
          cursorY += 5;
        }

        // A plain-grid table's caption is drawn inside renderGrid; for a
        // blocks/pairs table it has to be drawn here, above the first block.
        if (table.caption && (table.blocks || table.pairs)) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(40, 40, 40);
          for (const line of doc.splitTextToSize(table.caption, pageW - MARGIN * 2)) {
            doc.text(line, MARGIN, cursorY);
            cursorY += 5;
          }
          cursorY += 1;
        }

        if (table.blocks) {
          for (const block of table.blocks) {
            ensureSpace(20);
            const centered = block.align === "center" && block.parts.length === 0;
            if (block.heading) {
              doc.setFont("helvetica", "bold");
              doc.setFontSize(centered ? 12 : 10.5);
              doc.setTextColor(0, 0, 0);
              if (centered) {
                doc.text(block.heading, pageW / 2, cursorY + 1, { align: "center" });
                cursorY += 8;
              } else {
                doc.text(block.heading, MARGIN, cursorY);
                cursorY += 5.5;
              }
            }

            for (const note of block.notes ?? []) {
              // super-v2-prod.pdf bolds the leading "• Label:" and leaves the value plain.
              const { label, value } = splitNoteLabel(note);
              doc.setFontSize(8);
              doc.setTextColor(60, 60, 60);
              doc.setFont("helvetica", "bold");
              const labelW = doc.getTextWidth(label + " ");
              doc.text(label, MARGIN + 2, cursorY);
              doc.setFont("helvetica", "normal");
              const wrapped = doc.splitTextToSize(value, Math.max(contentW - labelW - 2, 20));
              if (value) doc.text(wrapped, MARGIN + 2 + labelW, cursorY);
              cursorY += Math.max(wrapped.length, 1) * 3.8 + 1;
            }

            for (const part of block.parts) {
              ensureSpace(18);
              // Grid captions are drawn inside renderGrid; pairs captions still need drawing here.
              if (part.caption && part.kind !== "grid") {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(9);
                doc.setTextColor(0, 0, 0);
                for (const line of part.caption.split("\n")) {
                  doc.text(line, MARGIN, cursorY);
                  cursorY += 4.5;
                }
              }
              cursorY =
                part.kind === "grid"
                  ? renderGrid(doc, part, cursorY)
                  : renderPairs(doc, part.pairs, cursorY, pageW, part.flow);
            }
            cursorY += 3;
          }
          continue;
        }

        if (table.pairs) {
          cursorY = renderPairs(doc, table.pairs, cursorY, pageW);
          continue;
        }

        cursorY = renderGrid(doc, table, cursorY);
      }

      // --- Photographs for this subsection (Module Images) ---
      const imgs = (sub.images ?? []).filter((im: ReportImage) => opts.images?.has(im.url));
      if (imgs.length > 0) {
        ensureSpace(24);
        doc.setDrawColor(...LINE_GRAY);
        doc.setLineWidth(0.2);
        doc.line(MARGIN, cursorY - 2, pageW - MARGIN, cursorY - 2);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(20, 20, 20);
        doc.text(`Photographs (${imgs.length})`, MARGIN, cursorY + 3);
        cursorY += 8;

        const perRow = 2;
        const gap = 6;
        const cw = (contentW - gap * (perRow - 1)) / perRow;
        const boxH = cw * 0.62; // frame the photo fits inside, aspect-preserved
        const capH = 9;
        let col = 0;
        let rowTop = cursorY;
        for (const im of imgs) {
          if (col === 0) {
            ensureSpace(boxH + capH + 6);
            rowTop = cursorY;
          }
          const x = MARGIN + col * (cw + gap);
          const data = opts.images!.get(im.url)!;
          doc.setDrawColor(...BORDER_GRAY);
          doc.setLineWidth(0.15);
          doc.rect(x, rowTop, cw, boxH);
          try {
            const fmt = /^data:image\/(png|jpe?g|webp)/i.exec(data)?.[1]?.toUpperCase().replace("JPG", "JPEG") ?? "JPEG";
            const props = doc.getImageProperties(data);
            const scale = Math.min((cw - 2) / props.width, (boxH - 2) / props.height);
            const iw = props.width * scale;
            const ih = props.height * scale;
            doc.addImage(data, fmt, x + (cw - iw) / 2, rowTop + (boxH - ih) / 2, iw, ih);
          } catch {
            // keep the empty frame
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.8);
          doc.setTextColor(40, 40, 40);
          const cap = doc.splitTextToSize(im.caption || "Untitled", cw);
          doc.text(cap.slice(0, 1), x, rowTop + boxH + 3.5);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.setTextColor(110, 110, 110);
          const meta = [im.category, im.date].filter(Boolean).join("  |  ");
          if (meta) doc.text(doc.splitTextToSize(meta, cw).slice(0, 1), x, rowTop + boxH + 6.8);
          col++;
          if (col === perRow) {
            col = 0;
            cursorY = rowTop + boxH + capH + 4;
          }
        }
        if (col !== 0) cursorY = rowTop + boxH + capH + 4;
        cursorY += 2;
      }
    }
  }

  // --- Draw the TOC pages for real, now that every target page number is known ---
  for (let i = 0; i < toc.pageCount; i++) {
    doc.setPage(2 + i);
    if (i === 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text("Table of Contents", MARGIN, 18);
    }
    for (const line of toc.lines) {
      if (line.pageIndex !== i) continue;
      if (line.level === "section") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...GREEN);
      } else if (line.level === "subsection") {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(20, 20, 20);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
      }
      doc.text(line.text, line.x, line.y);
      // A rule under section / subsection headers only - leaf rows just get
      // whitespace, matching the reference's own airier Table of Contents.
      if (line.level !== "table") {
        doc.setDrawColor(...LINE_GRAY);
        doc.setLineWidth(line.level === "section" ? 0.3 : 0.15);
        doc.line(MARGIN, line.y + 2.5, pageW - MARGIN, line.y + 2.5);
      }

      const targetPage = targetPageByKey[line.targetKey];
      if (targetPage) {
        doc.link(MARGIN, line.y - line.rowHeight + 2, contentW, line.rowHeight, { pageNumber: targetPage });
      }
    }
  }

  // --- Running header + footer on every page (cover included), matching the
  // reference's top-right "ICAR-ATARI/ZONE-IV/KVK-BHAGALPUR/REPORT-ALL-DATA"
  // slug and bottom-right "PageXofY". ---
  const pageCount = doc.getNumberOfPages();
  const runningHeader = reportRunningHeader(opts);
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(runningHeader, pageW - MARGIN, 10, { align: "right" });
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page${p}of${pageCount}`, pageW - MARGIN, pageH - 6, { align: "right" });
  }

  return doc;
}
