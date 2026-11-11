"use client";
import { downloadBlob, safeName } from "../map/export";
import { csvOf, MIME, type Format, type ReportDoc } from "./model";

export type { Block, Format, ReportDoc, Section } from "./model";

let logo: Promise<string | undefined> | null = null;
/** the D.I.S.H.A.R.I mark for the title block of every report (from the site itself, so it works offline) */
function logoPng(): Promise<string | undefined> {
  if (!logo) logo = fetch("/icons/icon-192.png").then((r) => (r.ok ? r.blob() : Promise.reject(new Error("logo")))).then((b) => new Promise<string>((ok, err) => {
    const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => err(fr.error); fr.readAsDataURL(b);
  })).catch(() => { logo = null; return undefined; });
  return logo;
}

export async function exportReport(doc: ReportDoc, format: Format) {
  if (!doc.logo && format !== "xlsx") doc = { ...doc, logo: await logoPng() };
  let blob: Blob;
  if (format === "pdf") blob = await (await import("./pdf")).renderPdf(doc);
  else if (format === "docx") blob = await (await import("./docx")).renderDocx(doc);
  else blob = await (await import("./xlsx")).renderXlsx(doc);
  const ext = format === "docx" ? "docx" : format;
  downloadBlob(blob, `${safeName(doc.fileBase)}.${ext}`);
}

export type DataFormat = "csv" | "xlsx" | "geojson";
export async function exportTable(name: string, head: string[], rows: (string | number | null)[][], format: "csv" | "xlsx") {
  if (format === "csv") downloadBlob(new Blob([csvOf(head, rows)], { type: MIME.csv }), `${safeName(name)}.csv`);
  else downloadBlob(await (await import("./xlsx")).tableXlsx(name, head, rows), `${safeName(name)}.xlsx`);
}
export function exportGeoJSON(name: string, fc: GeoJSON.FeatureCollection) {
  downloadBlob(new Blob([JSON.stringify(fc)], { type: MIME.geojson }), `${safeName(name)}.geojson`);
}
