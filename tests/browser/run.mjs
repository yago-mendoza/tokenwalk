// Browser regression checks against the built page: node tests/browser/run.mjs [--shot]
// Serves dist/ with `vite preview` unless BASE_URL is set. Needs Chrome (set CHROME to its path if it is elsewhere).
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { launch, sleep } from './cdp.mjs';
import { validateMeasurement } from '../../tools/measurement.mjs';

const SHOT = process.argv.includes('--shot');
let base = process.env.BASE_URL, server;
if (!base) {
  if (!fs.existsSync('dist/index.html')) execSync('npm run build', { stdio: 'inherit' });
  server = spawn('npx vite preview --port 4174 --strictPort', { stdio: 'ignore', shell: true });
  base = 'http://localhost:4174/';
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(250); }
}
const p = await launch();
const results = [];
async function check(name, fn) {
  const before = p.errors.length;
  try {
    await fn();
    if (p.errors.length > before) throw new Error('page errors: ' + p.errors.slice(before).join(' | '));
    results.push(true); console.log(`ok    ${name}`);
  } catch (e) { results.push(false); console.log(`FAIL  ${name}\n      ${String(e.message || e).split('\n').join('\n      ')}`); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const SHOTS = process.env.SHOTS_DIR; // when set, screenshots of the share window and the measured rows are written there
const shotTo = async name => { if (SHOTS) { await sleep(350); await p.shot(`${SHOTS}/${name}.png`); } };
const overflowIn = sel => p.ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => { if (!e.offsetParent || e.children.length) return false; const cs = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden' || cs.overflowX === 'hidden'); }).map(e => (e.id || e.className || e.tagName) + ': ' + e.textContent.slice(0, 40))`);
async function fresh(q = '', w = 1440, h = 900) {
  await p.size(w, h); await p.open(base + q);
  // a Real session left behind by an earlier check would resume on load: forget it and load again
  if (await p.ev(`(() => { const had = !!localStorage.getItem('tw.mode') && localStorage.getItem('tw.mode') !== 'sim'; ['tw.mode', 'tw.simS', 'tw.realS'].forEach(k => localStorage.removeItem(k)); return had; })()`)) await p.open(base + q);
  // the Loadout's tab and filters last for the browser tab's session: each check starts from none
  if (await p.ev(`(() => { const had = !!sessionStorage.getItem('tw.loadout'); sessionStorage.removeItem('tw.loadout'); return had; })()`)) await p.open(base + q);
  await p.ev(`showHelp(-1); document.getElementById('fsTip').hidden = true; window.__TRUNC = new Set()`);
}
const canvasHit = (cid, pred) => p.ev(`(() => { const c = document.getElementById('${cid}'), r = c.getBoundingClientRect(), h = (HITS['${cid}'] || []).find(q => Array.isArray(q.shape) && (${pred})(q.sel)); return h ? [r.x + h.shape[0] + Math.min(6, h.shape[2] / 2), r.y + h.shape[1] + Math.min(6, h.shape[3] / 2)] : null; })()`);

await check('loads with no errors and draws all four views', async () => {
  await fresh();
  for (const l of ['system', 'model', 'memory', 'tokens']) { await p.ev(`setLens('${l}')`); await sleep(250); }
  assert(await p.ev(`R.total > 0 && R.ttft > 0`), 'the request has no timeline');
});

await check('no text is cut or overflows, at 1440x900 and 1280x720', async () => {
  for (const [w, h] of [[1440, 900], [1280, 720]]) {
    await fresh('', w, h);
    for (const st of ['P.t = 0', 'P.t = R.ttft * .5', 'P.t = R.ttft + 8', 'P.t = R.total'])
      for (const l of ['system', 'model', 'memory', 'tokens']) { await p.ev(`${st}; setPlaying(false); select(null); setLens('${l}')`); await sleep(220); }
    await p.ev(`setLens('model'); ZOOM.model = [{ k: 'mat', layer: 3, name: R.sh.attn[0][0], shape: R.sh.attn[0] }]`); await sleep(220);
    await p.ev(`ZOOM.model.push({ k: 'row', layer: 3, name: R.sh.attn[0][0], shape: R.sh.attn[0], r: 0 })`); await sleep(220);
    await p.ev(`ZOOM.model.push({ k: 'num', layer: 3, name: R.sh.attn[0][0], shape: R.sh.attn[0], r: 0, i: 2 })`); await sleep(220);
    await p.ev(`ZOOM.model = [{ k: 'expert', layer: 3, e: 5 }]`); await sleep(220);
    await p.ev(`ZOOM.model = []; setLens('memory'); ZOOM.memory = [{ k: 'tok', t: 6600 }]`); await sleep(220);
    await p.ev(`ZOOM.memory = []`);
    for (const id of ['bw', 'place', 'intensity']) { await p.ev(`select({ k: 'inst', id: '${id}' })`); await sleep(180); }
    await p.ev(`select(null)`);
    const cut = await p.ev(`[...window.__TRUNC]`);
    const over = await p.ev(`[...document.querySelectorAll('body *')].filter(e => { if (!e.offsetParent || e.children.length) return false; const cs = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden' || cs.overflowX === 'hidden'); }).map(e => e.id || e.className || e.tagName)`);
    assert(!cut.length && !over.length, `${w}x${h}: cut ${JSON.stringify(cut)} overflow ${JSON.stringify(over)}`);
  }
});

await check('Model grid captions never overlap (es and en, long and short prompt, three sizes)', async () => {
  for (const [w, h] of [[1440, 900], [1280, 720], [900, 700]]) {
    await fresh('?view=model', w, h);
    for (const lg of ['en', 'es']) for (const short of [false, true]) {
      await p.ev(`setLang('${lg}'); UI.modelMode = 'grid'; renderMmode(); ${short ? "S.sys = 0; S.docs = 0; S.q = 50;" : "S.docs = 120000;"} changed(); P.t = R.ttft + 2; setPlaying(false)`); await sleep(250);
      const g = await p.ev(`JSON.stringify([window.__GRIDCAP || [], stageSize()[0]])`), [caps, W] = JSON.parse(g);
      for (const c of caps) assert(c[0] >= -1 && c[2] <= W + 1, `caption off the view at ${w}x${h} ${lg} ${short ? 'short' : 'long'}: ` + g);
      if (caps.length === 2) { const [a, b] = caps, hit = a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; assert(!hit, `captions overlap at ${w}x${h} ${lg} ${short ? 'short' : 'long'}: ` + g); }
      const tr = await p.ev('JSON.stringify([...window.__TRUNC].filter(t => t.startsWith("cModel")))'); assert(tr === '[]', 'cut text in Model: ' + tr);
    }
    await p.ev(`setLang('en')`);
  }
});

await check('an open Setup section stays attached to its header while the column scrolls', async () => {
  await fresh('', 1280, 720);
  await p.ev(`document.querySelector('#cfgBody .acc[data-acc=model] > button').click()`); await sleep(150);
  const zb = `document.querySelector('#cfg .zb')`;
  for (const dy of [40, 90]) {
    await p.ev(`${zb}.scrollTop = ${dy}`); await sleep(120);
    const g = await p.ev(`(() => { const a = document.querySelector('#cfgBody .acc[data-acc=model]'), z = ${zb}.getBoundingClientRect(), h = a.querySelector('button').getBoundingClientRect(), pn = a.querySelector('.in').getBoundingClientRect(); return [a.classList.contains('open'), h.bottom, pn.top, z.top, ${zb}.scrollTop]; })()`);
    if (g[0]) assert(Math.abs(g[1] - g[2]) <= 1.5, 'the panel came off its header: ' + JSON.stringify(g)); else assert(g[1] <= g[3] + 1, 'the panel closed while its header was visible: ' + JSON.stringify(g));
  }
  await p.ev(`${zb}.scrollTop = 0; document.querySelectorAll('#cfgBody .acc.open').forEach(o => o.classList.remove('open'))`);
});

await check('zoom goes matrix, row, one weight, and back out with Esc', async () => {
  await fresh('?view=model');
  await p.ev(`UI.modelMode = 'stack'; renderMmode(); P.t = R.ttft + 10; setPlaying(false)`); await sleep(500);
  for (const k of ['mat', 'zrow', 'zw']) {
    const pt = await canvasHit('cModel', `s => s.k === '${k}'`); assert(pt, `nothing to click for ${k}`);
    await p.click(...pt); await sleep(400);
  }
  const path = await p.ev(`ZOOM.model.map(f => f.k).join('>')`);
  assert(path === 'mat>row>num', 'zoom path is ' + path);
  for (let i = 0; i < 3; i++) { await p.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await sleep(150); }
  assert((await p.ev(`ZOOM.model.length`)) === 0, 'Esc did not climb out');
});

await check('Memory fits without scrolling for every model, at three window sizes', async () => {
  for (const [w, h] of [[1440, 900], [1280, 720], [1366, 640]]) {
    await fresh('?view=memory', w, h);
    for (const mk of await p.ev('presetModels()')) {
      await p.ev(`S.model = '${mk}'; S.quant = 'Q4_K_M'; changed(); ZOOM.memory = []; P.t = R.ttft + (R.total - R.ttft) * .5; setPlaying(false)`); await sleep(300);
      const [bottom, stage] = await p.ev(`[Math.max(...HITS.cMemory.filter(q => Array.isArray(q.shape)).map(q => q.shape[1] + q.shape[3])), stageSize()[1]]`);
      assert(bottom <= stage, `${w}x${h} ${mk}: drawn to ${bottom} in a stage of ${stage}`);
    }
  }
});

await check('a token click shows its sampling chain, not an explainer', async () => {
  await fresh('?view=tokens'); await p.ev(`P.t = R.ttft + 10; setPlaying(false)`); await sleep(500);
  await p.ev(`document.querySelector('#stream [data-tok]:nth-of-type(3)').click()`); await sleep(300);
  assert((await p.ev(`UI.logitTok`)) === 2, 'the logit token is not set');
  assert(await p.ev(`document.getElementById('lesson').hidden`), 'an explainer opened');
});

await check('time steps back, and impossible jumps are disabled', async () => {
  await fresh(); await p.ev(`P.t = R.ttft + 10; setPlaying(false)`);
  const t0 = await p.ev('P.t');
  await p.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))`);
  assert((await p.ev('P.t')) < t0, 'the left arrow did not step back');
  await p.ev(`document.getElementById('jumpMenu').click()`); await sleep(200);
  assert((await p.ev(`document.querySelector('#jumpPop [data-j=first]').getAttribute('aria-disabled')`)) === 'true', 'First token is offered after it was written');
});

await check('a setup that does not fit shows the problem and blocks Play', async () => {
  await fresh(); await p.ev(`S.model = 'gpt3'; S.quant = 'F16'; changed(); openLoadout('model')`); await sleep(400);
  assert(await p.ev(`!!document.querySelector('#loadout .problem')`), 'no problem band');
  assert(await p.ev(`document.getElementById('play').disabled`), 'Play is not blocked');
});

await check('explainers link other views and the wiki, with absolute URLs', async () => {
  await fresh(); await p.ev(`P.t = R.ttft + 10; setPlaying(false); SEL_FROM = 'cSystem'; select({ k: 'part', id: 'kv' })`); await sleep(400);
  const links = await p.ev(`[...document.querySelectorAll('#lsGo .lswiki a')].map(a => a.href)`);
  assert(links.length && links.every(h => h.startsWith('https://infraphysics.net/wiki/')), 'wiki links: ' + JSON.stringify(links));
  await p.ev(`document.querySelector('#lsGo [data-go="lens:memory"]').click()`); await sleep(300);
  assert((await p.ev('UI.lens')) === 'memory', 'See it in Memory did not switch the view');
});

// Live mode without a server: fetch is replaced in the page by one that answers from the recorded responses.
// window.__down makes the server vanish (every request fails, as with nothing listening); window.__slow spaces the
// streamed lines (ms) so a request can be caught while it runs; window.__lag delays every answer (ms).
const fixture = f => JSON.stringify(fs.readFileSync(`tests/fixtures/${f}`, 'utf8'));
const mockOllama = cors => `(() => {
  const files = { '/api/version': ${fixture('ollama-version.json')}, '/api/tags': ${fixture('ollama-tags.json')}, '/api/show': ${fixture('ollama-show-qwen36.json')}, '/api/generate': ${fixture('ollama-generate-warm.ndjson')} };
  window.fetch = async (url, opts = {}) => {
    if (window.__down) throw new TypeError('Failed to fetch');
    if (window.__lag) await new Promise(r => setTimeout(r, window.__lag));
    if (opts.mode === 'no-cors') return new Response('');
    if (${cors}) throw new TypeError('Failed to fetch');
    const path = new URL(url).pathname, body = files[path];
    if (body === undefined) return new Response('not found', { status: 404 });
    if (path === '/api/generate') { const lines = body.split(String.fromCharCode(10)).filter(Boolean); let i = 0; const sig = opts.signal;
      return new Response(new ReadableStream({ async pull(c) { if (window.__slow) await new Promise(r => setTimeout(r, window.__slow)); if (sig && sig.aborted) { c.error(new DOMException('aborted', 'AbortError')); return; } if (i < lines.length) c.enqueue(new TextEncoder().encode(lines[i++] + String.fromCharCode(10))); else c.close(); } }), { status: 200 }); }
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})()`;
const until = async (expr, ms = 4000) => { for (let t = 0; t < ms; t += 100) { if (await p.ev(expr)) return true; await sleep(100); } throw new Error('timed out waiting for ' + expr); };
const shown = sel => p.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && e.offsetParent); })()`);
const toReal = async () => { await p.ev(`document.querySelector('#modeSw [data-mode=real]').click()`); await until(`MODE.m === 'real' && !!MODELS.live`); await sleep(300); };
const MODES = process.env.MODES_DIR; // when set, a screenshot of each state is written there
const snap = async name => { if (MODES) { await sleep(350); await p.shot(`${MODES}/${name}.png`); } };

await check('mode: Real machine with no server stays Simulated, and closing the window changes nothing', async () => {
  await fresh(); await p.ev(mockOllama(true)); await snap('01-simulated');
  const s0 = await p.ev('JSON.stringify(S)');
  await p.ev(`document.querySelector('#modeSw [data-mode=real]').click()`);
  assert(await p.ev(`!document.getElementById('liveWin').hidden`), 'the connect window did not open');
  await until(`LIVE.status === 'cors'`);
  assert(/OLLAMA_ORIGINS/.test(await p.ev(`document.getElementById('liveIn').textContent`)), 'the CORS fix is not shown');
  assert(/Blocked by CORS/.test(await p.ev(`document.getElementById('liveIn').textContent`)), 'the CORS state is not named');
  assert(!/Detect/.test(await p.ev(`document.getElementById('liveIn').textContent`)), 'the window still says Detect');
  await snap('03-blocked-by-cors');
  assert((await p.ev('MODE.m')) === 'sim' && !(await p.ev(`document.body.classList.contains('real')`)), 'left the simulation without a server');
  await p.ev(`document.getElementById('liveClose').click()`); await sleep(200);
  assert((await p.ev('MODE.connecting')) === false, 'still connecting after close');
  assert((await p.ev('JSON.stringify(S)')) === s0, 'the simulated setup changed');
  assert(/^Real machine$/.test(await p.ev(`document.querySelector('#modeSw [data-mode=real]').textContent.trim()`)), 'the switch does not read Real machine');
});

await check('mode: connect, send, record, then back to the simulation restored exactly', async () => {
  await fresh(); await p.ev(mockOllama(false)); await p.ev(`P.t = R.ttft + 3; setPlaying(false)`);
  const s0 = await p.ev('JSON.stringify(S)'), t0 = await p.ev('P.t');
  await p.ev(`window.__lag = 500; document.querySelector('#modeSw [data-mode=real]').click()`);
  await until(`LIVE.status === 'busy'`, 1500);
  assert(/connecting/.test(await p.ev(`document.querySelector('#modeSw [data-mode=real]').textContent`)), 'the switch does not say connecting');
  await snap('02-connecting');
  await until(`MODE.m === 'real'`); await p.ev('window.__lag = 0'); await sleep(300);
  assert(await p.ev(`document.getElementById('liveWin').hidden`), 'the connect window stayed open');
  assert(await p.ev(`document.body.classList.contains('real')`), 'no Real accent');
  assert(/this machine/.test(await p.ev(`document.getElementById('chip').textContent`)) && /num_ctx/.test(await p.ev(`document.getElementById('chip').textContent`)), 'the breadcrumb is not the real one');
  assert(/Connected to Ollama 0\.40\.7 at http:\/\/localhost:11434 · qwen3\.6:35b-a3b/.test(await p.ev(`document.querySelector('#modeSw [data-mode=real]').title`)), 'the switch tooltip: ' + await p.ev(`document.querySelector('#modeSw [data-mode=real]').title`));
  for (const sel of ['[data-acc=request]', '[data-acc=machine]', '[data-acc=model]', '[data-acc=adv]', '[data-acc=scen]']) assert(!(await shown(sel)), sel + ' is not hidden in Real');
  assert(await shown('[data-acc=realreq]') && await shown('[data-acc=realmach]'), 'the real sections are missing');
  { const mc = await p.ev(`(() => { const c = document.querySelector('[data-acc=realmach]'); return [c.classList.contains('acc'), !!c.querySelector('.chev'), c.querySelector('#realMachIn').offsetParent !== null, c.textContent]; })()`);
    assert(!mc[0] && !mc[1] && mc[2], 'This machine is still an accordion or its body is hidden');
    assert(/Server/.test(mc[3]) && /Address/.test(mc[3]) && /Model/.test(mc[3]) && /Change server/.test(mc[3]) && /Estimate as/.test(mc[3]), 'This machine card content: ' + mc[3].slice(0, 160));
    assert(!(await p.ev(`!!document.querySelector('[data-acc=realmach] input[type=text]')`)), 'the address looks editable in the card'); }
  await p.ev(`document.querySelector('[data-acc=engine]').classList.add('open')`); await sleep(100);
  assert(!(await shown('#kv')) && !(await shown('#cold')) && await shown('#ctx'), 'KV type / cold start are not hidden, or num_ctx is');
  await p.ev(`document.querySelector('[data-acc=engine]').classList.remove('open')`);
  await sleep(300);
  for (const id of ['jumpGo', 'slower', 'faster', 'pauseTok']) assert(await p.ev(`document.getElementById('${id}').disabled`), id + ' is not greyed');
  assert(/Real time: a real server cannot be slowed, paused or stepped/.test(await p.ev(`document.getElementById('slower').title`)), 'no real-time tooltip');
  assert(await p.ev(`!document.getElementById('estTag').hidden`), 'no estimate tag in the System view');
  await snap('04-real-connected-idle');
  await p.ev(`document.querySelector('#modeSw [data-mode=real]').click()`); await sleep(300);
  const win = await p.ev(`document.getElementById('liveIn').textContent`);
  assert(/Connected/.test(win) && /Change server/.test(win) && /Disconnect/.test(win) && !/Detect/.test(win), 'the window when connected: ' + win.slice(0, 200));
  await snap('05-connect-window-connected'); await p.ev(`liveOpen(false)`);
  await p.ev(`window.__slow = 15; document.getElementById('play').click()`); await until('LIVE.running');
  await sleep(500); await snap('06-real-running');
  await until('!LIVE.running && !!LIVE.run', 8000);
  const run = await p.ev('[LIVE.run.promptN, LIVE.run.evalN, LIVE.run.arrivalsMs.length]');
  assert(run[0] === 36 && run[1] === 80 && run[2] === 80, 'run not parsed: ' + JSON.stringify(run));
  assert((await p.ev(`document.querySelectorAll('#liveCmp .lv-r').length`)) === 5, 'the comparison table is missing');
  assert((await p.ev(`document.getElementById('mbody').firstElementChild.id`)) === 'liveSec', 'Estimate vs measured is not first in Monitor');
  await sleep(400);
  assert(/real/i.test(await p.ev(`document.getElementById('outStream').textContent`)), 'the real answer is not in Output');
  assert(/s$/.test(await p.ev(`document.getElementById('clock').textContent.trim()`)), 'the clock does not show the wall time');
  assert(/num_ctx/.test(await p.ev(`document.getElementById('liveSent').textContent`)), 'the sent options are not listed');
  assert(/temp/.test(await p.ev(`[...document.querySelectorAll('.livehon')].map(e => (e.querySelector('input,select') || {}).id).join(',')`)), 'temperature is not marked as sent');
  await snap('07-real-done-record');
  await p.ev(`setLens('tokens')`); await sleep(500);
  assert((await p.ev(`document.querySelectorAll('#stream .g.live').length`)) === 80, 'the real tokens are not in the Tokens view');
  await p.ev(`document.querySelector('#stream [data-ltok="3"]').click()`); await sleep(300);
  assert((await p.ev('UI.liveTok')) === 3, 'a real token click is not handled'); await snap('08-real-tokens'); await p.ev(`UI.liveTok = null; setLens('system')`);
  assert((await p.ev(`S.model + MODELS.live.layers`)) === 'live40', 'the server model is not drawn');
  await p.ev(`document.getElementById('lvCal').click()`); await sleep(200);
  const d = await p.ev(`[LIVE.est.decodeTps, LIVE.run.evalN / LIVE.run.decodeS]`);
  assert(Math.abs(d[0] - d[1]) / d[1] < 0.02, 'calibrated decode ' + d.join(' vs '));
  await p.ev(`liveResetCal(); LIVE.maxTok = 48; saveReal()`);
  await p.ev(`document.querySelector('#modeSw [data-mode=sim]').click()`); await sleep(400);
  assert((await p.ev('MODE.m')) === 'sim' && !(await p.ev(`document.body.classList.contains('real')`)), 'did not go back to the simulation');
  assert((await p.ev('JSON.stringify(S)')) === s0, 'the simulation was not restored exactly');
  assert(Math.abs((await p.ev('P.t')) - t0) < 1e-9, 'the simulated time was not restored');
  assert(!(await p.ev(`document.getElementById('slower').disabled`)), 'the speed control is still greyed');
  assert(!/real/i.test(await p.ev(`document.getElementById('outStream').textContent.slice(0, 8)`)), 'the real answer leaked into the simulation');
  await p.ev(`document.querySelector('#modeSw [data-mode=real]').click()`); await until(`MODE.m === 'real'`);
  assert((await p.ev('LIVE.maxTok')) === 48 && (await p.ev(`document.getElementById('liveWin').hidden`)), 'Real did not come back instantly with its own settings');
  await p.ev(`leaveReal(true)`);
});

await check('mode: the views advance with the real run while it streams', async () => {
  await fresh(); await p.ev(mockOllama(false)); await toReal(); await p.ev(`setLens('model'); UI.modelMode = 'grid'`);
  await p.ev(`window.__slow = 40; document.getElementById('play').click()`); await until('LIVE.running');
  await until('LIVE.toks.length >= 6', 8000);
  const a = await p.ev('[P.t, generatedAt(P.t), LIVE.toks.length, now().layer]');
  await until('LIVE.toks.length >= ' + (a[2] + 10), 8000);
  const b = await p.ev('[P.t, generatedAt(P.t), LIVE.toks.length]');
  assert(b[0] > a[0] && b[1] > a[1], 'the estimate clock did not follow the real run: ' + JSON.stringify([a, b]));
  assert(Math.abs(b[1] - b[2]) <= 2, 'tokens written in the views do not match the real tokens: ' + JSON.stringify(b));
  assert(/interpolated within each real token/.test(await p.ev(`LENS_ABOUT().model[1]`)), 'no note that layers are interpolated');
  await p.ev(`setLens('memory')`); await sleep(300); const kv1 = await p.ev('tokensInCache(P.t)'); await sleep(700); const kv2 = await p.ev('tokensInCache(P.t)');
  assert(kv2 > kv1, 'the KV cache does not grow in Memory: ' + kv1 + ' -> ' + kv2);
  await until('!LIVE.running && !!LIVE.run', 12000); await p.ev('window.__slow = 0; setLens("system")');
});

await check('mode: the timeline has a present playhead in Real, and the record scrubs the views', async () => {
  await fresh(); await p.ev(mockOllama(false)); await toReal();
  await p.ev(`window.__slow = 25; document.getElementById('play').click()`); await until('LIVE.running'); await until('LIVE.toks.length >= 3', 8000);
  const g = await p.ev('JSON.stringify(timeGeo)'); assert(/"real":true/.test(g), 'no real timeline geometry');
  await until('!LIVE.running && !!LIVE.run', 12000); await p.ev('window.__slow = 0'); await sleep(200);
  const end = await p.ev('[P.t, generatedAt(P.t), LIVE.toks.length]'); assert(end[1] === end[2] || end[1] >= end[2] - 1, 'after the run the views are not at its end: ' + JSON.stringify(end));
  const r = await p.ev(`(() => { const r = document.getElementById('cTime').getBoundingClientRect(); return [r.x + timeGeo.lab + timeGeo.w * (timeGeo.endT * .5 / timeGeo.t1), r.y + r.height / 2]; })()`);
  await p.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1 }); await p.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 }); await sleep(250);
  const mid = await p.ev('[UI.realT, timeGeo.endT, generatedAt(P.t), LIVE.toks.length, LIVE.running]');
  assert(mid[0] > 0 && mid[0] < mid[1] && mid[2] < mid[3] && !mid[4], 'scrubbing the record did not move the views back without sending: ' + JSON.stringify(mid));
  await p.ev(`leaveReal(true)`);
});

