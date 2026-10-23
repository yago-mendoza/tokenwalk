// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== One mode at a time: Simulated, or Real machine =====
// The console is either a simulation (every number from the cost model, playable at any speed) or a window on a
// real server on this machine (one real request at a time, in real time, with the cost model's estimate beside it).
// The two keep separate settings: entering Real never overwrites the simulation, and leaving restores it exactly.
//
// State machine (MODE.m, LIVE.status, LIVE.running, MODE.lost):
//   sim                --switch Real, server not connected-->  connecting   (connect window opens, detection starts)
//   connecting         --server answers-->                     real.idle    (window closes, simulation saved)
//   connecting         --fails, or window closed-->            sim          (nothing changed)
//   sim                --switch Real, server already known-->  real.idle
//   real.idle          --Send request (Play)-->                real.running
//   real.running       --done, Stop, or error-->               real.idle    (the run stays as the record)
//   real.idle          --switch Simulated-->                   sim          (simulation restored)
//   real.running       --switch Simulated-->                   ask          ("Stop the real request…?", keep running by default)
//   ask                --Keep running / Esc-->                 real.running
//   ask                --Stop and switch-->                    sim
//   real.*             --poll fails (every 10 s) or stream drops--> real.lost (banner: Retry, Back to simulation)
//   real.lost          --Retry answers-->                      real.idle
//   real.lost          --Back to simulation-->                 sim
//   real.idle          --Disconnect-->                         sim          (server forgotten)
//   start              --saved mode Real and server answers in 1.5 s-->  real.idle, otherwise sim, silently
const MODE = { m: 'sim', connecting: false, lost: false, ask: false, editEp: false, simS: null, simT: 0, real: null };
function isReal() { try { return MODE.m === 'real'; } catch (e) { return false; } }
const MODE_KEY = 'tw.mode', SIMS_KEY = 'tw.simS', REAL_KEY = 'tw.realS';
const saveJ = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} };
const loadJ = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
// The real request's own settings: what is sent, and which machine preset the estimate is drawn on.
function realDefaults() { return { pick: LIVE.pick, promptMode: LIVE.promptMode, own: LIVE.own, maxTok: LIVE.maxTok, estMachine: S.machine, temp: S.temp, topk: S.topk, topp: S.topp, seed: S.seed, ctx: S.ctx, keepalive: S.keepalive, mtp: S.mtp }; }
function saveReal() { if (!isReal()) return; MODE.real = { ...realDefaults(), estMachine: S.machine }; saveJ(REAL_KEY, MODE.real); }
const promptTokGuess = () => (LIVE.run && LIVE.run.prompt === livePrompt() ? LIVE.run.promptN : Math.max(8, Math.round(livePrompt().length / 3.8)));

// Draw the server's model in the console and size the request to the real one, for the estimate.
async function realApplyModel() {
  let p;
  if (LIVE.kind === 'ollama') p = modelFromOllama(await (await liveFetch('/api/show', { method: 'POST', body: JSON.stringify({ model: LIVE.pick }) }, 15000)).json(), LIVE.pick);
  else p = modelFromLlama(LIVE.llamaInfo.models, LIVE.llamaInfo.props);
  registerLiveModel(p); fillSelects();
  S.model = 'live'; S.quant = p.quant; S.ctx = Math.min(S.ctx, p.model.ctxMax);
}
function realSizeRequest() { S.sys = 0; S.docs = 0; S.q = promptTokGuess(); S.ans = LIVE.maxTok; S.cached = false; S.disk = false; S.cold = false; S.spec = false; S.mtp = liveHasMtp() ? S.mtp : false; }

