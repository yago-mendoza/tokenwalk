// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Setup (zone 1): scenarios, sections, values =====
const SCEN = [
  { id: 'laptop', ic: 'memory', t: () => L('Reference: ThinkPad 860M', 'Referencia: ThinkPad 860M'), s: () => L('Qwen3.6 MoE on the 860M iGPU', 'Qwen3.6 MoE en la iGPU 860M'), set: {} },
  { id: 'dense', ic: 'layers', t: () => L('Dense 27B, same laptop', 'Denso 27B, mismo portátil'), s: () => L('every weight read per token', 'todos los pesos leídos por token'), set: { model: 'qwen38' } },
  { id: 'rtx', ic: 'bolt', t: () => L('Same request on an RTX 5090', 'La misma petición en una RTX 5090'), s: () => L('32 GB of VRAM at 1,792 GB/s', '32 GB de VRAM a 1.792 GB/s'), set: { machine: 'rtx5090' } },
  { id: 'nofit', ic: 'warning', t: () => L('55 GB model on a 32 GB laptop', 'Modelo de 55 GB en un portátil de 32 GB'), s: () => L('dense 27B in F16: fails the fit check', 'denso 27B en F16: no pasa la comprobación'), set: { model: 'qwen38', quant: 'F16', ram: 32 } },
  { id: 'long', ic: 'notes', t: () => L('Long context, 128k', 'Contexto largo, 128k'), s: () => L('120,000 tokens of documents', '120.000 tokens de documentos'), set: { docs: 120000, ctx: 131072 } },
  { id: 'cold', ic: 'timer', t: () => L('Cold start after keep_alive', 'Arranque en frío tras keep_alive'), s: () => L('the load from disk comes first', 'primero la carga desde disco'), set: { cold: true } },
];
function scenState(sc) { const d = defaults(); const st = { ...d }; if (sc.set.machine) Object.assign(st, machineFields(sc.set.machine)); return { ...st, ...sc.set }; }
function applyScen(sc) { if (locked()) return; pushUndo(); S = scenState(sc); UI.layer = -1; KEEP.unloaded = false; KEEP.idle = 0; changed(); }
function buildScen() {
  $('scen').innerHTML = SCEN.map(sc => `<button type="button" class="sc" data-s="${sc.id}" title="${esc(sc.s())}">${ICON(sc.ic)}<b>${esc(sc.t())}</b><span>${esc(sc.s())}</span></button>`).join('');
  $('scen').querySelectorAll('.sc').forEach(b => b.addEventListener('click', () => applyScen(SCEN.find(s => s.id === b.dataset.s))));
}
function renderScen() { const cur = JSON.stringify(S); document.querySelectorAll('.sc').forEach(b => { const sc = SCEN.find(s => s.id === b.dataset.s); b.classList.toggle('on', JSON.stringify(scenState(sc)) === cur); }); }
function fillSelects() {
  const opt = ([k, mm]) => `<option value="${k}">${esc(mm.name)}${mm.est ? ' *' : ` · ${L('calibrated', 'calibrada')}`}</option>`;
  $('machine').innerHTML = VENDORS.map(v => { const es = Object.entries(MACHINES).filter(([, mm]) => vendorOf(mm) === v); return es.length ? `<optgroup label="${esc(vendorLabel(v))}">${es.map(opt).join('')}</optgroup>` : ''; }).join('')
    + Object.entries(MACHINES).filter(([, mm]) => !VENDORS.includes(vendorOf(mm))).map(opt).join('');
  const mopt = ([k, mm]) => `<option value="${k}">${esc(mm.name)}</option>`;
  $('model').innerHTML = modelVendors().map(v => `<optgroup label="${esc(v)}">${Object.entries(MODELS).filter(([k, mm]) => k !== 'live' && mm.vendor === v).map(mopt).join('')}</optgroup>`).join('')
    + Object.entries(MODELS).filter(([k, mm]) => k === 'live' || !mm.vendor).map(mopt).join('');
  $('quant').innerHTML = Object.entries(QUANTS).map(([k, q]) => `<option value="${k}">${q.label} · ${dec(q.bpw)} bits</option>`).join('');
  $('kv').innerHTML = Object.entries(KV_TYPES).map(([k, q]) => `<option value="${k}">${q.label}</option>`).join('');
}
function syncControls() {
  const p = MACHINES[S.machine], m = MODELS[S.model];
  for (const id2 of ['machine', 'model', 'quant', 'kv']) $(id2).value = S[id2];
  for (const id2 of ['ram', 'tflops', 'mts', 'vram', 'vbw']) if (document.activeElement !== $(id2)) $(id2).value = S[id2];
  $('bus').value = String(S.bus);
  $('uniFields').style.display = p.kind === 'unified' ? 'grid' : 'none'; $('cardFields').style.display = p.kind === 'discrete' ? 'grid' : 'none';
  $('ctx').max = String(Math.log2(m.ctxMax)); $('ctx').min = String(Math.min(11, Math.log2(m.ctxMax)));
  $('ctx').value = String(Math.log2(Math.min(S.ctx, m.ctxMax))); $('ctxOut').textContent = num(Math.min(S.ctx, m.ctxMax));
  for (const id2 of ['sys', 'docs', 'q', 'ans', 'gamma', 'alpha', 'temp', 'topk', 'topp', 'keepalive']) $(id2).value = String(S[id2]);
  $('sysOut').textContent = num(S.sys); $('docsOut').textContent = num(S.docs); $('qOut').textContent = num(S.q); $('ansOut').textContent = num(S.ans);
  $('gammaOut').textContent = String(S.gamma); $('alphaOut').textContent = dec(S.alpha.toFixed(2)); $('keepaliveOut').textContent = S.keepalive ? `${S.keepalive} min` : L('0, unload at once', '0, descarga inmediata');
  $('tempOut').textContent = dec(S.temp.toFixed(2)); $('topkOut').textContent = S.topk >= 6 ? L('off', 'sin corte') : String(S.topk); $('toppOut').textContent = dec(S.topp.toFixed(2));
  for (const id2 of ['cold', 'cached', 'disk', 'spec', 'mtp']) $(id2).checked = S[id2];
  { const has = !!MODELS[S.model].mtp; $('mtp').disabled = !has || S.spec; $('mtpRow').title = !has ? L('This model has no MTP block', 'Este modelo no tiene bloque MTP') : S.spec ? L('The separate draft model replaces MTP while it is on', 'El modelo borrador aparte sustituye a MTP mientras está activo') : L('What Ollama does by default with this model (draft_num_predict 2)', 'Lo que Ollama hace por defecto con este modelo (draft_num_predict 2)'); $('mtpRow').classList.toggle('off', !has || S.spec); }
  $('specFields').style.display = S.spec ? 'grid' : 'none';
  $('bwFormula').innerHTML = dec(`${num(S.mts)} MT/s × ${S.bus} bit / 8 = <b>${((S.mts * S.bus) / 8 / 1000).toFixed(1)} GB/s</b>`);
  $('ctxNote').textContent = L('Ollama reserved 262,144 by default on the laptop (the right end).', 'Ollama reservaba 262.144 por defecto en el portátil (el extremo derecho).');
  $('estNote').textContent = !p.est ? L('Calibrated: measured on this machine.', 'Calibrada: medida en esta máquina.') : p.estimate === 'family-fit' ? L(`Estimate: published specs, with factors fitted to published benchmarks of its family (${famLabel(p.family)}).`, `Estimación: especificaciones publicadas, con factores ajustados a resultados publicados de su familia (${famLabel(p.family)}).`) : L('Estimated machine: published bandwidth, assumed efficiency.', 'Máquina estimada: ancho de banda publicado, eficiencia supuesta.');
  $('modelNote').textContent = L(`${dec(fmtGB(R.weights))} file · ${dec((m.readParams / 1e9).toFixed(1))}B read per token${m.moe ? ` · ${m.expertsUsed} + ${m.sharedExperts} of ${m.experts} experts` : ' · dense'}`, `archivo de ${dec(fmtGB(R.weights))} · ${dec((m.readParams / 1e9).toFixed(1))}B leídos por token${m.moe ? ` · ${m.expertsUsed} + ${m.sharedExperts} de ${m.experts} expertos` : ' · denso'}`);
  $('vMachine').textContent = `${R.mc.short}${p.est ? ' *' : ''} · ${dec(R.mc.bw.toFixed(0))} GB/s`;
  $('vModel').textContent = `${m.name.replace(' 35B-A3B', '')} · ${S.quant}`;
  $('vRequest').textContent = `${num(S.sys + S.docs + S.q)} + ${num(S.ans)}`;
  $('vEngine').textContent = `${num(Math.min(S.ctx, m.ctxMax) / 1024)}k · ${S.kv} · ${S.keepalive}m`;
  $('vSamp').textContent = `T ${dec(S.temp.toFixed(2))} · k ${S.topk >= 6 ? L('off', 'no') : S.topk} · p ${dec(S.topp.toFixed(2))}`; if (document.activeElement !== $('seed')) $('seed').value = S.seed;
  $('vAdv').textContent = [S.cached ? L('prefix', 'prefijo') : '', S.disk ? 'KV disk' : '', S.spec ? `spec γ${S.gamma}` : '', !S.spec && S.mtp && MODELS[S.model].mtp ? 'MTP' : ''].filter(Boolean).join(' · ') || L('off', 'apagado');
  // the setup line says which mode the console is in: the simulated setup, or what is really sent to the server
  $('chip').innerHTML = isReal() ? (() => { const mm = LIVE.models.find(q => q.name === LIVE.pick), run = LIVE.run && LIVE.run.prompt === livePrompt() ? LIVE.run : null;
    return `${ICON('laptop', 's')}<b>${esc(L('this machine', 'esta máquina'))}</b> <small>${esc(L('real', 'real'))}</small><span class="sep">/</span><b>${esc(LIVE.pick)}</b>${mm && mm.quant ? ` ${esc(mm.quant)}` : ''}<span class="sep">/</span>${run ? num(run.promptN) : `≈ ${num(promptTokGuess())}`} + ${num(LIVE.maxTok)} ${L('tokens', 'tokens')}<span class="sep">/</span>num_ctx ${num(Math.min(S.ctx, m.ctxMax))}`; })()
    : `${ICON('memory', 's')}<b>${esc(R.mc.short)}</b><span class="sep">/</span><b>${esc(m.name)}</b> ${esc(S.quant)}<span class="sep">/</span>${num(R.prompt)} + ${num(S.ans)} ${L('tokens', 'tokens')}<span class="sep">/</span>num_ctx ${num(R.ctx)}`;
  $('chip').title = isReal() ? L('What is sent to the server. Click to see the connection.', 'Lo que se envía al servidor. Pulsa para ver la conexión.') : L('The simulated machine, model and request. Click to change them.', 'La máquina, el modelo y la petición simulados. Pulsa para cambiarlos.');
  $('pauseTok').checked = UI.pauseTok; $('pauseLayer').checked = UI.pauseLayer;
  renderScen();
}
function changed(keepTime?) {
  const wasDone = R && R.total && P.t >= R.total - 1e-12;
  const frac = R.total ? P.t / R.total : 0;
  if (R && (ZOOM.model.length || ZOOM.memory.length) && R.m !== MODELS[S.model]) zoomReset();
  R = compute(); ATTN_IDX = R.kinds.map((k, i) => (k === 'attn' ? i : -1)).filter(i => i >= 0); if (R.m.kvLayers >= R.m.layers) ATTN_IDX = R.kinds.map((_, i) => i);
  sampleAll(); logKey = ''; streamKey = ''; alertKey = ''; kpiKey = '';
  if (!keepTime) { P.on = false; P.t = 0; P.anim = null; if (wasDone) UI.stale = true; } else P.t = Math.min(R.total, frac * R.total);
  if (UI.layer >= R.m.layers) UI.layer = -1;
  for (const k of ['mem', 'ssd', 'pcie', 'wb']) SYSP[k].length = 0;
  syncControls(); renderTransport(); writeUrl(); renderInspector(true);
}
function resample() { const g = P.t >= R.total && R.total ? 0 : generatedAt(P.t), keep = SAMPLED.slice(0, g); sampleAll(); SAMPLED = keep.concat(SAMPLED.slice(g)); streamKey = ''; syncControls(); writeUrl(); }