await check('mode: switching back while a real request runs asks, and keeps running by default', async () => {
  await fresh(); await p.ev(mockOllama(false)); await toReal();
  await p.ev(`window.__slow = 120; document.getElementById('play').click()`); await until('LIVE.running');
  await p.ev(`document.querySelector('#modeSw [data-mode=sim]').click()`); await sleep(200);
  assert(await p.ev(`!document.getElementById('modeAsk').hidden`), 'no confirmation');
  assert(/Stop the real request and go back to the simulation\?/.test(await p.ev(`document.getElementById('modeAsk').textContent`)), 'the confirmation text');
  assert((await p.ev(`document.activeElement && document.activeElement.id`)) === 'askKeep', 'Keep running is not the default');
  await snap('09-confirm-switch-while-running');
  await p.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await sleep(150);
  assert((await p.ev(`MODE.m + LIVE.running`)) === 'realtrue', 'Esc did not keep it running');
  await p.ev(`document.getElementById('liveOpen').click()`); await sleep(200);
  for (const id of ['lvModel', 'lvChange', 'lvDisc']) assert(await p.ev(`document.getElementById('${id}').disabled`), id + ' is not disabled while running');
  assert(/Wait for the real request to finish/.test(await p.ev(`document.getElementById('lvChange').title`)), 'no reason given');
  await p.ev(`liveOpen(false); document.querySelector('#modeSw [data-mode=sim]').click()`); await sleep(150);
  await p.ev(`document.getElementById('askStop').click()`); await sleep(300);
  assert((await p.ev('MODE.m')) === 'sim', 'Stop and switch did not switch');
  await until('!LIVE.running');
  await p.ev('window.__slow = 0');
});