async function enterReal() {
  if (isReal() || LIVE.status !== 'ok') return;
  setPlaying(false);
  MODE.simS = JSON.parse(JSON.stringify(S)); MODE.simT = P.t; saveJ(SIMS_KEY, MODE.simS);
  const r = MODE.real || loadJ(REAL_KEY);
  if (r) { if (LIVE.models.some(q => q.name === r.pick)) LIVE.pick = r.pick; LIVE.promptMode = r.promptMode || LIVE.promptMode; LIVE.own = r.own || ''; LIVE.maxTok = r.maxTok || LIVE.maxTok;
    Object.assign(S, { temp: r.temp ?? S.temp, topk: r.topk ?? S.topk, topp: r.topp ?? S.topp, seed: r.seed ?? S.seed, ctx: r.ctx ?? S.ctx, keepalive: r.keepalive ?? S.keepalive, mtp: r.mtp ?? S.mtp });
    if (r.estMachine && MACHINES[r.estMachine]) { S.machine = r.estMachine; Object.assign(S, machineFields(S.machine)); } }
  try { await realApplyModel(); } catch (e) { LIVE.error = String(e && e.message || e); S = JSON.parse(JSON.stringify(MODE.simS)); fillSelects(); changed(); MODE.connecting = false; renderLive(true); renderMode(true); return; }
  realSizeRequest(); P.t = 0; ZOOM.model = []; ZOOM.memory = []; UI.layer = -1;
  MODE.m = 'real'; MODE.connecting = false; MODE.lost = false; LIVE.showOut = true;
  document.body.classList.add('real'); saveJ(MODE_KEY, 'real'); saveReal();
  KEEP.unloaded = false; changed(); liveOpen(false); renderMode(true);
}
function leaveReal(force) {
  if (!isReal()) return;
  if (LIVE.running && !force) { MODE.ask = true; renderMode(true); setTimeout(() => { const k = $('askKeep'); if (k) k.focus(); }, 0); return; }
  if (LIVE.running) liveStop();
  saveReal(); MODE.ask = false; MODE.lost = false; $('outStream').dataset.live = ''; outKey = ''; streamKey = '';
  S = MODE.simS ? JSON.parse(JSON.stringify(MODE.simS)) : S; fillSelects();
  MODE.m = 'sim'; document.body.classList.remove('real'); saveJ(MODE_KEY, 'sim');
  KEEP.unloaded = false; changed(); P.t = Math.min(MODE.simT || 0, R.total); writeUrl(); renderMode(true);
}
// Switch Real from the simulation: straight in when the server is known, otherwise the connect window does it.
function askReal() {
  if (isReal()) return;
  if (LIVE.status === 'ok') { enterReal(); return; }
  MODE.connecting = true; MODE.editEp = false; liveOpen(true);
  if (LIVE.status !== 'busy') liveDetect(); // sets busy before its first await, so the switch reads "connecting" at once
  renderMode(true);
}
function realDisconnect() {
  if (LIVE.running) return;
  if (isReal()) leaveReal(true);
  LIVE.status = 'idle'; LIVE.models = []; LIVE.version = ''; LIVE.kind = null; LIVE.fix = ''; LIVE.error = ''; MODE.connecting = false; MODE.editEp = false;
  saveJ(MODE_KEY, 'sim'); liveOpen(false); renderLive(true); renderMode(true);
}
// Called by liveDetect when it settles: finishes a pending switch, or refreshes the drawn model after Change server.
function modeAfterDetect() {
  if (LIVE.status === 'ok') {
    if (MODE.connecting) enterReal();
    else if (isReal()) { MODE.lost = false; MODE.editEp = false; realApplyModel().then(() => { realSizeRequest(); changed(); }).catch(() => {}); }
  }
  renderMode(true);
}

