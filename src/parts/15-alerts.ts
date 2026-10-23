// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Alerts =====
function alerts() {
  const out = [], { mc, m } = R, need = R.weights + R.kvRes + R.state + R.buf;
  if (mc.kind === 'unified' && need + sysGB() > mc.ramGB) out.push({ id: 'ram', lv: 'critical', title: L('Does not fit in RAM', 'No cabe en la RAM'), txt: L(`Model, KV and buffers need ${dec(fmtGB(need))} on top of ${sysGB()} GB of system and apps, more than ${dec(fmtGB(mc.ramGB))}. The system would page to disk or the engine refuse to load.`, `Modelo, KV y buffers necesitan ${dec(fmtGB(need))} además de ${sysGB()} GB de sistema y apps, más que ${dec(fmtGB(mc.ramGB))}. El sistema paginaría a disco o el motor no cargaría.`) });
  if (mc.kind === 'discrete' && R.pl.fastShare < .999) out.push({ id: 'spill', lv: 'critical', title: L(`${pct(1 - R.pl.fastShare)} spills to system RAM`, `El ${pct(1 - R.pl.fastShare)} se desborda a la RAM`), txt: L(`The model does not fit in ${dec(fmtGB(mc.fastGB))} of VRAM; that part is read at ${mc.hostBw} GB/s by the CPU, linked over PCIe at ${mc.linkBw} GB/s, and every token waits for it.`, `El modelo no cabe en ${dec(fmtGB(mc.fastGB))} de VRAM; esa parte la lee la CPU a ${mc.hostBw} GB/s, unida por PCIe a ${mc.linkBw} GB/s, y cada token la espera.`) });
  if (mc.kind === 'unified' && S.machine !== 'thinkpadCpu' && need > mc.fastGB && need + sysGB() <= mc.ramGB) out.push({ id: 'gpusplit', lv: 'caution', title: L('Part of the model on the CPU', 'Parte del modelo en la CPU'), txt: L(`The GPU may use about ${dec(fmtGB(mc.fastGB))} of the RAM and this needs ${dec(fmtGB(need))}; ollama ps would show a CPU/GPU split.`, `La GPU puede usar unos ${dec(fmtGB(mc.fastGB))} de la RAM y esto necesita ${dec(fmtGB(need))}; ollama ps mostraría un reparto CPU/GPU.`) });
  if (R.truncated) out.push({ id: 'trunc', lv: 'critical', title: L('Prompt cut to fit num_ctx', 'Prompt recortado para caber en num_ctx'), txt: L(`${num(R.promptFull)} prompt tokens plus ${num(S.ans)} of answer do not fit in num_ctx ${num(R.ctx)}; the engine keeps ${num(R.prompt)}.`, `${num(R.promptFull)} tokens de prompt más ${num(S.ans)} de respuesta no caben en num_ctx ${num(R.ctx)}; el motor se queda con ${num(R.prompt)}.`) });
  if (tokensInCache(P.t) >= R.ctx - .5) out.push({ id: 'kvfull', lv: 'critical', title: L('KV cache full', 'Caché KV llena'), txt: L('The context is full: anything more would push the oldest tokens out.', 'El contexto está lleno: lo siguiente echaría a los tokens más antiguos.') });
  if (R.ctx >= 262144) out.push({ id: 'ctx', lv: 'caution', title: L(`num_ctx ${num(R.ctx)} reserves ${dec(fmtGB(R.kvRes))} of KV`, `num_ctx ${num(R.ctx)} reserva ${dec(fmtGB(R.kvRes))} de KV`), txt: L(`This request uses ${num(R.prompt + S.ans)} tokens. Ollama reserved the model maximum by default on the article’s laptop; OLLAMA_CONTEXT_LENGTH or num_ctx brings it down.`, `Esta petición usa ${num(R.prompt + S.ans)} tokens. Ollama reservaba por defecto el máximo del modelo en el portátil del artículo; OLLAMA_CONTEXT_LENGTH o num_ctx lo bajan.`) });
  if (R.tps < READING[0]) out.push({ id: 'slow', lv: 'critical', title: L(`${m.name} writes below reading speed`, `${m.name} escribe por debajo de la velocidad de lectura`), txt: L(`${dec(R.tps.toFixed(1))} tok/s against 5 to 8 a person reads: every token reads ${B(R.mid.bytesGB * 1e9)} over a ${dec(mc.bw.toFixed(0))} GB/s bus.`, `${dec(R.tps.toFixed(1))} tok/s frente a los 5 a 8 que lee una persona: cada token lee ${B(R.mid.bytesGB * 1e9)} por un bus de ${dec(mc.bw.toFixed(0))} GB/s.`) });
  else if (R.tps < READING[1]) out.push({ id: 'slowish', lv: 'caution', title: L('Writes at reading speed', 'Escribe a velocidad de lectura'), txt: L(`${dec(R.tps.toFixed(1))} tok/s, inside the 5 to 8 band a person reads at.`, `${dec(R.tps.toFixed(1))} tok/s, dentro de la banda de 5 a 8 a la que lee una persona.`) });
  if (R.ttft >= 30) out.push({ id: 'ttft', lv: R.ttft >= 120 ? 'critical' : 'caution', title: L(`First token after ${S_(R.ttft)}`, `Primer token a los ${S_(R.ttft)}`), txt: L(`${num(R.newTokens)} new prompt tokens at ${num(R.newTokens / Math.max(1e-9, R.prefill))} tok/s of prefill${R.load ? `, plus ${S_(R.load)} of loading` : ''}. Fewer or shorter documents, a cached prefix or a saved KV cache shorten it.`, `${num(R.newTokens)} tokens nuevos de prompt a ${num(R.newTokens / Math.max(1e-9, R.prefill))} tok/s de prefill${R.load ? `, más ${S_(R.load)} de carga` : ''}. Menos documentos o más cortos, un prefijo en caché o una caché KV guardada lo acortan.`) });
  if (R.specInfo && R.specInfo.kind === 'mtp' && R.specInfo.speedup < 1) out.push({ id: 'spec', lv: 'info', title: L(`MTP drafting costs ${pct(1 - R.specInfo.speedup)} at temperature ${dec(S.temp.toFixed(2))}`, `El borrador MTP cuesta un ${pct(1 - R.specInfo.speedup)} a temperatura ${dec(S.temp.toFixed(2))}`), txt: L(`Only ${pct(R.specInfo.alpha)} of the guesses survive when sampling this freely. Ollama drafts anyway; switch MTP off here to see plain decoding.`, `Solo sobrevive el ${pct(R.specInfo.alpha)} de las conjeturas al muestrear con esta libertad. Ollama los propone igualmente; apaga MTP aquí para ver el decode normal.`) });
  else if (R.specInfo && R.specInfo.speedup < 1) out.push({ id: 'spec', lv: 'caution', title: L(`Speculative decoding slows this ${m.moe ? 'MoE' : 'model'} down`, `El speculative decoding frena este ${m.moe ? 'MoE' : 'modelo'}`), txt: L(`${dec(R.specInfo.speedup.toFixed(2))}× the plain speed: the draft’s passes and ${m.moe ? 'a verification that wakes more experts' : 'the verification'} cost more than the accepted tokens save.`, `${dec(R.specInfo.speedup.toFixed(2))}× la velocidad normal: las pasadas del borrador y ${m.moe ? 'una verificación que despierta más expertos' : 'la verificación'} cuestan más de lo que ahorran los tokens aceptados.`) });
  if (KEEP.unloaded) out.push({ id: 'keep', lv: 'caution', title: L('Model unloaded by keep_alive', 'Modelo descargado por keep_alive'), txt: L(`The next request loads ${dec(fmtGB(R.weights))} from disk first, about ${S_(fileGB(m, S.quant) / ssdGBs(S.machine))}.`, `La próxima petición carga primero ${dec(fmtGB(R.weights))} del disco, unos ${S_(fileGB(m, S.quant) / ssdGBs(S.machine))}.`) });
  else if (R.cold) out.push({ id: 'cold', lv: 'caution', title: L('Cold start', 'Arranque en frío'), txt: L(`The model is not in memory: ${S_(R.load)} of loading before anything else.`, `El modelo no está en memoria: ${S_(R.load)} de carga antes de nada.`) });
  if (S.kv === 'q4_0') out.push({ id: 'kvq', lv: 'caution', title: L('KV cache at 4 bits', 'Caché KV a 4 bits'), txt: L('It rounds the context itself, the patient history included; measure answer quality on your own cases before relying on it.', 'Redondea el propio contexto, historia clínica incluida; mide la calidad de las respuestas con tus casos antes de fiarte.') });
  if (S.quant === 'Q2_K') out.push({ id: 'q2', lv: 'caution', title: L('Weights at 2.6 bits', 'Pesos a 2,6 bits'), txt: L('Fast and small, with a visible loss of quality on most models.', 'Rápido y pequeño, con una pérdida de calidad visible en la mayoría de modelos.') });
  if (MACHINES[S.machine].est) out.push({ id: 'est', lv: 'info', title: L('Estimated machine', 'Máquina estimada'), txt: L('Published bandwidth with an assumed efficiency; only the article’s laptop is measured.', 'Ancho de banda publicado con una eficiencia supuesta; solo el portátil del artículo está medido.') });
  if (!out.some(a => a.lv === 'critical' || a.lv === 'caution')) out.unshift({ id: 'ok', lv: 'nominal', title: L('All nominal', 'Todo normal'), txt: L('It fits, it writes faster than you read and the first token comes quickly.', 'Cabe, escribe más rápido de lo que lees y el primer token llega pronto.') });
  return out;
}
let alertKey = '';
function renderAlerts() {
  const list = alerts(), key = lang + selKey(UI.sel) + UI.alertNotes + list.map(a => a.id + a.title).join('|');
  if (key === alertKey) return; alertKey = key;
  const worst = list.some(a => a.lv === 'critical') ? 'critical' : list.some(a => a.lv === 'caution') ? 'caution' : 'nominal';
  setAlertCount(list, worst);
  const rank = { critical: 0, caution: 1, nominal: 2, info: 3 }, sorted = [...list].sort((p1, p2) => rank[p1.lv] - rank[p2.lv]), tag = { critical: L('CRIT', 'CRÍT'), caution: L('WARN', 'AVISO'), nominal: 'OK', info: L('NOTE', 'NOTA') };
  const main = sorted.filter(a => a.lv === 'critical' || a.lv === 'caution'), notes = sorted.filter(a => a.lv !== 'critical' && a.lv !== 'caution');
  const row = a => `<li class="${a.lv}${isSel({ k: 'alert', id: a.id }) ? ' sel' : ''}" data-alert="${a.id}" tabindex="0" role="button" aria-haspopup="dialog"><i class="sev">${tag[a.lv]}</i><span>${esc(a.title)}</span>${ICON('chev', 's')}</li>`;
  $('alertList').innerHTML = (main.length ? main.map(row).join('') : `<li class="okrow"><i class="sev ok">OK</i><span>${esc(L('No problems for this request.', 'Sin problemas para esta petición.'))}</span></li>`) + (notes.length ? `<li class="notes" data-notes="1"><i class="sev note">${notes.length}</i><span>${esc(UI.alertNotes ? L('Hide notes', 'Ocultar notas') : L(`${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`, `${notes.length} ${notes.length === 1 ? 'nota' : 'notas'}`))}</span>${ICON('chev', 's')}</li>${UI.alertNotes ? notes.map(row).join('') : ''}` : '');
  const nb = $('alertList').querySelector('[data-notes]'); if (nb) nb.addEventListener('click', () => { UI.alertNotes = !UI.alertNotes; alertKey = ''; renderAlerts(); });
  $('alertList').querySelectorAll('li[data-alert]').forEach(li => { li.addEventListener('click', () => select({ k: 'alert', id: li.dataset.alert })); li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select({ k: 'alert', id: li.dataset.alert }); } }); });
}