await check('mode: a lost server shows the banner, Retry and Back to simulation; Disconnect forgets it', async () => {
  await fresh(); await p.ev(mockOllama(false)); await toReal();
  await p.ev(`window.__down = true; realPoll(true)`); await sleep(300);
  assert(await p.ev(`!document.getElementById('lostBar').hidden`), 'no lost banner');
  assert(/Lost the server at http:\/\/localhost:11434/.test(await p.ev(`document.getElementById('lostBar').textContent`)), 'banner text');
  await sleep(200); assert(await p.ev(`document.getElementById('play').disabled`), 'Send is still offered with no server');
  await snap('10-server-lost');
  await p.ev(`document.getElementById('lostRetry').click()`); await sleep(300);
  assert(await p.ev('MODE.lost'), 'Retry cleared it with the server still gone');
  await p.ev(`window.__down = false; document.getElementById('lostRetry').click()`); await sleep(300);
  assert(await p.ev(`!MODE.lost && document.getElementById('lostBar').hidden`), 'Retry did not reconnect');
  await p.ev(`window.__down = true; realPoll(true)`); await sleep(300);
  await p.ev(`document.getElementById('lostBack').click()`); await sleep(300);
  assert((await p.ev('MODE.m')) === 'sim' && await p.ev(`document.getElementById('lostBar').hidden`), 'Back to simulation');
  await p.ev(`window.__down = false`); await toReal();
  await p.ev(`liveOpen(true); document.getElementById('lvDisc').click()`); await sleep(300);
  assert((await p.ev(`MODE.m + LIVE.status`)) === 'simidle', 'Disconnect did not return to the simulation');
  await p.ev(`document.querySelector('#modeSw [data-mode=real]').click()`); await until(`MODE.m === 'real'`); await p.ev('leaveReal(true)');
});

await check('mode: on start, Real resumes only when the server answers', async () => {
  for (const down of [false, true]) {
    await p.cmd('Page.enable'); const { result } = await p.cmd('Page.addScriptToEvaluateOnNewDocument', { source: `window.__down = ${down}; ${mockOllama(false)}; try { localStorage.setItem('tw.mode', 'real') } catch (e) {}` });
    await p.open(base, 3500); await p.cmd('Page.removeScriptToEvaluateOnNewDocument', { identifier: result.identifier });
    await p.ev(`showHelp(-1); document.getElementById('fsTip').hidden = true`);
    if (!down) { await until(`MODE.m === 'real'`, 3000); await p.ev('leaveReal(true)'); }
    else {
      assert((await p.ev('MODE.m')) === 'sim', 'started Real with no server');
      assert(!/this machine|Live:/i.test(await p.ev(`document.getElementById('top').textContent`)), 'a connected look with no server');
    }
  }
  await p.ev(`localStorage.removeItem('tw.mode')`);
});

await check('mode: no text is cut or overflows in Real machine mode, at 1440x900 and 1280x720', async () => {
  for (const [w, h] of [[1440, 900], [1280, 720]]) {
    await fresh('', w, h); await p.ev(mockOllama(false)); await toReal();
    await p.ev(`document.getElementById('play').click()`); await until('!!LIVE.run', 8000); await sleep(300);
    for (const l of ['system', 'model', 'memory', 'tokens']) { await p.ev(`setLens('${l}')`); await sleep(250); }
    for (const a of ['realmach', 'realreq', 'engine', 'samp']) { await p.ev(`document.querySelectorAll('#cfgBody .acc').forEach(e => e.classList.toggle('open', e.dataset.acc === '${a}'))`); await sleep(150); }
    await p.ev(`liveOpen(true)`); await sleep(200);
    const cut = await p.ev(`[...window.__TRUNC]`);
    const over = await p.ev(`[...document.querySelectorAll('body *')].filter(e => { if (!e.offsetParent || e.children.length) return false; const cs = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden' || cs.overflowX === 'hidden'); }).map(e => (e.id || e.className || e.tagName) + ': ' + e.textContent.slice(0, 40))`);
    assert(!cut.length && !over.length, `${w}x${h}: cut ${JSON.stringify(cut)} overflow ${JSON.stringify(over)}`);
    await p.ev(`liveOpen(false); leaveReal(true)`);
  }
});

