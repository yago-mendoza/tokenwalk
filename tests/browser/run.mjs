// Browser regression checks against the built page: node tests/browser/run.mjs [--shot]
// Serves dist/ with `vite preview` unless BASE_URL is set. Needs Chrome (set CHROME to its path if it is elsewhere).
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import { launch, sleep } from './cdp.mjs';

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
async function fresh(q = '', w = 1440, h = 900) {
  await p.size(w, h); await p.open(base + q);
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
    for (const mk of ['qwen36', 'qwen38', 'llama8b', 'gpt3']) {
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
const fixture = f => JSON.stringify(fs.readFileSync(`tests/fixtures/${f}`, 'utf8'));
const mockOllama = cors => `(() => {
  const files = { '/api/version': ${fixture('ollama-version.json')}, '/api/tags': ${fixture('ollama-tags.json')}, '/api/show': ${fixture('ollama-show-qwen36.json')}, '/api/generate': ${fixture('ollama-generate-warm.ndjson')} };
  window.fetch = async (url, opts = {}) => {
    if (opts.mode === 'no-cors') return new Response('');
    if (${cors}) throw new TypeError('Failed to fetch');
    const path = new URL(url).pathname, body = files[path];
    if (body === undefined) return new Response('not found', { status: 404 });
    if (path === '/api/generate') { const lines = body.split(String.fromCharCode(10)).filter(Boolean); let i = 0;
      return new Response(new ReadableStream({ pull(c) { if (i < lines.length) c.enqueue(new TextEncoder().encode(lines[i++] + String.fromCharCode(10))); else c.close(); } }), { status: 200 }); }
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
})()`;

await check('live mode: a blocked origin explains the OLLAMA_ORIGINS fix', async () => {
  await fresh(); await p.ev(mockOllama(true)); await p.ev(`document.querySelector('[data-acc=live] button').click()`);
  await p.ev('liveDetect()');
  assert((await p.ev('LIVE.status')) === 'cors', 'expected the CORS state');
  assert(/OLLAMA_ORIGINS/.test(await p.ev(`document.getElementById('liveIn').textContent`)), 'the fix is not shown');
});

await check('live mode: detect, run, compare and calibrate against recorded Ollama responses', async () => {
  await fresh(); await p.ev(mockOllama(false)); await p.ev(`document.getElementById('liveOpen').click()`);
  assert(await p.ev(`!document.getElementById('liveWin').hidden`), 'the live window did not open');
  await p.ev('liveDetect()');
  assert((await p.ev(`LIVE.status + LIVE.version + LIVE.models.length`)) === 'ok0.40.72', 'not connected to the mock');
  await p.ev(`LIVE.pick = 'qwen3.6:35b-a3b'; liveRun()`);
  const run = await p.ev('LIVE.run && [LIVE.run.promptN, LIVE.run.evalN, LIVE.run.arrivalsMs.length]');
  assert(run && run[0] === 36 && run[1] === 80 && run[2] === 80, 'run not parsed: ' + JSON.stringify(run));
  assert((await p.ev(`document.querySelectorAll('#liveCmp .lv-r').length`)) === 5, 'the comparison table is missing');
  assert(/live/i.test(await p.ev(`document.getElementById('outStream').textContent`)), 'the live answer is not in Output');
  await sleep(500);
  assert((await p.ev(`document.querySelectorAll('.simonly').length`)) > 5, 'controls the server ignores are not marked');
  assert(/temp/.test(await p.ev(`[...document.querySelectorAll('.livehon')].map(e => (e.querySelector('input,select') || {}).id).join(',')`)), 'temperature is not marked as sent');
  assert(/num_ctx/.test(await p.ev(`document.getElementById('liveSent').textContent`)), 'the sent options are not listed');
  assert(await p.ev(`!!document.querySelector('#chip .lvseg')`), 'the breadcrumb has no live segment');
  await p.ev(`document.getElementById('liveClose').click(); setLens('tokens')`); await sleep(500);
  assert((await p.ev(`document.querySelectorAll('#stream .g.live').length`)) === 80, 'the live tokens are not in the Tokens view');
  await p.ev(`document.querySelector('#stream [data-ltok="3"]').click()`); await sleep(300);
  assert((await p.ev('UI.liveTok')) === 3, 'a live token click is not handled'); await p.ev(`UI.liveTok = null; setLens('system')`);
  await p.ev('liveUseModel()'); assert((await p.ev(`S.model + MODELS.live.layers`)) === 'live40', 'live model not drawn');
  await p.ev('liveCalibrate()'); const d = await p.ev(`[LIVE.est.decodeTps, LIVE.run.evalN / LIVE.run.decodeS]`);
  assert(Math.abs(d[0] - d[1]) / d[1] < 0.02, 'calibrated decode ' + d.join(' vs '));
  await p.ev(`select({ k: 'trend', id: 'tpt' })`); await sleep(300); await p.ev('select(null); liveResetCal(); registerLiveModel(null)');
});

if (SHOT) {
  await fresh('?view=model'); await p.ev(`P.t = R.ttft + 8; setPlaying(false)`); await sleep(900);
  await p.shot('docs/screenshot.png'); console.log('wrote docs/screenshot.png');
}
p.close(); if (server) server.kill();
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
