// Types shared by the parts (src/parts/*.ts are classic scripts in one scope, so their declarations are global).

/** Interface state: view, selection, zoom and panel flags. Open-ended while the UI is being typed. */
interface UIState {
  lens: string; layer: number; scale: string; speed: string; sel: any; hover: any;
  modelMode?: string; jump?: string; autoLens?: boolean; follow?: boolean; stale?: boolean;
  [key: string]: any;
}

// querySelector results are used as concrete elements (dataset, style, value) throughout; loosened here.
interface ParentNode {
  querySelector(selectors: string): any;
  querySelectorAll(selectors: string): NodeListOf<any>;
}

interface Window { __TRUNC?: Set<string> }

/** Baked in by vite.config.ts: the build, and the accepted measurements from data/measurements.json. */
declare const TW_BUILD: { version: string; commit: string };
declare const TW_MEASUREMENTS: any[];
/** Baked in by tools/baked.mjs: the machine catalogue (data/machines.json) and the per-family calibration (data/calibration.json, or null). */
declare const TW_CATALOGUE: { compiled: string; machines: import('./core/types').CatalogueEntry[] };
declare const TW_CALIBRATION: { fitted: string; families: Record<string, import('./core/types').FamilyFactors & { label: string; rows: number; machines: string[] }> } | null;
