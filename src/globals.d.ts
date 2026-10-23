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
