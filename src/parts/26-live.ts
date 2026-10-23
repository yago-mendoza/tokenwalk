// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Real machine: the connection to a local server and one real request, measured next to the estimate =====
// The mode itself (Simulated or Real machine, and every switch between them) is in 27-mode.ts.
const LIVE = {
  ep: (() => { try { return localStorage.getItem('tw.liveEp') || 'http://localhost:11434'; } catch (e) { return 'http://localhost:11434'; } })(),
  kind: null, status: 'idle', version: '', error: '', fix: '', models: [], pick: '', caps: {},
  promptMode: 'short', own: '', maxTok: 64, running: false, ctl: null, text: '', run: null, est: null, showOut: false, t0: 0, toks: [], sent: null,
};
const LIVE_PROMPTS = () => ({
  short: L('A patient on warfarin is started on amiodarone. In three sentences, what interaction should the clinician watch for, and what should they check?', 'Un paciente con warfarina empieza amiodarona. En tres frases, ¿qué interacción debe vigilar el clínico y qué debe comprobar?'),
  long: (() => { const day = d => `Day ${d}: INR ${(2 + (d % 7) * 0.15).toFixed(1)}, warfarin 5 mg daily, no bleeding, blood pressure ${118 + (d % 9)}/${76 + (d % 5)}, creatinine ${(0.9 + (d % 4) * 0.05).toFixed(2)} mg/dL, notes: stable, adherent, diet unchanged. `;
    return `Patient history (synthetic). ${Array.from({ length: 64 }, (_, i) => day(i + 1)).join('')}\nQuestion: amiodarone 200 mg daily is started today. What interaction should the clinician watch for, and how should the warfarin dose and INR monitoring change? Answer in four sentences.`; })(),
});
const livePrompt = () => (LIVE.promptMode === 'own' ? LIVE.own : LIVE_PROMPTS()[LIVE.promptMode]) || '';

// fetch with a deadline; every request can also be cancelled by the Stop button.
async function liveFetch(path, opts = {}, ms = 4000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(new Error('timeout')), ms);
  const outer = opts.signal; if (outer) outer.addEventListener('abort', () => ctl.abort(outer.reason), { once: true });
  try { return await fetch(LIVE.ep.replace(/\/+$/, '') + path, { ...opts, signal: ctl.signal }); } finally { clearTimeout(timer); }
}
// A browser cannot tell "nothing is listening" from "the server refused this origin" (both are a network error),
// so a second, opaque request settles it: if that one goes through, the server is there and CORS is the problem.
async function liveReachable() { try { await fetch(LIVE.ep, { mode: 'no-cors', signal: AbortSignal.timeout(2500) }); return true; } catch (e) { return false; } }
function liveCorsFix(kind) { return liveCorsFix0(kind) + ' ' + liveCorsCheck(kind); }
function liveCorsCheck(kind) {
  const o = location.origin === 'null' || location.protocol === 'file:' ? 'null' : location.origin, port = kind === 'llama' ? 8080 : 11434, path = kind === 'llama' ? '/props' : '/api/tags';
  return L(`Check: curl -s -o /dev/null -w "%{http_code}" -X OPTIONS http://localhost:${port}${path} -H "Origin: ${o}" -H "Access-Control-Request-Method: GET" prints 204 once it is allowed. Opened from disk (origin null)? Serve it with npm run preview instead.`, `Comprueba: curl -s -o /dev/null -w "%{http_code}" -X OPTIONS http://localhost:${port}${path} -H "Origin: ${o}" -H "Access-Control-Request-Method: GET" devuelve 204 cuando ya está permitido. ¿Abierto desde disco (origen null)? Sírvelo con npm run preview.`);
}
function liveCorsFix0(kind) {
  const o = location.origin === 'null' || location.protocol === 'file:' ? '*' : location.origin;
  return kind === 'llama' ? L(`Start llama-server with --cors-origins ${o} (the default, *, also works).`, `Arranca llama-server con --cors-origins ${o} (el valor por defecto, *, también vale).`)
    : L(`Allow this page in Ollama: set OLLAMA_ORIGINS=${o} and restart Ollama. Windows: setx OLLAMA_ORIGINS "${o}", then quit Ollama from the tray and open it again. macOS: launchctl setenv OLLAMA_ORIGINS "${o}". Linux: add Environment="OLLAMA_ORIGINS=${o}" to the ollama service.`,
      `Permite esta página en Ollama: define OLLAMA_ORIGINS=${o} y reinicia Ollama. Windows: setx OLLAMA_ORIGINS "${o}", y cierra Ollama desde la bandeja y vuelve a abrirlo. macOS: launchctl setenv OLLAMA_ORIGINS "${o}". Linux: añade Environment="OLLAMA_ORIGINS=${o}" al servicio ollama.`);
}

