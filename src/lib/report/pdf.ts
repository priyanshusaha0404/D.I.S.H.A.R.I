"use client";
/** PDF rendering with pdfmake and embedded Noto fonts (Latin + Bengali, shaped correctly). Works offline. */
import type { Content, TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
import { scriptRuns, type Block, type ReportDoc } from "./model";

type PdfMake = typeof import("pdfmake/build/pdfmake");
let pm: Promise<PdfMake> | null = null;

const FILES = ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf", "NotoSansBengali-Regular.ttf", "NotoSansBengali-Bold.ttf", "Symbols-Regular.ttf", "Symbols-Bold.ttf"];
function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function pdfmake(): Promise<PdfMake> {
  if (!pm) {
    pm = (async () => {
      const mod = (await import("pdfmake/build/pdfmake")) as unknown as { default?: PdfMake } & PdfMake;
      const p = (mod.default || mod) as PdfMake & { vfs: Record<string, string>; fonts: Record<string, unknown> };
      const vfs: Record<string, string> = {};
      await Promise.all(FILES.map(async (f) => {
        const r = await fetch(`/fonts/pdf/${f}`);
        if (!r.ok) throw new Error(`font ${f}`);
        vfs[f] = b64(await r.arrayBuffer());
      }));
      p.vfs = vfs;
      p.fonts = {
        Noto: { normal: "NotoSans-Regular.ttf", bold: "NotoSans-Bold.ttf", italics: "NotoSans-Regular.ttf", bolditalics: "NotoSans-Bold.ttf" },
        NotoBn: { normal: "NotoSansBengali-Regular.ttf", bold: "NotoSansBengali-Bold.ttf", italics: "NotoSansBengali-Regular.ttf", bolditalics: "NotoSansBengali-Bold.ttf" },
        Sym: { normal: "Symbols-Regular.ttf", bold: "Symbols-Bold.ttf", italics: "Symbols-Regular.ttf", bolditalics: "Symbols-Bold.ttf" },
      };
      return p;
    })();
    pm.catch(() => { pm = null; });
  }
  return pm;
}

const FONT = { bn: "NotoBn", sym: "Sym", lat: "Noto" } as const;
/** text with per-script fonts */
export function tx(s: string | number, extra: Record<string, unknown> = {}): Content {
  const str = String(s ?? "");
  const runs = scriptRuns(str);
  if (runs.length <= 1) return { text: str, font: FONT[runs[0]?.script || "lat"], ...extra } as Content;
  return { text: runs.map((r) => ({ text: r.text, font: FONT[r.script] })), ...extra } as Content;
}

const C = { forest: "#123D32", ink: "#16201c", muted: "#5b6560", line: "#d9d5c9", soft: "#f3f1ea" };

function block(b: Block, width: number): Content[] {
  switch (b.t) {
    case "p": return [tx(b.text, { margin: [0, 0, 0, 6], color: b.muted ? C.muted : C.ink, fontSize: b.muted ? 8.5 : 10, lineHeight: 1.25 })];
    case "bullets": return [{ ul: b.items.map((i) => tx(i, { margin: [0, 1, 0, 1] })), margin: [0, 0, 0, 6], fontSize: 10 } as Content];
    case "kv": return [{
      table: { widths: ["42%", "*"], body: b.rows.map(([k, v]) => [tx(k, { color: C.muted }), tx(v, { bold: true })]) },
      layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => C.line, paddingTop: () => 3, paddingBottom: () => 3 },
      fontSize: 9.5, margin: [0, 0, 0, 8],
    } as Content];
    case "pb": return [{ text: "", pageBreak: "after" } as Content];
    case "kpis": {
      const cols = Math.min(b.cols || 4, b.items.length);
      const rows: TableCell[][] = [];
      for (let i = 0; i < b.items.length; i += cols) {
        const r: TableCell[] = b.items.slice(i, i + cols).map((k) => ({ stack: [tx(k.label, { fontSize: 7.5, color: C.muted, bold: true }), tx(k.value, { fontSize: cols > 4 ? 12 : 14, bold: true, color: C.forest, margin: [0, 2, 0, 0] }),
          ...(k.sub ? [tx(k.sub, { fontSize: 7.5, color: C.muted })] : [])], fillColor: C.soft, margin: [6, 6, 6, 6] } as TableCell));
        while (r.length < cols) r.push({ text: "" });
        rows.push(r);
      }
      return [{ table: { widths: Array(cols).fill("*"), body: rows }, layout: { hLineWidth: () => 2, vLineWidth: () => 2, hLineColor: () => "#ffffff", vLineColor: () => "#ffffff" }, margin: [0, 0, 0, 10] } as Content];
    }
    case "table": {
      const num = b.numeric || b.head.map((_, j) => j > 0 && b.rows.every((r) => typeof r[j] === "number" || /^[-−\d.,%\s০-৯]+$/.test(String(r[j] ?? ""))));
      const body: TableCell[][] = [b.head.map((h, j) => tx(h, { bold: true, color: "#ffffff", fillColor: C.forest, alignment: num[j] ? "right" : "left" }) as TableCell),
        ...b.rows.map((r, i) => r.map((c, j) => tx(c ?? "", { alignment: num[j] ? "right" : "left", fillColor: i % 2 ? C.soft : null }) as TableCell))];
      const out: Content[] = [];
      if (b.caption) out.push(tx(b.caption, { bold: true, fontSize: 9, margin: [0, 2, 0, 3] }));
      out.push({ table: { headerRows: 1, widths: b.widths || b.head.map((_, j) => (j === 0 ? "*" : "auto")), body, dontBreakRows: true },
        layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => C.line, paddingTop: () => 2.5, paddingBottom: () => 2.5, paddingLeft: () => 4, paddingRight: () => 4 },
        fontSize: b.rows.length > 25 || b.head.length > 6 ? 7.5 : 8.5, margin: [0, 0, 0, 10] } as Content);
      return out;
    }
    case "img": {
      const w = Math.min(width, b.w);
      return [{ image: b.src, width: w, margin: [0, 2, 0, b.caption ? 2 : 10] } as Content, ...(b.caption ? [tx(b.caption, { fontSize: 8, color: C.muted, margin: [0, 0, 0, 10] })] : [])];
    }
  }
}

