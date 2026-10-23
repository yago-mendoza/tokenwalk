// Loads the pure data and formula part (src/parts/01-data.ts) into a sandbox, without a browser.
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithEsbuild } from 'vite';

export async function loadModel() {
  const ts = fs.readFileSync(new URL('../../src/parts/01-data.ts', import.meta.url), 'utf8');
  const names = [...ts.matchAll(/^(?:const|function|let)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const { code } = await transformWithEsbuild(ts, 'data.ts', { loader: 'ts', target: 'es2022' });
  const ctx = vm.createContext({});
  vm.runInContext(`${code}\nglobalThis.__out = { ${names.join(', ')} };`, ctx);
  return ctx.__out;
}
