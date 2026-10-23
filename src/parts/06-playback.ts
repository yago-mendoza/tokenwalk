// ===== Playback =====
let R = compute();
const P: { t: number; on: boolean; anim: any } = { t: 0, on: false, anim: null };
const segAt = t => { const s = R.segs; if (!s.length) return -1; if (t >= R.total) return s.length; let lo = 0, hi = s.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].a <= t) lo = mid; else hi = mid - 1; } return lo; };
function now() {
  const idx = segAt(P.t), seg = idx >= 0 && idx < R.segs.length && (P.t > 0 || P.on) ? R.segs[idx] : null;
  const f = seg ? Math.min(1 - 1e-12, Math.max(0, (P.t - seg.a) / seg.d)) : 0;
  const out = { idx, seg, f, layer: -1, lp: 0, ops: null, op: null, opIdx: -1, opP: 0, head: false };
  if (!seg || seg.k === 'load' || seg.k === 'restore') return out;
  const lf = layerFractions(seg);
  let i = 0; while (i < lf.length - 2 && lf[i + 1] <= f) i++;
  if (i >= R.m.layers) { out.head = true; out.layer = R.m.layers - 1; out.lp = 1; return out; }
  out.layer = i; out.lp = (f - lf[i]) / Math.max(1e-12, lf[i + 1] - lf[i]);
  out.ops = opsOf(i, seg);
  out.opIdx = out.ops.findIndex(o => out.lp < o.b); if (out.opIdx < 0) out.opIdx = out.ops.length - 1;
  out.op = out.ops[out.opIdx]; out.opP = (out.lp - out.op.a) / Math.max(1e-12, out.op.b - out.op.a);
  return out;
}
const layerSpan = (seg, i) => { const lf = layerFractions(seg); return [seg.a + seg.d * lf[i], seg.a + seg.d * lf[i + 1]]; };
function generatedAt(t) { if (t < R.ttft) return 0; const idx = segAt(t); if (idx >= R.segs.length) return S.ans; const s = R.segs[idx]; return s.k === 'decode' || s.k === 'round' ? s.tok : 0; }
function tokensInCache(t) {
  const idx = segAt(t); if (idx < 0) return 0; if (idx >= R.segs.length) return R.prompt + S.ans;
  const s = R.segs[idx], f = Math.min(1, (t - s.a) / s.d);
  if (s.k === 'load') return 0; if (s.k === 'restore') return R.prefixLen * f; if (s.k === 'prefill') return s.from + (s.to - s.from) * f;
  return R.prompt + s.tok;
}
const SPEEDS = { request: ['fit', '1', '10', '100'], token: ['fit', '0.1', '0.01'], layer: ['fit', '0.001', '0.0001'], op: ['fit', '0.0001', '0.00001'] };
function unitDuration(n) {
  if (UI.scale === 'request') return R.total / 20;
  const seg = n.seg || R.segs[R.firstDecode] || R.segs[0];
  if (!seg) return 1;
  if (UI.scale === 'token') return seg.d / 4;
  if (seg.k === 'load' || seg.k === 'restore') return seg.d / 4;
  const li = Math.max(0, n.layer), sp = layerSpan(seg, li), ld = sp[1] - sp[0];
  if (UI.scale === 'layer') return ld / 3;
  const o = n.op || { a: 0, b: 1 / 8 };
  return Math.max(1e-9, (o.b - o.a) * ld) / 2.5;
}
function speedNow(n) { return UI.speed === 'fit' ? Math.max(1e-7, unitDuration(n)) : Number(UI.speed) || 1; }
function setPlaying(on) {
  if (on && P.t >= R.total) { P.t = 0; }
  if (on && KEEP.unloaded && P.t === 0) {} // the load is already in R
  P.on = on; KEEP.idle = 0; renderTransport();
}
function stopAt(t) { P.t = Math.min(R.total, Math.max(0, t)); P.on = false; renderTransport(); }
function stepToken() {
  const end = s => s.a + s.d * (1 - 1e-7);
  let idx = segAt(P.t); if (idx >= R.segs.length) return;
  idx = Math.max(0, idx);
  let target = end(R.segs[idx]);
  if (target - P.t < 1e-12 && idx + 1 < R.segs.length) target = end(R.segs[idx + 1]);
  stopAt(target); KEEP.idle = 0;
}
function stepLayer() {
  let n = now();
  if (!n.seg || n.layer < 0) { const next = R.segs.findIndex(s => s.a + 1e-12 > P.t && s.k !== 'load' && s.k !== 'restore'); if (next < 0) { stepToken(); return; } P.t = R.segs[next].a + 1e-12; n = now(); }
  const lf = layerFractions(n.seg), i = n.layer;
  P.anim = { seg: n.idx, layer: i, start: performance.now(), dur: 1600 };
  stopAt(n.seg.a + n.seg.d * lf[Math.min(lf.length - 1, i + 1)] + 1e-12); KEEP.idle = 0;
}
function openSampling(focusId) {
  const acc = document.querySelector('[data-acc=samp]'); if (acc && !acc.classList.contains('open')) acc.querySelector('button').click();
  if (matchMedia('(max-width: 760px)').matches) setZone('cfg');
  requestAnimationFrame(() => { const el = $(focusId); if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); const f = el.closest('.fld'); if (f) { f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash'); } } });
}
// Jumps: the main button repeats the last stop chosen from its menu.
const segEnd = sg => sg.a + sg.d * (1 - 1e-7), segPhase = k => (k === 'round' ? 'decode' : k);
function phaseEnd() {
  const ss = R.segs; let i = Math.max(0, segAt(P.t)); if (i >= ss.length) return;
  for (;;) { let j = i; while (j + 1 < ss.length && segPhase(ss[j + 1].k) === segPhase(ss[i].k)) j++; if (segEnd(ss[j]) - P.t > 1e-9 || j + 1 >= ss.length) { stopAt(segEnd(ss[j])); return; } i = j + 1; }
}
// Back steps mirror the forward ones: they land where a forward step would have stopped.
function prevToken() {
  const ends = R.segs.filter(q => q.k !== 'load' && q.k !== 'restore').map(segEnd).filter(t => t < P.t - 1e-9);
  stopAt(ends.length ? ends[ends.length - 1] : 0); KEEP.idle = 0;
}
function prevLayer() {
  const n = now();
  if (!n.seg || n.layer < 0 || n.seg.k === 'load' || n.seg.k === 'restore') { prevToken(); return; }
  const lf = layerFractions(n.seg), starts = lf.slice(0, -1).map(f => n.seg.a + n.seg.d * f + 1e-12).filter(t => t < P.t - 1e-9);
  if (starts.length > 1) stopAt(starts[starts.length - 1]); else prevToken();
  KEEP.idle = 0;
}
const firstDec = () => R.segs.find(q => q.k === 'decode' || q.k === 'round');
const atEnd = () => !R.total || P.t >= R.total - 1e-12;
// [id, icon, short label, menu label, key, explanation, action, why-not (null when available)]
const JUMPS: any[] = [
  ['start', 'restart', () => L('start', 'inicio'), () => L('Back to the start', 'Volver al principio'), 'Home', () => L('Time zero, before the load and the prefill.', 'Tiempo cero, antes de la carga y el prefill.'), () => stopAt(0), () => (P.t <= 0 ? L('Already at the start', 'Ya en el principio') : null), 'back'],
  ['ptok', 'skipback', () => L('−token', '−token'), () => L('Previous token', 'Token anterior'), '←', () => L('Where the last step ended: one token, or one prompt chunk.', 'Donde acabó el paso anterior: un token, o un bloque del prompt.'), () => prevToken(), () => (P.t <= 0 ? L('Nothing before this', 'No hay nada antes') : null), 'back'],
  ['player', 'steplayerback', () => L('−layer', '−capa'), () => L('Previous layer', 'Capa anterior'), 'Shift ←', () => L('One layer back inside this pass.', 'Una capa atrás dentro de esta pasada.'), () => prevLayer(), () => (P.t <= 0 ? L('Nothing before this', 'No hay nada antes') : null), 'back'],
  ['layer', 'steplayer', () => L('layer', 'capa'), () => L('Next layer', 'Siguiente capa'), 'Shift →', () => L('One layer of the pass: attention or DeltaNet, then the experts.', 'Una capa de la pasada: atención o DeltaNet, y luego los expertos.'), () => stepLayer(), () => (atEnd() ? L('The run has ended', 'La ejecución ha terminado') : null)],
  ['tok', 'skip', () => L('token', 'token'), () => L('Next token', 'Siguiente token'), '→', () => L('One whole pass: a token written, or a 512-token chunk while the prompt is read.', 'Una pasada entera: un token escrito, o un bloque de 512 tokens mientras se lee el prompt.'), () => stepToken(), () => (atEnd() ? L('The run has ended', 'La ejecución ha terminado') : null)],
  ['phase', 'next', () => L('phase', 'fase'), () => L('End of this phase', 'Fin de esta fase'), '', () => L('Load, prefill or writing: stop where the bottleneck changes.', 'Carga, prefill o escritura: para donde cambia el cuello de botella.'), () => phaseEnd(), () => (atEnd() ? L('The run has ended', 'La ejecución ha terminado') : null)],
  ['first', 'eye', () => L('1st token', '1.er token'), () => L('First token', 'Primer token'), '', () => L('The moment the user sees the first word appear.', 'El momento en que el usuario ve aparecer la primera palabra.'), () => { const t = firstDec(); if (t) stopAt(segEnd(t)); }, () => { const t = firstDec(); return !t ? L('No answer to write', 'No hay respuesta que escribir') : P.t >= segEnd(t) - 1e-9 ? L('Already written: use Back to the start to see it again', 'Ya escrito: usa Volver al principio para verlo otra vez') : null; }],
  ['end', 'last', () => L('end', 'fin'), () => L('End of the request', 'Fin de la petición'), 'End', () => L('All the answer written; then keep_alive starts counting.', 'Toda la respuesta escrita; luego empieza a contar keep_alive.'), () => stopAt(R.total), () => (atEnd() ? L('Already at the end', 'Ya en el final') : null)],
];
function doJump(k) { const j = JUMPS.find(x => x[0] === k) || JUMPS[4]; if (j[7]()) return; if (fitGate()) return; UI.stale = false; KEEP.idle = 0; j[6](); renderJump(); }
let jumpKey = '';
function renderJump() {
  if (isReal()) return;
  const j = JUMPS.find(x => x[0] === UI.jump) || JUMPS[4], why = j[7]();
  $('jumpGo').innerHTML = `${ICON(j[1], 's')}<span>${esc(j[2]())}</span>`; $('jumpGo').title = why || `${j[3]()}${j[4] ? ` (${j[4]})` : ''}. ${L('The arrow picks another stop.', 'La flecha elige otra parada.')}`;
  $('jumpGo').classList.toggle('na', !!why);
  $('jumpMenu').innerHTML = ICON('chev'); $('jumpMenu').title = L('Choose where to go', 'Elegir a dónde ir');
  const h = `<div class="lbl">${esc(L('Go back', 'Volver'))}</div>` + JUMPS.filter(x => x[8] === 'back').map(item).join('') + `<div class="lbl">${esc(L('Go forward', 'Avanzar'))}</div>` + JUMPS.filter(x => x[8] !== 'back').map(item).join('');
  function item(x) { const w = x[7](); return `<button type="button" role="menuitemradio" data-j="${x[0]}" aria-checked="${x[0] === j[0]}" ${w ? 'aria-disabled="true"' : ''}>${ICON(x[1])}<b>${esc(x[3]())}</b><kbd>${esc(x[4])}</kbd><small>${esc(w || x[5]())}</small></button>`; }
  if (h !== jumpKey) { jumpKey = h; $('jumpPop').innerHTML = h; }
}
function jumpPop(open) { $('jumpPop').hidden = !open; $('jumpMenu').setAttribute('aria-expanded', open); if (open) { renderJump(); $('jumpPop').querySelector('[aria-checked=true]')?.focus(); } }
function advance(dt, n) {
  if (!P.on) { if (P.t >= R.total || P.t === 0) tickIdle(dt); return; }
  let nt = P.t + dt * speedNow(n);
  const s = n.seg;
  if (s && UI.pauseLayer && n.layer >= 0) { const e = layerSpan(s, n.layer + (n.head ? 1 : 0))[1]; if (nt >= e) { nt = e + 1e-12; P.on = false; P.anim = { seg: n.idx, layer: n.layer, start: performance.now(), dur: 1600 }; } }
  if (s && P.on && UI.pauseTok && s.k !== 'load' && s.k !== 'restore') { const e = s.a + s.d * (1 - 1e-7); if (nt >= e && P.t < e) { nt = e; P.on = false; } }
  if (nt >= R.total) { nt = R.total; P.on = false; KEEP.unloaded = false; }
  P.t = nt; if (!P.on) renderTransport();
}
// keep_alive: the idle clock runs at 10 times real time while nothing plays; when it reaches keep_alive
// the server unloads the model and the next request pays the load.
function tickIdle(dt) {
  if (KEEP.unloaded || R.cold && P.t === 0) return;
  KEEP.idle += dt * 10;
  if (KEEP.idle >= S.keepalive * 60) { KEEP.unloaded = true; KEEP.idle = S.keepalive * 60; changed(); }
}
