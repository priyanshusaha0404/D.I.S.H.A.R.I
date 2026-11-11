"use client";
/** Word (.docx) rendering. Bengali runs use a complex-script font so Word shapes them correctly. */
import type { Block, ReportDoc } from "./model";

const C = { forest: "123D32", muted: "5B6560", line: "D9D5C9", soft: "F3F1EA", orange: "D98A37" };
const FONT = { ascii: "Calibri", hAnsi: "Calibri", cs: "Nirmala UI", eastAsia: "Calibri" };

function dataUrlBytes(u: string): Uint8Array {
  const b = atob(u.split(",")[1] || "");
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function renderDocx(doc: ReportDoc): Promise<Blob> {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, Header, Footer, PageNumber,
    BorderStyle, ShadingType, HeadingLevel, PageOrientation, PageBreak } = d;
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
    new TextRun({ text, bold: o.bold, italics: o.italics, size: o.size ?? 20, sizeComplexScript: o.size ?? 20, color: o.color, font: FONT,
      boldComplexScript: o.bold });
  const para = (text: string, o: { bold?: boolean; size?: number; color?: string; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel] } = {}) =>
    new Paragraph({ children: [run(text, o)], spacing: { after: o.after ?? 100 }, alignment: o.align, heading: o.heading });
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const thin = { style: BorderStyle.SINGLE, size: 4, color: C.line };
  const cell = (text: string, o: { bold?: boolean; fill?: string; color?: string; right?: boolean; w?: number } = {}) => new TableCell({
    children: String(text).split("\n").map((line, k) => new Paragraph({ children: [run(line, { bold: o.bold && k === 0, size: 18, color: o.color })], alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT })),
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 }, width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
    borders: { top: thin, bottom: thin, left: none, right: none },
  });
  const pageW = doc.landscape ? 13800 : 9400; // twips available (approx.)
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  const blocks = (b: Block) => {
    switch (b.t) {
      case "p": children.push(para(b.text, { color: b.muted ? C.muted : undefined, size: b.muted ? 17 : 20 })); break;
      case "bullets": b.items.forEach((i) => children.push(new Paragraph({ children: [run(i)], bullet: { level: 0 }, spacing: { after: 40 } }))); break;
      case "kv": children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: b.rows.map(([k, v]) => new TableRow({ children: [cell(k, { color: C.muted, w: 42 }), cell(v, { bold: true, w: 58 })] })) }));
        children.push(new Paragraph({ text: "", spacing: { after: 80 } })); break;
      case "pb": children.push(new Paragraph({ children: [new PageBreak()] })); break;
      case "kpis": {
        const cols = Math.min(b.cols || 4, b.items.length);
        const rows = [];
        for (let i = 0; i < b.items.length; i += cols) {
          const cs = b.items.slice(i, i + cols).map((k) => new TableCell({
            children: [new Paragraph({ children: [run(k.label, { size: 15, color: C.muted, bold: true })] }), new Paragraph({ children: [run(k.value, { size: 28, bold: true, color: C.forest })] }),
              ...(k.sub ? [new Paragraph({ children: [run(k.sub, { size: 15, color: C.muted })] })] : [])],
            shading: { type: ShadingType.CLEAR, color: "auto", fill: C.soft }, margins: { top: 90, bottom: 90, left: 110, right: 110 },
            borders: { top: { style: BorderStyle.SINGLE, size: 18, color: "FFFFFF" }, bottom: { style: BorderStyle.SINGLE, size: 18, color: "FFFFFF" },
              left: { style: BorderStyle.SINGLE, size: 18, color: "FFFFFF" }, right: { style: BorderStyle.SINGLE, size: 18, color: "FFFFFF" } },
            width: { size: 100 / cols, type: WidthType.PERCENTAGE } }));
          while (cs.length < cols) cs.push(new TableCell({ children: [new Paragraph("")], borders: { top: none, bottom: none, left: none, right: none } }));
          rows.push(new TableRow({ children: cs }));
        }
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
        children.push(new Paragraph({ text: "", spacing: { after: 80 } }));
        break;
      }
      case "table": {
        if (b.caption) children.push(para(b.caption, { bold: true, size: 18, after: 60 }));
        const num = b.head.map((_, j) => j > 0 && b.rows.every((r) => typeof r[j] === "number" || /^[-−\d.,%\s০-৯]+$/.test(String(r[j] ?? ""))));
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
          new TableRow({ tableHeader: true, children: b.head.map((h, j) => cell(h, { bold: true, fill: C.forest, color: "FFFFFF", right: num[j] })) }),
          ...b.rows.map((r, i) => new TableRow({ children: r.map((c, j) => cell(String(c ?? ""), { fill: i % 2 ? C.soft : undefined, right: num[j] })) })),
        ] }));
        children.push(new Paragraph({ text: "", spacing: { after: 80 } }));
        break;
      }
      case "img": {
        const maxPx = doc.landscape ? 900 : 620;
        const w = Math.min(maxPx, b.w), h = (b.h / b.w) * w;
        children.push(new Paragraph({ children: [new ImageRun({ type: "png", data: dataUrlBytes(b.src), transformation: { width: w, height: h } })], spacing: { after: b.caption ? 40 : 120 } }));
        if (b.caption) children.push(para(b.caption, { size: 16, color: C.muted, after: 120 }));
        break;
      }
    }
  };
  if (doc.logo) children.push(new Paragraph({ children: [new ImageRun({ type: "png", data: dataUrlBytes(doc.logo), transformation: { width: 48, height: 48 } }),
    run("   D.I.S.H.A.R.I", { bold: true, size: 20, color: C.orange })], spacing: { after: 60 } }));
  else children.push(para("D.I.S.H.A.R.I", { bold: true, size: 18, color: C.orange, after: 40 }));
  children.push(para(doc.title, { bold: true, size: 40, color: C.forest, after: 60, heading: HeadingLevel.TITLE }));
  if (doc.subtitle) children.push(para(doc.subtitle, { size: 21, color: C.muted, after: 160 }));
  blocks({ t: "kv", rows: doc.meta });
  for (const s of doc.sections) {
    if (s.title) children.push(new Paragraph({ children: [run(s.title, { bold: true, size: 28, color: C.forest })], heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.line, space: 2 } } }));
    s.blocks.forEach(blocks);
  }
  void pageW;
  const document_ = new Document({
    creator: "D.I.S.H.A.R.I", title: doc.title, description: doc.subtitle,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: { page: { size: doc.landscape ? { orientation: PageOrientation.LANDSCAPE } : undefined, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [run(`D.I.S.H.A.R.I — Sundarbans WebGIS · ${doc.title}`, { size: 15, color: C.muted })], alignment: AlignmentType.RIGHT })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 15, color: C.muted, font: FONT })] })] }) },
      children,
    }],
  });
  return Packer.toBlob(document_);
}