export function docDefinition(doc: ReportDoc): TDocumentDefinitions {
  const width = doc.landscape ? 762 : 515;
  const titleBlock: Content[] = [
    tx("D.I.S.H.A.R.I", { fontSize: 9, bold: true, color: "#D98A37", characterSpacing: 1.5 }),
    tx(doc.title, { fontSize: 20, bold: true, color: C.forest, margin: [0, 2, 0, 2] }),
    ...(doc.subtitle ? [tx(doc.subtitle, { fontSize: 10.5, color: C.muted, margin: [0, 0, 0, 8] })] : []),
  ];
  const gen = doc.meta.find((m) => /Generated|তৈরি/.test(m[0]));
  const content: Content[] = [
    { canvas: [{ type: "rect", x: 0, y: 0, w: width, h: 4, color: C.forest }], margin: [0, 0, 0, 10] } as Content,
    doc.logo ? { columns: [{ image: doc.logo, width: 46, height: 46, margin: [0, 2, 10, 0] }, { stack: titleBlock, width: "*" },
      ...(gen ? [{ stack: [tx(gen[0], { fontSize: 7.5, color: C.muted, alignment: "right" }), tx(gen[1], { fontSize: 8.5, alignment: "right" })], width: 120 }] : [])], columnGap: 4 } as Content
      : { stack: titleBlock } as Content,
    ...block({ t: "kv", rows: doc.logo && gen ? doc.meta.filter((m) => m !== gen) : doc.meta }, width),
  ];
  for (const s of doc.sections) {
    if (s.title) content.push(tx(s.title, { fontSize: 13.5, bold: true, color: C.forest, margin: [0, 10, 0, 6], headlineLevel: 1 }));
    for (const b of s.blocks) content.push(...block(b, width));
  }
  return {
    pageSize: "A4", pageOrientation: doc.landscape ? "landscape" : "portrait", pageMargins: [40, 46, 40, 44],
    defaultStyle: { font: "Noto", fontSize: 10, color: C.ink },
    info: { title: doc.title, author: "D.I.S.H.A.R.I", subject: doc.subtitle || doc.title, creator: "D.I.S.H.A.R.I Sundarbans WebGIS" },
    header: (page: number) => page === 1 ? { text: "" } : { columns: [tx("D.I.S.H.A.R.I — Sundarbans WebGIS", { fontSize: 7.5, color: C.muted }), tx(doc.title, { fontSize: 7.5, color: C.muted, alignment: "right" })], margin: [40, 22, 40, 0] },
    footer: (page: number, pages: number) => ({ columns: [tx(doc.meta.find((m) => /Generated|তৈরি/.test(m[0]))?.[1] || "", { fontSize: 7.5, color: C.muted }),
      tx(`${page} / ${pages}`, { fontSize: 7.5, color: C.muted, alignment: "right" })], margin: [40, 14, 40, 0] }),
    pageBreakBefore: (node, following) => {
      const n = node as unknown as { headlineLevel?: number; startPosition?: { top: number } };
      const f = following as unknown as unknown[];
      return n.headlineLevel === 1 && (n.startPosition?.top ?? 0) > 690 && f.length > 0;
    },
    content,
  } as TDocumentDefinitions;
}

export async function renderPdf(doc: ReportDoc): Promise<Blob> {
  const p = await pdfmake();
  const def = docDefinition(doc);
  return new Promise((ok, err) => {
    try {
      (p.createPdf(def) as unknown as { getBlob: (cb: (b: Blob) => void) => void }).getBlob((b) => ok(b));
    } catch (e) { err(e); }
  });
}

/** Single-page map sheet (A4 or A3, landscape). */
export async function mapSheetPdf(img: string, w: number, h: number, title: string, size: "A4" | "A3"): Promise<Blob> {
  const p = await pdfmake();
  const pageW = size === "A3" ? 1190.55 : 841.89, pageH = size === "A3" ? 841.89 : 595.28;
  const maxW = pageW - 48, maxH = pageH - 48;
  const s = Math.min(maxW / w, maxH / h);
  const def: TDocumentDefinitions = { pageSize: size, pageOrientation: "landscape", pageMargins: [24, 24, 24, 24], defaultStyle: { font: "Noto" },
    info: { title, author: "D.I.S.H.A.R.I" }, content: [{ image: img, width: w * s, height: h * s, alignment: "center" } as Content] };
  return new Promise((ok) => (p.createPdf(def) as unknown as { getBlob: (cb: (b: Blob) => void) => void }).getBlob(ok));
}
