// Live mode against a real local server: node tests/browser/live-smoke.mjs [model]
// Skips (exit 0) when no Ollama answers on localhost:11434. Uses the smallest installed model unless one is named.
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
  await p.ev(`document.querySelector('[data-acc=live] button').click()`); await sleep(200);
  await p.ev(`liveDetect()`);
  const st = await p.ev(`LIVE.status + ' ' + LIVE.kind + ' ' + LIVE.version + ' · ' + LIVE.models.length + ' models'`); console.log('      ' + st);
  if (!st.startsWith('ok')) throw new Error('not connected: ' + await p.ev('LIVE.fix || LIVE.error'));
  await p.ev(`LIVE.pick = ${JSON.stringify(pick)}; LIVE.maxTok = ${Number(process.env.MAXTOK || 48)}; LIVE.promptMode = ${JSON.stringify(process.env.PROMPT || 'short')}; renderLive(true)`);
  console.log('      running on ' + pick + ' (a cold load can take a minute)…');
  await p.ev(`liveRun()`);
  const r = await p.ev(`JSON.stringify({ run: LIVE.run && { ...LIVE.run, text: LIVE.run.text.slice(0, 120), arrivalsMs: LIVE.run.arrivalsMs.length }, est: LIVE.est, err: LIVE.error })`);
  console.log('      ' + r);
  const o = JSON.parse(r); if (!o.run || !(o.run.evalN > 0)) throw new Error('no measured run: ' + o.err);
  if (process.env.SHOT) { await p.ev(`setLens('system')`); await sleep(600); await p.shot(process.env.SHOT); }
  await p.ev(`liveUseModel()`); await sleep(400);
  console.log('      console model: ' + await p.ev(`S.model + ' = ' + MODELS[S.model].name + ', ' + MODELS[S.model].layers + ' layers'`));
  await p.ev(`LIVE.est = liveEstimate(LIVE.run); liveCalibrate()`);
  const after = JSON.parse(await p.ev(`JSON.stringify({ cal: CALIB[S.machine], est: LIVE.est })`)); console.log('      calibrated: ' + JSON.stringify(after));
  const meas = o.run.evalN / o.run.decodeS; if (Math.abs(after.est.decodeTps - meas) / meas > 0.1) throw new Error(`calibrated decode ${after.est.decodeTps} vs measured ${meas}`);
  await p.ev(`liveResetCal()`);
  if (p.errors.length) throw new Error('page errors: ' + p.errors.join(' | '));
  console.log('ok    live run measured, model mapped, calibration matches decode');
} catch (e) { ok = false; console.log('FAIL  ' + (e.message || e)); }
p.close(); server.kill();
process.exit(ok ? 0 : 1);
