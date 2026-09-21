import type ExcelJS from "exceljs";
import {
  DEMOGRAPHIC_GROUPS,
  PUBLICATIONS_BLOCK,
  TECHNICAL_ACHIEVEMENT_CARDS,
  buildRowValues,
  type SectionValues,
  type SummaryCard,
  type SummarySection,
} from "./technical-achievement-summary";
import { buildHeaderMatrix, type ReportColumn } from "./report-types";
import { lastTableBottom } from "./pdf-autotable";

const TITLE = "Technical Achievement Summary";
const GREEN: [number, number, number] = [40, 108, 74];
const BORDER_GRAY: [number, number, number] = [190, 190, 190];

/** Same 4 accents as the on-screen cards (components/data-table/technical-achievement-summary.tsx's CARD_ACCENTS), as RGB/hex triples for jsPDF/ExcelJS/docx instead of Tailwind class names. */
const CARD_ACCENTS: Record<string, { bar: [number, number, number]; head: [number, number, number]; hex: string; headHex: string }> = {
  "oft-fld": { bar: [14, 165, 233], head: [240, 249, 255], hex: "0EA5E9", headHex: "F0F9FF" },
  "training-extension": { bar: [16, 185, 129], head: [236, 253, 245], hex: "10B981", headHex: "ECFDF5" },
  "seed-planting": { bar: [139, 92, 246], head: [245, 243, 255], hex: "8B5CF6", headHex: "F5F3FF" },
  "livestock-soil": { bar: [245, 158, 11], head: [255, 251, 235], hex: "F59E0B", headHex: "FFFBEB" },
};

export type TechnicalAchievementExportMeta = {
  reportingYear: string;
  /** KVK Admin's own scope note ("Figures for KVK X"), or the Super Admin's KVK filter summary - printed under the title so a downloaded file still shows what it was scoped to. */
  scopeNote?: string;
};

/**
 * One `ReportColumn` per leaf value `buildRowValues()` produces, in the same
 * order, so the header tree (built by the shared `buildHeaderMatrix()` -
 * same function the big Reports engine's own PDF uses for its grouped/
 * merged headers) and the single data row line up. `groups` is the column's
 * ancestor header path, outermost first - matching the on-screen table's own
 * row order exactly: section heading, sub-heading (if any), metric/
 * participant group heading, "Achievement" (only where a lead column splits
 * the group), then the caste label, with the leaf `label` being the M/F/T
 * split (or the plain metric name / lead column name for a column that
 * terminates earlier and row-spans down).
 */
function sectionColumns(section: SummarySection): ReportColumn[] {
  const prefix = [section.heading, ...(section.subHeading ? [section.subHeading] : [])];
  const columns: ReportColumn[] = section.metricGroup.columns.map((label, i) => ({
    key: `${section.heading}-metric-${i}`,
    label,
    groups: [...prefix, section.metricGroup.heading],
  }));

  const pg = section.participantGroup;
  if (pg) {
    if (pg.leadColumn) {
      columns.push({ key: `${section.heading}-lead`, label: pg.leadColumn, groups: [...prefix, pg.heading] });
    }
    const matrixPrefix = pg.matrixHeading ? [...prefix, pg.heading, pg.matrixHeading] : [...prefix, pg.heading];
    for (const group of DEMOGRAPHIC_GROUPS) {
      for (const split of group.splits) {
        columns.push({
          key: `${section.heading}-${group.label}-${split}`,
          label: split,
          groups: [...matrixPrefix, group.label],
        });
      }
    }
  }
  return columns;
}

function cardColumns(card: SummaryCard): ReportColumn[] {
  const [left, right] = card.sections;
  return [...sectionColumns(left), ...sectionColumns(right)];
}

function cardValues(card: SummaryCard, sectionValues: Record<string, SectionValues> | undefined): (string | number)[] {
  const [left, right] = card.sections;
  return [
    ...buildRowValues(left, sectionValues?.[`${card.id}-0`]),
    ...buildRowValues(right, sectionValues?.[`${card.id}-1`]),
  ];
}

