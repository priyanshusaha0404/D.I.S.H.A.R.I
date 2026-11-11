"use client";
/** Runs one request through the team: the coordinator (or the connected AI model) makes the plan, each agent does its
 *  job in turn and the chat shows every step live — who is working, what came out, buttons and suggestions. */
import type { Lang } from "../i18n";
import { say, stopVoice } from "../trip/voice";
import { AGENTS, isOut, jobLabel, L, mem, runJob, type Env, type Out } from "./agents";
import { INTENT, norm } from "./nlu";
import { replyLang, understand, type Plan } from "./router";
import { getAssistant, msgId, patchMsg, pushMsg, setAi, setBusy, type Img, type Action, type AgentId, type Chip, type Msg, type Part, type Step } from "./store";

const agentName = (a: AgentId, lang: Lang) => (lang === "bn" ? AGENTS[a].bn : AGENTS[a].en);
const plain = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

function history(): { role: "user" | "assistant"; text: string }[] {
  return getAssistant().msgs.slice(-10).map((m) => ({ role: m.role, text: m.role === "user" ? m.text || "" : plain(m.parts.filter((p) => p.k === "text").map((p) => (p as { text: string }).text).join(" ")).slice(0, 400) }))
    .filter((h) => h.text);
}

export async function ask(raw: string, env: Env, images: Img[] = []) {
  const text = raw.trim().slice(0, 1200);
  if ((!text && !images.length) || getAssistant().busy) return;
  stopVoice();
  const hist = history();
  pushMsg({ id: msgId(), role: "user", text, images: images.map((im) => im.url), lang: env.lang, steps: [], parts: [], actions: [], chips: [], done: true });
  const lang0 = replyLang(text, env.lang);
  const id = msgId();
  const steps: Step[] = [{ agent: "router", text: L(lang0)("Reading your message…", "আপনার বার্তা পড়ছি…"), status: "run" }];
  const parts: Part[] = [];
  const actions: Action[] = [];
  let chips: Chip[] = [];
  let lang: Lang = lang0;
  const show = () => patchMsg(id, { steps: steps.map((s) => ({ ...s })), parts: [...parts], actions: [...actions], chips: [...chips], lang });
  pushMsg({ id, role: "assistant", lang: lang0, steps: [...steps], parts: [], actions: [], chips: [], done: false });
  setBusy(true);
  /** put one agent result into this answer; false when the chain has to stop (a question or a failure) */
  const take = (out: Out, i: number): boolean => {
    if (out.ask) { steps[i].status = "ask"; mem.pending = out.ask.pending; parts.push({ k: "text", text: out.ask.q }); chips = out.ask.chips; show(); return false; }
    if (out.fail) { steps[i].status = "fail"; parts.push({ k: "note", text: out.fail }); if (out.chips) chips = out.chips; show(); return false; }
    steps[i].status = "ok";
    if (out.parts) parts.push(...out.parts);
    if (out.note) parts.push({ k: "note", text: out.note });
    for (const a of out.actions || []) if (!actions.some((x) => x.label === a.label) && actions.length < 7) actions.push(a);
    if (out.chips?.length) chips = out.chips;
    show();
    return true;
  };
  mem.turn++;
  const placeBefore = mem.place;
  try {
    // "yes" / "do it" / "koro" runs the main button of the last answer
    if (!images.length && INTENT.yes.test(norm(text))) {
      const last = [...getAssistant().msgs].reverse().find((m) => m.role === "assistant" && m.id !== id && m.actions.some((a) => a.primary));
      const act = last?.actions.find((a) => a.primary);
      if (act && !mem.pending) {
        steps[0] = { agent: "router", text: L(lang)(`Doing: ${act.label}`, `করছি: ${act.label}`), status: "ok" };
        show();
        const r = await act.run();
        if (isOut(r)) take(r, steps.push({ agent: r.agent || "router", text: act.label, status: "run" }) - 1);
        else parts.push({ k: "text", text: L(lang)("Done.", "হয়ে গেছে।") });
        return;
      }
    }

    let plan: Plan | null = null;
    const { aiAvailable } = await import("./llm");
    const aiOn = await aiAvailable();
    setAi(aiOn);
    if (aiOn) {
      steps.push({ agent: "ai", text: images.length ? L(lang)("Looking at your photo…", "আপনার ছবি দেখছি…") : L(lang)("Thinking…", "ভাবছি…"), status: "run" });
      show();
      try {
        const { llmPlan } = await import("./llm");
        const r = await llmPlan(text || L(lang)("What do you see? Help me.", "ছবিতে কী দেখছ? আমাকে সাহায্য করো।"), lang0, hist, env.path(), images);
        if (r.plan.jobs.length || r.plan.say) { plan = r.plan; steps[steps.length - 1] = { agent: "ai", text: images.length ? L(lang)("Photo understood", "ছবি বোঝা গেছে") : L(lang)("Understood", "বুঝেছি"), status: "ok" }; }
        else steps.pop();
        if (r.missing.length) parts.push({ k: "note", text: L(lang)(`Not found on the map: ${r.missing.join(", ")}`, `মানচিত্রে পাওয়া যায়নি: ${r.missing.join(", ")}`) });
      } catch (e) {
        console.warn("AI model", e);
        steps.pop();
      }
    }
    if (!plan && images.length && !text) {
      steps[0] = { agent: "router", text: L(lang)("Photo received", "ছবি পেয়েছি"), status: "ok" };
      parts.push({ k: "text", text: L(lang)("I got your photo. Tell me in a few words what is happening or what you need — I'll help right away.", "ছবিটি পেয়েছি। কী হচ্ছে বা কী দরকার কয়েকটি কথায় বলুন — এখনই সাহায্য করছি।") });
      chips = [{ label: L(lang)("Emergency help", "জরুরি সাহায্য"), send: L(lang)("emergency help near me", "আমার কাছে জরুরি সাহায্য") }, { label: L(lang)("Nearest hospital", "কাছের হাসপাতাল"), send: L(lang)("nearest hospital to me", "আমার কাছের হাসপাতাল") }];
      show();
      return;
    }
    if (!plan) plan = await understand(text, env.lang);
    lang = plan.lang;
    const lx = L(lang);
    const team = [...new Set(plan.jobs.map((j) => j.a as AgentId))];
    steps[0] = { agent: "router", text: team.length ? lx(`Plan: ${team.map((a) => agentName(a, "en")).join(" → ")}`, `পরিকল্পনা: ${team.map((a) => agentName(a, "bn")).join(" → ")}`) : lx("Understood", "বুঝেছি"), status: "ok" };
    if (plan.say) parts.push({ k: "text", text: plan.say });
    if (plan.chips) chips = plan.chips;
    show();

    const envL: Env = { ...env, lang };
    for (const job of plan.jobs) {
      const i = steps.push({ agent: job.a as AgentId, text: jobLabel(job, lang), status: "run" }) - 1;
      show();
      let out: Out;
      try { out = await runJob(envL, job); }
      catch (e) { console.error(e); out = { fail: lx(`That did not work (${(e as Error).message || e}).`, `কাজটি হয়নি (${(e as Error).message || e})।`) }; }
      if (!take(out, i)) break;
    }
    if (!parts.length && !plan.jobs.length) parts.push({ k: "text", text: lx("Tell me what you would like to do.", "কী করতে চান বলুন।") });
  } catch (e) {
    console.error(e);
    steps.forEach((s) => { if (s.status === "run") s.status = "fail"; });
    parts.push({ k: "note", text: L(lang)("Something went wrong — please try again.", "কিছু একটা সমস্যা হয়েছে — আবার চেষ্টা করুন।") });
  } finally {
    if (mem.place !== placeBefore) mem.placeTurn = mem.turn;
    steps.forEach((s) => { if (s.status === "run") s.status = "ok"; });
    show();
    patchMsg(id, { done: true });
    setBusy(false);
    const st = getAssistant();
    if (st.voice) {
      const spoken = plain(parts.filter((p) => p.k === "text" || p.k === "note").map((p) => (p as { text: string }).text).join(" ")).slice(0, 320);
      if (spoken) say(spoken, lang, { flush: true });
    }
  }
}

