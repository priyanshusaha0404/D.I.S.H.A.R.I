import type { Lang } from "./i18n";

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, digits: number, compact = false): Intl.NumberFormat {
  const k = `${lang}|${digits}|${compact}`;
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(lang === "bn" ? "bn-IN" : "en-IN", compact
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    fmtCache.set(k, f);
  }
  return f;
}

/** Number with Indian grouping (12,34,567) and Bengali digits when the interface is in Bengali. */
export function fmt(v: number | null | undefined, lang: Lang, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return nf(lang, digits).format(v);
}
export function fmtCompact(v: number | null | undefined, lang: Lang): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return nf(lang, 1, true).format(v);
}
const BN = "০১২৩৪৫৬৭৮৯";
export function digits(s: string | number, lang: Lang): string {
  const t = String(s);
  return lang === "bn" ? t.replace(/[0-9]/g, (d) => BN[Number(d)]) : t;
}
export function fmtKm(m: number | null | undefined, lang: Lang): string {
  if (m === null || m === undefined || Number.isNaN(m)) return "—";
  return m >= 1000 ? `${fmt(m / 1000, lang, 1)} ${lang === "bn" ? "কিমি" : "km"}` : `${fmt(m, lang, 0)} ${lang === "bn" ? "মি" : "m"}`;
}
export function fmtDuration(min: number, lang: Lang): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60), m = total % 60;
  if (lang === "bn") return h ? (m ? `${digits(h, lang)} ঘণ্টা ${digits(m, lang)} মিনিট` : `${digits(h, lang)} ঘণ্টা`) : `${digits(m, lang)} মিনিট`;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
export function fmtDate(iso: string | number | Date, lang: Lang, withTime = false): string {
  const d = new Date(iso);
  return d.toLocaleString(lang === "bn" ? "bn-IN" : "en-IN", withTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
}
export const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_BN = ["জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলা", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"];
export const monthName = (m: number, lang: Lang) => (lang === "bn" ? MONTHS_BN : MONTHS_EN)[(m - 1 + 12) % 12];