/** "OFT - No. of Technologies Tested - No. of OFTs - Target" - same flatten-grouped-headers-to-one-row convention the big Reports engine's own Excel/Word exports use (lib/report-excel.ts, lib/report-word.ts), for the same reason: a merged multi-row header isn't worth the width-calc cost in a spreadsheet or a Word table. */
function flatColumnLabel(column: ReportColumn): string {
  return [...(column.groups ?? []), column.label].join(" - ");
}

function metaLines(meta: TechnicalAchievementExportMeta): string[] {
  const lines = [`Reporting Year: ${meta.reportingYear}`];
  if (meta.scopeNote) lines.push(meta.scopeNote);
  return lines;
}

function fileBaseName(meta: TechnicalAchievementExportMeta): string {
  return `${TITLE} - ${meta.reportingYear}`;
}

export async function downloadTechnicalAchievementPdf(
  meta: TechnicalAchievementExportMeta,
  sectionValues: Record<string, SectionValues> | undefined,
) {
  const { jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: "landscape" });
  doc.setProperties({ title: TITLE });

  function drawPageBorder() {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...BORDER_GRAY);
    doc.setLineWidth(0.4);
    doc.rect(6, 6, pageW - 12, pageH - 12);
  }

  drawPageBorder();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...GREEN);
  doc.text(TITLE, 14, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(metaLines(meta).join("   |   "), 14, 20);

  const pageH = doc.internal.pageSize.getHeight();
  let cursorY = 26;

  for (const card of TECHNICAL_ACHIEVEMENT_CARDS) {
    const accent = CARD_ACCENTS[card.id];
    const columns = cardColumns(card);
    const headRows = buildHeaderMatrix(columns).map((row) =>
      row.map((cell) => ({
        content: cell.text,
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan,
        styles: { fillColor: accent.head, textColor: [0, 0, 0] as [number, number, number], fontStyle: "bold" as const, halign: "center" as const },
      })),
    );

    if (cursorY > pageH - 30) {
      doc.addPage();
      drawPageBorder();
      cursorY = 16;
    }

    // The thin accent bar the on-screen card has above its own header, same colour per card.
    autoTable(doc, {
      startY: cursorY,
      margin: { left: 10, right: 10 },
      body: [[{ content: "", colSpan: columns.length }]],
      theme: "plain",
      styles: { minCellHeight: 1.5, cellPadding: 0, fillColor: accent.bar, lineWidth: 0 },
      didDrawPage: () => drawPageBorder(),
    });
    cursorY = lastTableBottom(doc);

    autoTable(doc, {
      startY: cursorY,
      margin: { left: 10, right: 10 },
      head: headRows,
      body: [cardValues(card, sectionValues).map((v) => String(v))],
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 1.2, lineColor: BORDER_GRAY, lineWidth: 0.15, textColor: [0, 0, 0], halign: "center" as const },
      headStyles: { lineColor: BORDER_GRAY, lineWidth: 0.15, fontSize: 7 },
      didDrawPage: () => drawPageBorder(),
    });
    cursorY = lastTableBottom(doc) + 8;
  }

  if (cursorY > pageH - 20) {
    doc.addPage();
    drawPageBorder();
    cursorY = 16;
  }
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(PUBLICATIONS_BLOCK.heading, 14, cursorY);
  cursorY += 5;
  doc.setFont("helvetica", "italic");
  doc.setTextColor(140, 140, 140);
  doc.setFontSize(9);
  doc.text(PUBLICATIONS_BLOCK.emptyMessage, 14, cursorY);

  doc.save(`${fileBaseName(meta)}.pdf`);
}

