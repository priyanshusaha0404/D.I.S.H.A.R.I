"use client";
/** React hooks over the static data loaders (each file is fetched once and shared). */
import { useEffect, useState } from "react";
import { hexStore, type HexStore } from "./hex";
import { loadCatalog, loadModules, loadRasters, loadSources, type Catalog, type Modules, type RasterDef, type Source } from "./catalog";
import { loadAdmin, loadIslands, loadVillages } from "./entities";

function useLoad<T>(f: () => Promise<T>): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    f().then((x) => live && setV(x)).catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}
export const useHex = (): HexStore | null => useLoad(hexStore);
export const useCatalog = (): Catalog | null => useLoad(loadCatalog);
export const useRasters = (): Record<string, RasterDef> | null => useLoad(loadRasters);
export const useModules = (): Modules | null => useLoad(loadModules);
export const useSources = (): Source[] | null => useLoad(loadSources);
export const useAdmin = () => useLoad(loadAdmin);
export const useVillages = () => useLoad(loadVillages);
export const useIslands = () => useLoad(loadIslands);