async function liveDetect() {
  LIVE.status = 'busy'; LIVE.error = ''; LIVE.fix = ''; LIVE.models = []; renderLive(true);
  try { localStorage.setItem('tw.liveEp', LIVE.ep); } catch (e) {}
  try {
    let r = null;
    try { r = await liveFetch('/api/version'); } catch (e) { r = null; }
    if (r && r.ok) {
      LIVE.kind = 'ollama'; LIVE.version = (await r.json()).version || '';
      const tags = await (await liveFetch('/api/tags')).json();
      LIVE.models = (tags.models || []).map(m => ({ name: m.name, size: m.size, params: m.details && m.details.parameter_size, quant: m.details && m.details.quantization_level }));
      LIVE.caps = Object.fromEntries((tags.models || []).map(m => [m.name, m.capabilities || []]));
    } else {
      let p = null; try { p = await liveFetch('/props'); } catch (e) { p = null; }
      if (!(p && p.ok)) {
        const there = await liveReachable();
        LIVE.status = there ? 'cors' : 'down'; LIVE.fix = there ? liveCorsFix(LIVE.ep.includes(':8080') ? 'llama' : 'ollama') : L('Nothing answered. Start Ollama (ollama serve) or llama-server, or check the address.', 'Nadie respondió. Arranca Ollama (ollama serve) o llama-server, o revisa la dirección.');
        renderLive(true); modeAfterDetect(); return;
      }
      LIVE.kind = 'llama'; const props = await p.json(); LIVE.version = props.build_info || '';
      const models = await (await liveFetch('/v1/models')).json(); LIVE.llamaInfo = { props, models };
      LIVE.models = (models.data || []).map(d => ({ name: d.id.split(/[\\/]/).pop(), id: d.id, params: d.meta && d.meta.n_params ? `${(d.meta.n_params / 1e9).toFixed(1)}B` : '' }));
    }
    LIVE.status = 'ok'; if (!LIVE.models.some(m => m.name === LIVE.pick)) LIVE.pick = (LIVE.models.find(m => MODELS[S.model] && m.name === MODELS[S.model].tag) || LIVE.models[0] || {}).name || '';
  } catch (e) { LIVE.status = 'error'; LIVE.error = String(e && e.message || e); }
  renderLive(true); modeAfterDetect();
}

async function liveRun() {
  if (LIVE.running || LIVE.status !== 'ok' || !LIVE.pick) return;
  const prompt = livePrompt(); if (!prompt.trim()) return;
  LIVE.running = true; LIVE.text = ''; LIVE.run = null; LIVE.est = null; LIVE.showOut = true; LIVE.error = ''; LIVE.ctl = new AbortController(); LIVE.t0 = performance.now(); renderLive(true);
  const arrivals = []; let first = null, raw = '';
  try {
    const body = liveBody(prompt); LIVE.sent = liveSentList(body); LIVE.toks = []; UI.liveTok = null; streamKey = '';
    const r = await liveFetch(LIVE.kind === 'ollama' ? '/api/generate' : '/completion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: LIVE.ctl.signal }, 15 * 60 * 1000);
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.trim()) continue; raw += l + '\n';
        const o = LIVE.kind === 'ollama' ? JSON.parse(l) : l.startsWith('data: ') && l.slice(6).trim() !== '[DONE]' ? JSON.parse(l.slice(6)) : null;
        const piece = o ? (LIVE.kind === 'ollama' ? o.response : o.content) || '' : '';
        if (piece) { const t = performance.now() - LIVE.t0; if (first === null) first = t; arrivals.push(t); LIVE.text += piece; LIVE.toks.push({ s: piece, t, top: liveTop(o) }); streamKey = ''; }
      }
    }
    if (buf.trim()) raw += buf + '\n';
    const parsed = LIVE.kind === 'ollama' ? parseOllamaStream(raw) : parseLlamaStream(raw);
    if (!parsed.final) throw new Error(L('the stream ended without timings', 'el flujo terminó sin tiempos'));
    LIVE.run = (LIVE.kind === 'ollama' ? ollamaRun : llamaRun)(parsed.final, LIVE.pick, LIVE.text, first === null ? null : first / 1000, arrivals);
    if (LIVE.run.totalS === null || LIVE.kind === 'llama') LIVE.run.totalS = (performance.now() - LIVE.t0) / 1000;
    LIVE.run.prompt = prompt;
    LIVE.est = liveEstimate(LIVE.run);
  } catch (e) { if (!(LIVE.ctl && LIVE.ctl.signal.aborted)) { LIVE.error = String(e && e.message || e); LIVE.running = false; realPoll(true); } }
  LIVE.running = false; LIVE.ctl = null; TCURVE = { r: null, d: {} }; renderLive(true);
}
function liveStop() { if (LIVE.ctl) LIVE.ctl.abort(new Error('stopped')); }

