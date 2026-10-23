// Live mode against a real local server: node tests/browser/live-smoke.mjs [model]
// Skips (exit 0) when no Ollama answers on localhost:11434. Uses the smallest installed model unless one is named;
// MAXTOK (default 32) and PROMPT (short | long) set the request. Goes through the mode switch like a person would.
// Serves dist/ with vite preview on a localhost port, which Ollama accepts by default (no OLLAMA_ORIGINS needed).
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { launch, sleep } from './cdp.mjs';

let tags;
try { tags = await (await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2500) })).json(); } catch { console.log('skip  no Ollama on localhost:11434'); process.exit(0); }
const models = (tags.models || []).sort((a, b) => a.size - b.size), pick = process.argv[2] || (models[0] && models[0].name);
if (!pick) { console.log('skip  Ollama has no models'); process.exit(0); }
if (!fs.existsSync('dist/index.html')) execSync('npm run build', { stdio: 'inherit' });
const server = spawn('npx vite preview --port 4175 --strictPort', { stdio: 'ignore', shell: true }), base = 'http://localhost:4175/';
for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(250); }
const p = await launch({ port: 9431 });
let ok = true;
try {
  await p.size(1440, 900); await p.open(base);
  await p.ev(`showHelp(-1); document.getElementById('fsTip').hidden = true`);
  const s0 = await p.ev('JSON.stringify(S)');
  await p.ev(`document.querySelector('#modeSw [data-mode=real]').click()`);
  for (let t = 0; t < 100 && !(await p.ev(`MODE.m === 'real' || ['cors', 'down', 'error'].includes(LIVE.status)`)); t++) await sleep(100);
  const st = await p.ev(`LIVE.status + ' ' + LIVE.kind + ' ' + LIVE.version + ' · ' + LIVE.models.length + ' models · mode ' + MODE.m`); console.log('      ' + st);
  if (!(await p.ev(`MODE.m === 'real'`))) throw new Error('not connected: ' + await p.ev('LIVE.fix || LIVE.error'));
  console.log('      ' + await p.ev(`document.querySelector('#modeSw [data-mode=real]').title`));
  await p.ev(`document.getElementById('rqModel').value = ${JSON.stringify(pick)}; document.getElementById('rqModel').dispatchEvent(new Event('change'))`);
  for (let t = 0; t < 150 && !(await p.ev(`MODELS.live && MODELS.live.tag === ${JSON.stringify(pick)}`)); t++) await sleep(100);
  await p.ev(`LIVE.maxTok = ${Number(process.env.MAXTOK || 32)}; LIVE.promptMode = ${JSON.stringify(process.env.PROMPT || 'short')}; saveReal(); changed()`); await sleep(500);
  console.log('      breadcrumb: ' + await p.ev(`document.getElementById('chip').textContent`));
  console.log('      sending to ' + pick + ' (a cold load can take a minute)…');
  await p.ev(`document.getElementById('play').click()`);
  // while it streams, sample the estimate's clock: the views must follow the server
  const seen = []; let midShot = false;
  for (let t = 0; t < 6000 && (await p.ev(`LIVE.running || !LIVE.run && !LIVE.error`)); t++) { await sleep(100);
    if (t % 5 === 0 && (await p.ev('LIVE.running'))) seen.push(await p.ev('[+P.t.toFixed(3), generatedAt(P.t), LIVE.toks.length, now().layer]'));
    if (!midShot && process.env.SHOT_MID && (await p.ev('LIVE.toks.length >= 12'))) { midShot = true; await p.ev(`setLens('model')`); await sleep(300); await p.shot(process.env.SHOT_MID); await p.ev(`setLens('system')`); } }
  const ts = seen.map(q => q[0]), moved = ts.length > 2 && ts[ts.length - 1] > ts[0] && new Set(ts).size > 2;
  console.log(`      views follow the run: ${moved ? 'yes' : 'NO'} (${seen.length} samples, estimate t ${ts[0]} → ${ts[ts.length - 1]}, last [t, written in views, real tokens, layer] ${JSON.stringify(seen[seen.length - 1])})`);
  if (!moved) throw new Error('the views did not move during the real run');
  const r = await p.ev(`JSON.stringify({ run: LIVE.run && { ...LIVE.run, text: LIVE.run.text.slice(0, 120), arrivalsMs: LIVE.run.arrivalsMs.length }, est: LIVE.est, err: LIVE.error, clock: document.getElementById('clock').textContent })`);
  console.log('      ' + r);
  const o = JSON.parse(r); if (!o.run || !(o.run.evalN > 0)) throw new Error('no measured run: ' + o.err);
  if (process.env.SHOT) { await p.ev(`setLens('system')`); await sleep(600); await p.shot(process.env.SHOT); }
  if (process.env.SHOT2) { await p.ev(`setLens('tokens')`); await sleep(600); await p.shot(process.env.SHOT2); await p.ev(`setLens('system')`); }
  console.log('      console model: ' + await p.ev(`S.model + ' = ' + MODELS[S.model].name + ', ' + MODELS[S.model].layers + ' layers'`));
  await p.ev(`document.getElementById('lvCal').click()`); await sleep(300);
  const after = JSON.parse(await p.ev(`JSON.stringify({ cal: CALIB[S.machine], est: LIVE.est })`)); console.log('      calibrated: ' + JSON.stringify(after));
  const meas = o.run.evalN / o.run.decodeS; if (Math.abs(after.est.decodeTps - meas) / meas > 0.1) throw new Error(`calibrated decode ${after.est.decodeTps} vs measured ${meas}`);
  await p.ev(`liveResetCal()`);
  await p.ev(`document.querySelector('#modeSw [data-mode=sim]').click()`); await sleep(300);
  if ((await p.ev('JSON.stringify(S)')) !== s0) throw new Error('the simulation was not restored after the real run');
  if (p.errors.length) throw new Error('page errors: ' + p.errors.join(' | '));
  console.log('ok    real request sent from Real machine mode, measured, calibrated, simulation restored');
} catch (e) { ok = false; console.log('FAIL  ' + (e.message || e)); }
p.close(); server.kill();
process.exit(ok ? 0 : 1);