// ---- top bar: the switch, the lost-server banner, the confirmation ----
let modeKey = '';
function renderMode(force) {
  const real = isReal(), name = LIVE.kind === 'llama' ? 'llama.cpp' : 'Ollama', mm = LIVE.models.find(q => q.name === LIVE.pick);
  const rl = real ? `${name}${LIVE.version ? ` ${String(LIVE.version).slice(0, 12)}` : ''}` : MODE.connecting && LIVE.status === 'busy' ? L('Real machine · connecting', 'Máquina real · conectando') : L('Real machine', 'Máquina real');
  const tip = real ? L(`Connected to ${name} ${LIVE.version} at ${LIVE.ep} · ${LIVE.pick}${mm && mm.quant ? ` ${mm.quant}` : ''}`, `Conectado a ${name} ${LIVE.version} en ${LIVE.ep} · ${LIVE.pick}${mm && mm.quant ? ` ${mm.quant}` : ''}`)
    : L('Run real requests on a local Ollama or llama.cpp server, in real time', 'Ejecuta peticiones reales en un servidor local de Ollama o llama.cpp, en tiempo real');
  const h = `<button type="button" data-mode="sim" aria-pressed="${!real}" title="${esc(L('Every number from the cost model; play at any speed', 'Todos los números salen del modelo de costes; se reproduce a cualquier velocidad'))}">${ICON('memory', 's')}<span>${esc(L('Simulated', 'Simulado'))}</span></button>`
    + `<button type="button" data-mode="real" aria-pressed="${real}" title="${esc(tip)}"><span class="halo${real ? ' on' : ''}${real && LIVE.running ? ' run' : ''}">${ICON('laptop', 's')}</span><span>${esc(rl)}</span></button>`;
  const sw = $('modeSw'); if (sw && (force || h !== modeKey)) { modeKey = h; sw.innerHTML = h; sw.classList.toggle('real', real); }
  const zt = document.querySelector('#run .zh .zt'); if (zt) { const t = real ? L('Request', 'Petición') : T('zRun'); if (zt.textContent !== t) zt.textContent = t; }
  const lb = $('lostBar'); if (lb) { const on = real && MODE.lost; lb.hidden = !on; if (on) { const lh = `${ICON('warning', 's')}<span>${esc(L(`Lost the server at ${LIVE.ep}. The last real run is kept.`, `Se perdió el servidor en ${LIVE.ep}. Se conserva la última ejecución real.`))}</span><button type="button" class="tbtn" id="lostRetry">${esc(L('Retry', 'Reintentar'))}</button><button type="button" class="tbtn" id="lostBack">${esc(L('Back to simulation', 'Volver a la simulación'))}</button>`; if (lb.dataset.k !== lh) { lb.dataset.k = lh; lb.innerHTML = lh; } } }
  const ak = $('modeAsk'); if (ak) { ak.hidden = !MODE.ask; if (MODE.ask && !ak.dataset.k) { ak.dataset.k = '1'; ak.innerHTML = `<p>${esc(L('Stop the real request and go back to the simulation?', '¿Parar la petición real y volver a la simulación?'))}</p><div><button type="button" class="btnp" id="askKeep">${esc(L('Keep running', 'Seguir'))}</button><button type="button" class="tbtn" id="askStop">${esc(L('Stop and switch', 'Parar y cambiar'))}</button></div>`; } if (!MODE.ask) ak.dataset.k = ''; }
}
document.addEventListener('click', e => {
  const b = e.target.closest('#modeSw [data-mode]'); if (b) { if (b.dataset.mode === 'real') { if (isReal()) liveOpen(true); else askReal(); } else leaveReal(false); return; }
  if (e.target.closest('#askKeep')) { MODE.ask = false; renderMode(true); return; }
  if (e.target.closest('#askStop')) { MODE.ask = false; leaveReal(true); return; }
  if (e.target.closest('#lostRetry')) { realPoll(true); return; }
  if (e.target.closest('#lostBack')) { leaveReal(true); return; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && MODE.ask) { e.stopPropagation(); MODE.ask = false; renderMode(true); } }, true);
// The connect window closed before a server answered: stay in the simulation, nothing changed.
$('liveClose').addEventListener('click', () => { if (MODE.connecting && !isReal()) { MODE.connecting = false; renderMode(true); } });
$('liveWin').querySelector('.scrim').addEventListener('click', () => { if (MODE.connecting && !isReal()) { MODE.connecting = false; renderMode(true); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && MODE.connecting && !isReal()) { MODE.connecting = false; setTimeout(() => renderMode(true), 0); } }, true);

// ---- a lost server, polled every 10 s while Real is idle ----
async function realPoll(manual) {
  if (!isReal() || (LIVE.running && !manual)) return;
  let ok = false; try { const r = await liveFetch(LIVE.kind === 'llama' ? '/props' : '/api/version', {}, 3000); ok = r.ok; } catch (e) { ok = false; }
  const was = MODE.lost; MODE.lost = !ok; if (was !== MODE.lost) renderMode(true);
}
setInterval(() => realPoll(false), 10000);