// The simulator's answer to the same request: the measured prompt and answer lengths, cold if the server loaded the model.
function liveEstimate(run) {
  const keep = S, key = MODELS.live && MODELS.live.tag === run.model ? 'live' : S.model;
  S = { ...S, model: key, sys: 0, docs: 0, q: Math.max(1, run.promptN), ans: Math.max(1, run.evalN), cold: (run.loadS || 0) > 1, cached: false, disk: false, spec: false, mtp: liveSentDraft() > 0, ctx: Math.max(S.ctx, run.promptN + run.evalN + 1) };
  let r; try { r = compute(); } finally { S = keep; }
  return { model: key, loadS: r.load, ttftS: r.ttft, prefillTps: r.newTokens / Math.max(1e-9, r.prefill), decodeTps: r.tps, totalS: r.total };
}
function liveCalibrate() {
  const run = LIVE.run; if (!run || locked()) return;
  const key = LIVE.est ? LIVE.est.model : S.model, keepCal = CALIB[S.machine]; saveCalib(S.machine, null);
  // A run decoded with MTP drafting is converted to plain decoding first, with the model's own MTP speed-up at this
  // temperature, so the machine is calibrated on bandwidth and not on how predictable this answer happened to be.
  const mc0 = machine(), m0 = MODELS[key], ctx0 = run.promptN + run.evalN / 2, dr = liveSentDraft();
  // The MTP ratio depends on the bandwidth being solved for, so iterate to the fixed point (three rounds settle it).
  let adj = 1, c = calibrateTo(mc0, m0, S.quant, S.kv, run);
  if (dr > 0 && m0.mtp) for (let it = 0; it < 6; it++) { const mcC = { ...mc0, bwEff: mc0.bwEff * c.bw, tflops: mc0.tflops * c.fl }; adj = mtpTokS(mcC, m0, S.quant, S.kv, ctx0, mtpAlpha(S.temp), dr) / decodeTokS(mcC, m0, S.quant, S.kv, ctx0); c = calibrateTo(mc0, m0, S.quant, S.kv, { ...run, decodeS: run.decodeS * adj }); }
  if (adj !== 1) c.notes.push(L(`decode taken as plain: MTP x${dec(adj.toFixed(2))} removed`, `decode tomado como normal: quitado el MTP x${dec(adj.toFixed(2))}`));
  saveCalib(S.machine, c); if (!keepCal) {} LIVE.calNotes = c.notes; changed(); LIVE.est = liveEstimate(run); renderLive(true);
}
function liveResetCal() { saveCalib(S.machine, null); LIVE.calNotes = []; changed(); if (LIVE.run) LIVE.est = liveEstimate(LIVE.run); renderLive(true); }

// Measured seconds per token, from the arrival of each streamed piece after the first.
function liveTpt() { const a = LIVE.run && LIVE.run.arrivalsMs; if (!a || a.length < 3) return null; const out = []; for (let i = 1; i < a.length; i++) out.push(a[i] - a[i - 1]); return out; }