const fitsTab = `document.getElementById('loadout').classList.contains('on') && LOAD.tab === 'fits' && document.querySelector('#loadout [data-lt=fits]').getAttribute('aria-pressed') === 'true' && !!document.querySelector('#loadout #fitsIn .fw-tbl')`;
await check('What fits: the Setup row opens the Loadout tab, sorts, filters, and a row loads the setup (undoable)', async () => {
  await fresh('', 1280, 720);
  await p.ev(`document.getElementById('fitsOpen').click()`); await sleep(300);
  assert(await p.ev(fitsTab), 'the What fits tab did not open');
  // every combination is a row, shown a page at a time: scrolling to the end appends the next page
  const n = await p.ev(`[FITS.view.length, document.querySelectorAll('#fitsIn tbody tr[data-fr]').length, !!document.querySelector('#fitsIn tr.more')]`);
  assert(n[0] === (await p.ev(`Object.keys(MACHINES).length * presetModels().length * 5`)) && n[1] === Math.min(n[0], 400) && n[2] === n[0] > 400, 'rows: ' + n);
  await p.ev(`(() => { const t = document.querySelector('#fitsIn .fw-tbl'); t.scrollTop = t.scrollHeight; t.dispatchEvent(new Event('scroll')); })()`); await sleep(200);
  assert((await p.ev(`document.querySelectorAll('#fitsIn tbody tr[data-fr]').length`)) === Math.min(n[0], 800), 'the next page was not appended');
  await p.ev(`document.querySelector('#fitsIn .fw-tbl').scrollTop = 0`);
  const order = await p.ev(`[...document.querySelectorAll('#fitsIn tbody tr[data-fr]')].map(t => { const [m, mo, q] = t.dataset.fr.split('|'), r = FITS.rows.find(x => x.mk === m && x.mo === mo && x.q === q); return [r.fit, r.tps]; })`);
  const rank = { yes: 0, tight: 1, no: 2 };
  for (let i = 1; i < order.length; i++) { const a = order[i - 1], b = order[i]; assert(rank[a[0]] < rank[b[0]] || (rank[a[0]] === rank[b[0]] && a[1] >= b[1]), 'default order broken at ' + i + ': ' + JSON.stringify([a, b])); }
  assert(await p.ev(`[...document.querySelectorAll('#fitsIn tbody tr[data-fr]')].every(t => { const k = t.dataset.fr.split('|')[0]; return MACHINES[k].estimate === 'calibrated' ? /calibrated/.test(t.cells[0].textContent) : /estimate/.test(t.cells[0].textContent); })`), 'calibrated / estimate marks');
  assert(await p.ev(`[...document.querySelectorAll('#fitsIn tbody tr[data-fr]')].filter(t => /calibrated/.test(t.cells[0].textContent)).every(t => /^thinkpad(Cpu)?\|/.test(t.dataset.fr))`), 'only the ThinkPad presets are calibrated');
  await p.ev(`document.querySelector('#fitsIn th[data-fs=ttft]').click()`); await sleep(150);
  const tt = await p.ev(`[...document.querySelectorAll('#fitsIn tbody tr[data-fr]')].map(t => t.dataset.fr).slice(0, 3).map(id => { const [m, mo, q] = id.split('|'); return FITS.rows.find(r => r.mk === m && r.mo === mo && r.q === q).ttft; })`);
  assert(tt[0] <= tt[1] && tt[1] <= tt[2], 'ttft sort ascending: ' + tt);
  await p.ev(`document.querySelector('#fitsIn th[data-fs=ttft]').click()`); await sleep(150);
  assert((await p.ev(`FITS.sort.dir`)) === -1 && /▼/.test(await p.ev(`document.querySelector('#fitsIn th[data-fs=ttft]').textContent`)), 'second click did not reverse the sort');
  await p.ev(`(() => { const s = document.getElementById('fitsMach'); s.value = 'rtx4090'; s.dispatchEvent(new Event('change')); })()`); await sleep(150);
  assert(await p.ev(`[...document.querySelectorAll('#fitsIn tbody tr[data-fr]')].every(t => t.dataset.fr.startsWith('rtx4090|')) && document.querySelectorAll('#fitsIn tbody tr[data-fr]').length === presetModels().length * 5`), 'machine filter');
  await p.ev(`(() => { const s = document.getElementById('fitsModel'); s.value = 'v:OpenAI'; s.dispatchEvent(new Event('change')); })()`); await sleep(150);
  assert(await p.ev(`[...document.querySelectorAll('#fitsIn tbody tr[data-fr]')].every(t => MODELS[t.dataset.fr.split('|')[1]].vendor === 'OpenAI') && document.querySelectorAll('#fitsIn tbody tr[data-fr]').length === presetModels().filter(k => MODELS[k].vendor === 'OpenAI').length * 5`), 'model vendor filter');
  await p.ev(`(() => { const s = document.getElementById('fitsModel'); s.value = 'm:gpt-oss-20b'; s.dispatchEvent(new Event('change')); })()`); await sleep(150);
  assert(await p.ev(`[...document.querySelectorAll('#fitsIn tbody tr[data-fr]')].every(t => t.dataset.fr.startsWith('rtx4090|gpt-oss-20b|')) && document.querySelectorAll('#fitsIn tbody tr[data-fr]').length === 5`), 'one model');
  await p.ev(`(() => { const s = document.getElementById('fitsModel'); s.value = 'all'; s.dispatchEvent(new Event('change')); })()`); await sleep(150);
  await p.ev(`(() => { const c = document.getElementById('fitsOnly'); c.checked = true; c.dispatchEvent(new Event('change')); })()`); await sleep(150);
  assert(await p.ev(`[...document.querySelectorAll('#fitsIn .fp')].every(f => !f.classList.contains('no')) && document.querySelectorAll('#fitsIn tbody tr[data-fr]').length < presetModels().length * 5`), 'only what fits');
  const s0 = await p.ev('JSON.stringify(S)');
  const id = await p.ev(`document.querySelector('#fitsIn tbody tr[data-fr]:not(.cur)').dataset.fr`);
  await p.ev(`document.querySelector('#fitsIn tbody tr[data-fr="${id}"]').click()`); await sleep(250);
  const [m, mo, q] = id.split('|');
  assert(await p.ev(`!document.getElementById('loadout').classList.contains('on')`), 'the Loadout did not close');
  assert(await p.ev(`S.machine === '${m}' && S.model === '${mo}' && S.quant === '${q}' && S.vram === MACHINES['${m}'].fastGB`), 'the row was not loaded: ' + await p.ev('JSON.stringify([S.machine, S.model, S.quant])'));
  await p.ev(`document.getElementById('undoBtn').click()`); await sleep(150);
  assert((await p.ev('JSON.stringify(S)')) === s0, 'Undo did not restore the setup');
  await p.ev(`FITS.machine = 'all'; FITS.model = 'all'; FITS.only = false; FITS.sort = { k: 'fit', dir: 1 }`);
});

await check('Loadout tabs: Machines, Models and What fits switch in place; a What fits row loads the pair as choosing it by hand does; the tab survives reopen', async () => {
  for (const lg of ['en', 'es']) {
    await fresh(lg === 'es' ? '?lang=es' : '', 1280, 720);
    await p.ev(`openLoadout('machine')`); await sleep(300);
    const labels = await p.ev(`[...document.querySelectorAll('#loadout [data-lt]')].map(b => b.textContent.trim()).join('|')`);
    assert(labels === (lg === 'es' ? 'Máquinas|Modelos|Qué cabe' : 'Machines|Models|What fits'), `${lg}: tabs ${labels}`);
    for (const t of ['model', 'fits', 'machine', 'fits']) {
      await p.ev(`document.querySelector('#loadout [data-lt=${t}]').click()`); await sleep(250);
      const st = await p.ev(`[LOAD.tab, [...document.querySelectorAll('#loadout [data-lt]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.lt).join(), !!document.querySelector('#loadout #fitsIn .fw-tbl'), document.querySelectorAll('#loadout .cards .card').length, !!document.getElementById('cmpT')]`);
      assert(st[0] === t && st[1] === t && st[2] === (t === 'fits') && (t === 'fits' ? st[3] === 0 && !st[4] : st[3] > 0 && st[4]), `${lg} ${t}: ` + JSON.stringify(st));
      const o = await overflowIn('#loadout *'); assert(!o.length, `${lg} ${t}: overflow ${JSON.stringify(o)}`);
    }
    // by hand: Choose the machine, then the model at a weight format; and the same pair as one What fits row
    const s0 = await p.ev('JSON.stringify(S)'), u0 = await p.ev('UNDO.length');
    await p.ev(`openLoadout('machine'); document.querySelector('#loadout .choose[data-m=rtx4090]').click(); openLoadout('model'); document.querySelector('#loadout [data-qm="gpt-oss-20b"][data-q=Q4_K_M]').click()`); await sleep(250);
    const byHand = await p.ev('JSON.stringify(S)');
    await p.ev(`undo(); undo()`); await sleep(150);
    assert((await p.ev('JSON.stringify(S)')) === s0 && (await p.ev('UNDO.length')) === u0, `${lg}: undo by hand`);
    await p.ev(`openLoadout('fits'); (() => { const m = document.getElementById('fitsMach'); m.value = 'rtx4090'; m.dispatchEvent(new Event('change')); const s = document.getElementById('fitsModel'); s.value = 'm:gpt-oss-20b'; s.dispatchEvent(new Event('change')); })()`); await sleep(200);
    await p.ev(`document.querySelector('#fitsIn tbody tr[data-fr="rtx4090|gpt-oss-20b|Q4_K_M"]').click()`); await sleep(250);
    assert((await p.ev('JSON.stringify(S)')) === byHand, `${lg}: the row loaded something else than choosing by hand`);
    assert(await p.ev(`!document.getElementById('loadout').classList.contains('on') && UNDO.length === ${u0} + 1`), `${lg}: the row did not close the Loadout or was not one undo step`);
    await p.ev(`document.getElementById('rstBtn').click()`); await sleep(150); await p.ev(`document.getElementById('rstGo').click()`); await sleep(200);
    assert(await p.ev('isDefault()'), `${lg}: Restore defaults after a row`);
    await p.ev(`undo()`); await sleep(150);
    assert((await p.ev('JSON.stringify(S)')) === byHand, `${lg}: Undo after Restore defaults`);
    await p.ev(`undo()`); await sleep(150);
    assert((await p.ev('JSON.stringify(S)')) === s0, `${lg}: Undo of the row`);
    // reopened, from the header chip or after a reload in the same browser tab: the tab and its filters are as left
    await p.ev(`document.getElementById('chip').click()`); await sleep(250);
    assert(await p.ev(`${fitsTab} && document.getElementById('fitsMach').value === 'rtx4090'`), `${lg}: the chip did not reopen What fits`);
    await p.open(base + (lg === 'es' ? '?lang=es' : '')); await p.ev(`showHelp(-1); document.getElementById('fsTip').hidden = true`);
    await p.ev(`document.getElementById('chip').click()`); await sleep(300);
    assert(await p.ev(`${fitsTab} && FITS.machine === 'rtx4090' && FITS.model === 'm:gpt-oss-20b' && document.querySelectorAll('#fitsIn tbody tr[data-fr]').length === 5`), `${lg}: the tab or its filters did not survive a reload`);
    await p.ev(`FITS.machine = 'all'; FITS.model = 'all'; for (const t of ['model', 'machine', 'fits']) { LOAD.tab = t; renderLoadout(); }`); await sleep(300);
    await shotTo(`tab-fits-${lg}`);
    for (const t of ['machine', 'model']) { await p.ev(`document.querySelector('#loadout [data-lt=${t}]').click()`); await sleep(300); await shotTo(`tab-${t}-${lg}`); }
    await p.ev(`fitsOpen(false); sessionStorage.removeItem('tw.loadout')`);
  }
});