// ---- Configure in Real: the request that is sent, and this machine ----
let realCfgKey = '';
function renderRealCfg() {
  if (!isReal()) { realCfgKey = ''; return; }
  const run = LIVE.running, dis = run ? `disabled title="${esc(L('A real request is running', 'Hay una petición real en marcha'))}"` : '', mm = LIVE.models.find(q => q.name === LIVE.pick), name = LIVE.kind === 'llama' ? 'llama.cpp' : 'Ollama';
  const req = `<div class="fld"><label for="rqModel"><span>${esc(L('Model on the server', 'Modelo en el servidor'))}</span></label><select id="rqModel" ${dis}>${LIVE.models.map(m => `<option value="${esc(m.name)}" ${m.name === LIVE.pick ? 'selected' : ''}>${esc(m.name)}${m.params ? ` · ${esc(m.params)}` : ''}${m.quant ? ` · ${esc(m.quant)}` : ''}</option>`).join('')}</select></div>
    <div class="fld"><label for="rqPrompt"><span>${esc(L('Prompt', 'Prompt'))}</span><output>≈ ${num(promptTokGuess())} tok</output></label><select id="rqPrompt" ${dis}><option value="short" ${LIVE.promptMode === 'short' ? 'selected' : ''}>${esc(L('Short question', 'Pregunta corta'))}</option><option value="long" ${LIVE.promptMode === 'long' ? 'selected' : ''}>${esc(L('Long history · ≈ 3,500 tok', 'Historia larga · ≈ 3.500 tok'))}</option><option value="own" ${LIVE.promptMode === 'own' ? 'selected' : ''}>${esc(L('My own text', 'Mi propio texto'))}</option></select></div>
    ${LIVE.promptMode === 'own' ? `<textarea id="rqOwn" rows="4" ${dis} placeholder="${esc(L('Paste a prompt', 'Pega un prompt'))}">${esc(LIVE.own)}</textarea>` : ''}
    <div class="fld"><label for="rqMax"><span>${esc(L('Max tokens to write', 'Tokens máx. a escribir'))}</span></label><input type="number" id="rqMax" min="8" max="2048" step="8" value="${LIVE.maxTok}" ${dis}></div>
    ${LIVE.kind === 'ollama' && liveHasMtp() ? `<label class="sw"><input type="checkbox" id="rqMtp" ${S.mtp ? 'checked' : ''} ${dis}><i></i><span>${esc(L(`MTP drafts (draft_num_predict ${MTP.k})`, `Borradores MTP (draft_num_predict ${MTP.k})`))}</span></label>` : ''}
    <div class="hint">${esc(L('Sent with each real request, with num_ctx, keep_alive and the sampling settings below.', 'Se envía con cada petición real, junto con num_ctx, keep_alive y los ajustes de muestreo de abajo.'))}</div>`;
  const mach = `<dl class="rm"><dt>${esc(L('Server', 'Servidor'))}</dt><dd>${esc(name)} ${esc(LIVE.version || '')}</dd><dt>${esc(L('Address', 'Dirección'))}</dt><dd>${esc(LIVE.ep)}</dd><dt>${esc(L('Model', 'Modelo'))}</dt><dd>${esc(LIVE.pick)}${mm && mm.quant ? ` ${esc(mm.quant)}` : ''}</dd></dl>
    <div class="fld"><label for="rqEst"><span>${esc(L('Estimate as', 'Estimar como'))}</span></label><select id="rqEst">${Object.entries(MACHINES).map(([k, mc]) => `<option value="${k}" ${S.machine === k ? 'selected' : ''}>${esc(mc.name)}</option>`).join('')}</select>
      <div class="hint">${esc(L('The machine preset the Observatory draws the estimate on. The real numbers come from the server, whatever this says.', 'El preset de máquina con el que el Observatorio dibuja la estimación. Los números reales salen del servidor, diga lo que diga esto.'))}</div></div>`;
  const key = req + mach + lang;
  $('vRealMach').textContent = `${name} ${String(LIVE.version || '').slice(0, 10)}`; $('vRealReq').textContent = `≤ ${num(LIVE.maxTok)} tok`;
  if (key === realCfgKey) return; realCfgKey = key;
  const ae = document.activeElement && document.activeElement.id;
  $('realReqIn').innerHTML = req; $('realMachIn').innerHTML = mach;
  const re = () => { realSizeRequest(); saveReal(); changed(); };
  $('rqModel').addEventListener('change', e => { LIVE.pick = e.target.value; LIVE.run = null; LIVE.est = null; realApplyModel().then(re).catch(er => { LIVE.error = String(er.message || er); }); });
  $('rqPrompt').addEventListener('change', e => { LIVE.promptMode = e.target.value; re(); });
  if ($('rqOwn')) $('rqOwn').addEventListener('input', e => { LIVE.own = e.target.value; }), $('rqOwn').addEventListener('change', re);
  $('rqMax').addEventListener('change', e => { LIVE.maxTok = Math.max(8, Math.min(2048, Math.round(+e.target.value) || 64)); re(); });
  if ($('rqMtp')) $('rqMtp').addEventListener('change', e => { S.mtp = e.target.checked; re(); });
  $('rqEst').addEventListener('change', e => { S.machine = e.target.value; Object.assign(S, machineFields(S.machine)); saveReal(); changed(); });
  if (ae && $(ae)) $(ae).focus();
}