// The request, from the console's settings: only what this server honours per request is sent.
function liveBody(prompt) {
  if (LIVE.kind === 'ollama') {
    const opts = { num_predict: LIVE.maxTok, num_ctx: S.ctx, temperature: S.temp, top_p: S.topp, seed: S.seed, ...(S.topk < 6 ? { top_k: S.topk } : {}) };
    if (liveHasMtp()) opts.draft_num_predict = S.mtp ? MTP.k : 0;
    return { model: LIVE.pick, prompt, stream: true, keep_alive: `${S.keepalive}m`, logprobs: true, top_logprobs: 5, options: opts, ...((LIVE.caps[LIVE.pick] || []).includes('thinking') ? { think: false } : {}) };
  }
  return { prompt, stream: true, n_predict: LIVE.maxTok, temperature: S.temp, top_p: S.topp, seed: S.seed, cache_prompt: !!S.cached, n_probs: 5, ...(S.topk < 6 ? { top_k: S.topk } : {}) };
}
function liveSentList(b) {
  const o = LIVE.kind === 'ollama' ? { ...b.options, keep_alive: b.keep_alive } : { n_predict: b.n_predict, temperature: b.temperature, top_p: b.top_p, top_k: b.top_k, seed: b.seed, cache_prompt: b.cache_prompt };
  return Object.entries(o).filter(([, v]) => v !== undefined);
}
// The server model has an MTP block when its GGUF says so (read in liveDetect / liveUseModel), or when it is a Qwen preset that does.
const liveSentDraft = () => { const d = LIVE.sent && LIVE.sent.find(([k]) => k === 'draft_num_predict'); return d ? +d[1] : 0; };
function liveHasMtp() { const mm = LIVE.models.find(q => q.name === LIVE.pick); if (mm && mm.mtp !== undefined) return !!mm.mtp; const pre = Object.values(MODELS).find(q => q.tag === LIVE.pick); return !!(pre && pre.mtp); }
// Top alternatives for one streamed piece: Ollama logprobs[].top_logprobs, llama-server completion_probabilities[].top_logprobs (or .probs).
function liveTop(o) {
  if (!o) return null;
  const lp = (o.logprobs && o.logprobs[0]) || (o.completion_probabilities && o.completion_probabilities[0]); if (!lp) return null;
  const alts = lp.top_logprobs || lp.probs || [];
  return { tok: lp.token || lp.content || '', p: lp.logprob !== undefined ? Math.exp(lp.logprob) : lp.prob, alts: alts.map(a => ({ tok: a.token || a.tok_str || '', p: a.logprob !== undefined ? Math.exp(a.logprob) : a.prob })) };
}
// In Real, the settings that are sent with each request are marked; the simulation-only ones are hidden (styles, body.real).
const LIVE_HONOURED = ['temp', 'topk', 'topp', 'seed', 'ctx', 'keepalive'];
let scopeKey = '';
function liveSyncScope() {
  const on = isReal() && LIVE.status === 'ok', key = on ? LIVE.kind + lang : '';
  if (key === scopeKey) return; scopeKey = key;
  document.querySelectorAll('.livehon').forEach(el => { el.classList.remove('livehon'); if (el.dataset.lvTitle !== undefined) { el.title = el.dataset.lvTitle; delete el.dataset.lvTitle; } });
  if (!on) return;
  const ids = LIVE.kind === 'ollama' ? LIVE_HONOURED : ['temp', 'topk', 'topp', 'seed'];
  for (const id of ids) { const el = $(id), b = el && (el.closest('.fld, label.sw') || el); if (!b) continue; b.dataset.lvTitle = b.title || ''; b.title = L('Sent with each real request', 'Se envía con cada petición real'); b.classList.add('livehon'); }
}
function liveOpen(on) { $('liveWin').hidden = !on; if (on) { renderLive(true); const f = $('lvDetect'); if (f && LIVE.status !== 'ok') f.focus(); } else { MODE.editEp = false; } }
$('liveOpen').addEventListener('click', e => { e.stopPropagation(); liveOpen(true); }, true);
$('liveClose').innerHTML = ICON('close', 's'); $('liveClose').addEventListener('click', () => liveOpen(false));
$('liveWin').querySelector('.scrim').addEventListener('click', () => liveOpen(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('liveWin').hidden) { e.stopPropagation(); liveOpen(false); } }, true);
// Tokens view: the live answer as tokens, each with its arrival time and, when the server sends them, its top alternatives.
const liveShowing = () => isReal() && (LIVE.running || LIVE.toks.length > 0);
function liveStreamHtml() {
  const tk = LIVE.toks, from = Math.max(0, tk.length - 240);
  let h = `<span class="lv-tag">${esc(L('real', 'real'))}</span>${from ? '… ' : ''}`;
  for (let i = from; i < tk.length; i++) h += `<span class="g live${UI.liveTok === i ? ' sel' : ''}" data-ltok="${i}" title="${esc(L(`real token ${i + 1} · ${Math.round(tk[i].t)} ms`, `token real ${i + 1} · ${Math.round(tk[i].t)} ms`))}">${esc(i === from ? tk[i].s.trimStart() : tk[i].s)}</span>`;
  if (!tk.length) h += `<span class="ph">${esc(L('Waiting for the first token…', 'Esperando el primer token…'))}</span>`;
  return h;
}
function drawLiveChain(id2, W, H2) {
  const x2 = fit($(id2), W, H2); hitReset(id2);
  const i = UI.liveTok != null && UI.liveTok < LIVE.toks.length ? UI.liveTok : LIVE.toks.length - 1, tk = LIVE.toks[i];
  if (!tk) { text(x2, L('Live answer: click a token to see what the server says about it', 'Respuesta en vivo: pulsa un token para ver qué dice el servidor de él'), 0, 14, C.mid, 'left', 10.5, 600); return; }
  const gap = i > 0 ? tk.t - LIVE.toks[i - 1].t : null;
  text(x2, L(`Live token ${num(i + 1)} “${tk.s.trim()}” · arrived at ${num(Math.round(tk.t))} ms${gap === null ? ' · the first token' : gap < 2 ? ' · together with the previous one (an MTP guess accepted in the same pass)' : ` · ${num(Math.round(gap))} ms after the previous`}`, `Token en vivo ${num(i + 1)} «${tk.s.trim()}» · llegó a los ${num(Math.round(tk.t))} ms${gap === null ? ' · el primer token' : gap < 2 ? ' · junto con el anterior (una conjetura MTP aceptada en la misma pasada)' : ` · ${num(Math.round(gap))} ms después del anterior`}`), 0, 14, '#ff8a95', 'left', 10.5, 650);
  if (!tk.top || !tk.top.alts.length) { textWrap(x2, LIVE.kind === 'ollama' ? L('No probabilities for this piece. With MTP drafting on, Ollama 0.40.7 sends logprobs for only a few tokens (measured: 2 of 16); switch MTP off and run again to get them for every token.', 'Sin probabilidades para este trozo. Con el borrador MTP activo, Ollama 0.40.7 solo envía logprobs para unos pocos tokens (medido: 2 de 16); apaga MTP y vuelve a ejecutar para tenerlos en todos.') : L('Not available from this server.', 'No disponible desde este servidor.'), 0, 40, W, C.dim, 10.5, 400, 3); return; }
  text(x2, L('What the server says it chose from (top alternatives, real probabilities)', 'Entre qué eligió según el servidor (alternativas principales, probabilidades reales)'), 0, 36, C.dim, 'left', 10);
  const lw = Math.min(190, W * .3), bw = W - lw - 70, rh = Math.min(26, (H2 - 50) / Math.max(1, tk.top.alts.length));
  tk.top.alts.forEach((a, j) => { const Y = 48 + j * rh, chosen = a.tok === tk.top.tok; if (chosen) chipRound(x2, 2, Y + rh / 2 - 4, 8, '#ff5d6c'); textFit(x2, a.tok.replace(/\n/g, '⏎') || '∅', 16, Y + rh / 2 + 4, lw - 20, chosen ? '#ffd2d7' : C.ink, 'left', 11, chosen ? 700 : 500); x2.fillStyle = 'rgba(255,255,255,.04)'; x2.fillRect(lw, Y + 4, bw, rh - 9); x2.fillStyle = chosen ? '#ff5d6c' : 'rgba(255,93,108,.45)'; x2.fillRect(lw, Y + 4, Math.max(1.5, bw * (a.p || 0)), rh - 9); text(x2, pct(a.p || 0), lw + bw + 8, Y + rh / 2 + 4, C.mid, 'left', 10); });
}
let chipLive = '';
setInterval(() => { liveSyncScope(); const c = [isReal(), LIVE.status, LIVE.pick, LIVE.running, LIVE.maxTok, LIVE.run && LIVE.run.promptN, LIVE.promptMode, lang].join('|'); if (c !== chipLive) { chipLive = c; syncControls(); } }, 400);