await check('What fits and the new controls: nothing cut, no inner horizontal scroll, at 1280x720 and 1440x900 in both languages', async () => {
  for (const [lg, w, h] of [['en', 1280, 720], ['es', 1280, 720], ['en', 1440, 900], ['es', 1440, 900]]) {
    await fresh(lg === 'es' ? '?lang=es' : '', w, h);
    await p.ev(`document.getElementById('fitsOpen').click()`); await sleep(300);
    const g = await p.ev(`(() => { const t = document.querySelector('#fitsIn .fw-tbl'), c = t.getBoundingClientRect(), d = document.documentElement; return [t.scrollWidth, t.clientWidth, c.top, c.bottom, c.left, c.right, innerWidth, innerHeight, d.scrollWidth, t.clientHeight]; })()`);
    assert(g[0] <= g[1] + 1 && g[8] <= g[6], `${lg} ${w}: horizontal scroll ${JSON.stringify(g)}`);
    assert(g[2] >= 0 && g[3] <= g[7] && g[4] >= 0 && g[5] <= g[6] && g[9] > 200, `${lg} ${w}: the table leaves the window or has no room ` + JSON.stringify(g));
    const over = await p.ev(`[...document.querySelectorAll('#loadout *, #cfg .zh *, #top *, #cfgBody [data-acc=fits] *')].filter(e => { if (!e.offsetParent || e.children.length) return false; const cs = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden' || cs.overflowX === 'hidden'); }).map(e => (e.id || e.className || e.tagName) + ': ' + e.textContent.slice(0, 40))`);
    assert(!over.length, `${lg} ${w}: overflow ${JSON.stringify(over)}`);
    await p.ev(`fitsOpen(false); S.temp = .3; changed()`); await sleep(300); await p.ev(`document.getElementById('rstBtn').click()`); await sleep(200);
    await p.ev(`document.getElementById('linkBtn').click()`); await sleep(300);
    const box = await p.ev(`['rstAsk', 'toast'].map(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return [id, !e.hidden && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight]; })`);
    for (const b of box) assert(b[1], `${lg}: ${b[0]} hidden or out of the window`);
  }
});

await check('What fits with the whole catalogue: vendor and family filters narrow rows and the machine list, both languages, no horizontal scroll', async () => {
  for (const lg of ['en', 'es']) {
    await fresh(lg === 'es' ? '?lang=es' : '', 1280, 720);
    await p.ev(`fitsOpen(true)`); await sleep(300);
    const fams = await p.ev(`[...document.querySelectorAll('#fitsFam option')].map(o => o.value)`);
    assert(fams[0] === 'all' && fams.includes('v:Apple') && fams.includes('v:NVIDIA') && fams.includes('f:nvidia-cuda-pro') && fams.includes('v:CPU'), 'family options: ' + fams);
    for (const f of ['v:Apple', 'f:nvidia-cuda', 'f:amd-rocm-instinct', 'v:CPU']) {
      await p.ev(`(() => { const s = document.getElementById('fitsFam'); s.value = '${f}'; s.dispatchEvent(new Event('change')); })()`); await sleep(150);
      const g = await p.ev(`(() => { const rows = FITS.view.map(r => r.mk); const opts = [...document.querySelectorAll('#fitsMach option')].map(o => o.value).filter(v => v !== 'all'); const t = document.querySelector('#fitsIn .fw-tbl'); return [rows.length, rows.every(k => machineMatches(MACHINES[k], '${f}')), opts.every(k => machineMatches(MACHINES[k], '${f}')), opts.length, new Set(rows).size, t.scrollWidth <= t.clientWidth + 1]; })()`);
      assert(g[0] > 0 && g[1], `${lg} ${f}: rows outside the filter ` + JSON.stringify(g));
      assert(g[2] && g[3] === g[4], `${lg} ${f}: the machine list does not follow the filter ` + JSON.stringify(g));
      assert(g[5], `${lg} ${f}: horizontal scroll`);
    }
    // a machine picked, then a family it is not in: the machine filter resets instead of showing nothing
    await p.ev(`(() => { const s = document.getElementById('fitsFam'); s.value = 'all'; s.dispatchEvent(new Event('change')); const m = document.getElementById('fitsMach'); m.value = 'm4max'; m.dispatchEvent(new Event('change')); })()`); await sleep(150);
    assert((await p.ev(`document.querySelectorAll('#fitsIn tbody tr[data-fr^="m4max|"]').length`)) === (await p.ev('presetModels().length * 5')), 'machine filter m4max');
    await p.ev(`(() => { const s = document.getElementById('fitsFam'); s.value = 'v:NVIDIA'; s.dispatchEvent(new Event('change')); })()`); await sleep(150);
    assert(await p.ev(`FITS.machine === 'all' && document.querySelectorAll('#fitsIn tbody tr[data-fr]').length > presetModels().length * 5`), 'the machine filter did not reset');
    await p.ev(`(() => { const c = document.getElementById('fitsOnly'); c.checked = true; c.dispatchEvent(new Event('change')); })()`); await sleep(150);
    assert(await p.ev(`[...document.querySelectorAll('#fitsIn .fp')].every(f => !f.classList.contains('no'))`), 'only what fits with a family');
    const o = await overflowIn('#loadout *'); assert(!o.length, `${lg}: overflow ${JSON.stringify(o)}`);
    await p.ev(`(() => { const c = document.getElementById('fitsOnly'); c.checked = false; c.dispatchEvent(new Event('change')); const s = document.getElementById('fitsFam'); s.value = 'all'; s.dispatchEvent(new Event('change')); })()`); await sleep(200);
    await shotTo(`fits-catalogue-${lg}`);
    await p.ev(`(() => { const s = document.getElementById('fitsFam'); s.value = 'v:Apple'; s.dispatchEvent(new Event('change')); })()`); await sleep(200);
    await shotTo(`fits-apple-${lg}`);
    await p.ev(`FITS.fam = 'all'; FITS.machine = 'all'; FITS.only = false; fitsOpen(false)`);
  }
});

await check('Machine catalogue: every preset is a card with its provenance and family, the filter narrows it, both languages', async () => {
  for (const lg of ['en', 'es']) {
    await fresh(lg === 'es' ? '?lang=es' : '', 1280, 720);
    await p.ev(`openLoadout('machine')`); await sleep(400);
    const n = await p.ev(`document.querySelectorAll('#loadout .card .choose[data-m], #loadout .card .choose:disabled').length`);
    assert(n === (await p.ev(`Object.keys(MACHINES).length`)), `${lg}: ${n} cards`);
    const tags = await p.ev(`[...document.querySelectorAll('#loadout .card')].map(c => [c.querySelector('header b').textContent, c.querySelector('.tagp').textContent, !!c.querySelector('.desc.fam')])`);
    const cal = tags.filter(t => /calibrated|calibrada/.test(t[1])).map(t => t[0]);
    assert(cal.length === 2 && cal.every(nm => /ThinkPad/.test(nm)), `${lg}: calibrated cards ${JSON.stringify(cal)}`);
    assert(tags.every(t => t[2]), `${lg}: a card without its family line`);
    await p.ev(`(() => { const s = document.getElementById('famSel'); s.value = 'f:apple-metal-na'; s.dispatchEvent(new Event('change')); })()`); await sleep(250);
    const names = await p.ev(`[...document.querySelectorAll('#loadout .card header b')].map(b => b.textContent)`);
    assert(names.length >= 6 && names.every(nm => /M5|M6/.test(nm)), `${lg}: family filter ${JSON.stringify(names)}`);
    const o = await overflowIn('#loadout *'); assert(!o.length, `${lg}: overflow ${JSON.stringify(o)}`);
    await shotTo(`catalogue-m5-${lg}`);
    await p.ev(`(() => { const s = document.getElementById('famSel'); s.value = 'all'; s.dispatchEvent(new Event('change')); })()`); await sleep(300);
    const o2 = await overflowIn('#loadout *'); assert(!o2.length, `${lg}: overflow ${JSON.stringify(o2)}`);
    await shotTo(`catalogue-all-${lg}`);
    await p.ev(`LOAD.fam = 'all'; document.getElementById('loadClose').click()`);
  }
});

await check('Model catalogue: every model is a card with its family, source and date, the filter narrows it, both languages', async () => {
  for (const lg of ['en', 'es']) {
    await fresh(lg === 'es' ? '?lang=es' : '', 1280, 720);
    await p.ev(`openLoadout('model')`); await sleep(400);
    const cards = await p.ev(`[...document.querySelectorAll('#loadout .card.mcard')].map(c => [c.querySelector('header b').textContent, (c.querySelector('.desc.fam') || {}).textContent || '', !!c.querySelector('.desc.fam a[href^="https://"]'), !!c.querySelector('.desc.fam .apx')])`);
    // a model connected in Real machine earlier (MODELS.live) keeps its card; every preset has one, with its provenance
    const names = await p.ev('presetModels().map(k => MODELS[k].name)'), all = cards.length;
    assert(all === (await p.ev('Object.keys(MODELS).length')) && names.every(nm => cards.some(c => c[0] === nm)), `${lg}: ${all} cards`);
    cards.splice(0, all, ...cards.filter(c => names.includes(c[0])));
    assert(cards.every(c => /\d{4}-\d{2}-\d{2}/.test(c[1])), `${lg}: a card without its date ${JSON.stringify(cards.filter(c => !/\d{4}/.test(c[1])))}`);
    assert(cards.filter(c => !c[2]).every(c => /Qwen3\.[68]/.test(c[0])), `${lg}: only the GGUF-read Qwen models have no link ${JSON.stringify(cards.filter(c => !c[2]))}`);
    assert(cards.filter(c => /Gemma 3|gpt-oss/.test(c[0])).every(c => c[3]), `${lg}: the sliding-window models do not say they are approximated`);
    const groups = await p.ev(`[...document.querySelectorAll('#model optgroup')].map(g => g.label)`);
    assert(['Qwen', 'Meta', 'OpenAI', 'Google', 'Mistral AI', 'Microsoft'].every(v => groups.includes(v)), 'Setup model groups: ' + groups);
    for (const [f, re] of [['v:Google', /^Gemma 3/], ['f:Qwen3', /^Qwen3 /], ['f:Llama 3', /^Llama 3\./], ['v:OpenAI', /^(GPT-3|gpt-oss)/]]) {
      await p.ev(`(() => { const s = document.getElementById('mfamSel'); s.value = ${JSON.stringify(f)}; s.dispatchEvent(new Event('change')); })()`); await sleep(200);
      const names = await p.ev(`[...document.querySelectorAll('#loadout .card header b')].map(b => b.textContent)`);
      assert(names.length >= 2 && names.every(nm => re.test(nm)), `${lg} ${f}: ${JSON.stringify(names)}`);
    }
    const o = await overflowIn('#loadout *'); assert(!o.length, `${lg}: overflow ${JSON.stringify(o)}`);
    await p.ev(`(() => { const s = document.getElementById('mfamSel'); s.value = 'all'; s.dispatchEvent(new Event('change')); })()`); await sleep(300);
    const o2 = await overflowIn('#loadout *'); assert(!o2.length, `${lg}: overflow ${JSON.stringify(o2)}`);
    await shotTo(`models-catalogue-${lg}`);
    await p.ev(`LOAD.mfam = 'all'; document.getElementById('loadClose').click()`);
  }
});