// ===== Lens captions and the hover hint =====
const CAPS = {};
function setCap(lens, txt) { CAPS[lens] = txt; }
function renderCap() {
  const el = $('lensCap');
  if (UI.hover && UI.hoverCanvas && UI.hoverName) { el.textContent = (UI.hoverZoom ? L(`Click to zoom in: ${UI.hoverName}`, `Clic para ampliar: ${UI.hoverName}`) : L(`Click to learn: ${UI.hoverName}`, `Clic para aprender: ${UI.hoverName}`)); el.style.color = C.ink; }
  else { const h = `<button type="button" class="about">${ICON('info', 's')}${esc(L('About this view', 'Sobre esta vista'))}</button>`; if (el.dataset.k !== h) { el.dataset.k = h; el.innerHTML = h; el.querySelector('.about').addEventListener('click', () => { SEL_FROM = 'cap'; select({ k: 'lens', id: UI.lens }); }); } el.style.color = ''; return; }
  el.dataset.k = '';
}

// KV rows fill layer by layer: a chunk of 512 prompt tokens writes its keys and values at each attention
// layer as the chunk passes that layer (all 512 columns at once); a decode token writes one column the same way.
let ATTN_IDX = [];
function kvRowFill(r, n, inCache) {
  const Lr = ATTN_IDX[r];
  if (!n.seg || Lr === undefined) return inCache;
  const passed = n.head || n.layer > Lr || (n.layer === Lr && n.op && (n.op.kind === 'kv' ? n.opP > .5 : n.ops && n.opIdx > n.ops.findIndex(o => o.kind === 'kv')));
  if (n.seg.k === 'prefill') return passed ? n.seg.to : n.seg.from;
  if (n.seg.k === 'decode' || n.seg.k === 'round') { const base = R.prompt + n.seg.tok; return passed ? base + (n.seg.n || 1) : base; }
  return inCache;
}

// KV filled so far, drawn by token kind in proportion to the reserved context.
function kvKinds(x, X, Y, w, h, filled) {
  let t = 0; for (const [k, v] of [['sys', S.sys], ['docs', S.docs], ['q', S.q], ['ans', S.ans]]) { const a = t, b = Math.min(filled, t + v); if (b > a) fillKind(x, 'kv_' + k, X + (a / R.ctx) * w, Y, ((b - a) / R.ctx) * w, h); t += v; }
}