// Setup, the way an empty GitHub repo shows it: numbered steps, each command in a block with a copy button.
// The commands are for this page's origin and the visitor's system (tabs switch it).
let LIVE_OS = /Win/i.test(navigator.platform) ? 'win' : /Mac/i.test(navigator.platform) ? 'mac' : 'linux';
function liveSetupHtml() {
  const o = location.protocol === 'file:' || location.origin === 'null' ? '*' : location.origin, os = LIVE_OS;
  const allow = { win: `setx OLLAMA_ORIGINS "${o}"`, mac: `launchctl setenv OLLAMA_ORIGINS "${o}"`, linux: `sudo systemctl edit ollama.service\n# add under [Service]:\nEnvironment="OLLAMA_ORIGINS=${o}"\nsudo systemctl restart ollama` }[os];
  const restart = { win: L('Quit Ollama from the tray icon and open it again (setx applies to new processes).', 'Cierra Ollama desde el icono de la bandeja y vuelve a abrirlo (setx se aplica a procesos nuevos).'), mac: L('Quit Ollama from the menu bar and open it again.', 'Cierra Ollama desde la barra de menús y vuelve a abrirlo.'), linux: '' }[os];
  const check = `curl -s -o /dev/null -w "%{http_code}" -X OPTIONS http://localhost:11434/api/tags -H "Origin: ${o === '*' ? 'null' : o}" -H "Access-Control-Request-Method: GET"`;
  const block = (cmd) => `<div class="lv-cmd"><pre>${esc(cmd)}</pre><button type="button" class="lv-copy" data-copy="${esc(cmd)}" title="${esc(L('Copy', 'Copiar'))}">${ICON('notes', 's')}<span>${esc(L('Copy', 'Copiar'))}</span></button></div>`;
  const step = (n, t, body) => `<li><b>${n}</b><div><p>${t}</p>${body}</div></li>`;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(location.origin);
  return `<details class="lv-setup" ${LIVE.status === 'cors' ? 'open' : ''}><summary>${esc(L('How to connect your own Ollama', 'Cómo conectar tu propio Ollama'))}</summary>
    <div class="lv-os">${[['win', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux']].map(([k, l]) => `<button type="button" data-os="${k}" aria-pressed="${os === k}">${l}</button>`).join('')}</div>
    <ol>${step(1, L('Install Ollama from <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a> and pull the article’s model:', 'Instala Ollama desde <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a> y descarga el modelo del artículo:'), block('ollama pull qwen3.6:35b-a3b'))}
    ${local ? step(2, L('This page is on localhost, which Ollama already allows. Nothing to change.', 'Esta página está en localhost, que Ollama ya permite. No hay nada que cambiar.'), '') : step(2, L(`Allow this page (${esc(o)}) to talk to Ollama:`, `Permite que esta página (${esc(o)}) hable con Ollama:`), block(allow) + (restart ? `<p class="lv-note">${esc(restart)}</p>` : ''))}
    ${step(3, L('Check it: it prints 204 when allowed, 403 when not.', 'Compruébalo: imprime 204 si está permitido, 403 si no.'), block(check))}
    ${step(4, L('Press Connect above.', 'Pulsa Conectar arriba.'), '')}</ol></details>`;
}
document.addEventListener('click', e => {
  const c = e.target.closest('.lv-copy'); if (c) { navigator.clipboard && navigator.clipboard.writeText(c.dataset.copy).then(() => { c.classList.add('done'); c.querySelector('span').textContent = L('Copied', 'Copiado'); setTimeout(() => { c.classList.remove('done'); c.querySelector('span').textContent = L('Copy', 'Copiar'); }, 1400); }); return; }
  const b = e.target.closest('.lv-os [data-os]'); if (b) { LIVE_OS = b.dataset.os; const d = b.closest('details'); const open = d && d.open; renderLive(true); if (open) { const nd = document.querySelector('.lv-setup'); if (nd) nd.open = true; } }
});
let liveKey = '', liveCmpKey = '';
// The connect window, one state at a time: not connected, connecting, blocked by CORS (with the steps), nothing
// answering, connected (Change server / Disconnect), running (changes wait for the request), lost.
function renderLive(force) {
  const st = LIVE.status, run = LIVE.running, real = isReal(), name = LIVE.kind === 'llama' ? 'llama.cpp' : 'Ollama', ok = st === 'ok';
  const head = {
    idle: [L('Not connected', 'Sin conectar'), '', L('Connect to a local Ollama or llama.cpp server. Nothing is sent until you press Send in the request zone.', 'Conecta con un servidor local de Ollama o llama.cpp. No se envía nada hasta que pulses Enviar en la zona de petición.')],
    busy: [L('Connecting…', 'Conectando…'), '', L(`Asking ${LIVE.ep} which server it is and which models it has.`, `Preguntando a ${LIVE.ep} qué servidor es y qué modelos tiene.`)],
    cors: [L('Blocked by CORS', 'Bloqueado por CORS'), 'warn', L('The server is there but refuses this page. Allow it with the steps below, then Connect again.', 'El servidor está, pero rechaza esta página. Permítela con los pasos de abajo y vuelve a Conectar.')],
    down: [L('Nothing answered', 'Nadie respondió'), 'bad', L('Start Ollama (ollama serve) or llama-server, or check the address.', 'Arranca Ollama (ollama serve) o llama-server, o revisa la dirección.')],
    error: [L('Could not connect', 'No se pudo conectar'), 'bad', ''],
    ok: [L('Connected', 'Conectado'), 'ok', L(`${name} ${LIVE.version} at ${LIVE.ep} · ${LIVE.models.length} models`, `${name} ${LIVE.version} en ${LIVE.ep} · ${LIVE.models.length} modelos`)],
  }[st];
  if (ok && real && MODE.lost) { head[0] = L('Lost the server', 'Se perdió el servidor'); head[1] = 'bad'; head[2] = L(`${LIVE.ep} stopped answering. Retry, or go back to the simulation.`, `${LIVE.ep} dejó de responder. Reintenta o vuelve a la simulación.`); }
  $('vLive').textContent = run ? L('running…', 'en marcha…') : ok ? (real ? name : L(`${name} · not in use`, `${name} · sin usar`)) : st === 'busy' ? L('connecting…', 'conectando…') : L('not connected', 'sin conectar');
  const why = L('Wait for the real request to finish, or stop it', 'Espera a que termine la petición real, o párala'), dis = run ? `disabled title="${esc(why)}"` : '';
  const epRow = `<div class="lv-row"><input type="text" id="lvEp" value="${esc(LIVE.ep)}" spellcheck="false" aria-label="${esc(L('Server address', 'Dirección del servidor'))}" ${st === 'busy' ? 'disabled' : ''}><button type="button" class="btnp" id="lvDetect" ${st === 'busy' ? 'disabled' : ''}>${esc(st === 'busy' ? L('Connecting…', 'Conectando…') : ok ? L('Connect here', 'Conectar aquí') : L('Connect', 'Conectar'))}</button>${ok ? `<button type="button" class="tbtn quiet" id="lvEpCancel">${esc(L('Cancel', 'Cancelar'))}</button>` : ''}</div>`;
  let h = `<div class="lv-st"><span class="lv-chip ${head[1]}">${esc(head[0])}</span>${head[2] ? `<small>${esc(head[2])}</small>` : ''}</div>`;
  if (!ok) h += epRow + (LIVE.fix && st === 'cors' ? `<div class="lv-fix">${esc(LIVE.fix)}</div>` : '') + (LIVE.error ? `<div class="lv-fix bad">${esc(LIVE.error)}</div>` : '') + liveSetupHtml()
    + `<div class="hint">${esc(L('Connecting switches the console to Real machine. Your simulation is kept and comes back exactly when you switch back.', 'Conectar pasa la consola a Máquina real. Tu simulación se guarda y vuelve tal cual al volver.'))}</div>`;
  else {
    h += `<div class="fld"><label for="lvModel"><span>${esc(L('Model on the server', 'Modelo en el servidor'))}</span></label><select id="lvModel" ${dis}>${LIVE.models.map(m => `<option value="${esc(m.name)}" ${m.name === LIVE.pick ? 'selected' : ''}>${esc(m.name)}${m.params ? ` · ${esc(m.params)}` : ''}${m.quant ? ` · ${esc(m.quant)}` : ''}</option>`).join('')}</select></div>`;
    if (MODE.editEp) h += epRow;
    h += `<div class="lv-act">${real ? '' : `<button type="button" class="btnp" id="lvEnter">${ICON('laptop', 's')}<span>${esc(L('Use the real machine', 'Usar la máquina real'))}</span></button>`}${real && MODE.lost ? `<button type="button" class="btnp" id="lvRetry">${esc(L('Retry', 'Reintentar'))}</button>` : ''}<button type="button" class="tbtn" id="lvChange" ${dis}>${ICON('edit', 's')}<span>${esc(L('Change server', 'Cambiar de servidor'))}</span></button><button type="button" class="tbtn" id="lvDisc" ${dis}>${ICON('close', 's')}<span>${esc(L('Disconnect', 'Desconectar'))}</span></button></div>`;
    if (run) h += `<div class="hint">${esc(why)}: ${esc(L('the server and the model cannot change mid-request.', 'el servidor y el modelo no pueden cambiar a mitad de petición.'))}</div>`;
    else h += `<div class="hint">${esc(real ? L('Prompt, max tokens and sampling are in Setup; Send is in the Request zone.', 'El prompt, los tokens máx. y el muestreo están en Configuración; Enviar está en la zona Petición.') : L('You are in the simulation. Use the real machine to send requests to this server.', 'Estás en la simulación. Usa la máquina real para enviar peticiones a este servidor.'))}</div>`;
  }
  const key = h + lang;
  if (force || key !== liveKey) {
    const ae = document.activeElement && document.activeElement.id; liveKey = key; $('liveIn').innerHTML = h;
    const go = () => { LIVE.ep = $('lvEp').value.trim(); if (!isReal()) MODE.connecting = true; liveDetect(); };
    if ($('lvEp')) { $('lvEp').addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); $('lvDetect').addEventListener('click', go); }
    if ($('lvEpCancel')) $('lvEpCancel').addEventListener('click', () => { MODE.editEp = false; renderLive(true); });
    if ($('lvModel')) $('lvModel').addEventListener('change', e => { LIVE.pick = e.target.value; LIVE.run = null; LIVE.est = null; LIVE.toks = []; LIVE.text = ''; if (isReal()) realApplyModel().then(() => { realSizeRequest(); saveReal(); changed(); renderMode(true); }).catch(er => { LIVE.error = String(er.message || er); }); renderLive(true); });
    if ($('lvEnter')) $('lvEnter').addEventListener('click', () => enterReal());
    if ($('lvRetry')) $('lvRetry').addEventListener('click', () => realPoll(true));
    if ($('lvChange')) $('lvChange').addEventListener('click', () => { MODE.editEp = true; renderLive(true); const f = $('lvEp'); if (f) { f.focus(); f.select(); } });
    if ($('lvDisc')) $('lvDisc').addEventListener('click', realDisconnect);
    if (ae && $(ae)) $(ae).focus();
  }
  const sentH = LIVE.sent ? `<b>${esc(L('Sent with the last real request', 'Enviado con la última petición real'))}:</b> ${LIVE.sent.map(([k, v]) => `${esc(k)} ${esc(String(v))}`).join(' · ')}` : (LIVE.status === 'ok' && isReal() ? `<b>${esc(L('Will be sent', 'Se enviará'))}:</b> ${liveSentList(liveBody('')).map(([k, v]) => `${esc(k)} ${esc(String(v))}`).join(' · ')}` : '');
  if ($('liveSent').innerHTML !== sentH) $('liveSent').innerHTML = sentH;
  renderLiveCompare();
}

