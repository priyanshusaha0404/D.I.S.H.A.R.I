import { readFileSync } from "node:fs";

/** Static export: the whole site (pages, scripts, data) is plain files — deployable on any static host (Render Static Site). */
let dataVersion = "dev";
try {
  dataVersion = JSON.parse(readFileSync(new URL("./public/data/manifest.json", import.meta.url), "utf8")).version;
} catch {
  /* data not exported yet */
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_DATA_VERSION: dataVersion, NEXT_PUBLIC_BUILD_TIME: new Date().toISOString() },
};
export default nextConfig;