// Every model on the default machine: every view and phase, the matrix, row and number close-ups (an expert's too, for a
// mixture of experts), a token's KV and the expert inspector; no page error and no canvas text cut.
await check('every model on the default machine draws every view with no error and no text cut, both languages', async () => {
  const shots = { 'qwen2.5-32b': 'dense', 'gpt-oss-120b': 'moe', 'llama3.3-70b': 'large' };
  for (const [w, h, langs] of [[1280, 720, ['en', 'es']], [1440, 900, ['en']]]) for (const lg of langs) {
    await fresh(lg === 'es' ? '?lang=es' : '', w, h);
    const bad = [];
    for (const k of await p.ev('presetModels()')) {
      const e0 = p.errors.length;
      await p.ev(`window.__TRUNC = new Set(); S.model = '${k}'; S.quant = 'Q4_K_M'; UI.layer = -1; changed()`); await sleep(120);
      for (const st of ['P.t = 0', 'P.t = R.ttft * .5', 'P.t = R.ttft + (R.total - R.ttft) * .3', 'P.t = R.total'])
        for (const l of ['system', 'model', 'memory', 'tokens']) { await p.ev(`${st}; setPlaying(false); select(null); setLens('${l}')`); await sleep(70); }
      await p.ev(`P.t = R.ttft + (R.total - R.ttft) * .3; setPlaying(false); setLens('model'); UI.modelMode = 'stack'; renderMmode()`); await sleep(120);
      const zs = [`ZOOM.model = [{ k: 'mat', layer: 3, name: R.sh.attn[0][0], shape: R.sh.attn[0] }]`, `ZOOM.model.push({ k: 'row', layer: 3, name: R.sh.attn[0][0], shape: R.sh.attn[0], r: 0 })`, `ZOOM.model.push({ k: 'num', layer: 3, name: R.sh.attn[0][0], shape: R.sh.attn[0], r: 0, i: 2 })`];
      if (await p.ev('!!R.sh.expert')) zs.push(`ZOOM.model = [{ k: 'expert', layer: 3, e: chosenExperts(R.segs[R.firstDecode].tok || 0, 3)[0] }]`, `ZOOM.model.push({ k: 'mat', layer: 3, name: R.sh.expert[0][0], shape: R.sh.expert[0], e: 1 })`,
        `ZOOM.model.push({ k: 'row', layer: 3, name: R.sh.expert[0][0], shape: R.sh.expert[0], r: 0, e: 1 })`, `ZOOM.model.push({ k: 'num', layer: 3, name: R.sh.expert[0][0], shape: R.sh.expert[0], r: 0, i: 2, e: 1 })`, `ZOOM.model = []; select({ k: 'expert', layer: 3, e: 0 })`);
      for (const z of zs) { await p.ev(z); await sleep(90); }
      await p.ev(`ZOOM.model = []; select(null); UI.modelMode = 'grid'; renderMmode(); setLens('memory'); ZOOM.memory = [{ k: 'tok', t: Math.min(R.prompt - 1, 100) }]`); await sleep(90);
      await p.ev(`ZOOM.memory = []`);
      if (SHOTS && shots[k] && w === 1280) for (const l of ['system', 'model', 'memory', 'tokens']) { await p.ev(`P.t = R.ttft + (R.total - R.ttft) * .3; setPlaying(false); setLens('${l}')`); await shotTo(`model-${shots[k]}-${k}-${l}-${lg}`); }
      if (SHOTS && shots[k] && w === 1280) { await p.ev(`setLens('model'); UI.modelMode = 'stack'; renderMmode()`); await shotTo(`model-${shots[k]}-${k}-matrices-${lg}`); await p.ev(`UI.modelMode = 'grid'; renderMmode()`); }
      const cut = await p.ev(`[...window.__TRUNC]`), errs = p.errors.slice(e0);
      if (cut.length || errs.length) bad.push({ k, cut, errs: errs.map(e => e.slice(0, 200)) });
      p.errors.length = e0; // reported once, here, with the model it belongs to
    }
    assert(!bad.length, `${w}x${h} ${lg}: ${JSON.stringify(bad)}`);
  }
});

const stateNow = () => p.ev(`JSON.stringify([S, UI.lens, UI.modelMode, +P.t.toFixed(6), UI.layer, UI.scale])`);
await check('Copy link: the link round-trips in a fresh page, with and without the moment, and opens Simulated', async () => {
  await fresh('', 1280, 720);
  const setup = `S.machine = 'rtx4090'; Object.assign(S, machineFields('rtx4090')); S.vbw = 900; S.model = 'llama8b'; S.quant = 'Q6_K'; S.kv = 'q8_0'; S.ctx = 32768; S.docs = 12000; S.ans = 420; S.temp = .35; S.topk = 3; S.topp = .8; S.seed = 7; S.cached = true; S.mtp = false; S.spec = true; S.gamma = 5; S.keepalive = 12; changed(); setLens('memory'); UI.modelMode = 'stack'; renderMmode(); setPlaying(false)`;
  await p.ev(setup); await p.ev(`LINK_AT = false; document.getElementById('linkBtn').click()`); await sleep(300);
  assert(/Link copied|Copy failed/.test(await p.ev(`document.getElementById('toast').textContent`)), 'no toast');
  const url = await p.ev('window.__link'); assert(url.length < 260 && /m=rtx4090/.test(url) && /vb=900/.test(url) && !/vr=/.test(url) && !/at=/.test(url), 'link: ' + url);
  const a = await stateNow(); await fresh(url.replace(base, ''), 1280, 720); const b = await stateNow();
  assert(a === b, 'not restored exactly:\n' + a + '\n' + b);
  await p.ev(`P.t = R.ttft + 1.25; setPlaying(false); document.getElementById('linkBtn').click()`); await sleep(200);
  await p.ev(`(() => { const c = document.getElementById('linkAt'); c.checked = true; c.dispatchEvent(new Event('change')); })()`); await sleep(300);
  const url2 = await p.ev('window.__link'); assert(/at=/.test(url2), 'the moment is not in the link: ' + url2);
  const a2 = await stateNow(); await fresh(url2.replace(base, ''), 1280, 720); const b2 = await stateNow();
  assert(a2 === b2, 'not restored exactly with the moment:\n' + a2 + '\n' + b2);
  await p.ev(`LINK_AT = false; localStorage.removeItem('tw.linkAt')`);
  // a shared link opens Simulated even where the last session was Real
  await p.ev(`localStorage.setItem('tw.mode', 'real')`); await p.open(url2); await sleep(300);
  assert((await p.ev(`MODE.m`)) === 'sim' && (await p.ev(`S.machine + S.model`)) === 'rtx4090llama8b', 'the link did not open in the simulation as written');
  await p.ev(`localStorage.removeItem('tw.mode')`);
});

await check('Copy link: defaults give a clean address; old and invalid params are handled', async () => {
  await fresh('', 1280, 720);
  await p.ev(`document.getElementById('linkBtn').click()`); await sleep(200);
  assert((await p.ev('window.__link')) === base, 'defaults-only link is not clean: ' + await p.ev('window.__link'));
  assert((await p.ev('location.search')) === '', 'the address bar is not clean at defaults');
  await fresh('?machine=rtx5090&model=qwen38&quant=Q8_0&history=1000&question=40&answer=200&cache=1&view=memory&layer=3', 1280, 720);
  assert(await p.ev(`S.machine === 'rtx5090' && S.model === 'qwen38' && S.quant === 'Q8_0' && S.docs === 1000 && S.q === 40 && S.ans === 200 && S.cached && UI.lens === 'memory' && UI.layer === 2`), 'an old link: ' + await p.ev('JSON.stringify(S)'));
  await fresh('?m=nope&mo=live&qt=Q9&kv=x&ctx=abc&temp=99&ans=-4&doc=&pc=maybe&v=nowhere&mm=odd&at=zz', 1280, 720);
  const d = await p.ev(`JSON.stringify(defaults())`);
  assert((await p.ev('JSON.stringify(S)')) === d && (await p.ev('UI.lens')) === 'system' && (await p.ev('P.t')) === 0, 'invalid params were not ignored: ' + await p.ev('JSON.stringify(S)'));
});

await check('Restore defaults: asks when there are changes, restores, and Undo brings the change back', async () => {
  await fresh('', 1280, 720); await sleep(300);
  assert(await p.ev(`document.getElementById('rstBtn').disabled`), '↺ is enabled with nothing to restore');
  assert(!(await p.ev(`!!document.getElementById('reset')`)), 'the top-bar Reference machine button is still there');
  assert(/reference machine \(ThinkPad · Radeon 860M, calibrated\)/.test(await p.ev(`document.getElementById('rstBtn').title`)), 'tooltip: ' + await p.ev(`document.getElementById('rstBtn').title`));
  await p.ev(`pushUndo(); S.machine = 'm4max'; Object.assign(S, machineFields('m4max')); S.ans = 900; S.temp = 1.2; changed()`); await sleep(300);
  const s1 = await p.ev('JSON.stringify(S)');
  await p.ev(`document.getElementById('rstBtn').click()`); await sleep(150);
  assert(await p.ev(`!document.getElementById('rstAsk').hidden`), 'no confirmation');
  await p.ev(`document.getElementById('rstNo').click()`); await sleep(100);
  assert((await p.ev('JSON.stringify(S)')) === s1, 'Cancel changed the setup');
  await p.ev(`document.getElementById('rstBtn').click()`); await sleep(150); await p.ev(`document.getElementById('rstGo').click()`); await sleep(200);
  assert(await p.ev('isDefault()'), 'not restored');
  await p.ev(`document.getElementById('undoBtn').click()`); await sleep(150);
  assert((await p.ev('JSON.stringify(S)')) === s1, 'Undo did not bring the change back');
});

