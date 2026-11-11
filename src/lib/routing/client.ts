"use client";
import { DATA_VERSION } from "../data/fetch";
import type { PlanRequest, PlanResponse } from "./worker";

export type { Leg, PlanRequest, PlanResponse, RouteResult } from "./worker";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { ok: (r: PlanResponse) => void; err: (e: Error) => void }>();

function get(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; res?: PlanResponse; error?: string }>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.ok && ev.data.res) p.ok(ev.data.res); else p.err(new Error(ev.data.error || "Routing failed"));
    };
  }
  return worker;
}

export function planRoute(req: PlanRequest): Promise<PlanResponse> {
  const id = ++seq;
  return new Promise((ok, err) => {
    pending.set(id, { ok, err });
    get().postMessage({ id, version: DATA_VERSION, req });
  });
}
