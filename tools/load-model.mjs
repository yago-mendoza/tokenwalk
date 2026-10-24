// Loads pure parts of the app (by default the data and formulas, src/parts/01-data.ts) into a sandbox, without a
// browser, with the baked data files (tools/baked.mjs) in front, as the page has them.
// `extra`: more TypeScript files (paths from the repo root) appended after the parts, e.g. the legacy cost model.
// `globals`: properties set on the sandbox before the code runs (e.g. throwing getters for S, document).
// `calibration`: a calibration object to bake instead of data/calibration.json (null: none).
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { transformWithEsbuild } from 'vite';
import { bakedData } from './baked.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PURE_PARTS = ['01-data.ts', '01c-catalogue.ts', '01e-estimate.ts'];

export async function loadModel(parts = ['01-data.ts'], { extra = [], globals = {}, calibration } = {}) {
  const src = [...parts.map(f => new URL('../src/parts/' + f, import.meta.url)), ...extra.map(f => new URL('../' + f, import.meta.url))];
  const ts = bakedData(ROOT, { calibration }) + src.map(u => fs.readFileSync(u, 'utf8')).join('\n');
  const names = [...ts.matchAll(/^(?:const|function|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const { code } = await transformWithEsbuild(ts, 'data.ts', { loader: 'ts', target: 'es2022' });
  const ctx = vm.createContext({});
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(globals))) Object.defineProperty(ctx, k, d);
  vm.runInContext(`${code}\nglobalThis.__out = { ${names.join(', ')} };`, ctx);
  return ctx.__out;
}