/** speak one answer again (the speaker button on a message) */
export function speakMsg(m: Msg) {
  const t = plain(m.parts.map((p) => (p.k === "text" || p.k === "note" ? p.text : p.k === "facts" ? p.rows.map((r) => `${r[0]}: ${r[1]}`).join(". ") : p.k === "list" ? p.items.slice(0, 5).map((x) => x.title).join(". ") : "")).join(". ")).slice(0, 600);
  if (t) say(t, m.lang, { flush: true });
}

/** a button under an answer ran an agent: show what came out as a new answer */
export function postOut(label: string, out: Out, lang: Lang) {
  const agent = (out.agent || "router") as AgentId;
  const st: Step["status"] = out.ask ? "ask" : out.fail ? "fail" : "ok";
  const parts: Part[] = [];
  let chips: Chip[] = out.chips || [];
  if (out.ask) { mem.pending = out.ask.pending; parts.push({ k: "text", text: out.ask.q }); chips = out.ask.chips; }
  if (out.fail) parts.push({ k: "note", text: out.fail });
  if (out.parts) parts.push(...out.parts);
  if (out.note) parts.push({ k: "note", text: out.note });
  pushMsg({ id: msgId(), role: "assistant", lang, steps: [{ agent, text: label, status: st }], parts, actions: (out.actions || []).slice(0, 7), chips, done: true });
  if (getAssistant().voice) { const t = plain(parts.filter((p) => p.k === "text" || p.k === "note").map((p) => (p as { text: string }).text).join(" ")).slice(0, 320); if (t) say(t, lang, { flush: true }); }
}
