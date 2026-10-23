// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Live mode: one real request to a local server, measured next to the simulator's estimate =====
// Optional and separate from the simulated run: nothing here blocks or changes the simulator until the user
// chooses to use the live model or to calibrate the machine to the measured run.
const LIVE = {
  ep: (() => { try { return localStorage.getItem('tw.liveEp') || 'http://localhost:11434'; } catch (e) { return 'http://localhost:11434'; } })(),
  kind: null, status: 'idle', version: '', error: '', fix: '', models: [], pick: '', caps: {},
  promptMode: 'short', own: '', maxTok: 64, running: false, ctl: null, text: '', run: null, est: null, showOut: false, t0: 0,
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
function liveCorsFix(kind) {
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
    const body = LIVE.kind === 'ollama'
      ? { model: LIVE.pick, prompt, stream: true, options: { num_predict: LIVE.maxTok, num_ctx: S.ctx, temperature: S.temp, top_p: S.topp, seed: S.seed, ...(S.topk < 6 ? { top_k: S.topk } : {}) }, ...((LIVE.caps[LIVE.pick] || []).includes('thinking') ? { think: false } : {}) }
      : { prompt, stream: true, n_predict: LIVE.maxTok, temperature: S.temp, top_p: S.topp, seed: S.seed, cache_prompt: false, ...(S.topk < 6 ? { top_k: S.topk } : {}) };
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
        if (piece) { const t = performance.now() - LIVE.t0; if (first === null) first = t; arrivals.push(t); LIVE.text += piece; }
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
  S = { ...S, model: key, sys: 0, docs: 0, q: Math.max(1, run.promptN), ans: Math.max(1, run.evalN), cold: (run.loadS || 0) > 1, cached: false, disk: false, spec: false, ctx: Math.max(S.ctx, run.promptN + run.evalN + 1) };
  let r; try { r = compute(); } finally { S = keep; }
  return { model: key, loadS: r.load, ttftS: r.ttft, prefillTps: r.newTokens / Math.max(1e-9, r.prefill), decodeTps: r.tps, totalS: r.total };
}
function liveCalibrate() {
  const run = LIVE.run; if (!run || locked()) return;
  const key = LIVE.est ? LIVE.est.model : S.model, keepCal = CALIB[S.machine]; saveCalib(S.machine, null);
  const c = calibrateTo(machine(), MODELS[key], key === 'live' ? S.quant : S.quant, S.kv, run);
  saveCalib(S.machine, c); if (!keepCal) {} LIVE.calNotes = c.notes; changed(); LIVE.est = liveEstimate(run); renderLive(true);
}
function liveResetCal() { saveCalib(S.machine, null); LIVE.calNotes = []; changed(); if (LIVE.run) LIVE.est = liveEstimate(LIVE.run); renderLive(true); }

// Measured seconds per token, from the arrival of each streamed piece after the first.
function liveTpt() { const a = LIVE.run && LIVE.run.arrivalsMs; if (!a || a.length < 3) return null; const out = []; for (let i = 1; i < a.length; i++) out.push(a[i] - a[i - 1]); return out; }

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
