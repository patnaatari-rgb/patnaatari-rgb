import type ExcelJS from "exceljs";
import {
  isRedundantTableHeading,
  type ReportGrid,
  type ReportSection,
  type ReportTable,
} from "./report-types";

export type ReportExcelOptions = {
  title: string;
  zoneLabel: string;
  reportingYearLabel: string;
  /** Filters the list was narrowed by (e.g. "State: Bihar | On Campus"). */
  filterLabel?: string;
  kvkNames: string[];
  sections: ReportSection[];
  /** Module-Image url -> data-URL, pre-fetched by the caller. */
  images?: Map<string, string>;
};

const GREEN = "FF286C4A";
const LIGHT_GRAY = "FFF2F2F2";
const BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF888888" } };
const CELL_BORDER: Partial<ExcelJS.Borders> = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

/** Excel sheet names can't exceed 31 chars or contain : \ / ? * [ ] */
function sheetName(raw: string) {
  return raw.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
}

/** Grouped columns flatten to "Group - Label" here (a merged two-row header isn't worth the width-calc cost in a spreadsheet); every column stays a real, filterable column. */
function flatHeaders(grid: ReportGrid, serial: boolean) {
  return [
    ...(serial ? ["Sl. No."] : []),
    ...grid.columns.map((c) => [...(c.groups ?? []), c.label].join(" - ")),
  ];
}

/** Writes one grid starting at row `r`, returns the next free row. */
function writeGrid(sheet: ExcelJS.Worksheet, r: number, grid: ReportGrid): number {
  const serial = !grid.noSerial;

  for (const line of grid.caption ? grid.caption.split("\n") : []) {
    sheet.getCell(`A${r}`).value = line;
    sheet.getCell(`A${r}`).font = { bold: true, size: 10, color: { argb: "FF333333" } };
    r += 1;
  }

  if (grid.rows.length === 0 && !grid.totalRow && !grid.keepEmpty) {
    sheet.getCell(`A${r}`).value = "No data available in table";
    sheet.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: "FF999999" } };
    return r + 2;
  }

  const headers = flatHeaders(grid, serial);

  for (const band of grid.titleBands ?? []) {
    sheet.mergeCells(r, 1, r, Math.max(headers.length, 1));
    const cell = sheet.getCell(`A${r}`);
    cell.value = band;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEBEBEB" } };
    cell.border = CELL_BORDER;
    r += 1;
  }

  const headerRow = sheet.getRow(r);
  headers.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_GRAY } };
    cell.border = CELL_BORDER;
  });
  r += 1;

  grid.rows.forEach((row, i) => {
    const dataRow = sheet.getRow(r);
    const values = [...(serial ? [String(i + 1)] : []), ...grid.columns.map((c) => row[c.key] ?? "")];
    values.forEach((v, ci) => {
      const cell = dataRow.getCell(ci + 1);
      cell.value = v;
      cell.border = CELL_BORDER;
    });
    r += 1;
  });

  if (grid.totalRow) {
    const totalRow = sheet.getRow(r);
    const values = [...(serial ? [""] : []), ...grid.columns.map((c) => grid.totalRow![c.key] ?? "")];
    values.forEach((v, ci) => {
      const cell = totalRow.getCell(ci + 1);
      cell.value = v;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEBEBEB" } };
      cell.border = CELL_BORDER;
    });
    r += 1;
  }
  r += 1;

  headers.forEach((label, i) => {
    const col = sheet.getColumn(i + 1);
    const bodyMax = grid.rows.reduce((max, row) => {
      const key = serial ? (i === 0 ? "" : grid.columns[i - 1]?.key ?? "") : grid.columns[i]?.key ?? "";
      return Math.max(max, String(row[key] ?? "").length);
    }, 0);
    col.width = Math.max(col.width ?? 10, Math.min(Math.max(label.length, bodyMax) + 2, 45));
  });

  return r;
}

