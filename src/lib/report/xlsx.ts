"use client";
/** Excel (.xlsx): a Summary sheet plus one sheet per table of the report; datasets go to a single sheet. */
import type { ReportDoc } from "./model";

type Cell = { value: string | number | null; type?: StringConstructor | NumberConstructor; fontWeight?: "bold"; backgroundColor?: string; color?: string; wrap?: boolean } | null;
type Sheet = Cell[][];

const sheetName = (s: string, used: Set<string>) => {
  let n = s.replace(/[\\/*?:[\]]/g, " ").slice(0, 28).trim() || "Sheet";
  let k = 2;
  const b = n;
  while (used.has(n)) n = `${b.slice(0, 25)} ${k++}`;
  used.add(n);
  return n;
};
const asCell = (v: string | number | null | undefined, bold = false, parse = false): Cell => {
  if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return { value: null };
  if (typeof v === "number") return { value: v, type: Number, fontWeight: bold ? "bold" : undefined };
  // formatted numbers in report tables ("1,23,456", "22.5", Bengali digits) are stored as numbers
  if (!parse) return { value: v, type: String, fontWeight: bold ? "bold" : undefined };
  const latin = v.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/,/g, "").replace(/−/g, "-").trim();
  if (/^-?\d+(\.\d+)?$/.test(latin) && latin.length < 16) return { value: Number(latin), type: Number, fontWeight: bold ? "bold" : undefined };
  return { value: v, type: String, fontWeight: bold ? "bold" : undefined };
};
const head = (h: string): Cell => ({ value: h, type: String, fontWeight: "bold", backgroundColor: "#123D32", color: "#F6F5EF" });

export async function renderXlsx(doc: ReportDoc): Promise<Blob> {
  const sheets: Sheet[] = [];
  const names: string[] = [];
  const used = new Set<string>();
  const summary: Sheet = [[{ value: doc.title, type: String, fontWeight: "bold" }], ...(doc.subtitle ? [[asCell(doc.subtitle)]] : []), [null],
    ...doc.meta.map(([k, v]) => [asCell(k, true), asCell(v, false, true)])];
  for (const s of doc.sections) {
    const kv = s.blocks.filter((b) => b.t === "kv" || b.t === "kpis");
    if (!kv.length) continue;
    if (s.title) summary.push([null], [{ value: s.title, type: String, fontWeight: "bold" }]);
    for (const b of kv) {
      if (b.t === "kv") b.rows.forEach(([k, v]) => summary.push([asCell(k), asCell(v, false, true)]));
      if (b.t === "kpis") b.items.forEach((k) => summary.push([asCell(k.label), asCell(k.value, false, true), asCell(k.sub)]));
    }
  }
  sheets.push(summary); names.push(sheetName("Summary", used));
  for (const s of doc.sections) {
    s.blocks.forEach((b) => {
      if (b.t !== "table") return;
      sheets.push([b.head.map(head), ...b.rows.map((r) => r.map((c) => asCell(c, false, true)))]);
      names.push(sheetName(b.caption || s.title, used));
    });
  }
  return xlsxBlob(sheets, names);
}

/** One table to one sheet (datasets). Numbers stay numbers so they can be analysed in Excel. */
export async function tableXlsx(title: string, header: string[], rows: (string | number | null)[][]): Promise<Blob> {
  return xlsxBlob([[header.map(head), ...rows.map((r) => r.map((c) => asCell(c)))]], [sheetName(title, new Set())]);
}

async function xlsxBlob(sheets: Sheet[], names: string[]): Promise<Blob> {
  const mod = await import("write-excel-file");
  const write = (mod.default || mod) as unknown as (data: unknown, o: Record<string, unknown>) => Promise<Blob>;
  const columns = sheets.map((sh) => {
    const n = Math.max(...sh.map((r) => r.length));
    return Array.from({ length: n }, (_, j) => ({ width: Math.min(48, Math.max(10, ...sh.slice(0, 200).map((r) => String(r[j]?.value ?? "").length + 2))) }));
  });
  if (sheets.length === 1) return write(sheets[0], { sheet: names[0], columns: columns[0], fontFamily: "Calibri", fontSize: 11 });
  return write(sheets, { sheets: names, columns, fontFamily: "Calibri", fontSize: 11 });
}