// ---- Run zone in Real: one real request, in real time ----
const REAL_TIME = () => L('Real time: a real server cannot be slowed, paused or stepped', 'Tiempo real: un servidor real no se puede ralentizar, pausar ni avanzar paso a paso');
function realElapsed() { return LIVE.running ? (performance.now() - LIVE.t0) / 1000 : LIVE.run ? LIVE.run.totalS || 0 : 0; }
function realSend() { UI.realT = null; if (LIVE.running) liveStop(); else if (!MODE.lost) liveRun().then(() => { if (LIVE.run) { S.q = LIVE.run.promptN || S.q; S.ans = Math.max(1, LIVE.run.evalN || LIVE.toks.length || S.ans); changed(); } }); }
let realRunT = 0;
function renderRealRun() {
  const t = performance.now(); if (t - realRunT < 90) return; realRunT = t;
  const el = realElapsed(), run = LIVE.run, n = LIVE.toks.length, first = LIVE.toks.length ? LIVE.toks[0].t / 1000 : run ? run.ttftS : null;
  $('clock').textContent = dec(`${el.toFixed(3)} s`);
  $('rateOut').innerHTML = `<span style="color:var(--cy)">${esc(L('real time', 'tiempo real'))}</span>`; $('rateTxt').textContent = '1×';
  const sd = LIVE.running ? L(`real request · ${num(n)} tokens so far`, `petición real · ${num(n)} tokens hasta ahora`) : run ? L(`last real run <b>${S_(run.totalS || el)}</b> · first token at <b>${first !== null ? S_(first) : '—'}</b>`, `última ejecución real <b>${S_(run.totalS || el)}</b> · primer token a <b>${first !== null ? S_(first) : '—'}</b>`) : L('no real run yet', 'aún sin ejecución real');
  if ($('stepDur').dataset.k !== sd) { $('stepDur').dataset.k = sd; $('stepDur').innerHTML = sd; }
  const txt = MODE.lost ? L('Lost the server: Retry, or go back to the simulation.', 'Se perdió el servidor: Reintenta, o vuelve a la simulación.') : LIVE.running ? (n ? L(`Writing: ${LIVE.pick} has sent ${num(n)} of at most ${num(LIVE.maxTok)} tokens.`, `Escribiendo: ${LIVE.pick} ha enviado ${num(n)} de como mucho ${num(LIVE.maxTok)} tokens.`) : L(`Waiting for the first token: ${LIVE.pick} is loading and reading the prompt.`, `Esperando el primer token: ${LIVE.pick} está cargando y leyendo el prompt.`))
    : run ? L('Done. Press Send to run the same request again.', 'Hecho. Pulsa Enviar para repetir la misma petición.') : L('Real machine: press Send to run this request on the server.', 'Máquina real: pulsa Enviar para ejecutar esta petición en el servidor.');
  if ($('nowTxt').dataset.k !== txt) { $('nowTxt').dataset.k = txt; $('nowTxt').innerHTML = esc(txt); } $('nowLine').classList.remove('stale');
  const ph = LIVE.running ? (n ? 'decode' : 'wait') : run ? 'done' : 'idle';
  const tiles = [['wait', 'layers', L('LOAD + PREFILL', 'CARGA + PREFILL'), ph === 'wait' ? '…' : first !== null ? S_(first) : ''], ['decode', 'token', 'DECODE', `${num(n)}/${num(LIVE.maxTok)}`], ['done', 'check', L('DONE', 'FIN'), run ? S_(run.totalS || el) : '']];
  const ord = { idle: -1, wait: 0, decode: 1, done: 2 }[ph];
  const th = tiles.map(([k, ic, nm, v], i) => `<div class="tk ${k === 'wait' ? 'prefill' : k}${i === ord ? ' cur' : ''}${i < ord || ph === 'done' ? ' past' : ''}"><i style="width:${i < ord || ph === 'done' ? 100 : 0}%"></i>${ICON(ic, 's')}<span>${nm}</span>${v ? `<small class="ka">${esc(v)}</small>` : ''}</div>`).join('');
  if ($('track').dataset.k !== th) { $('track').dataset.k = th; $('track').innerHTML = th; }
  const big = `${num(n)} <small>/ ${num(LIVE.maxTok)} ${L('tokens', 'tokens')}</small>`, sm = run ? L(`${num(run.promptN)} prompt tokens · ${dec((run.evalN / Math.max(1e-9, run.decodeS)).toFixed(1))} tok/s`, `${num(run.promptN)} tokens de prompt · ${dec((run.evalN / Math.max(1e-9, run.decodeS)).toFixed(1))} tok/s`) : L(`≈ ${num(promptTokGuess())} prompt tokens`, `≈ ${num(promptTokGuess())} tokens de prompt`);
  if ($('cntBig').dataset.k !== big) { $('cntBig').dataset.k = big; $('cntBig').innerHTML = big; } if ($('cntSm').textContent !== sm) $('cntSm').textContent = sm;
  $('counter').className = ph === 'done' ? 'done' : ph === 'idle' ? 'idle' : ph === 'wait' ? 'prefill' : 'decode';
  $('pill').className = `pill ${MODE.lost ? 'load' : { idle: 'idle', wait: 'prefill', decode: 'decode', done: 'done' }[ph]}${LIVE.running ? ' run' : ''}`;
  $('pillTxt').textContent = MODE.lost ? L('LOST', 'PERDIDO') : { idle: 'IDLE', wait: L('WAITING', 'ESPERANDO'), decode: 'DECODE', done: L('DONE', 'FIN') }[ph];
  $('nowFix').innerHTML = ''; $('nowFix').dataset.k = ''; $('reset').disabled = true; $('reset').title = L('Reset applies to the simulation', 'Restablecer se aplica a la simulación');
  $('cfg').classList.remove('locked');
  // controls that make no sense against a real server
  for (const id of ['jumpGo', 'jumpMenu', 'slower', 'faster']) { const b = $(id); b.disabled = true; b.title = REAL_TIME(); }
  for (const id of ['pauseTok', 'pauseLayer']) { const c = $(id); c.disabled = true; c.closest('label').title = REAL_TIME(); }
  document.querySelectorAll('#tlScale button').forEach(b => { b.disabled = true; b.title = REAL_TIME(); });
  $('play').disabled = MODE.lost || (!LIVE.running && !livePrompt().trim());
  { const ph2 = `${ICON(LIVE.running ? 'stop' : 'play', 's')}<span>${esc(LIVE.running ? L('Stop', 'Parar') : L('Send', 'Enviar'))}</span>`; if ($('play').dataset.k !== ph2) { $('play').dataset.k = ph2; $('play').innerHTML = ph2; } } $('play').title = LIVE.running ? L('Stop the real request (space)', 'Parar la petición real (espacio)') : L('Send the request to the server (space)', 'Enviar la petición al servidor (espacio)'); $('play').setAttribute('aria-label', $('play').title);
  $('stop').disabled = !LIVE.running; $('stop').title = L('Stop the real request', 'Parar la petición real');
  renderRealCfg();
}
// Leaving Real gives the simulation its controls back.
function realControlsBack() {
  for (const id of ['jumpGo', 'jumpMenu', 'slower', 'faster', 'stop']) { const b = $(id); b.disabled = false; if (b.title === REAL_TIME()) b.title = ''; }
  for (const id of ['pauseTok', 'pauseLayer']) { const c = $(id); c.disabled = false; c.closest('label').title = ''; }
  document.querySelectorAll('#tlScale button').forEach(b => { b.disabled = false; });
  $('play').dataset.k = ''; $('track').dataset.k = ''; $('cntBig').dataset.k = ''; $('stepDur').dataset.k = ''; $('nowTxt').dataset.k = ''; renderTransport(); renderTlScale();
}
let wasReal = false;
setInterval(() => { const r = isReal(); if (wasReal && !r) realControlsBack(); wasReal = r; renderMode(); $('estTag').hidden = !(r && (UI.lens !== 'tokens' || !liveShowing())); }, 300);
$('estTag').textContent = L('estimate', 'estimación');
$('estTag').title = L('In Real machine mode, System, Model and Memory draw the cost model’s estimate for the server’s model on the Estimate as machine. Tokens and the Estimate vs measured table are real.', 'En modo Máquina real, Sistema, Modelo y Memoria dibujan la estimación del modelo de costes para el modelo del servidor en la máquina de Estimar como. Tokens y la tabla Estimación frente a medida son reales.');

