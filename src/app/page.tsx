"use client";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const Shell = dynamic(() => import("@/components/shell/Shell"), { ssr: false });
export default function Page() {
  return <Suspense fallback={null}><Shell /></Suspense>;
}
