import type { jsPDF } from "jspdf";

/**
 * jspdf-autotable records where its most recent table ended on the document
 * instance (`doc.lastAutoTable.finalY`), but its typings do not declare that
 * property. Read it here once, with a real error if no table has been drawn
 * yet, instead of casting the document to `any` at every call site.
 */
export function lastTableBottom(doc: jsPDF): number {
  const last = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  if (!last) throw new Error("lastTableBottom was called before any table was drawn");
  return last.finalY;
}