// ---- Real run -> estimate timeline: the views follow the server ----
// Phase by phase: the wait before the first token covers the estimate's load, prefill and first pass (split at the
// server's own load time once it reports it); each arriving token i maps to the estimate's pass for token i.
// The server does not report layers, so inside one real token the layers are interpolated over its real duration.
let EST_END = { r: null, m: new Map() };
function eTokEnd(i) { // when the estimate has written token i (0-based)
  if (EST_END.r !== R) EST_END = { r: R, m: new Map() };
  if (EST_END.m.has(i)) return EST_END.m.get(i);
  let lo = 0, hi = R.total; if (generatedAt(hi - 1e-9) < i + 1) { EST_END.m.set(i, R.total); return R.total; }
  for (let k = 0; k < 48; k++) { const mid = (lo + hi) / 2; if (generatedAt(mid) >= i + 1) hi = mid; else lo = mid; }
  EST_END.m.set(i, hi); return hi;
}
function realToEst(t) {
  const run = LIVE.run, arr = LIVE.toks.map(q => q.t / 1000), n = arr.length, eps = 1e-6;
  if (!R.total) return 0;
  if (n === 0) return Math.min(t, eTokEnd(0) - eps);
  const e0 = eTokEnd(0);
  if (t < arr[0]) {
    const eLoad = R.load + R.restore;
    if (run && run.loadS > 0 && eLoad > 0 && arr[0] > run.loadS) return t < run.loadS ? eLoad * t / run.loadS : eLoad + (e0 - eLoad) * (t - run.loadS) / (arr[0] - run.loadS);
    return e0 * t / arr[0];
  }
  let k = n - 1; while (k > 0 && arr[k] > t) k--;
  const a = eTokEnd(k), b = eTokEnd(Math.min(k + 1, S.ans - 1));
  if (k < n - 1) return a + (b - a) * (t - arr[k]) / Math.max(eps, arr[k + 1] - arr[k]);
  if (!LIVE.running) return Math.min(R.total, a + (run && t > arr[k] ? (R.total - a) * Math.min(1, (t - arr[k]) / Math.max(eps, (run.totalS || t) - arr[k])) : 0));
  const avg = k > 0 ? (arr[k] - arr[0]) / k : Math.max(.05, eTokEnd(1) - e0);
  return a + (b - a) * Math.min(.98, (t - arr[k]) / Math.max(eps, avg));
}
// The record ends at the last real arrival, on the same browser clock as the arrivals (the server's own total can differ).
function realRecEnd() { const n = LIVE.toks.length; return n ? LIVE.toks[n - 1].t / 1000 : LIVE.run ? LIVE.run.totalS || 0 : realElapsed(); }
// The estimate's clock in Real: live while the request streams, the chosen point of the record afterwards.
function realEstT() {
  if (LIVE.running) return realToEst(realElapsed());
  if (LIVE.run || LIVE.toks.length) { const end = realRecEnd(); return UI.realT == null ? R.total : realToEst(Math.min(end, UI.realT)); }
  return null;
}

