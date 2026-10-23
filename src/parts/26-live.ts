// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Live mode: one real request to a local server, measured next to the simulator's estimate =====
// Optional and separate from the simulated run: nothing here blocks or changes the simulator until the user
// chooses to use the live model or to calibrate the machine to the measured run.
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
        renderLive(true); return;
      }
      LIVE.kind = 'llama'; const props = await p.json(); LIVE.version = props.build_info || '';
      const models = await (await liveFetch('/v1/models')).json(); LIVE.llamaInfo = { props, models };
      LIVE.models = (models.data || []).map(d => ({ name: d.id.split(/[\\/]/).pop(), id: d.id, params: d.meta && d.meta.n_params ? `${(d.meta.n_params / 1e9).toFixed(1)}B` : '' }));
    }
    LIVE.status = 'ok'; if (!LIVE.models.some(m => m.name === LIVE.pick)) LIVE.pick = (LIVE.models.find(m => MODELS[S.model] && m.name === MODELS[S.model].tag) || LIVE.models[0] || {}).name || '';
  } catch (e) { LIVE.status = 'error'; LIVE.error = String(e && e.message || e); }
  renderLive(true);
}

// The picked server model becomes the console's 'live' model, so every view draws it.
async function liveUseModel() {
  if (locked()) return;
  let p;
  if (LIVE.kind === 'ollama') p = modelFromOllama(await (await liveFetch('/api/show', { method: 'POST', body: JSON.stringify({ model: LIVE.pick }) }, 15000)).json(), LIVE.pick);
  else p = modelFromLlama(LIVE.llamaInfo.models, LIVE.llamaInfo.props);
  pushUndo(); registerLiveModel(p); fillSelects(); S.model = 'live'; S.quant = p.quant; S.ctx = Math.min(S.ctx, p.model.ctxMax); UI.layer = -1; KEEP.unloaded = false; changed(); renderLive(true);
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
    LIVE.est = liveEstimate(LIVE.run);
  } catch (e) { if (!(LIVE.ctl && LIVE.ctl.signal.aborted)) LIVE.error = String(e && e.message || e); }
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
// What each Configure control means for the real run: honoured (sent with the request), or simulation only, with why.
function liveScope() {
  if (LIVE.status !== 'ok') return null;
  const srv = L('the server decides this', 'esto lo decide el servidor'), ol = LIVE.kind === 'ollama';
  const sim = { machine: L('Simulation only: the real machine is the one running the server', 'Solo simulación: la máquina real es la que ejecuta el servidor'), model: L(`Simulation only: the server runs ${LIVE.pick}`, `Solo simulación: el servidor ejecuta ${LIVE.pick}`),
    request: L('Simulation only: the live prompt and Max tokens in the live window decide this', 'Solo simulación: el prompt en vivo y los tokens máx. de la ventana en vivo deciden esto'),
    kv: ol ? L('Simulation only: set on the server (OLLAMA_KV_CACHE_TYPE)', 'Solo simulación: se fija en el servidor (OLLAMA_KV_CACHE_TYPE)') : L('Simulation only: set when llama-server starts (-ctk / -ctv)', 'Solo simulación: se fija al arrancar llama-server (-ctk / -ctv)'),
    cached: ol ? L(`Simulation only: Ollama keeps its own prompt cache; ${srv}`, `Solo simulación: Ollama gestiona su propia caché de prompt; ${srv}`) : null,
    disk: L(`Simulation only: ${srv}`, `Solo simulación: ${srv}`), cold: L(`Simulation only: ${srv}`, `Solo simulación: ${srv}`),
    spec: ol ? L('Simulation only: Ollama has no separate draft model', 'Solo simulación: Ollama no tiene modelo borrador aparte') : L('Simulation only: a draft model is set when llama-server starts (-md)', 'Solo simulación: el modelo borrador se fija al arrancar llama-server (-md)'),
    mtp: ol ? (liveHasMtp() ? null : L('Simulation only: this server model has no MTP block', 'Solo simulación: este modelo del servidor no tiene bloque MTP')) : L('Simulation only: not a per-request option of llama-server', 'Solo simulación: no es una opción por petición de llama-server'),
    ctx: ol ? null : L('Simulation only: set when llama-server starts (-c)', 'Solo simulación: se fija al arrancar llama-server (-c)'),
    keepalive: ol ? null : L('Simulation only: llama-server keeps the model loaded until it stops', 'Solo simulación: llama-server mantiene el modelo cargado hasta que se para') };
  return sim;
}
const SCOPE_IDS = { machine: ['machine', 'mts', 'bus', 'vbw', 'ram', 'tflops'], model: ['model', 'quant'], request: ['sys', 'docs', 'q', 'ans'], kv: ['kv'], cached: ['cached'], disk: ['disk'], cold: ['cold'], spec: ['spec', 'gamma', 'alpha'], mtp: ['mtp'], ctx: ['ctx'], keepalive: ['keepalive'] };
const LIVE_HONOURED = ['temp', 'topk', 'topp', 'seed', 'ctx', 'keepalive', 'mtp', 'cached'];
let scopeKey = '';
function liveSyncScope() {
  const sc = liveScope(), key = sc ? JSON.stringify(sc) : '';
  if (key === scopeKey) return; scopeKey = key;
  document.querySelectorAll('.simonly, .livehon').forEach(el => { el.classList.remove('simonly', 'livehon'); if (el.dataset.lvTitle !== undefined) { el.title = el.dataset.lvTitle; delete el.dataset.lvTitle; } });
  if (!sc) return;
  const box = id => { const el = $(id); return el ? el.closest('.fld, label.sw, .row2 > .fld') || el : null; };
  for (const [k, ids] of Object.entries(SCOPE_IDS)) { const why = sc[k]; for (const id of ids) { const b = box(id); if (!b) continue; if (why) { b.dataset.lvTitle = b.title || ''; b.title = why; b.classList.add('simonly'); } } }
  for (const [acc, k] of [['machine', 'machine'], ['model', 'model'], ['request', 'request']]) { const b = document.querySelector(`[data-acc=${acc}] > button`); if (b && sc[k]) { b.dataset.lvTitle = b.title || ''; b.title = sc[k]; b.classList.add('simonly'); } }
  for (const id of LIVE_HONOURED) { const b = box(id); if (b && !b.classList.contains('simonly')) { b.dataset.lvTitle = b.title || ''; b.title = L('Sent with the live run', 'Se envía con la ejecución en vivo'); b.classList.add('livehon'); } }
}
// The breadcrumb's live segment: the server's model and its quantization, behind a server icon.
function liveChipHtml() {
  // called by the setup line during start-up, before this part has run: LIVE does not exist yet then
  try { if (LIVE.status !== 'ok' || !LIVE.pick) return ''; } catch (e) { return ''; }
  const mm = LIVE.models.find(q => q.name === LIVE.pick);
  return `<span class="sep">/</span><span class="lvseg" title="${esc(L('The model on the live server', 'El modelo en el servidor en vivo'))}">${ICON('server', 's')}<i class="livedot${LIVE.running ? ' run' : ''}"></i><b>${esc(LIVE.pick)}</b>${mm && mm.quant ? ` ${esc(mm.quant)}` : ''}</span>`;
}
function liveOpen(on) { $('liveWin').hidden = !on; if (on) { renderLive(true); const f = $('lvDetect'); if (f && LIVE.status !== 'ok') f.focus(); } }
$('liveOpen').addEventListener('click', e => { e.stopPropagation(); liveOpen(true); }, true);
$('liveClose').innerHTML = ICON('close', 's'); $('liveClose').addEventListener('click', () => liveOpen(false));
$('liveWin').querySelector('.scrim').addEventListener('click', () => liveOpen(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('liveWin').hidden) { e.stopPropagation(); liveOpen(false); } }, true);
// Tokens view: the live answer as tokens, each with its arrival time and, when the server sends them, its top alternatives.
const liveShowing = () => LIVE.showOut && (LIVE.running || LIVE.toks.length > 0);
function liveStreamHtml() {
  const tk = LIVE.toks, from = Math.max(0, tk.length - 240);
  let h = `<span class="lv-tag">${esc(L('live', 'en vivo'))}</span>${from ? '… ' : ''}`;
  for (let i = from; i < tk.length; i++) h += `<span class="g live${UI.liveTok === i ? ' sel' : ''}" data-ltok="${i}" title="${esc(L(`live token ${i + 1} · ${Math.round(tk[i].t)} ms`, `token en vivo ${i + 1} · ${Math.round(tk[i].t)} ms`))}">${esc(i === from ? tk[i].s.trimStart() : tk[i].s)}</span>`;
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
setInterval(() => { liveSyncScope(); const c = liveChipHtml(); if (c !== chipLive) { chipLive = c; syncControls(); } }, 400);

let liveKey = '', liveCmpKey = '';
function renderLive(force) {
  const st = LIVE.status, chip = { idle: [L('not connected', 'sin conectar'), ''], busy: [L('detecting…', 'detectando…'), ''], ok: [`${LIVE.kind === 'ollama' ? 'Ollama' : 'llama.cpp'}${LIVE.version ? ` · ${LIVE.version}` : ''}`, 'ok'], cors: [L('blocked by CORS', 'bloqueado por CORS'), 'warn'], down: [L('not running', 'no responde'), 'bad'], error: [L('error', 'error'), 'bad'] }[st];
  $('vLive').textContent = LIVE.running ? L('running…', 'en marcha…') : st === 'ok' ? (LIVE.kind === 'ollama' ? 'Ollama' : 'llama.cpp') : chip[0];
  const h = `<div class="lv-row"><input type="text" id="lvEp" value="${esc(LIVE.ep)}" spellcheck="false" aria-label="${esc(L('Server address', 'Dirección del servidor'))}"><button type="button" class="tbtn" id="lvDetect">${esc(L('Detect', 'Detectar'))}</button></div>
    <div class="lv-st"><span class="lv-chip ${chip[1]}">${esc(chip[0])}</span>${st === 'ok' ? `<small>${esc(L(`${LIVE.models.length} models`, `${LIVE.models.length} modelos`))}</small>` : ''}</div>
    ${LIVE.fix ? `<div class="lv-fix">${esc(LIVE.fix)}</div>` : ''}${LIVE.error ? `<div class="lv-fix bad">${esc(LIVE.error)}</div>` : ''}
    ${st === 'ok' ? `<div class="fld"><label for="lvModel"><span>${esc(L('Model on the server', 'Modelo en el servidor'))}</span></label><select id="lvModel">${LIVE.models.map(m => `<option value="${esc(m.name)}" ${m.name === LIVE.pick ? 'selected' : ''}>${esc(m.name)}${m.params ? ` · ${esc(m.params)}` : ''}${m.quant ? ` · ${esc(m.quant)}` : ''}</option>`).join('')}</select></div>
      <button type="button" class="tbtn" id="lvUse" ${locked() ? 'disabled' : ''}>${ICON('layers', 's')}<span>${esc(S.model === 'live' && MODELS.live && MODELS.live.tag === LIVE.pick ? L('In use in the console', 'En uso en la consola') : L('Draw this model in the console', 'Dibujar este modelo en la consola'))}</span></button>
      <div class="fld"><label for="lvPrompt"><span>${esc(L('Prompt', 'Prompt'))}</span></label><select id="lvPrompt"><option value="short" ${LIVE.promptMode === 'short' ? 'selected' : ''}>${esc(L('Short question', 'Pregunta corta'))}</option><option value="long" ${LIVE.promptMode === 'long' ? 'selected' : ''}>${esc(L('Long history · ≈ 3,500 tok', 'Historia larga · ≈ 3.500 tok'))}</option><option value="own" ${LIVE.promptMode === 'own' ? 'selected' : ''}>${esc(L('My own', 'El mío'))}</option></select></div>
      ${LIVE.promptMode === 'own' ? `<textarea id="lvOwn" rows="4" placeholder="${esc(L('Paste a prompt', 'Pega un prompt'))}">${esc(LIVE.own)}</textarea>` : ''}
      <div class="lv-row"><label class="lv-n">${esc(L('Max tokens', 'Tokens máx.'))}<input type="number" id="lvMax" min="8" max="2048" step="8" value="${LIVE.maxTok}"></label>
      ${LIVE.running ? `<button type="button" class="btnp" id="lvStop">${ICON('stop', 's')}<span>${esc(L('Stop', 'Parar'))}</span></button>` : `<button type="button" class="btnp" id="lvRun">${ICON('play', 's')}<span>${esc(L('Run live', 'Ejecutar en vivo'))}</span></button>`}</div>` : ''}
    <div class="hint">${esc(L('Sends one real request to the server and measures it; the simulated run is not touched. Sampling settings are shared.', 'Envía una petición real al servidor y la mide; la ejecución simulada no se toca. Los ajustes de muestreo se comparten.'))}</div>`;
  const key = h + (LIVE.running ? Math.floor(performance.now() / 500) : '');
  if (force || key !== liveKey) {
    const ae = document.activeElement && document.activeElement.id; liveKey = key; $('liveIn').innerHTML = h;
    $('lvEp').addEventListener('change', e => { LIVE.ep = e.target.value.trim(); }); $('lvEp').addEventListener('keydown', e => { if (e.key === 'Enter') { LIVE.ep = e.target.value.trim(); liveDetect(); } });
    $('lvDetect').addEventListener('click', () => { LIVE.ep = $('lvEp').value.trim(); liveDetect(); });
    if ($('lvModel')) $('lvModel').addEventListener('change', e => { LIVE.pick = e.target.value; renderLive(true); });
    if ($('lvUse')) $('lvUse').addEventListener('click', () => liveUseModel().catch(e => { LIVE.error = String(e.message || e); renderLive(true); }));
    if ($('lvPrompt')) $('lvPrompt').addEventListener('change', e => { LIVE.promptMode = e.target.value; renderLive(true); });
    if ($('lvOwn')) $('lvOwn').addEventListener('input', e => { LIVE.own = e.target.value; });
    if ($('lvMax')) $('lvMax').addEventListener('change', e => { LIVE.maxTok = Math.max(8, Math.min(2048, Math.round(+e.target.value) || 64)); });
    if ($('lvRun')) $('lvRun').addEventListener('click', liveRun); if ($('lvStop')) $('lvStop').addEventListener('click', liveStop);
    if (ae && $(ae)) $(ae).focus();
  }
  const sentH = LIVE.sent ? `<b>${esc(L('Sent with the last live run', 'Enviado con la última ejecución en vivo'))}:</b> ${LIVE.sent.map(([k, v]) => `${esc(k)} ${esc(String(v))}`).join(' · ')}` : (LIVE.status === 'ok' ? `<b>${esc(L('Will be sent', 'Se enviará'))}:</b> ${liveSentList(liveBody('')).map(([k, v]) => `${esc(k)} ${esc(String(v))}`).join(' · ')}` : '');
  if ($('liveSent').innerHTML !== sentH) $('liveSent').innerHTML = sentH;
  renderLiveCompare();
}

// Monitor: estimate against measurement, with the ratio, and the calibration controls.
function renderLiveCompare() {
  const sec = $('liveSec'), run = LIVE.run, est = LIVE.est;
  if (!run && !LIVE.running) { if (!sec.hidden) sec.hidden = true; return; }
  sec.hidden = false;
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
    `<div class="lv-act"><button type="button" class="tbtn" id="lvCal" ${locked() ? 'disabled' : ''}>${ICON('tune', 's')}<span>${esc(L('Calibrate this machine to the run', 'Calibrar esta máquina a la ejecución'))}</span></button>${cal ? `<button type="button" class="tbtn quiet" id="lvUncal">${esc(L('Reset', 'Restablecer'))}</button>` : ''}</div>` +
    (cal ? `<div class="lv-note">${esc(L(`${R.mc.name}: bandwidth ×${dec(cal.bw.toFixed(2))}, compute ×${dec(cal.fl.toFixed(2))}`, `${R.mc.name}: ancho de banda ×${dec(cal.bw.toFixed(2))}, cómputo ×${dec(cal.fl.toFixed(2))}`))}${LIVE.calNotes && LIVE.calNotes.length ? ` · ${esc(LIVE.calNotes.join('; '))}` : ''}</div>` : '') +
    `<div class="lv-note">${esc(L(`${run.kind === 'ollama' ? 'Ollama' : 'llama-server'} timings for ${run.model}; first token measured by this page.`, `Tiempos de ${run.kind === 'ollama' ? 'Ollama' : 'llama-server'} para ${run.model}; el primer token lo mide esta página.`))}</div>`;
  if (h !== liveCmpKey) { liveCmpKey = h; $('liveCmp').innerHTML = h; const c = $('lvCal'), u = $('lvUncal'); if (c) c.addEventListener('click', liveCalibrate); if (u) u.addEventListener('click', liveResetCal); }
}

// Output box: the live answer while it streams (and after), marked as live; the simulated answer otherwise.
function liveOutput() {
  if (!LIVE.showOut || (!LIVE.running && !LIVE.text)) return false;
  const h = `<span class="lv-tag">${esc(L('live', 'en vivo'))}</span>${esc(LIVE.text) || `<span class="ph">${esc(L('Waiting for the first token…', 'Esperando el primer token…'))}</span>`}`;
  if ($('outStream').dataset.live !== h) { $('outStream').dataset.live = h; $('outStream').innerHTML = h; $('outStream').scrollTop = $('outStream').scrollHeight; outKey = ''; }
  $('outCnt').textContent = LIVE.run ? `${num(LIVE.run.evalN)} ${L('tokens', 'tokens')}` : L('live', 'en vivo');
  const lt = LIVE.running ? L(`Streaming from ${LIVE.pick}`, `Recibiendo de ${LIVE.pick}`) : L('Live answer · click to go back to the simulated one', 'Respuesta en vivo · pulsa para volver a la simulada');
  if ($('outLogit').textContent !== lt) $('outLogit').textContent = lt;
  return true;
}
$('outStream').addEventListener('click', () => { if (LIVE.showOut && !LIVE.running && LIVE.text) { LIVE.showOut = false; $('outStream').dataset.live = ''; outKey = ''; } });
renderLive(true);

// The engine badge in the top bar: what is producing the numbers now. Simulated by default; a click opens live mode.
let engineKey = '';
function renderEngineBadge() {
  const on = LIVE.status === 'ok', name = LIVE.kind === 'llama' ? 'llama.cpp' : 'Ollama';
  const h = on ? `${ICON('server', 's')}<span>${esc(name)}${LIVE.version ? ` ${esc(String(LIVE.version).slice(0, 12))}` : ''}</span><i class="livedot${LIVE.running ? ' run' : ''}"></i><b>LIVE</b>`
    : `${ICON('memory', 's')}<span>${esc(L('Simulated', 'Simulado'))}</span>`;
  const b = $('engineBadge'); if (!b) return;
  if (h !== engineKey) { engineKey = h; b.innerHTML = h; b.classList.toggle('on', on); b.title = on ? L('Connected to a real server. Click to open live mode.', 'Conectado a un servidor real. Pulsa para abrir el modo en vivo.') : L('Numbers come from the cost model. Click to connect a real Ollama or llama.cpp server.', 'Los números salen del modelo de costes. Pulsa para conectar un servidor real de Ollama o llama.cpp.'); }
}
setInterval(renderEngineBadge, 500);
document.addEventListener('click', e => { if (!e.target.closest('#engineBadge')) return; liveOpen(true); });