/** Writes a numbered label/value list, returns the next free row. */
function writePairs(
  sheet: ExcelJS.Worksheet,
  r: number,
  pairs: { num?: string; label: string; value: string }[],
  caption?: string,
  flow?: boolean,
): number {
  for (const line of caption ? caption.split("\n") : []) {
    sheet.getCell(`A${r}`).value = line;
    sheet.getCell(`A${r}`).font = { bold: true, size: 10, color: { argb: "FF333333" } };
    r += 1;
  }
  if (flow) {
    for (const pair of pairs) {
      sheet.getCell(`A${r}`).value = `${pair.label} ${pair.value}`;
      sheet.getCell(`A${r}`).font = { size: 10 };
      r += 1;
    }
    return r + 1;
  }
  for (const pair of pairs) {
    const row = sheet.getRow(r);
    const labelCell = row.getCell(1);
    labelCell.value = pair.num ? `${pair.num} ${pair.label}` : pair.label;
    labelCell.font = { bold: true };
    labelCell.border = CELL_BORDER;
    const valueCell = row.getCell(2);
    valueCell.value = pair.value;
    valueCell.border = CELL_BORDER;
    r += 1;
  }
  sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width ?? 10, 34);
  sheet.getColumn(2).width = Math.max(sheet.getColumn(2).width ?? 10, 50);
  return r + 1;
}

function writeTableBody(sheet: ExcelJS.Worksheet, r: number, table: ReportTable): number {
  if (table.blocks) {
    for (const block of table.blocks) {
      if (block.heading) {
        sheet.getCell(`A${r}`).value = block.heading;
        sheet.getCell(`A${r}`).font = { bold: true, size: 11 };
        r += 1;
      }
      for (const note of block.notes ?? []) {
        sheet.getCell(`A${r}`).value = note;
        sheet.getCell(`A${r}`).font = { size: 9, color: { argb: "FF555555" } };
        r += 1;
      }
      for (const part of block.parts) {
        r = part.kind === "grid" ? writeGrid(sheet, r, part) : writePairs(sheet, r, part.pairs, part.caption, part.flow);
      }
      r += 1;
    }
    return r;
  }
  if (table.pairs) return writePairs(sheet, r, table.pairs);
  return writeGrid(sheet, r, table);
}

/**
 * Real downloadable Excel export of the same report tree the PDF/Word
 * exports use - one worksheet per top-level section, a "Contents" sheet with
 * real internal hyperlinks jumping to each section's sheet, and a "Back to
 * Contents" link at the top of every section sheet.
 */
