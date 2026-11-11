"use client";
/** Voice guide with the browser's own speech (works offline where the voices are installed — Microsoft Edge has
 *  natural Bengali and Indian-English voices). */
import type { Lang } from "../i18n";

export const voiceOk = () => typeof window !== "undefined" && "speechSynthesis" in window;
let voices: SpeechSynthesisVoice[] = [];
function refresh() { try { voices = window.speechSynthesis.getVoices(); } catch { voices = []; } }
if (voiceOk()) { refresh(); window.speechSynthesis.onvoiceschanged = refresh; }

export function voiceFor(lang: Lang): SpeechSynthesisVoice | null {
  if (!voices.length) refresh();
  const pref = lang === "bn" ? ["bn-IN", "bn-BD", "bn"] : ["en-IN", "en-GB", "en-US", "en"];
  for (const p of pref) {
    const v = voices.filter((x) => x.lang.replace("_", "-").toLowerCase().startsWith(p.toLowerCase()));
    if (v.length) return v.find((x) => /natural|neural|online/i.test(x.name)) || v[0];
  }
  return null;
}
export const hasBengaliVoice = () => !!voiceFor("bn");

export function say(text: string, lang: Lang, opts: { flush?: boolean; onend?: () => void } = {}) {
  if (!voiceOk() || !text) { opts.onend?.(); return; }
  const s = window.speechSynthesis;
  if (opts.flush) s.cancel();
  const v = voiceFor(lang) || voiceFor("en");
  const u = new SpeechSynthesisUtterance(text);
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === "bn" ? "bn-IN" : "en-IN";
  u.rate = lang === "bn" ? 0.98 : 1.0;
  u.onend = () => opts.onend?.();
  u.onerror = () => opts.onend?.();
  s.speak(u);
}
export function stopVoice() { if (voiceOk()) window.speechSynthesis.cancel(); }

const BN_D = "০১২৩৪৫৬৭৮৯";
const bnNum = (s: string) => s.replace(/[0-9]/g, (d) => BN_D[Number(d)]);
export function spokenKm(km: number, lang: Lang) {
  if (km < 1) { const m = Math.round((km * 1000) / 10) * 10; return lang === "bn" ? `${bnNum(String(m))} মিটার` : `${m} metres`; }
  const v = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return lang === "bn" ? `${bnNum(String(v))} কিলোমিটার` : `${v} kilometres`;
}
export function spokenMin(min: number, lang: Lang) {
  const t = Math.max(1, Math.round(min)), h = Math.floor(t / 60), m = t % 60;
  if (lang === "bn") return [h ? `${bnNum(String(h))} ঘণ্টা` : "", m ? `${bnNum(String(m))} মিনিট` : ""].filter(Boolean).join(" ");
  return [h ? `${h} hour${h > 1 ? "s" : ""}` : "", m ? `${m} minute${m > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
}
export function spokenTime(ms: number, lang: Lang) {
  const d = new Date(ms);
  if (lang !== "bn") return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const h = d.getHours(), m = d.getMinutes(), h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 4 ? "রাত" : h < 6 ? "ভোর" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকাল" : h < 20 ? "সন্ধ্যা" : "রাত";
  return `${part} ${bnNum(String(h12))}টা${m ? ` ${bnNum(String(m))} মিনিট` : ""}`;
}

type P = Record<string, string>;
const T: Record<string, [string, string]> = {
  start: ["Starting your trip from {from}.", "{from} থেকে আপনার যাত্রা শুরু হচ্ছে।"],
  boat: ["Take the {vessel} for {d}{via} to {to}. About {m}.", "{via}{to} পর্যন্ত {vessel}য় {d} যান। প্রায় {m}।"],
  walk: ["Walk {d} to {to}. About {m}.", "{to} পর্যন্ত {d} হাঁটুন। প্রায় {m}।"],
  change: ["At {at}, change from {a} to {b}.", "{at}-এ {a} থেকে {b}য় বদল করুন।"],
  arrive: ["You have arrived at {name}. Stay {m}.", "আপনি {name}-এ পৌঁছেছেন। {m} থাকুন।"],
  arriveNoStay: ["You have arrived at {name}.", "আপনি {name}-এ পৌঁছেছেন।"],
  done: ["You have reached {name}. Your trip is complete.", "আপনি {name}-এ পৌঁছেছেন। যাত্রা সম্পূর্ণ।"],
  paused: ["Paused. Here is what is around you.", "থামানো হয়েছে। আশেপাশে কী আছে দেখুন।"],
  near: ["{name} is {d} ahead.", "{name} আর {d} দূরে।"],
  off: ["You are off the planned route.", "আপনি পরিকল্পিত পথ থেকে সরে গেছেন।"],
  live: ["Live tracking is on.", "লাইভ ট্র্যাকিং চালু হয়েছে।"],
};
export function phrase(key: keyof typeof T, lang: Lang, p: P = {}) {
  let s = T[key][lang === "bn" ? 1 : 0];
  for (const [k, v] of Object.entries(p)) s = s.split(`{${k}}`).join(v);
  return lang === "bn" ? s.replace(/ঘাট-এর/g, "ঘাটের").replace(/ঘাট-এ/g, "ঘাটে").replace(/ঘাট-তে/g, "ঘাটে") : s;
}
