"use client";
/** Gives the agents the site language and theme and a way to open the right drawer (the site is one map page). */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { useAssistant } from "@/lib/assistant/store";
import type { Env } from "@/lib/assistant/agents";
import { getUI, openDrawer, type Drawer } from "@/lib/ui";

const Panel = dynamic(() => import("./AssistantPanel"), { ssr: false });
const TO: Record<string, Drawer> = { "/route": "trip", "/dashboard": "dash", "/my": "saved", "/reports": "dash", "/pois": "pois", "/nearby": "near" };
const FROM: Record<string, string> = { trip: "/route/", dash: "/dashboard/", saved: "/my/", near: "/nearby/", pois: "/pois/" };
const clean = (p: string) => p.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";

export default function AssistantHost() {
  const open = useAssistant((s) => s.open);
  const queue = useAssistant((s) => s.queue);
  const [ever, setEver] = useState(false);
  useEffect(() => { if (open || queue) setEver(true); }, [open, queue]);
  const { lang, setLang, theme, setTheme } = useApp();
  const env = useMemo<Env>(() => ({ lang, theme: theme === "dark" ? "dark" : "light", setLang, setTheme: (t) => setTheme(t),
    go: async (href: string) => { const d = TO[clean(href)] ?? null; if (getUI().drawer !== d) { openDrawer(d); await new Promise((r) => setTimeout(r, 450)); } },
    path: () => FROM[getUI().drawer || ""] || "/" }), [lang, theme, setLang, setTheme]);
  return ever ? <Panel env={env} /> : null;
}
