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
  // a Real session left behind by an earlier check would resume on load: forget it and load again
  if (await p.ev(`(() => { const had = !!localStorage.getItem('tw.mode') && localStorage.getItem('tw.mode') !== 'sim'; ['tw.mode', 'tw.simS', 'tw.realS'].forEach(k => localStorage.removeItem(k)); return had; })()`)) await p.open(base + q);
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

if (SHOT) {
  await fresh('?view=model'); await p.ev(`P.t = R.ttft + 8; setPlaying(false)`); await sleep(900);
  await p.shot('docs/screenshot.png'); console.log('wrote docs/screenshot.png');
}
p.close(); if (server) server.kill();
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