export async function generateReportExcel(opts: ReportExcelOptions): Promise<ExcelJS.Workbook> {
  const ExcelJSModule = (await import("exceljs")).default;
  const wb = new ExcelJSModule.Workbook();
  wb.creator = "ATARI AMS";
  wb.created = new Date();

  const contents = wb.addWorksheet("Contents");
  contents.columns = [{ width: 6 }, { width: 60 }];
  contents.mergeCells("A1:B1");
  contents.getCell("A1").value = opts.zoneLabel;
  contents.getCell("A1").font = { bold: true, size: 16, color: { argb: GREEN } };
  contents.mergeCells("A2:B2");
  contents.getCell("A2").value = opts.title;
  contents.getCell("A2").font = { bold: true, size: 13 };
  contents.mergeCells("A3:B3");
  contents.getCell("A3").value = `Reporting Year: ${opts.reportingYearLabel}${opts.filterLabel ? `  |  Filters: ${opts.filterLabel}` : ""}`;
  contents.getCell("A3").font = { italic: true, size: 10, color: { argb: "FF555555" } };
  contents.mergeCells("A4:B4");
  contents.getCell("A4").value = `KVKs Included (${opts.kvkNames.length}): ${opts.kvkNames.join(", ")}`;
  contents.getCell("A4").alignment = { wrapText: true };
  contents.getRow(4).height = 45;

  let contentsRow = 6;
  contents.getCell(`A${contentsRow}`).value = "Table of Contents";
  contents.getCell(`A${contentsRow}`).font = { bold: true, size: 12 };
  contentsRow += 1;

  const usedSheetNames = new Set<string>(["Contents"]);

  for (const section of opts.sections) {
    let name = sheetName(`${section.num} ${section.title}`);
    let suffix = 2;
    while (usedSheetNames.has(name)) {
      name = sheetName(`${section.num} ${section.title}`).slice(0, 28) + "-" + suffix;
      suffix += 1;
    }
    usedSheetNames.add(name);

    contents.getCell(`A${contentsRow}`).value = section.num;
    contents.getCell(`B${contentsRow}`).value = { text: section.title, hyperlink: `#'${name}'!A1` };
    contents.getCell(`B${contentsRow}`).font = { color: { argb: "FF1155CC" }, underline: true, bold: true };
    contentsRow += 1;
    for (const sub of section.subsections) {
      contents.getCell(`B${contentsRow}`).value = { text: `  ${sub.num}  ${sub.title}`, hyperlink: `#'${name}'!A1` };
      contents.getCell(`B${contentsRow}`).font = { color: { argb: "FF1155CC" }, underline: true };
      contentsRow += 1;
    }

    const sheet = wb.addWorksheet(name);
    sheet.getCell("A1").value = { text: "← Back to Contents", hyperlink: "#'Contents'!A1" };
    sheet.getCell("A1").font = { color: { argb: "FF1155CC" }, underline: true, italic: true, size: 9 };

    sheet.getCell("A3").value = `${section.num}. ${section.title}`;
    sheet.getCell("A3").font = { bold: true, size: 14, color: { argb: GREEN } };
    let r = 5;

    for (const sub of section.subsections) {
      sheet.getCell(`A${r}`).value = `${sub.num}  ${sub.title}`;
      sheet.getCell(`A${r}`).font = { bold: true, size: 12 };
      r += 2;

      let lastGroupCode: string | null = null;
      for (const table of sub.tables) {
        if (table.groupCode && table.groupCode !== lastGroupCode) {
          sheet.getCell(`A${r}`).value = `${table.groupCode}  ${table.groupTitle ?? ""}`;
          sheet.getCell(`A${r}`).font = { bold: true, size: 11, color: { argb: "FF333333" } };
          r += 1;
          lastGroupCode = table.groupCode;
        }
        if (!table.groupCode) lastGroupCode = null;

        if (!isRedundantTableHeading(sub, table)) {
          sheet.getCell(`A${r}`).value = `${table.code}  ${table.title}`;
          sheet.getCell(`A${r}`).font = { bold: true, size: 10, color: { argb: "FF333333" } };
          r += 1;
        }

        r = writeTableBody(sheet, r, table);
      }

      const imgs = (sub.images ?? []).filter((im) => opts.images?.has(im.url));
      if (imgs.length > 0) {
        sheet.getCell(`A${r}`).value = `Photographs (${imgs.length})`;
        sheet.getCell(`A${r}`).font = { bold: true, size: 10, color: { argb: "FF333333" } };
        r += 2;
        for (const im of imgs) {
          const data = opts.images!.get(im.url)!;
          const m = /^data:image\/(png|jpe?g|gif)/i.exec(data)?.[1]?.toLowerCase();
          const ext: "png" | "jpeg" | "gif" = m === "jpg" || m === "jpeg" ? "jpeg" : m === "gif" ? "gif" : "png";
          try {
            const imgId = wb.addImage({ base64: data, extension: ext });
            sheet.addImage(imgId, { tl: { col: 0, row: r - 1 }, ext: { width: 340, height: 210 }, editAs: "oneCell" });
          } catch {
            // Skip an image that fails rather than aborting the workbook.
          }
          r += 12; // leave room for the picture
          sheet.getCell(`A${r}`).value = (im.caption || "Untitled") + ([im.category, im.date].filter(Boolean).length ? `  |  ${[im.category, im.date].filter(Boolean).join("  |  ")}` : "");
          sheet.getCell(`A${r}`).font = { size: 9, bold: true, color: { argb: "FF444444" } };
          r += 2;
        }
      }
    }
  }

  return wb;
}