// Monitor: estimate against measurement, with the ratio, and the calibration controls.
function renderLiveCompare() {
  const sec = $('liveSec'), run = LIVE.run, est = LIVE.est;
  if (!isReal()) { if (!sec.hidden) sec.hidden = true; liveCmpKey = ''; return; }
  sec.hidden = false;
  if (!run && !LIVE.running) { const h0 = `<div class="lv-note">${esc(L('No real run yet. Press Send in the Request zone: the estimate and the measurement appear here side by side.', 'Aún no hay ejecución real. Pulsa Enviar en la zona Petición: la estimación y la medida aparecen aquí lado a lado.'))}</div>`; if (h0 !== liveCmpKey) { liveCmpKey = h0; $('liveCmp').innerHTML = h0; } return; }
  const f = (v, kind) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : kind === 's' ? S_(v) : `${dec(v.toFixed(v < 10 ? 1 : 0))} tok/s`);
  const rows = run && est ? [
    [L('Load', 'Carga'), est.loadS, run.loadS, 's'], [L('First token', 'Primer token'), est.ttftS, run.ttftS, 's'],
    [L(`Prefill · ${num(run.promptN)} tok`, `Prefill · ${num(run.promptN)} tok`), est.prefillTps, run.prefillS > 0 ? run.promptN / run.prefillS : null, 't'],
    [L(`Decode · ${num(run.evalN)} tok`, `Decode · ${num(run.evalN)} tok`), est.decodeTps, run.decodeS > 0 ? run.evalN / run.decodeS : null, 't'], [L('Total', 'Total'), est.totalS, run.totalS, 's'],
  ] : [];
  const cal = CALIB[S.machine];
  const h = LIVE.running ? `<div class="lv-wait">${ICON('bolt', 's')}${esc(L(`Running on ${LIVE.pick}… ${num(LIVE.run ? 0 : (LIVE.text ? LIVE.text.length : 0))} characters so far`, `En marcha en ${LIVE.pick}… ${num(LIVE.text ? LIVE.text.length : 0)} caracteres`))}</div>`
    : `<div class="lv-h"><span>${esc(L('Same request', 'Misma petición'))}</span><span>${esc(L('Estimate', 'Estimación'))}</span><span>${esc(L('Measured', 'Medido'))}</span><span>×</span></div>` +
    rows.map(([l, e, m, k]) => { const ratio = e && m ? (k === 's' ? m / e : m / e) : null; const bad = ratio && (ratio > 1.5 || ratio < 0.67); return `<div class="lv-r"><span>${esc(l)}</span><b class="num">${f(e, k)}</b><b class="num m">${f(m, k)}</b><i class="num ${bad ? 'off' : ''}">${ratio ? `${dec(ratio.toFixed(2))}` : '—'}</i></div>`; }).join('') +
    `<div class="lv-act"><button type="button" class="tbtn" id="lvCal" ${locked() ? 'disabled' : ''}>${ICON('tune', 's')}<span>${esc(L('Calibrate the estimate to this machine', 'Calibrar la estimación a esta máquina'))}</span></button>${cal ? `<button type="button" class="tbtn quiet" id="lvUncal">${esc(L('Reset', 'Restablecer'))}</button>` : ''}</div>` +
    (cal ? `<div class="lv-note">${esc(L(`${R.mc.name}: bandwidth ×${dec(cal.bw.toFixed(2))}, compute ×${dec(cal.fl.toFixed(2))}`, `${R.mc.name}: ancho de banda ×${dec(cal.bw.toFixed(2))}, cómputo ×${dec(cal.fl.toFixed(2))}`))}${LIVE.calNotes && LIVE.calNotes.length ? ` · ${esc(LIVE.calNotes.join('; '))}` : ''}</div>` : '') +
    `<div class="lv-note">${esc(L(`${run.kind === 'ollama' ? 'Ollama' : 'llama-server'} timings for ${run.model}; first token measured by this page.`, `Tiempos de ${run.kind === 'ollama' ? 'Ollama' : 'llama-server'} para ${run.model}; el primer token lo mide esta página.`))}</div>`;
  if (h !== liveCmpKey) { liveCmpKey = h; $('liveCmp').innerHTML = h; const c = $('lvCal'), u = $('lvUncal'); if (c) c.addEventListener('click', liveCalibrate); if (u) u.addEventListener('click', liveResetCal); }
}

