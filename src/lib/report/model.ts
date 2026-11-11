/** A report is a list of sections made of simple blocks; the same document renders to PDF, Word and Excel. */
import type { Lang } from "../i18n";

export type Block =
  | { t: "p"; text: string; muted?: boolean }
  | { t: "kv"; rows: [string, string][] }
  | { t: "table"; head: string[]; rows: (string | number)[][]; caption?: string; numeric?: boolean[]; widths?: (number | "*" | "auto")[] }
  | { t: "img"; src: string; w: number; h: number; caption?: string }
  | { t: "bullets"; items: string[] }
  | { t: "kpis"; items: { label: string; value: string; sub?: string }[]; cols?: number }
  | { t: "pb" };

export interface Section { title: string; blocks: Block[] }
export interface ReportDoc {
  title: string;
  subtitle?: string;
  lang: Lang;
  meta: [string, string][];
  sections: Section[];
  fileBase: string;
  landscape?: boolean;
  /** PNG data URL of the logo for the title block */
  logo?: string;
}
export type Format = "pdf" | "docx" | "xlsx";

export const MIME: Record<Format | "csv" | "geojson", string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
  geojson: "application/geo+json",
};

const BN = /[ঀ-৿।॥]/;
const SYM = /[→←↑↓↔≥≤≈≠√∑∞∆⌂⚑]/;
const LATIN = /[A-Za-zÀ-ɏͰ-Ͽ]/;
export type Script = "bn" | "sym" | "lat";
/** Split text into runs of one script so each run gets a font that has its glyphs. Neutral characters join the current run. */
export function scriptRuns(s: string): { text: string; script: Script }[] {
  const out: { text: string; script: Script }[] = [];
  let cur: Script | null = null, buf = "", base: Script = "lat";
  for (const ch of s) {
    let sc: Script | null = BN.test(ch) ? "bn" : SYM.test(ch) ? "sym" : LATIN.test(ch) ? "lat" : null;
    // digits, spaces and punctuation never stay in the symbol font (it has only the arrows and signs)
    if (sc === null && cur === "sym") sc = base;
    if (sc === "bn" || sc === "lat") base = sc;
    if (sc === null || sc === cur) { buf += ch; continue; }
    if (cur === null) { cur = sc; buf += ch; continue; }
    out.push({ text: buf, script: cur });
    cur = sc; buf = ch;
  }
  if (buf) out.push({ text: buf, script: cur ?? "lat" });
  return out;
}

export function csvOf(head: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) return "";
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}
