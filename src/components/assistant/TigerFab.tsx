"use client";
/** The tiger button: welcomes people as soon as they arrive and now and then offers help with a little roar. */
import { useEffect, useRef, useState } from "react";
import { X } from "@/components/icons";
import { useApp } from "@/lib/app-context";
import { getAssistant, openAssistant, useAssistant } from "@/lib/assistant/store";
import { getUI } from "@/lib/ui";
import { getTrip } from "@/lib/trip/store";
import { Tiger } from "./Tiger";

type Line = [string, string, string, string];   // en, en small, bn, bn small
const WELCOME: Line = ["Namaskar! 🐯 Welcome to the Sundarbans.", "Ask me anything — I'll plan your trip.", "নমস্কার! 🐯 সুন্দরবনে স্বাগতম।", "যা খুশি জিজ্ঞেস করুন — যাত্রা আমি সাজিয়ে দেব।"];
const GENERAL: Line[] = [
  ["Need any help?", "Type, speak or send a photo.", "কোনো সাহায্য লাগবে?", "লিখুন, বলুন বা একটা ছবি পাঠান।"],
  ["Going for honey, fish or crab?", "I'll mark the best spots from the model.", "মধু, মাছ না কাঁকড়া আনতে যাবেন?", "মডেল থেকে সেরা জায়গা দেখিয়ে দেব।"],
  ["Want the safest boat route?", "Just say from where to where.", "সবচেয়ে নিরাপদ নৌপথ চান?", "শুধু বলুন কোথা থেকে কোথায়।"],
  ["Something happened? Send me a photo.", "I'll understand it and help right away.", "কিছু হয়েছে? ছবি তুলে পাঠান।", "বুঝে এখনই সাহায্য করব।"],
  ["Curious about a block?", "Ask me — population, ghats, hospitals …", "কোনো ব্লক সম্পর্কে জানতে চান?", "জিজ্ঞেস করুন — জনসংখ্যা, ঘাট, হাসপাতাল …"],
];
const BY_DRAWER: Record<string, Line> = {
  trip: ["Shall I plan this trip for you?", "Say e.g. “Gosaba theke modhu ante jabo”.", "যাত্রাটা আমি সাজিয়ে দেব?", "যেমন বলুন “গোসাবা থেকে মধু আনতে যাব”।"],
  pois: ["Looking for a hospital or a ghat?", "Ask me for the nearest one.", "হাসপাতাল বা ঘাট খুঁজছেন?", "কাছেরটা আমাকে জিজ্ঞেস করুন।"],
  dash: ["Want a block report?", "Ask me — PDF, Word or Excel.", "ব্লকের রিপোর্ট চাই?", "বলুন — PDF, Word বা Excel।"],
  near: ["Need help nearby?", "Ask me for emergency numbers too.", "কাছে সাহায্য দরকার?", "জরুরি নম্বরও জিজ্ঞেস করুন।"],
};
const MAX = 6;

export default function TigerFab() {
  const { lang, L } = useApp();
  const open = useAssistant((s) => s.open);
  const unread = useAssistant((s) => s.unread);
  const [roar, setRoar] = useState(0);
  const [bubble, setBubble] = useState<Line | null>(null);
  const shown = useRef(0), dismissed = useRef(false), k = useRef(Math.floor(Math.random() * GENERAL.length));
  const hideT = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const show = (line: Line, sound: boolean) => {
      if (getAssistant().open || dismissed.current) return;
      setBubble(line); setRoar((r) => r + 1); shown.current++;
      clearTimeout(hideT.current);
      hideT.current = setTimeout(() => setBubble(null), 9000);
    };
    const first = setTimeout(() => show(WELCOME, false), 1500);
    let next: ReturnType<typeof setTimeout>;
    const loop = () => {
      next = setTimeout(() => {
        const st = getAssistant();
        if (shown.current < MAX && !st.open && Date.now() - st.lastUse > 60000 && document.visibilityState === "visible") {
          const d = getUI().drawer;
          const line = d && BY_DRAWER[d] && Math.random() < 0.6 ? BY_DRAWER[d] : d === "trip" || getTrip().stops.length ? BY_DRAWER.trip : GENERAL[k.current++ % GENERAL.length];
          show(line, true);
        }
        if (shown.current < MAX) loop();
      }, 75000 + Math.random() * 45000);
    };
    loop();
    return () => { clearTimeout(first); clearTimeout(next); clearTimeout(hideT.current); };
  }, []);
  useEffect(() => { if (open) setBubble(null); }, [open]);

  if (open) return null;
  const go = () => { setBubble(null); setRoar((r) => r + 1); setTimeout(() => openAssistant(true), 380); };
  const bn = lang === "bn";
  return (
    <>
      {bubble && (
        <div className="tiger-nudge" role="status" onClick={go}>
          {bn ? bubble[2] : bubble[0]}<small>{bn ? bubble[3] : bubble[1]}</small>
          <button className="absolute right-1.5 top-1.5 rounded-full p-1 opacity-60 hover:bg-black/10 hover:opacity-100" aria-label={L("Close", "বন্ধ")}
            onClick={(e) => { e.stopPropagation(); setBubble(null); dismissed.current = shown.current >= 2; }}><X size={13} /></button>
        </div>)}
      <button className="tiger-fab" onClick={go} aria-label={L("Open the assistant", "সহায়ক খুলুন")} title={L("Assistant — ask me anything", "সহায়ক — যা খুশি জিজ্ঞেস করুন")}>
        <Tiger size={62} roar={roar} />
        <span className="fab-ring" /><span className="fab-ring r2" />
        {unread && <i className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full bg-risk ring-2 ring-white" />}
      </button>
    </>
  );
}