await check('Restore defaults in Real: only the request and sampling, never the connection; What fits sets only Estimate as', async () => {
  await fresh(); await p.ev(mockOllama(false)); await toReal();
  await p.ev(`LIVE.maxTok = 200; LIVE.promptMode = 'long'; S.temp = 1.4; S.seed = 9; saveReal(); changed()`); await sleep(400);
  const before = await p.ev(`JSON.stringify([LIVE.ep, LIVE.pick, LIVE.status, S.machine, S.model])`);
  await p.ev(`document.getElementById('rstBtn').click()`); await sleep(150); await p.ev(`document.getElementById('rstGo').click()`); await sleep(300);
  assert((await p.ev(`JSON.stringify([LIVE.maxTok, LIVE.promptMode, S.temp, S.seed])`)) === JSON.stringify([64, 'short', 0.7, 1]), 'request / sampling not restored');
  assert((await p.ev(`JSON.stringify([LIVE.ep, LIVE.pick, LIVE.status, S.machine, S.model])`)) === before && (await p.ev('MODE.m')) === 'real', 'the connection changed');
  await p.ev(`document.getElementById('undoBtn').click()`); await sleep(200);
  assert((await p.ev(`JSON.stringify([LIVE.maxTok, LIVE.promptMode, S.temp, S.seed])`)) === JSON.stringify([200, 'long', 1.4, 9]), 'Undo in Real');
  await p.ev(`FITS.machine = 'h100'; fitsOpen(true)`); await sleep(300);
  assert(/Estimate as/.test(await p.ev(`document.getElementById('fitsIn').textContent`)), 'no Real note');
  assert((await p.ev(`[...document.querySelectorAll('#loadout [data-lt]')].filter(b => b.disabled).map(b => b.dataset.lt).join()`)) === 'machine,model', 'Real: Machines and Models should be disabled');
  const pick = await p.ev('LIVE.pick');
  await p.ev(`document.querySelector('#fitsIn tbody tr[data-fr^="h100|qwen38|"]').click()`); await sleep(300);
  assert((await p.ev(`S.machine + '|' + S.model + '|' + LIVE.pick`)) === 'h100|live|' + pick, 'the row changed more than Estimate as');
  await p.ev(`FITS.machine = 'all'; leaveReal(true)`);
});

await check('History keeps the whole run: after 300 events the load and first prefill lines are still listed', async () => {
  await fresh('?cold=1&mtp=0', 1280, 720);
  await p.ev(`P.t = R.total; setPlaying(false); document.getElementById('logBtn').click()`); await sleep(400);
  assert((await p.ev(`segAt(P.t)`)) > 300, 'fewer than 300 events');
  assert(await p.ev(`!!document.querySelector('#log li.k-load') && /Chunk 1 of/.test(document.getElementById('log').textContent)`), 'the start of the run is gone');
  const blocks = await p.ev(`document.querySelectorAll('#log [data-lblk]').length`); assert(blocks === 6, 'decode blocks: ' + blocks);
  await p.ev(`document.querySelector('#log [data-lblk="0"]').click()`); await sleep(100);
  assert(/Token 1 /.test(await p.ev(`document.getElementById('log').textContent`)), 'a block did not open');
  await p.ev(`document.getElementById('log').scrollTop = 0; P.t = R.total - 0.5; setPlaying(false)`); await sleep(600);
  assert((await p.ev(`document.getElementById('log').scrollTop`)) === 0, 'the history jumped while reading above');
  assert(/Token 1 /.test(await p.ev(`document.getElementById('log').textContent`)), 'the open block closed on re-render');
  await p.ev(`document.querySelector('#log [data-lph="prefill"]').click()`); await sleep(100);
  const txt = await p.ev(`document.getElementById('log').textContent`);
  assert(!/Chunk 1 of/.test(txt) && /First token/.test(txt), 'the prefill group did not collapse, or hid the first token');
  await p.ev(`document.querySelector('#log [data-lph="prefill"]').click(); document.getElementById('logClose').click()`);
});


