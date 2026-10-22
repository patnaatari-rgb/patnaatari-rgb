import type {
  Document as DocxDocument,
  Paragraph as DocxParagraph,
  Table as DocxTable,
} from "docx";
import {
  isRedundantTableHeading,
  splitNoteLabel,
  type ReportGrid,
  type ReportSection,
  type ReportTable,
} from "./report-types";

export type ReportWordOptions = {
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

/** Strips a data-URL prefix to the raw base64 payload docx's ImageRun wants. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Natural pixel size of a PNG or JPEG (the two allowed Module Image types) - so a photo scales to fit a frame without being squashed. */
function imagePixelSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    // PNG: IHDR width/height are big-endian at offsets 16 and 20.
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // JPEG: walk the segment markers to the first SOF frame header.
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
  }
  return null;
}

/** Fit width/height into a `maxW` x `maxH` frame, keeping the photo's own aspect ratio. */
function fitImage(bytes: Uint8Array, maxW: number, maxH: number): { width: number; height: number } {
  const size = imagePixelSize(bytes);
  if (!size || size.width <= 0 || size.height <= 0) return { width: maxW, height: Math.round(maxW * 0.62) };
  const scale = Math.min(maxW / size.width, maxH / size.height);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

const GREEN = "286C4A";

/**
 * Real downloadable Word export of the same report tree the PDF/Excel
 * exports use. Every section/subsection/table title is a real Word Heading
 * (1/2/3) so Word's Navigation Pane and the native `TableOfContents` field
 * both jump straight there. Grids render as Word tables (grouped columns
 * flatten to "Group - Label"); composite blocks and pair lists render as
 * their own heading + inner tables.
 */
export async function generateReportWord(opts: ReportWordOptions): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    TableOfContents,
    PageBreak,
    Table,
    TableRow,
    TableCell,
    WidthType,
    ShadingType,
    ImageRun,
  } = await import("docx");

  const children: (DocxParagraph | DocxTable)[] = [];

  function gridChildren(grid: ReportGrid): (DocxParagraph | DocxTable)[] {
    const out: (DocxParagraph | DocxTable)[] = [];
    const serial = !grid.noSerial;

    for (const line of grid.caption ? grid.caption.split("\n") : []) {
      out.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: line, bold: true, size: 18 })] }));
    }

    if (grid.rows.length === 0 && !grid.totalRow && !grid.keepEmpty) {
      out.push(new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: "No data available in table", italics: true, color: "999999" })] }));
      return out;
    }

    const headers = [
      ...(serial ? ["Sl. No."] : []),
      ...grid.columns.map((c) => [...(c.groups ?? []), c.label].join(" - ")),
    ];
    const bandRows = (grid.titleBands ?? []).map(
      (band, i) =>
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({
              columnSpan: headers.length,
              shading: { type: ShadingType.SOLID, color: i === 0 ? "EBEBEB" : "F5F5F5", fill: i === 0 ? "EBEBEB" : "F5F5F5" },
              children: [new Paragraph({ children: [new TextRun({ text: band, bold: true, size: 18 })] })],
            }),
          ],
        }),
    );
    const headerRow = new TableRow({
      tableHeader: true,
      children: headers.map(
        (label) =>
          new TableCell({
            shading: { type: ShadingType.SOLID, color: "F2F2F2", fill: "F2F2F2" },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 16 })] })],
          }),
      ),
    });
    const dataRows = grid.rows.map(
      (row, i) =>
        new TableRow({
          children: [...(serial ? [String(i + 1)] : []), ...grid.columns.map((c) => row[c.key] ?? "")].map(
            (v) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: v, size: 16 })] })] }),
          ),
        }),
    );
    const rows = [...bandRows, headerRow, ...dataRows];
    if (grid.totalRow) {
      rows.push(
        new TableRow({
          children: [...(serial ? [""] : []), ...grid.columns.map((c) => grid.totalRow![c.key] ?? "")].map(
            (v) =>
              new TableCell({
                shading: { type: ShadingType.SOLID, color: "EBEBEB", fill: "EBEBEB" },
                children: [new Paragraph({ children: [new TextRun({ text: v, bold: true, size: 16 })] })],
              }),
          ),
        }),
      );
    }

    out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    out.push(new Paragraph({ spacing: { after: 150 }, text: "" }));
    return out;
  }

  function pairChildren(
    pairs: { num?: string; label: string; value: string }[],
    caption?: string,
    flow?: boolean,
  ): (DocxParagraph | DocxTable)[] {
    const out: (DocxParagraph | DocxTable)[] = [];
    for (const line of caption ? caption.split("\n") : []) {
      out.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: line, bold: true, size: 18 })] }));
    }
    if (flow) {
      for (const pair of pairs) {
        out.push(new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `${pair.label} `, bold: true, italics: true, size: 16 }),
            new TextRun({ text: pair.value, size: 16 }),
          ],
        }));
      }
      return out;
    }
    const rows = pairs.map(
      (pair) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 40, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.SOLID, color: "F7F7F7", fill: "F7F7F7" },
              children: [new Paragraph({ children: [new TextRun({ text: pair.num ? `${pair.num} ${pair.label}` : pair.label, bold: true, size: 16 })] })],
            }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pair.value, size: 16 })] })] }),
          ],
        }),
    );
    out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    out.push(new Paragraph({ spacing: { after: 150 }, text: "" }));
    return out;
  }

  function tableBodyChildren(table: ReportTable): (DocxParagraph | DocxTable)[] {
    if (table.blocks) {
      const out: (DocxParagraph | DocxTable)[] = [];
      for (const block of table.blocks) {
        const centered = block.align === "center" && block.parts.length === 0;
        if (block.heading) {
          out.push(new Paragraph({
            alignment: centered ? AlignmentType.CENTER : undefined,
            spacing: { before: centered ? 200 : 120, after: centered ? 120 : 80 },
            children: [new TextRun({ text: block.heading, bold: true, size: centered ? 26 : 22 })],
          }));
        }
        for (const note of block.notes ?? []) {
          const { label, value } = splitNoteLabel(note);
          out.push(new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: label, bold: true, size: 16, color: "333333" }),
              ...(value ? [new TextRun({ text: ` ${value}`, size: 16, color: "555555" })] : []),
            ],
          }));
        }
        for (const part of block.parts) {
          out.push(...(part.kind === "grid" ? gridChildren(part) : pairChildren(part.pairs, part.caption, part.flow)));
        }
      }
      return out;
    }
    if (table.pairs) return pairChildren(table.pairs);
    return gridChildren(table);
  }

  children.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: opts.zoneLabel, bold: true, size: 40, color: GREEN })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "INDIAN COUNCIL OF AGRICULTURAL RESEARCH", size: 18, color: "666666" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Agricultural Technology Application", bold: true, size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: "Research Institute (ATARI)", bold: true, size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: opts.title, bold: true, size: 48, color: GREEN })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: opts.filterLabel ? 100 : 400 }, children: [new TextRun({ text: `Reporting Year: ${opts.reportingYearLabel}`, bold: true, size: 22 })] }),
    ...(opts.filterLabel ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: `Filters: ${opts.filterLabel}`, bold: true, size: 22 })] })] : []),
    new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `KVKS INCLUDED (${opts.kvkNames.length})`, bold: true })] }),
    new Paragraph({ spacing: { after: 400 }, children: [new TextRun({ text: opts.kvkNames.map((n, i) => `${i + 1}. ${n}`).join("   |   ") })] }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Table of Contents", bold: true, size: 32 })] }),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  for (const section of opts.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 150 }, children: [new TextRun({ text: `${section.num}. ${section.title}`, color: GREEN })] }));

    for (const sub of section.subsections) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 150, after: 100 }, children: [new TextRun({ text: `${sub.num}  ${sub.title}` })] }));

      let lastGroupCode: string | null = null;
      for (const table of sub.tables) {
        if (table.groupCode && table.groupCode !== lastGroupCode) {
          children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 100, after: 60 }, children: [new TextRun({ text: `${table.groupCode}  ${table.groupTitle ?? ""}` })] }));
          lastGroupCode = table.groupCode;
        }
        if (!table.groupCode) lastGroupCode = null;

        if (!isRedundantTableHeading(sub, table)) {
          children.push(
            new Paragraph({
              heading: table.groupCode ? HeadingLevel.HEADING_4 : HeadingLevel.HEADING_3,
              spacing: { before: 100, after: 80 },
              children: [new TextRun({ text: `${table.code}  ${table.title}` })],
            }),
          );
        }

        children.push(...tableBodyChildren(table));
      }

      const imgs = (sub.images ?? []).filter((im) => opts.images?.has(im.url));
      if (imgs.length > 0) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 60 }, children: [new TextRun({ text: `Photographs (${imgs.length})` })] }));
        for (const im of imgs) {
          try {
            const data = opts.images!.get(im.url)!;
            const type = /^data:image\/(png|jpe?g|gif|bmp)/i.exec(data)?.[1]?.toLowerCase().replace("jpeg", "jpg") ?? "jpg";
            const bytes = dataUrlToBytes(data);
            children.push(
              new Paragraph({
                spacing: { after: 20 },
                children: [new ImageRun({ data: bytes, type: type as "png" | "jpg" | "gif" | "bmp", transformation: fitImage(bytes, 380, 280) })],
              }),
            );
          } catch {
            // Skip an image that fails to decode rather than aborting the whole doc.
          }
          children.push(new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({ text: im.caption || "Untitled", bold: true, size: 16 }),
              ...([im.category, im.date].filter(Boolean).length
                ? [new TextRun({ text: `   ${[im.category, im.date].filter(Boolean).join("  |  ")}`, size: 15, color: "777777" })]
                : []),
            ],
          }));
        }
      }
    }
  }

  const doc: DocxDocument = new Document({
    sections: [{ properties: {}, children }],
    styles: { default: { document: { run: { size: 20 } } } },
  });

  return Packer.toBlob(doc);
}
