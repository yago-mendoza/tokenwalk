// Loads pure parts (by default the data and formulas, src/parts/01-data.ts) into a sandbox, without a browser.
// `extra`: more TypeScript files (paths from the repo root) appended after the parts, e.g. the legacy cost model.
// `globals`: properties set on the sandbox before the code runs (e.g. throwing getters for S, document).
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithEsbuild } from 'vite';

export async function loadModel(parts = ['01-data.ts'], { extra = [], globals = {} } = {}) {
  const src = [...parts.map(f => new URL('../../src/parts/' + f, import.meta.url)), ...extra.map(f => new URL('../../' + f, import.meta.url))];
  const ts = src.map(u => fs.readFileSync(u, 'utf8')).join('\n');
  const names = [...ts.matchAll(/^(?:const|function|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const { code } = await transformWithEsbuild(ts, 'data.ts', { loader: 'ts', target: 'es2022' });
  const ctx = vm.createContext({});
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(globals))) Object.defineProperty(ctx, k, d);
  vm.runInContext(`${code}\nglobalThis.__out = { ${names.join(', ')} };`, ctx);
  return ctx.__out;
}