export async function generateTechnicalAchievementExcel(
  meta: TechnicalAchievementExportMeta,
  sectionValues: Record<string, SectionValues> | undefined,
) {
  const ExcelJSModule = (await import("exceljs")).default;
  const wb = new ExcelJSModule.Workbook();
  wb.creator = "ATARI AMS";
  wb.created = new Date();
  wb.title = TITLE;

  const sheet = wb.addWorksheet("Technical Achievement");
  sheet.getCell("A1").value = TITLE;
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF286C4A" } };
  metaLines(meta).forEach((line, i) => {
    sheet.getCell(`A${2 + i}`).value = line;
    sheet.getCell(`A${2 + i}`).font = { italic: true, color: { argb: "FF555555" } };
  });

  let row = 2 + metaLines(meta).length + 1;
  const border: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF888888" } };
  const cellBorder: Partial<ExcelJS.Borders> = { top: border, left: border, bottom: border, right: border };

  for (const card of TECHNICAL_ACHIEVEMENT_CARDS) {
    const accent = CARD_ACCENTS[card.id];
    const columns = cardColumns(card);
    const [left, right] = card.sections;
    sheet.getCell(`A${row}`).value = `${left.heading} / ${right.heading}`;
    sheet.getCell(`A${row}`).font = { bold: true };
    row += 1;

    const headerRow = sheet.getRow(row);
    columns.forEach((column, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = flatColumnLabel(column);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${accent.hex}` } };
      cell.border = cellBorder;
      cell.alignment = { wrapText: true, vertical: "middle" };
    });
    row += 1;

    const values = cardValues(card, sectionValues);
    const dataRow = sheet.getRow(row);
    values.forEach((value, i) => {
      const cell = dataRow.getCell(i + 1);
      cell.value = value;
      cell.border = cellBorder;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${accent.headHex}` } };
    });
    row += 2;
  }

  sheet.getCell(`A${row}`).value = PUBLICATIONS_BLOCK.heading;
  sheet.getCell(`A${row}`).font = { bold: true };
  row += 1;
  sheet.getCell(`A${row}`).value = PUBLICATIONS_BLOCK.emptyMessage;
  sheet.getCell(`A${row}`).font = { italic: true, color: { argb: "FF999999" } };

  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  return wb;
}

export async function generateTechnicalAchievementWord(
  meta: TechnicalAchievementExportMeta,
  sectionValues: Record<string, SectionValues> | undefined,
) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle } =
    await import("docx");

  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "888888" };
  const tableBorders = {
    top: cellBorder,
    bottom: cellBorder,
    left: cellBorder,
    right: cellBorder,
    insideHorizontal: cellBorder,
    insideVertical: cellBorder,
  };

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: TITLE, bold: true, size: 32, color: "286C4A" })],
    }),
    ...metaLines(meta).map(
      (line) =>
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: line, italics: true, size: 18, color: "555555" })],
        }),
    ),
  ];

  for (const card of TECHNICAL_ACHIEVEMENT_CARDS) {
    const accent = CARD_ACCENTS[card.id];
    const columns = cardColumns(card);
    const [left, right] = card.sections;

    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: `${left.heading} / ${right.heading}`, bold: true, size: 22 })],
      }),
    );

    const headerRow = new TableRow({
      tableHeader: true,
      children: columns.map(
        (column) =>
          new TableCell({
            shading: { type: ShadingType.SOLID, color: accent.hex, fill: accent.hex },
            children: [
              new Paragraph({
                children: [new TextRun({ text: flatColumnLabel(column), bold: true, size: 14, color: "FFFFFF" })],
              }),
            ],
          }),
      ),
    });

    const values = cardValues(card, sectionValues);
    const dataRow = new TableRow({
      children: values.map(
        (value) =>
          new TableCell({
            shading: { type: ShadingType.SOLID, color: accent.headHex, fill: accent.headHex },
            children: [new Paragraph({ children: [new TextRun({ text: String(value), size: 16 })] })],
          }),
      ),
    });

    children.push(
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders, rows: [headerRow, dataRow] }),
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: PUBLICATIONS_BLOCK.heading, bold: true, size: 22 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: PUBLICATIONS_BLOCK.emptyMessage, italics: true, size: 18, color: "999999" })],
    }),
  );

  const doc = new Document({
    title: TITLE,
    creator: "ATARI AMS",
    sections: [{ properties: {}, children }],
    styles: { default: { document: { run: { size: 20 } } } },
  });

  return Packer.toBlob(doc);
}