// ===== Lenses =====
const LENS_DEF = [['system', 'memory', () => L('System', 'Sistema')], ['model', 'layers', () => L('Model', 'Modelo')], ['memory', 'grid', () => L('Memory', 'Memoria')], ['tokens', 'notes', () => L('Tokens', 'Tokens')]];
function renderMmode() { const h = [['grid', L('Grid', 'Cuadrícula')], ['stack', L('Matrices', 'Matrices')]].map(([k, l]) => `<button type="button" data-mm="${k}" aria-pressed="${(UI.modelMode || 'grid') === k}">${esc(l)}</button>`).join(''); if ($('mmodeSeg').dataset.k !== h) { $('mmodeSeg').dataset.k = h; $('mmodeSeg').innerHTML = h; $('mmodeSeg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { UI.modelMode = b.dataset.mm; try { localStorage.setItem('llmc.modelMode', UI.modelMode); } catch (er) {} if (zTop('model')) zoomTo('model', 0); renderMmode(); writeUrl(); })); } }
function setLens(l) { UI.lens = l; document.body.dataset.lens = l; if (legendLens !== l) buildLegend(); renderZbar(); document.querySelectorAll('#stage [data-lens]').forEach(el => el.classList.toggle('on', el.dataset.lens === l)); renderLensSeg(); writeUrl(); }
function renderLensSeg() {
  // One lens switcher: each tab carries a live miniature of its view.
  const LENS_Q = { system: L('Where the bytes travel: memory, chips and the wires between them', 'Por dónde viajan los bytes: memoria, chips y los cables entre ellos'), model: L('How a token climbs the layers, and what each layer reads', 'Cómo sube un token por las capas y qué lee cada capa'), memory: L('What fills the memory, and how the KV cache grows', 'Qué llena la memoria y cómo crece la caché KV'), tokens: L('What goes in, what comes out, and how each word is chosen', 'Qué entra, qué sale y cómo se elige cada palabra') };
  $('lensSeg').innerHTML = LENS_DEF.map(([k, ic, l]) => `<button type="button" data-l="${k}" aria-pressed="${UI.lens === k}" title="${esc(LENS_Q[k])}"><canvas class="lt"></canvas><span>${esc(l())}</span></button>`).join('');
  $('lensSeg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => setLens(b.dataset.l)));

}
let thumbT = 0;
function renderThumbs(n) {
  const nowT = performance.now(); if (nowT - thumbT < 600) return; thumbT = nowT;
  for (const [k] of LENS_DEF) {
    const b = $('lensSeg').querySelector(`[data-l="${k}"]`); if (!b) continue; const cv = b.querySelector('canvas'), x = fit(cv, 34, 18);
    x.globalAlpha = k === UI.lens ? 1 : .55;
    if (k === 'tokens') { const g = generatedAt(P.t); for (let i = 0; i < Math.min(18, g); i++) chipRound(x, 2 + (i % 6) * 5.4, 2 + Math.floor(i / 6) * 5.4, 4, C.hot); continue; }
    const src = { system: 'cSystem', model: 'cModel', memory: 'cMemory' }[k];
    if (k !== UI.lens) { if (k === 'system') drawSystem(n, 0); if (k === 'model') drawModel(n); if (k === 'memory') drawMemory(n); }
    const s = $(src); if (s.width) x.drawImage(s, 0, 0, s.width, s.height, 0, 0, cv.clientWidth, cv.clientHeight);
  }
}
const LEGEND = [
  ['weights', () => L('weights', 'pesos'), () => L('Weights, the model: fixed, re-read from memory every token', 'Pesos, el modelo: fijos, releídos de memoria en cada token')],
  ['kv', () => L('KV cache', 'caché KV'), () => L('Keys and values of earlier tokens, per attention layer; kept and growing', 'Claves y valores de tokens anteriores, por capa de atención; se guardan y crecen')],
  ['kvres', () => L('reserved', 'reservado'), () => L('KV space reserved by num_ctx at load, still empty', 'Espacio KV reservado por num_ctx al cargar, aún vacío')],
  ['state', () => L('fixed state', 'estado fijo'), () => L('Gated DeltaNet state: the same size at every token', 'Estado Gated DeltaNet: del mismo tamaño en cada token')],
  ['flight', () => L(`Each dot: ${num(LEGEND_DOT_MB)} MB on the move`, `Cada punto: ${num(LEGEND_DOT_MB)} MB en camino`), () => L('Bytes of weights travelling from memory to the chip; rings are K and V written back', 'Bytes de pesos viajando de la memoria al chip; los anillos son K y V escritos de vuelta')],
  ['busy', () => L('arithmetic', 'aritmética'), () => L('Compute units doing multiplications now (a model estimate)', 'Unidades de cómputo multiplicando ahora (estimación del modelo)')],
  ['sys', () => L('other apps', 'otras apps'), () => L('Operating system and apps, 32 GB measured on the laptop', 'Sistema operativo y apps, 32 GB medidos en el portátil')],
  ['token', () => L('token', 'token'), () => L('Square: a prompt token; round: a generated token', 'Cuadrado: token del prompt; redondo: token generado')],
];
const LEGEND_IN = {
  weights: 'system model memory', kv: 'system model', kvres: 'system memory', state: 'system model memory', flight: 'system model', busy: 'system model', sys: 'system memory', token: 'system model tokens',
  kvby: 'memory', free: 'memory', hw_storage: 'system', hw_ram: 'system', hw_vram: 'system', hw_proc: 'system', hw_link: 'system', tk_sys: 'tokens', tk_docs: 'tokens', tk_q: 'tokens', tk_ans: 'tokens', unread: 'tokens', cached: 'tokens memory',
};
const LEGEND_X = [
  ['kvby', () => L('KV, tinted by the token that left it', 'KV, teñida por el token que la dejó'), () => L('Each cell of the KV cache takes the colour of the kind of token that wrote it: system, documents, question or answer', 'Cada celda de la caché KV toma el color del tipo de token que la escribió: sistema, documentos, pregunta o respuesta')],
  ['free', () => L('free', 'libre'), () => L('Memory nobody holds', 'Memoria que nadie ocupa')],
  ['tk_sys', () => L('system prompt', 'prompt de sistema'), () => L('Tokens of the system prompt', 'Tokens del prompt de sistema')],
  ['tk_docs', () => L('documents', 'documentos'), () => L('Tokens of the history and documents', 'Tokens de la historia y los documentos')],
  ['tk_q', () => L('question', 'pregunta'), () => L('Tokens of the question', 'Tokens de la pregunta')],
  ['tk_ans', () => L('answer', 'respuesta'), () => L('Tokens the model writes', 'Tokens que escribe el modelo')],
  ['unread', () => L('not read yet', 'aún sin leer'), () => L('Faded: prompt tokens the prefill has not reached', 'Atenuado: tokens del prompt a los que el prefill aún no ha llegado')],
  ['hw_storage', () => L('storage', 'almacenamiento'), () => L('Outline: SSD or disk', 'Contorno: SSD o disco')],
  ['hw_ram', () => L('system RAM', 'RAM del sistema'), () => L('Outline: system memory chips', 'Contorno: chips de memoria del sistema')],
  ['hw_vram', () => L('VRAM or HBM', 'VRAM o HBM'), () => L('Outline: memory on the graphics card', 'Contorno: memoria en la tarjeta gráfica')],
  ['hw_proc', () => L('processors', 'procesadores'), () => L('Outline: CPU, GPU, NPU and the memory controller', 'Contorno: CPU, GPU, NPU y el controlador de memoria')],
  ['hw_link', () => L('links', 'enlaces'), () => L('Wires between parts: memory bus, PCIe', 'Cables entre piezas: bus de memoria, PCIe')],
  ['cached', () => L('prefix cache', 'prefijo en caché'), () => L('Cyan underline: tokens whose KV was kept from an earlier request, so no prefill', 'Subrayado cian: tokens cuya KV se guardó de una petición anterior, sin prefill')],
];
let legendLens = '';
function buildLegend() {
  legendLens = UI.lens;
  const nL = [...LEGEND, ...LEGEND_X].filter(([k]) => (LEGEND_IN[k] || '').split(' ').includes(UI.lens)).length; $('legBtn').innerHTML = `${ICON('eq', 's')}<span>${esc(L(`Legend · ${nL}`, `Leyenda · ${nL}`))}</span>`; $('legBtn').title = L('What the colours and textures of this view mean', 'Qué significan los colores y texturas de esta vista');
  $('legend').innerHTML = [...LEGEND, ...LEGEND_X].filter(([k]) => (LEGEND_IN[k] || '').split(' ').includes(UI.lens)).map(([k, l, d]) => { const t = l(); return `<span class="lg" data-k="${k}" title="${esc(d())}"><canvas data-k="${k}"></canvas><span>${esc(t.charAt(0).toUpperCase() + t.slice(1))}</span></span>`; }).join('');
  $('legend').querySelectorAll('canvas').forEach(c => {
    const k = c.dataset.k, x = fit(c, 22, 12);
    if (['weights', 'kv', 'kvres', 'state', 'sys'].includes(k)) fillKind(x, k, 0, 0, 22, 12);
    else if (k === 'flight') { x.fillStyle = C.hot; for (const [a, b] of [[4, 6], [10, 6]]) { x.beginPath(); x.arc(a, b, 1.7, 0, 7); x.fill(); } x.strokeStyle = C.hot; x.beginPath(); x.arc(17, 6, 2.6, 0, 7); x.stroke(); }
    else if (k === 'busy') glowRect(x, 5, 2, 12, 8, true);
    else if (k === 'token') { chipSq(x, 1, 2, 8, C.li); chipRound(x, 12, 2, 8, C.hot); }
    else if (k === 'kvby') ['sys', 'docs', 'q', 'ans'].forEach((t, i) => fillKind(x, 'kv_' + t, i * 5.5, 0, 5, 12));
    else if (k === 'free') fillKind(x, 'free', 0, 0, 22, 12);
    else if (k.startsWith('hw_')) { x.strokeStyle = HW[k.slice(3)]; x.lineWidth = 1.5; if (k === 'hw_link') { x.beginPath(); x.moveTo(1, 6); x.lineTo(21, 6); x.stroke(); } else x.strokeRect(1.75, 1.75, 18.5, 8.5); x.lineWidth = 1; }
    else if (k.startsWith('tk_')) { for (let i = 0; i < 3; i++) chipSq(x, 1 + i * 7, 3, 6, TOKCOL[k.slice(3)]); }
    else if (k === 'unread') { x.globalAlpha = .28; for (let i = 0; i < 3; i++) chipSq(x, 1 + i * 7, 3, 6, TOKCOL.docs); x.globalAlpha = 1; }
    else if (k === 'cached') { for (let i = 0; i < 3; i++) chipSq(x, 1 + i * 7, 2, 6, TOKCOL.docs); x.fillStyle = C.cy; x.fillRect(1, 9.5, 20, 1.5); }
  });
}

// ===== Help =====
const HELP = [
  ['#cfg', 1, () => L('Setup', 'Configuración'), () => L('Pick a scenario or open a section to set the machine, the model and the request. It locks while a run is going.', 'Elige un escenario o abre una sección para fijar la máquina, el modelo y la petición. Se bloquea mientras corre.')],
  ['#run', 2, () => L('Playback', 'Ejecución'), () => L('Play, pause, step one token or one layer, set the speed. The clock is simulated time; the track says where the run is.', 'Reproduce, pausa, avanza un token o una capa, ajusta la velocidad. El reloj es tiempo simulado; la pista dice dónde va.')],
  ['#watch', 3, () => L('Observatory', 'Observatorio'), () => L('One lens at a time: the computer, the model, the memory, the tokens. The thumbnails switch lens.', 'Una lente cada vez: el ordenador, el modelo, la memoria, los tokens. Las miniaturas cambian de lente.')],
  ['#legend', 4, () => L('Legend', 'Leyenda'), () => L('What this view draws: each colour and texture means one thing everywhere, and the list changes with the view. Hover an item for its definition.', 'Lo que dibuja esta vista: cada color y textura significa una sola cosa en todas partes, y la lista cambia con la vista. Pasa el ratón por un elemento para su definición.')],
  ['#kpis', 5, () => L('Monitor', 'Monitor'), () => L('Four numbers that matter, with health colours, and one line saying what limits the run now.', 'Cuatro números que importan, con colores de estado, y una línea que dice qué limita la ejecución ahora.')],
  ['#mbody', 6, () => L('Alerts and instruments', 'Alertas e instrumentos'), () => L('Hover anything to see its name; click it, here or in any view, and an explainer opens: what it is, what it holds now and why it matters.', 'Pasa el ratón por cualquier cosa para ver su nombre; haz clic, aquí o en cualquier vista, y se abre una explicación: qué es, qué guarda ahora y por qué importa.')],
];
let helpI = -1;
function showHelp(i) {
  helpI = i; const h = $('help');
  if (i < 0 || i >= HELP.length) { h.classList.remove('on'); try { localStorage.setItem('llmc.help', '1'); } catch (e) {} return; }
  if (matchMedia('(max-width: 760px)').matches) { const z = { '#cfg': 'cfg', '#mon': 'mon', '#kpis': 'mon', '#mbody': 'mon' }[HELP[i][0]] || 'watch'; setZone(z); }
  h.classList.add('on');
  const [sel, nn, t, p] = HELP[i], el = document.querySelector(sel), r = el.getBoundingClientRect(), hole = h.querySelector('.hole'), card = h.querySelector('.card');
  Object.assign(hole.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
  $('hN').textContent = String(nn); $('hT').textContent = t(); $('hP').textContent = p(); $('hD').textContent = `${i + 1} / ${HELP.length}`;
  $('hBack').textContent = L('Back', 'Atrás'); $('hBack').disabled = i === 0; $('hNext').textContent = i === HELP.length - 1 ? L('Start', 'Empezar') : L('Next', 'Siguiente');
  const cw = 300, ch = card.offsetHeight || 150; let left = r.right + 14, top = r.top;
  if (left + cw > innerWidth - 8) left = r.left - cw - 14; if (left < 8) { left = Math.min(innerWidth - cw - 8, Math.max(8, r.left)); top = r.bottom + 12; if (top + ch > innerHeight - 8) top = r.top - ch - 12; }
  card.style.left = `${Math.max(8, left)}px`; card.style.top = `${Math.max(8, Math.min(innerHeight - ch - 8, top))}px`;
}

// ===== Settings popover: preferences, not the run =====
function renderSettings() {
  const el = $('settings');
  el.innerHTML = `
  <div class="lbl">${esc(L('Language', 'Idioma'))}</div><div class="seg" id="langSeg"><button type="button" data-k="en" aria-pressed="${lang === 'en'}">English</button><button type="button" data-k="es" aria-pressed="${lang === 'es'}">Español</button></div>
  <label class="sw sw2"><input type="checkbox" id="followT" ${UI.follow ? 'checked' : ''}><i></i><span><b>${esc(L('Follow the running layer', 'Seguir la capa en marcha'))}</b><small>${esc(L('On: while a run plays, Model keeps focusing whichever layer is being computed. Off: it stays on the layer you clicked.', 'Activado: mientras corre, Model enfoca siempre la capa que se está calculando. Apagado: se queda en la capa que pulsaste.'))}</small></span></label>
  <label class="sw sw2"><input type="checkbox" id="autoLensT" ${UI.autoLens ? 'checked' : ''}><i></i><span><b>${esc(L('Switch view to what I click', 'Cambiar de vista según lo que pulso'))}</b><small>${esc(L('On: clicking something outside the stage opens the view that draws it (a KV alert opens Memory, a token opens Tokens). Off: the view only changes when you pick it.', 'Activado: pulsar algo fuera del escenario abre la vista que lo dibuja (una alerta de KV abre Memory, un token abre Tokens). Apagado: la vista solo cambia cuando la eliges.'))}</small></span></label>
  <label class="sw sw2"><input type="checkbox" id="optMotion" ${document.body.classList.contains('reduced') ? 'checked' : ''}><i></i><span><b>${esc(L('Reduce motion', 'Reducir movimiento'))}</b><small>${esc(L('On: no flashes, glows or zoom animations; the simulation itself still plays. Off: transitions show where things go.', 'Activado: sin destellos, brillos ni animaciones de zoom; la simulación sigue corriendo. Apagado: las transiciones muestran adónde va cada cosa.'))}</small></span></label>
  <label class="sw sw2"><input type="checkbox" id="optLegend" ${document.body.classList.contains('noFoot') ? '' : 'checked'}><i></i><span><b>${esc(L('Show the legend', 'Mostrar la leyenda'))}</b><small>${esc(L('On: the colours and textures of the current view are named under it. Off: the view takes that space.', 'Activado: los colores y texturas de la vista actual se nombran debajo. Apagado: la vista ocupa ese espacio.'))}</small></span></label>
  <div class="fld" style="display:none"><label for="optSeed"><span>${esc(L('Sampling seed (reproducible text)', 'Semilla de muestreo (texto reproducible)'))}</span></label><input type="number" id="optSeed" min="1" max="99999" step="1" value="${S.seed}"></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="tbtn" id="optLayout" style="border-color:var(--line2)">${ICON('restart', 's')}${esc(L('Reset panel layout', 'Restablecer paneles'))}</button><button type="button" class="tbtn" id="optHelp" style="border-color:var(--line2)">${ICON('help', 's')}${esc(L('Open the wizard', 'Abrir el wizard'))}</button></div>
  <button type="button" class="tbtn" id="optNumbers" style="border-color:var(--line2);justify-self:start">${ICON('info', 's')}${esc(L('How accurate are the numbers?', '¿Qué precisión tienen los números?'))}</button>`;

  el.querySelectorAll('#langSeg button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.k)));
  $('optNumbers').addEventListener('click', () => { $('settings').classList.remove('on'); SEL_FROM = 'cap'; select({ k: 'term', id: 'numbers' }); });
  $('followT').addEventListener('change', e => { UI.follow = e.target.checked; });
  $('autoLensT').addEventListener('change', e => { UI.autoLens = e.target.checked; try { localStorage.setItem('llmc.autoLens', UI.autoLens ? '1' : '0'); } catch (er) {} });
  $('optMotion').addEventListener('change', e => { document.body.classList.toggle('reduced', e.target.checked); });
  $('optLegend').addEventListener('change', e => { document.body.classList.toggle('noFoot', !e.target.checked); try { localStorage.setItem('llmc.noFoot', e.target.checked ? '0' : '1'); } catch (e2) {} requestAnimationFrame(() => dispatchEvent(new Event('resize'))); });
  $('optSeed').addEventListener('change', e => { const v = Math.round(+e.target.value); if (v > 0) { S.seed = v; resample(); } else e.target.value = S.seed; });

  $('optLayout').addEventListener('click', () => { try { localStorage.removeItem('llmc.layout'); } catch (e) {} for (const k of ['--cfgW', '--monW', '--runH']) document.documentElement.style.removeProperty(k); });
  $('optHelp').addEventListener('click', () => { el.classList.remove('on'); showHelp(0); });
}

// ===== Splitters =====
function splitter(id, prop, axis, min, max, sign) {
  const el = $(id); let start = 0, base = 0;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); el.classList.add('drag'); start = axis === 'x' ? e.clientX : e.clientY; base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(prop)) || 0; });
  el.addEventListener('pointermove', e => { if (!el.classList.contains('drag')) return; const d = (axis === 'x' ? e.clientX : e.clientY) - start; const v = Math.max(min, Math.min(max, base + sign * d)); document.documentElement.style.setProperty(prop, `${v}px`); });
  el.addEventListener('pointerup', () => { el.classList.remove('drag'); try { localStorage.setItem('llmc.layout', JSON.stringify({ cfgW: getComputedStyle(document.documentElement).getPropertyValue('--cfgW'), monW: getComputedStyle(document.documentElement).getPropertyValue('--monW'), runH: getComputedStyle(document.documentElement).getPropertyValue('--runH') })); } catch (e) {} });
}
function loadLayout() { try { if (localStorage.getItem('llmc.noFoot') === '1') document.body.classList.add('noFoot'); } catch (e) {} try { const v = JSON.parse(localStorage.getItem('llmc.layout') || 'null'); if (v) { if (v.cfgW) document.documentElement.style.setProperty('--cfgW', v.cfgW.trim()); if (v.monW) document.documentElement.style.setProperty('--monW', v.monW.trim()); if (v.runH) document.documentElement.style.setProperty('--runH', v.runH.trim()); } } catch (e) {} }

// ===== Text, language, zones =====
function applyText() {
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.dataset.t); });
  document.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = ICON(el.dataset.ic, el.dataset.ic === 'chev' ? 's' : ''); });
  document.title = `tokenwalk · ${T('title')}`; document.documentElement.lang = lang;
  $('gear').innerHTML = ICON('settings'); $('gear').title = L('Settings', 'Ajustes'); $('helpBtn').innerHTML = ICON('help'); $('helpBtn').title = L('Wizard (?)', 'Wizard (?)');
  $('monBtn').innerHTML = `${ICON('eq', 's')}<span>${esc(L('Monitor', 'Monitor'))}</span>`; $('monClose').innerHTML = ICON('close', 's');
  $('stop').innerHTML = ICON('stop'); $('stop').title = L('Stop and back to the start', 'Parar y volver al principio');
  renderJump();
  $('slower').innerHTML = ICON('minus', 's'); $('faster').innerHTML = ICON('plus', 's'); $('slower').title = L('Slower', 'Más lento'); $('faster').title = L('Faster', 'Más rápido');
  $('aboutBtn').innerHTML = `${ICON('info', 's')}<span>${esc(L('About', 'Sobre la vista'))}</span>`; $('aboutBtn').title = L('What this view shows and what is happening in it now', 'Qué muestra esta vista y qué pasa en ella ahora');
  $('scaleBtn').innerHTML = `${ICON('eq', 's')}<span>${esc(L('Scale', 'Escala'))}</span>`; $('scaleBtn').title = L('Where the sizes on screen sit, from a byte to the model', 'Dónde caen los tamaños de la pantalla, de un byte al modelo');
  $('scaleTxt').textContent = L('Every size in the console on one ladder of powers of ten: each step to the right is a thousand times bigger. The yellow dot is what the current view is about; click any dot to read what it is.', 'Todos los tamaños de la consola en una escalera de potencias de diez: cada paso a la derecha es mil veces mayor. El punto amarillo es de lo que trata la vista actual; pulsa cualquier punto para leer qué es.');
  $('lsClose').innerHTML = ICON('close', 's'); $('lsClose').title = L('Close (Esc)', 'Cerrar (Esc)'); $('logClose').innerHTML = ICON('close', 's');
  $('logBtn').innerHTML = `${ICON('notes', 's')}<span>${esc(L('History', 'Historial'))}</span>`; $('logBtn').title = L('Everything that happened so far, with times', 'Todo lo que ha pasado hasta ahora, con tiempos');
  $('stopEdit').innerHTML = `${ICON('edit', 's')}<span>${esc(L('Stop and edit', 'Parar y editar'))}</span>`;
  document.querySelectorAll('#ztabs button').forEach(b => { const z = b.dataset.z; b.innerHTML = `${ICON(z === 'cfg' ? 'tune' : z === 'watch' ? 'eye' : 'eq', 's')}${esc({ cfg: T('zCfg'), watch: T('zWatch'), mon: T('zMon') }[z])}`; });
  $('sp1').title = $('sp2').title = $('sp3').title = L('Drag to resize', 'Arrastra para cambiar el tamaño');
  $('shield').title = L('Locked during the run: stop it to change the configuration', 'Bloqueado durante la ejecución: párala para cambiar la configuración');
  buildScen(); renderLensSeg(); buildLegend(); buildKpis(); renderTransport(); renderSettings();
  alertKey = ''; inspKey = ''; logKey = ''; streamKey = ''; kpiKey = '';
}
function setLang(l) { lang = l; SCRIPT_TOK = scriptTokens(lang); fillSelects(); applyText(); changed(true); }
function setZone(z) { document.body.dataset.zone = z; document.querySelectorAll('#ztabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.z === z))); }
function openMon() { if (matchMedia('(max-width: 760px)').matches) setZone('mon'); else if (matchMedia('(max-width: 1100px)').matches) document.body.classList.add('monOpen'); }