// Output box: the live answer while it streams (and after), marked as live; the simulated answer otherwise.
function liveOutput() {
  if (!isReal()) return false;
  const h = `<span class="lv-tag">${esc(L('real', 'real'))}</span>${esc(LIVE.text) || `<span class="ph">${esc(LIVE.running ? L('Waiting for the first token…', 'Esperando el primer token…') : L('The real answer appears here. Press Send in the Request zone.', 'La respuesta real aparece aquí. Pulsa Enviar en la zona Petición.'))}</span>`}`;
  if ($('outStream').dataset.live !== h) { $('outStream').dataset.live = h; $('outStream').innerHTML = h; $('outStream').scrollTop = $('outStream').scrollHeight; outKey = ''; }
  $('outCnt').textContent = LIVE.run ? `${num(LIVE.run.evalN)} ${L('tokens', 'tokens')}` : L('real', 'real');
  const lt = LIVE.running ? L(`Streaming from ${LIVE.pick}`, `Recibiendo de ${LIVE.pick}`) : LIVE.text ? L(`Real answer from ${LIVE.pick}`, `Respuesta real de ${LIVE.pick}`) : L('Real machine', 'Máquina real');
  if ($('outLogit').textContent !== lt) $('outLogit').textContent = lt;
  return true;
}
renderLive(true);