// The timeline in Real: the run as it arrives, on a real-time axis, then kept as the record of that run.
function drawRealTimeline() {
  const id = 'cTime', c = $(id), r = $('tlWrap').getBoundingClientRect(), W = Math.max(200, Math.floor(r.width)), H = Math.max(48, Math.floor(r.height)), x = fit(c, W, H); hitReset(id);
  const lab = W < 500 ? 46 : 88, w = W - lab - 8, run = LIVE.run, el = realElapsed(), arr = LIVE.toks.map(q => q.t / 1000);
  const T = Math.max(1, el, run ? run.totalS || 0 : 0) * 1.02, X = t => lab + (t / T) * w, lanes = [L('load', 'carga'), 'prefill', 'decode'], laneH = Math.max(8, Math.min(22, (H - 26) / 3 - 4)), ly = i => 4 + i * (laneH + 4);
  lanes.forEach((l, i) => { text(x, l, lab - 8, ly(i) + laneH / 2 + 3.5, C.mid, 'right', 9.5); x.fillStyle = 'rgba(255,255,255,.025)'; x.fillRect(lab, ly(i), w, laneH); });
  const first = arr.length ? arr[0] : run ? run.ttftS : null;
  if (!LIVE.running && !run) { text(x, L('Press Send: the real run is drawn here as it arrives', 'Pulsa Enviar: la ejecución real se dibuja aquí según llega'), lab + w / 2, ly(1) + laneH / 2 + 3.5, C.dim, 'center', 10.5); }
  else {
    if (run && run.loadS !== undefined && first !== null) { // the server's own split of the wait
      const ld = Math.min(run.loadS || 0, first); x.fillStyle = 'rgba(185,162,242,.7)'; x.fillRect(X(0), ly(0), Math.max(1, X(ld) - X(0)), laneH);
      x.fillStyle = 'rgba(127,227,255,.65)'; x.fillRect(X(ld), ly(1), Math.max(1, X(first) - X(ld)), laneH);
    } else { const end = first !== null ? first : el; x.fillStyle = 'rgba(127,227,255,.3)'; x.fillRect(X(0), ly(1), Math.max(1, X(end) - X(0)), laneH); if (W > 520) text(x, L('load + prefill (split known at the end)', 'carga + prefill (el reparto se sabe al final)'), X(0) + 6, ly(1) + laneH / 2 + 3.5, C.ink, 'left', 9.5); }
    if (first !== null) { const end = LIVE.running ? el : run ? run.totalS || el : el; x.fillStyle = 'rgba(255,212,59,.22)'; x.fillRect(X(first), ly(2), Math.max(1, X(end) - X(first)), laneH); x.fillStyle = C.hot; for (const a of arr) x.fillRect(Math.round(X(a)), ly(2), 1, laneH); }
  }
  const yA = ly(3) - 2, step = [0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300].find(s => T / s <= 8) || 600;
  for (let t = 0; t <= T; t += step) { const xx = Math.round(X(t)) + .5; x.strokeStyle = C.grid; x.beginPath(); x.moveTo(xx, 2); x.lineTo(xx, yA); x.stroke(); text(x, S_(t), xx, yA + 12, C.dim, 'center', 9.5); }
  // the present: a playhead at the real elapsed time while it runs, then at the chosen point of the record (the end by default)
  const endT = realRecEnd(), tp = LIVE.running ? el : (run || arr.length) ? (UI.realT == null ? endT : Math.min(endT, UI.realT)) : null;
  if (tp !== null) { const ph = X(tp); x.strokeStyle = C.ink; x.lineWidth = 2; x.beginPath(); x.moveTo(ph, 0); x.lineTo(ph, yA); x.stroke(); x.lineWidth = 1; x.fillStyle = C.ink; x.beginPath(); x.moveTo(ph - 5, 0); x.lineTo(ph + 5, 0); x.lineTo(ph, 6); x.fill(); }
  timeGeo = { lab, w, t0: 0, t1: T, real: true, scale: 'real', endT: (run || arr.length) && !LIVE.running ? endT : null };
}

// ---- start: resume Real only when the last session was Real and the server answers quickly ----
{
  const saved = (() => { try { return localStorage.getItem(MODE_KEY); } catch (e) { return null; } })(), simS = loadJ(SIMS_KEY);
  if (saved === 'real' && simS) { S = { ...S, ...simS }; fillSelects(); changed(); }
  if (saved === 'real') {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 1500);
    fetch(LIVE.ep.replace(/\/+$/, '') + '/api/version', { signal: ctl.signal }).then(r => { if (r.ok) { MODE.connecting = true; liveDetect(); } }).catch(() => {});
  }
  renderMode(true);
}