await check('Connect window: the agent brief is copied with the origin and the 204 check; the old switch sentence is gone', async () => {
  await fresh('', 1280, 720); await p.ev(mockOllama(true));
  await p.ev(`document.querySelector('#modeSw [data-mode=real]').click()`); await until(`LIVE.status === 'cors'`);
  const txt = await p.ev(`document.getElementById('liveIn').textContent`);
  assert(!/Connecting switches the console/.test(txt), 'the removed sentence is still there');
  assert(/Copy instructions for an AI agent/.test(txt), 'no agent button');
  await p.ev(`document.querySelector('.lv-setup').open = true`); await sleep(100);
  for (const os of ['win', 'mac', 'linux']) {
    await p.ev(`document.querySelector('.lv-os [data-os=${os}]').click()`); await sleep(100); await p.ev(`document.querySelector('.lv-setup').open = true`);
    await p.ev(`document.getElementById('lvAgent').click()`); await sleep(300);
    const b = await p.ev('window.__agentBrief || ""'), origin = await p.ev('location.origin');
    assert(b.includes(`Page origin: ${origin}`) && /204/.test(b) && /-X OPTIONS http:\/\/localhost:11434\/api\/tags -H "Origin: /.test(b), `${os}: brief lacks the origin or the 204 check:\n` + b.slice(0, 400));
    assert(/allows localhost and 127\.0\.0\.1 origins by default/.test(b) && /DO NOT/.test(b) && /0\.0\.0\.0/.test(b) && /OLLAMA_ORIGINS=\*/.test(b) && /REPORT BACK/.test(b), `${os}: brief sections`);
  }
  assert(/Copied|Copy failed/.test(await p.ev(`document.getElementById('toast').textContent`)) && await p.ev(`!document.getElementById('toast').hidden`), 'no toast');
  await shotTo('agent-brief-button');
  for (const lg of ['en', 'es']) { await p.ev(`setLang('${lg}'); renderLive(true); document.querySelector('.lv-setup').open = true`); await sleep(200); const o = await overflowIn('#liveWin *'); assert(!o.length, `${lg}: overflow in the connect window ${JSON.stringify(o)}`); }
  await p.ev(`setLang('en'); liveOpen(false)`);
});

const measFixture = JSON.parse(fs.readFileSync('tests/fixtures/measurement-ollama.json', 'utf8'));
await check('Share a measurement: the window shows the payload without the prompt, and the issue link is well formed and under the limit', async () => {
  await fresh('', 1280, 720); await p.ev(mockOllama(false)); await toReal();
  assert(!(await p.ev(`!!document.getElementById('lvShare')`)), 'Share is offered before a run');
  await p.ev(`window.__lag = 2300; document.getElementById('play').click()`); await until('!LIVE.running && !!LIVE.run', 8000); await p.ev('window.__lag = 0'); await sleep(300);
  assert(await p.ev(`!!document.getElementById('lvShare')`), 'no Share button after a finished run');
  await p.ev(`localStorage.removeItem('tw.shareHw'); Object.assign(SHARE, { hw: '', device: '', cpu: '', gpu: '', memGB: '', memType: '', os: '', kv: 'f16' })`);
  await p.ev(`document.getElementById('lvShare').click()`); await until(`!document.getElementById('shareWin').hidden && !!document.getElementById('shPrev')`);
  await sleep(300);
  const prompt = await p.ev('LIVE.run.prompt'), answer = await p.ev('LIVE.run.text'), ep = await p.ev('LIVE.ep');
  const all = await p.ev(`document.getElementById('shareIn').textContent + document.getElementById('shJson').textContent`);
  for (const [what, v] of [['prompt', prompt.slice(0, 40)], ['answer', answer.trim().slice(0, 30)], ['address', ep]]) assert(!all.includes(v), `the ${what} is in the share window`);
  assert(/Never sent: the prompt, the answer, the server address/.test(all), 'no privacy line');
  assert(await p.ev(`document.getElementById('shOpen').disabled`), 'Open is allowed before the hardware is named');
  assert(/Name your hardware first/.test(all), 'no reason given');
  await shotTo('share-01-unnamed');
  await p.ev(`(() => { const s = document.getElementById('shHw'); s.value = 'thinkpad'; s.dispatchEvent(new Event('change')); })()`); await sleep(200);
  const sh = await p.ev('JSON.stringify(window.__share)'), share = JSON.parse(sh);
  assert(share.url && share.url.url, 'no URL after naming the hardware');
  const u = new URL(share.url.url);
  assert(u.origin + u.pathname === 'https://github.com/yago-mendoza/tokenwalk/issues/new' && u.searchParams.get('template') === 'measurement.yml', 'URL: ' + share.url.url.slice(0, 120));
  assert(share.url.url.length <= 7500, 'URL is ' + share.url.url.length + ' characters');
  assert(/^Measurement: ThinkPad · Radeon 860M · qwen3\.6:35b-a3b Q4_K_M$/.test(u.searchParams.get('title')), 'title: ' + u.searchParams.get('title'));
  assert(u.searchParams.get('preset') === 'thinkpad', 'preset field');
  const m = JSON.parse(u.searchParams.get('measurement'));
  assert(JSON.stringify(m) === JSON.stringify(share.payload), 'the JSON in the link is not the one shown');
  const v = validateMeasurement(m); assert(v.ok, 'the payload does not validate: ' + v.errors.join('; '));
  assert(m.request.promptTokens === 36 && m.request.answerTokens === 80 && m.timings.ollama.eval_count === 80 && !('context' in m.timings.ollama), 'payload timings');
  assert(m.model.digest && m.model.digest.startsWith('a7eb95c5') && m.server.version === '0.40.7' && m.estimate.machine === 'thinkpad' && m.estimate.decodeTps > 0, 'payload model / server / estimate');
  assert(!JSON.stringify(m).includes(prompt.slice(0, 20)) && !JSON.stringify(m).includes('localhost'), 'prompt or address in the payload');
  assert((await p.ev(`document.querySelectorAll('#shareIn table.sh-t tr').length`)) === 8, 'the readable table');
  await p.ev(`document.querySelector('#shareIn .sh-raw').open = true`); await sleep(150);
  await shotTo('share-02-preset');
  // Other needs at least one field, and pre-fills nothing it does not know
  await p.ev(`(() => { const s = document.getElementById('shHw'); s.value = 'other'; s.dispatchEvent(new Event('change')); })()`); await sleep(200);
  assert(await p.ev(`!!document.getElementById('shDev') && !!document.getElementById('shMem')`), 'no free fields for Other');
  if (!(await p.ev(`SHARE.gpu`))) assert(await p.ev(`document.getElementById('shOpen').disabled`), 'Other with nothing filled can be opened');
  await p.ev(`(() => { const i = document.getElementById('shDev'); i.value = 'Framework 13'; i.dispatchEvent(new Event('input')); const g = document.getElementById('shMem'); g.value = '32'; g.dispatchEvent(new Event('input')); })()`); await sleep(200);
  const s2 = JSON.parse(await p.ev('JSON.stringify(window.__share)'));
  assert(s2.url.url && s2.payload.hardware.device === 'Framework 13' && s2.payload.hardware.memoryGB === 32 && validateMeasurement(s2.payload).ok, 'Other payload');
  assert(new URL(s2.url.url).searchParams.get('device') === 'Framework 13', 'device field not prefilled');
  await shotTo('share-03-other');
  // a payload too long for a link: the optional fields go first, then the link itself
  // (a growing payload walks through every level in order: pretty JSON with every field, compact, preset only, JSON only, none)
  const lv = await p.ev(`(() => { const lev = []; for (let n = 0; n <= 1500; n += 1) { const u = shareUrl({ ...window.__share.payload, pad: Array(n).fill('y') }); lev.push(u.level); if (u.url && u.url.length > 7500) return 'over'; } return [lev, shareUrl({ ...window.__share.payload, pad: Array(90).fill('z'.repeat(100)) })]; })()`);
  const order = l => (l === -1 ? 9 : l);
  assert(lv !== 'over' && [0, 1, 2, 3, -1].every(l => lv[0].includes(l)) && lv[0].every((l, i) => i === 0 || order(l) >= order(lv[0][i - 1])), 'fallback levels: ' + JSON.stringify(lv && lv[0]));
  assert(lv[1].url === null && /issues\/new\?template=measurement\.yml$/.test(lv[1].form), 'last resort: ' + JSON.stringify(lv[1]).slice(0, 200));
  for (const lg of ['en', 'es']) {
    await p.ev(`setLang('${lg}'); shareRender(); document.querySelector('#shareIn .sh-raw').open = true`); await sleep(250);
    const g = await p.ev(`(() => { const c = document.querySelector('#shareWin .card').getBoundingClientRect(), b = document.querySelector('#shareWin .sh-body'); return [c.top, c.bottom, c.left, c.right, innerWidth, innerHeight, b.scrollWidth, b.clientWidth]; })()`);
    assert(g[0] >= 0 && g[1] <= g[5] && g[2] >= 0 && g[3] <= g[4] && g[6] <= g[7] + 1, `${lg}: the share window leaves the screen or scrolls sideways ` + JSON.stringify(g));
    const o = await overflowIn('#shareWin *'); assert(!o.length, `${lg}: overflow ${JSON.stringify(o)}`);
    if (lg === 'es') await shotTo('share-04-es');
  }
  await p.ev(`setLang('en'); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await sleep(150);
  assert(await p.ev(`document.getElementById('shareWin').hidden`), 'Esc did not close the share window');
  await shotTo('share-00-monitor-button');
  const o = await overflowIn('#liveSec *'); assert(!o.length, 'overflow in Estimate vs measured: ' + JSON.stringify(o));
  await p.ev(`localStorage.removeItem('tw.shareHw'); leaveReal(true)`);
});

await check('What fits: a row with accepted measurements shows them, with n, the spread and the source issues', async () => {
  for (const lg of ['en', 'es']) {
    await fresh(lg === 'es' ? '?lang=es' : '', 1280, 720);
    const rec = (n, tps, prompt) => ({ issue: n, url: `https://github.com/yago-mendoza/tokenwalk/issues/${n}`, submitted: '2026-10-24', m: { ...measFixture, request: { ...measFixture.request, promptTokens: prompt }, timings: { ollama: { ...measFixture.timings.ollama, prompt_eval_count: prompt } }, derived: { ...measFixture.derived, decodeTps: tps, ttftS: prompt / 100 } } });
    await p.ev(`setMeasurements(${JSON.stringify([rec(12, 9.04, 6400), rec(15, 11.5, 36), rec(19, 10.1, 7000), { ...rec(21, 40, 36), m: { ...rec(21, 40, 36).m, hardware: { preset: 'rtx4090' } } }])}); FITS.model = 'm:qwen36'; fitsOpen(true)`); await sleep(300);
    const row = `#fitsIn tr[data-fr="thinkpad|qwen36|Q4_K_M"]`;
    const r = await p.ev(`(() => { const t = document.querySelector('${row}'); return [!!t.querySelector('.mtag'), t.querySelector('.mtag').textContent, t.cells[4].textContent, t.cells[5].textContent, t.querySelector('.c-tps .ms').title, t.querySelector('.c-ttft .ms').title]; })()`);
    assert(r[0] && /×3/.test(r[1]), `${lg}: tag ` + JSON.stringify(r));
    assert(/10[.,]1$/.test(r[3]) && /median of 3, 9[.,]0 to 11[.,]5|mediana de 3, de 9[.,]0 a 11[.,]5/.test(r[4]), `${lg}: decode median of 3 with its spread: ` + JSON.stringify(r));
    assert(/(median of|mediana de) 2/.test(r[5]) && /67 s/.test(r[2]), `${lg}: first token from the two runs near 6,500 tokens: ` + JSON.stringify(r));
    assert((await p.ev(`document.querySelector('${row} .c-ttft .ms').textContent`)).length > 0 && !(await p.ev(`document.querySelector('${row} .c-ttft .ms').classList.contains('none')`)), 'no measured TTFT');
    assert(await p.ev(`!!document.querySelector('#fitsIn tr[data-fr="rtx4090|qwen36|Q4_K_M"] .mtag') && !document.querySelector('#fitsIn tr[data-fr="rtx4090|qwen36|Q4_K_M"] .c-ttft .ms:not(.none)')`), 'the 4090 run (36-token prompt) should show — for first token');
    assert(await p.ev(`[...document.querySelectorAll('#fitsIn tbody tr[data-fr]')].filter(t => !t.querySelector('.mtag')).every(t => MACHINES[t.dataset.fr.split('|')[0]].estimate === 'calibrated' ? /calibrated|calibrada/.test(t.cells[0].textContent) : /estimate|estimada/.test(t.cells[0].textContent))`), 'unmeasured rows lost their estimate tag');
    await p.ev(`document.querySelector('${row} .mtag').click()`); await sleep(200);
    assert(await p.ev(`${fitsTab} && S.machine === 'thinkpad'`), 'the tag click loaded the row or closed the tab');
    const links = await p.ev(`[...document.querySelectorAll('#fitsIn tr.mdet a')].map(a => a.href)`);
    assert(links.join() === [12, 15, 19].map(n => `https://github.com/yago-mendoza/tokenwalk/issues/${n}`).join(), 'detail links: ' + links);
    assert(/Ollama 0\.40\.7/.test(await p.ev(`document.querySelector('#fitsIn tr.mdet').textContent`)), 'no server version in the detail');
    const g = await p.ev(`(() => { const t = document.querySelector('#fitsIn .fw-tbl'); return [t.scrollWidth, t.clientWidth]; })()`);
    assert(g[0] <= g[1] + 1, `${lg}: horizontal scroll ${g}`);
    const o = await overflowIn('#loadout *'); assert(!o.length, `${lg}: overflow ${JSON.stringify(o)}`);
    await p.ev(`document.querySelector('#fitsIn tr.mdet').scrollIntoView({ block: 'center' })`); await shotTo(`fits-measured-${lg}`);
    await p.ev(`setMeasurements([]); FITS.model = 'all'; fitsOpen(false)`);
  }
});

await check('Flow draws one layer as a circuit from the model, and the address line names every level at its own speed', async () => {
  await fresh('?mo=qwen36');
  await p.ev(`setLang('en'); setLens('flow'); const s = R.segs.find(s => s.k === 'prefill' && s.i === 2); stopAt(s.a + s.d * .5)`); await sleep(500);
  const pre = await p.ev(`document.getElementById('addr').innerText.replace(/\\s+/g, ' ')`);
  assert(/PREFILL/.test(pre) && /chunk 3 ?\/13/.test(pre) && /together/.test(pre) && /layer \d+ ?\/40/.test(pre), 'prefill address: ' + pre);
  await p.ev(`(() => { const s = R.segs.filter(s => s.k === 'decode' || s.k === 'round')[10]; const sp = layerSpan(s, R.kinds.indexOf('attn')); stopAt(sp[0] + (sp[1] - sp[0]) * .3); })()`); await sleep(500);
  const dec = await p.ev(`document.getElementById('addr').innerText.replace(/\\s+/g, ' ')`);
  assert(/DECODE/.test(dec) && /token \d+ ?\/300/.test(dec) && /(row|KV token|state head|expert|matri)/.test(dec), 'decode address: ' + dec);
  const ids = await p.ev(`FL.items.map(i => i.id).join()`);
  for (const id of ['embed', 'q', 'k', 'v', 'scores', 'softmax', 'mix', 'o', 'kvK', 'kvV', 'router', 'grid', 'eg', 'eu', 'ed', 'esum', 'head', 'sample', 'pillar']) assert(ids.split(',').includes(id), `Qwen3.6 attention layer lacks ${id}`);
  assert(await p.ev(`FL.cards.map(c => c.title).join()`) === 'Attention,Experts', 'section titles');
  // every box's text fits inside it, in both languages
  for (const lg of ['en', 'es']) { await p.ev(`setLang('${lg}')`); await sleep(400); const over = await p.ev(`(() => { const c = document.getElementById('cFlow').getContext('2d'), out = []; for (const it of FL.items) { if (!it.title || it.kind === 'chip' || it.kind === 'ebox' || it.kind === 'grid' || it.round || it.inner) continue; c.font = '650 13.5px ' + SANS; const w = c.measureText(it.title).width; c.font = '500 12px ' + FONT; const w2 = it.lane ? 0 : c.measureText(it.sub || '').width; if (Math.max(w, w2) > it.w - 12) out.push(it.id); } return out; })()`); assert(!over.length, `${lg}: text wider than its box: ${over}`); }
  await p.ev(`setLang('en')`);
  // a dense model: a plain feed-forward network, no router
  await fresh('?mo=llama8b&m=rtx4090'); await p.ev(`setLens('flow'); stopAt(R.ttft + 0.05)`); await sleep(500);
  const ld = (await p.ev(`FL.items.map(i => i.id).join()`)).split(',');
  assert(ld.includes('fg') && ld.includes('fu') && ld.includes('fd') && !ld.includes('router'), 'Llama feed-forward: ' + ld);
  // playing fast: the fine levels give their rate instead of digits that would flicker
  await p.ev(`UI.scale = 'request'; UI.speed = 'fit'; setPlaying(true)`); await sleep(1200);
  const fast = await p.ev(`[...document.querySelectorAll('#addr .ad-s.fast .rt')].map(e => e.textContent).join(' | ')`);
  await p.ev(`setPlaying(false)`); await sleep(300);
  assert(/≈/.test(fast), 'no level shows its rate while playing fast: ' + fast);
  assert(!(await p.ev(`document.querySelectorAll('#addr .ad-s.fast').length`)), 'digits stay muted after pausing');
  // a level opens the deep timeline at that element
  await p.ev(`setLens('model'); document.querySelector('#addr [data-k=layer]').click()`); await sleep(900);
  assert(await p.ev(`XP.on && XP.sel && XP.sel.k === 'layer'`), 'the layer level did not open the explorer at a layer');
  await p.ev(`xpClose()`); await sleep(700);
});

if (SHOT) {
  await fresh('?view=model'); await p.ev(`P.t = R.ttft + 8; setPlaying(false)`); await sleep(900);
  await p.shot('docs/screenshot.png'); console.log('wrote docs/screenshot.png');
}
p.close(); if (server) server.kill();
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
