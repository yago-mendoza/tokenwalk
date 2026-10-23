// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Monitor: KPIs, verdict, alerts, details, log =====
let PIN = null;
const KPI_DEF = [
  { id: 'ttft', inst: 'ttft', label: () => L('First token', 'Primer token') },
  { id: 'tps', inst: 'tps', label: () => L('Writing', 'Escritura') },
  { id: 'fit', inst: 'fit', label: () => L('Memory', 'Memoria') },
  { id: 'bound', inst: 'intensity', label: () => L('Bottleneck', 'Cuello') },
];
function prov() { return MACHINES[S.machine].est ? L('estimated', 'estimado') : L('calibrated', 'calibrado'); }
function memNeed() { const mc = R.mc, need = R.weights + R.kvRes + R.state + R.buf; return mc.kind === 'unified' ? [need + sysGB(), mc.ramGB] : [need * R.pl.fastShare + (R.kvRes + R.state + R.buf) * (1 - R.pl.fastShare), mc.fastGB]; }
function boundNow(n) { const ph = n.seg && n.seg.k === 'prefill' ? 'prefill' : 'decode', v = intensity(ph), bal = machineBalance() / R.mc.bwEff; return { ph, v, bal, mem: v < bal }; }
function buildKpis() {
  $('kpis').innerHTML = KPI_DEF.map(k => `<div class="kpi" data-k="${k.id}" tabindex="0" role="button"><div class="k"><span class="lbl"></span><button type="button" class="ib" aria-label="info">${ICON('info', 's')}</button></div><div class="v num"></div><div class="sub"></div><canvas></canvas><div class="bar"><i></i></div></div>`).join('') +
    `<div id="verdict" style="grid-column:1/-1;font-size:11.5px;color:var(--ink);line-height:1.4;padding:2px 2px 0"></div>`;
  document.querySelectorAll('.kpi').forEach(el => { const hl = { ttft: 'prefill', tps: 'decode' }[el.dataset.k]; if (hl) { el.addEventListener('pointerenter', () => { UI.tlHl = hl; }); el.addEventListener('pointerleave', () => { UI.tlHl = null; }); } });
  document.querySelectorAll('.kpi').forEach(el => { const def = KPI_DEF.find(d => d.id === el.dataset.k); el.addEventListener('click', () => select({ k: 'inst', id: def.inst })); el.addEventListener('keydown', e => { if (e.key === 'Enter') select({ k: 'inst', id: def.inst }); }); });
  $('pinBtn').onclick = (() => { if (PIN) { PIN = null; } else { PIN = { ttft: R.ttft, tps: R.tps, total: R.total, mem: memNeed()[0], label: `${R.mc.short} · ${R.m.name}`, spans: R.segs.filter(s => s.k !== 'decode' || s.tok % 4 === 0).map(s => [s.a, s.a + (s.k === 'decode' ? s.d * 4 : s.d), s.k === 'prefill' ? C.cy : s.k === 'load' ? C.li : C.hot]) }; } kpiKey = ''; });
}
function delta(v, p, unit, better) { if (!PIN) return ''; const d = v - p; if (Math.abs(d) < 1e-9) return L(' · same as pinned', ' · igual que la fijada'); const good = better === 'low' ? d < 0 : d > 0; return ` · <span style="color:${good ? 'var(--ok)' : 'var(--red)'}">${d > 0 ? '+' : ''}${unit(d)}</span>`; }
let kpiKey = '', kpiT = 0;
function renderKpis(n) {
  const nowT = performance.now(); if (nowT - kpiT < 100) return; kpiT = nowT;
  const lv = id => INSTR.find(i => i.id === id).level(), b = boundNow(n), [used, cap] = memNeed();
  const vals = {
    ttft: [S_(R.ttft), '', [R.load ? L(`load ${S_(R.load)}`, `carga ${S_(R.load)}`) : '', R.restore ? L(`KV disk ${S_(R.restore)}`, `KV disco ${S_(R.restore)}`) : '', `prefill ${S_(R.prefill)}`].filter(Boolean).join(' + ') + delta(R.ttft, PIN && PIN.ttft, S_, 'low'), lv('ttft')],
    tps: [dec(R.tps.toFixed(R.tps < 10 ? 1 : 0)), 'tok/s', L(`ceiling ${dec((R.mc.bw / R.mid.bytesGB).toFixed(0))}, ${prov()}`, `techo ${dec((R.mc.bw / R.mid.bytesGB).toFixed(0))}, ${prov()}`) + delta(R.tps, PIN && PIN.tps, v => dec(v.toFixed(1)), 'high'), lv('tps')],
    fit: [dec(used.toFixed(1)), `/ ${dec(cap.toFixed(0))} GB`, L(`weights ${dec(fmtGB(R.weights))}, KV ${dec(fmtGB(R.kvRes))}`, `pesos ${dec(fmtGB(R.weights))}, KV ${dec(fmtGB(R.kvRes))}`) + delta(used, PIN && PIN.mem, v => dec(`${v.toFixed(1)} GB`), 'low'), lv('fit')],
    bound: [b.mem ? L('Memory', 'Memoria') : L('Compute', 'Cómputo'), '', L(`${b.ph} ${num(b.v)} FLOP/B, balance ${num(b.bal)}`, `${b.ph} ${num(b.v)} FLOP/B, equilibrio ${num(b.bal)}`), ''],
  };
  document.querySelectorAll('.kpi').forEach(el => {
    const k = el.dataset.k, [v, unit, sub, level] = vals[k], def = KPI_DEF.find(d => d.id === k);
    el.className = `kpi ${level || ''}${isSel({ k: 'inst', id: def.inst }) ? ' sel' : ''}`;
    el.querySelector('.lbl').textContent = def.label();
    const vh = `${esc(v)}${unit ? `<small>${esc(unit)}</small>` : ''}`, ve = el.querySelector('.v'), se = el.querySelector('.sub'); if (ve.dataset.k !== vh) { ve.dataset.k = vh; ve.innerHTML = vh; }
    if (se.dataset.k !== sub) { se.dataset.k = sub; se.innerHTML = sub; el.title = `${def.label()}: ${se.textContent}. ${L('Click for the explanation.', 'Clic para la explicación.')}`; }
    const cv = el.querySelector('canvas'), w = Math.max(60, Math.floor(cv.getBoundingClientRect().width)), x = fit(cv, w, 22);
    if (k === 'ttft') { const tot = Math.max(1e-9, R.ttft); let cx = 0; for (const [d, kind] of [[R.load, 'weights'], [R.restore, 'kv'], [R.prefill, 'cy']]) { const pw = (d / tot) * w; if (kind === 'cy') { x.fillStyle = C.cy; x.fillRect(cx, 7, Math.max(0, pw - 1), 8); } else fillKind(x, kind, cx, 7, Math.max(0, pw - 1), 8); cx += pw; } if (P.t < R.ttft && P.t > 0) { x.fillStyle = C.ink; x.fillRect((P.t / tot) * w - 1, 3, 2, 16); } }
    if (k === 'tps') { const ds = R.segs.filter(s => s.k === 'decode' || s.k === 'round'); const vs = ds.map(s => (s.n || 1) / s.d), mx = Math.max(10, ...vs) * 1.15, Y = v2 => 20 - (v2 / mx) * 18; x.fillStyle = 'rgba(255,181,71,.16)'; x.fillRect(0, Y(READING[1]), w, Y(READING[0]) - Y(READING[1])); x.strokeStyle = C.hot; x.beginPath(); vs.forEach((v2, i) => { const xx = (i / Math.max(1, vs.length - 1)) * w; if (i) x.lineTo(xx, Y(v2)); else x.moveTo(xx, Y(v2)); }); x.stroke(); const g = generatedAt(P.t); if (g > 0 && g < S.ans) { x.fillStyle = C.ink; x.fillRect((g / S.ans) * w - 1, 2, 2, 18); } }
    if (k === 'fit') { const mc = R.mc, parts = mc.kind === 'unified' ? [['sys', sysGB()], ['weights', R.weights], ['kv', R.kvRes], ['state', R.state], ['buf', R.buf]] : [['weights', R.weights * R.pl.fastShare], ['kv', R.kvRes], ['buf', R.buf]]; hbar(x, 0, 6, w, 10, parts, cap, ''); }
    if (k === 'bound') { const lg = v2 => Math.max(0, Math.min(1, (Math.log10(Math.max(.1, v2)) + 1) / 5)); x.fillStyle = 'rgba(127,227,255,.12)'; x.fillRect(0, 7, lg(b.bal) * w, 8); x.fillStyle = 'rgba(255,212,59,.12)'; x.fillRect(lg(b.bal) * w, 7, w - lg(b.bal) * w, 8); x.fillStyle = C.hot; x.fillRect(lg(b.bal) * w - 1, 3, 2, 16); for (const [ph, col] of [['decode', C.hot], ['prefill', C.cy]]) { const px = lg(intensity(ph)) * w; x.fillStyle = col; x.beginPath(); x.moveTo(px, 15); x.lineTo(px - 4, 21); x.lineTo(px + 4, 21); x.fill(); } }
  });
  const v = b.ph === 'prefill'
    ? L(`Reading the prompt is limited by arithmetic: each weight read serves 512 tokens, at about ${dec(R.mc.tflops)} TFLOPS of useful compute.`, `Leer el prompt lo limita la aritmética: cada peso leído sirve a 512 tokens, a unos ${dec(R.mc.tflops)} TFLOPS útiles.`)
    : L(`Writing is limited by memory bandwidth: each token reads ${B(R.mid.bytesGB * 1e9)} at about ${dec((R.mid.bytesGB / R.mid.seconds).toFixed(0))} GB/s.`, `Escribir lo limita el ancho de banda: cada token lee ${B(R.mid.bytesGB * 1e9)} a unos ${dec((R.mid.bytesGB / R.mid.seconds).toFixed(0))} GB/s.`);
  if ($('verdict').textContent !== v) $('verdict').textContent = v;
  const pb = `${ICON(PIN ? 'close' : 'eye', 's')}<span>${PIN ? L('Unpin', 'Quitar fijada') : L('Pin to compare', 'Fijar para comparar')}</span>`; if ($('pinBtn').dataset.k !== pb) { $('pinBtn').dataset.k = pb; $('pinBtn').innerHTML = pb; }
  $('pinBtn').title = PIN ? L(`Pinned: ${PIN.label}. The KPIs show the difference and the timeline a ghost row.`, `Fijada: ${PIN.label}. Los KPI muestran la diferencia y la línea de tiempo una fila fantasma.`) : L('Keep this run to compare the next one against it', 'Guardar esta ejecución para comparar la siguiente con ella');
}
function renderDetails() {
  const order = ['bw', 'place', 'spec', 'prefix'], el = $('details');
  if (!el.dataset.built) { el.dataset.built = '1'; el.innerHTML = order.map(id => `<div class="dt" data-id="${id}"><header tabindex="0" role="button" aria-haspopup="dialog"><span class="d"></span><span class="n"></span><span class="v"></span>${ICON('chev', 'chev')}</header></div>`).join(''); el.querySelectorAll('.dt header').forEach(hd => { const go = () => select({ k: 'inst', id: hd.parentElement.dataset.id }); hd.addEventListener('click', go); hd.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); }); }
  el.querySelectorAll('.dt').forEach(d => {
    const ins = INSTR.find(i => i.id === d.dataset.id), lv = ins.level();
    d.classList.toggle('sel', isSel({ k: 'inst', id: ins.id }));
    d.querySelector('.d').className = `d ${lv}`; d.querySelector('.n').textContent = ins.label();
    const v = ins.val(), ve = d.querySelector('.v'); if (ve.dataset.k !== v) { ve.dataset.k = v; ve.innerHTML = v; }
  });
}

// ===== Trends: each quantity as a curve over the whole run =====
// The run is deterministic, so every curve is known in advance: solid up to now, faint ahead, a dot at now.
// Its shape (flat, steps, steady, faster and faster) is named in words, because the shape is the lesson.
const TRENDS = [
  { id: 'bw', inst: 'bw', label: () => L('Read / token', 'Leído / token'), f: t => { const q = segOfT(t); return q && (q.k === 'decode' || q.k === 'round') ? q.bytes * 1e9 : null; }, fmt: v => B(v), fine: v => `${dec((v / 1e9).toFixed(4))} GB`, col: () => C.li },
  { id: 'tpt', label: () => L('Time / token', 'Tiempo / token'), f: t => { const q = segOfT(t); return q && q.k === 'decode' ? q.d * 1000 : q && q.k === 'round' ? q.d * 1000 / Math.max(1, q.n || 1) : null; }, fmt: v => `${dec(v.toFixed(v < 10 ? 1 : 0))} ms`, fine: v => `${dec(v.toFixed(2))} ms`, col: () => C.hot },
  { id: 'kvt', label: () => L('KV cache', 'Caché KV'), f: t => tokensInCache(t) * kvBytesPerToken(R.m, S.kv), fmt: v => B(v), col: () => C.hot },
  { id: 'gen', label: () => L('Written', 'Escritos'), f: t => generatedAt(t), fmt: v => num(Math.round(v)), col: () => C.hot },
];
const segOfT = t => { const i = segAt(t); return R.segs[Math.max(0, Math.min(R.segs.length - 1, i))] || null; };
let TCURVE = { r: null, d: {} };
function trendCurve(tr) {
  if (TCURVE.r !== R) TCURVE = { r: R, d: {} };
  if (!TCURVE.d[tr.id]) { const N = 160, out = []; for (let i = 0; i <= N; i++) { const t = R.total * i / N; out.push([t, tr.f(Math.min(R.total - 1e-9, t))]); } TCURVE.d[tr.id] = { pts: out, shape: trendShape(out) }; }
  return TCURVE.d[tr.id];
}
// The shape, phase by phase: how it moves while the prompt is read, and while the answer is written.
function trendShape(pts) {
  const v = pts.filter(q => q[1] !== null && Number.isFinite(q[1])); if (v.length < 3) return L('only while writing', 'solo al escribir');
  const vals = v.map(q => q[1]), lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo <= Math.abs(hi) * .015) return hi > lo ? L(`almost flat (+${pct((hi - lo) / Math.max(1e-12, lo))})`, `casi plano (+${pct((hi - lo) / Math.max(1e-12, lo))})`) : L('flat', 'plano');
  const rate = (t0, t1) => { const a = v.find(q => q[0] >= t0), z = [...v].reverse().find(q => q[0] <= t1); return a && z && z[0] > a[0] ? (z[1] - a[1]) / (z[0] - a[0]) : null; };
  const sp = R.ttft > R.ttftStart ? rate(R.ttftStart, R.ttft) : null, sd = rate(R.ttft, R.total), eps = (hi - lo) / Math.max(1e-9, R.total) * .02;
  if (sp === null || Math.abs(sp) < eps) return sd > eps ? L('flat while reading, then steady', 'plano al leer, luego constante') : L('flat', 'plano');
  if (sd !== null && sd > eps && sp > 3 * sd) return L('steep while reading, gentle while writing', 'empinado al leer, suave al escribir');
  return sp > 0 ? L('rises steadily', 'sube a ritmo constante') : L('falls', 'baja');
}
function trendArrow(tr) { const a = tr.f(Math.max(0, P.t - R.total / 160)), b = tr.f(Math.min(R.total - 1e-9, P.t)); if (a === null || b === null || !P.t) return ['', '']; const r = Math.abs(b - a) / Math.max(1e-12, Math.abs(b)); return r < .002 ? ['→', C.dim] : b > a ? ['↑', C.hot] : ['↓', C.cy]; }
function drawSpark(x, tr, w, h, big) {
  const c = trendCurve(tr), pts = c.pts, def = pts.filter(q => q[1] !== null), vs = def.map(q => q[1]), col = tr.col();
  // Big: the x axis spans where the quantity exists, the y axis its own range, both labelled. Small: the whole run from zero.
  // A live run's measured time per token joins this curve, placed at the simulated time of the same token.
  const meas = tr.id === 'tpt' ? liveTpt() : null, mPts = meas ? meas.map((ms, i) => { const sg = R.segs[R.firstDecode + i + 1]; return sg ? [sg.a, ms] : null; }).filter(Boolean) : [];
  if (mPts.length) vs.push(...mPts.map(q => q[1]));
  const t0 = big && def.length ? def[0][0] : 0, t1 = R.total, axW = big ? 70 : 0, vmin = Math.min(...vs), vmax = Math.max(...vs), pad = (vmax - vmin) * .15 || Math.abs(vmax) * .05 || 1;
  const lo = big ? vmin - pad : Math.min(0, vmin), hi = big ? vmax + pad : Math.max(1e-12, vmax), axL = big ? 70 : 1, axB = big ? 16 : 2;
  const X = t => axL + ((t - t0) / Math.max(1e-12, t1 - t0)) * (w - axL - 2), Y = v => h - axB - ((v - lo) / Math.max(1e-12, hi - lo)) * (h - axB - 6);
  if (big) {
    x.strokeStyle = C.line; x.beginPath(); x.moveTo(axL, 2); x.lineTo(axL, h - axB); x.lineTo(w, h - axB); x.stroke();
    const af = tr.fmt(vmax) === tr.fmt(vmin) && tr.fine ? tr.fine : tr.fmt; text(x, af(vmax), axL - 6, Y(vmax) + 4, C.mid, 'right', 9.5); text(x, af(vmin), axL - 6, Y(vmin) + 4, C.mid, 'right', 9.5);
    text(x, S_(t0), axL, h - 3, C.dim, 'left', 9.5); text(x, S_(t1), w - 2, h - 3, C.dim, 'right', 9.5);
    if (R.ttft > t0 + 1e-9) { x.setLineDash([2, 3]); x.beginPath(); x.moveTo(X(R.ttft), 2); x.lineTo(X(R.ttft), h - axB); x.stroke(); x.setLineDash([]); text(x, L('first token', 'primer token'), X(R.ttft) + 4, 12, C.dim, 'left', 9.5); }
  }
  for (const past of [false, true]) {
    x.strokeStyle = col; x.globalAlpha = past ? 1 : .25; x.lineWidth = big ? 2 : 1.4; x.beginPath(); let on = false;
    for (const [t, v] of pts) { if (v === null || t < t0 || (past && t > P.t)) { on = false; continue; } const px = X(t), py = Y(v); if (!on) { x.moveTo(px, py); on = true; } else x.lineTo(px, py); }
    x.stroke(); x.globalAlpha = 1; x.lineWidth = 1;
  }
  const vn = P.t > 0 ? tr.f(Math.min(R.total - 1e-9, P.t)) : null;
  if (vn !== null) { x.fillStyle = col; x.beginPath(); x.arc(X(P.t), Y(vn), big ? 4 : 2.6, 0, 7); x.fill(); }
  if (mPts.length) { x.fillStyle = C.cy; for (const [t, v] of mPts) { x.globalAlpha = .75; x.fillRect(X(t) - (big ? 1.5 : 1), Y(v) - (big ? 1.5 : 1), big ? 3 : 2, big ? 3 : 2); } x.globalAlpha = 1; if (big) text(x, L('cyan dots: measured on your server', 'puntos cian: medido en tu servidor'), w - 2, 12, C.cy, 'right', 9.5); }
}
function renderTrends() {
  const el = $('trends');
  if (!el.dataset.built) { el.dataset.built = '1'; el.innerHTML = `<div class="trh"><span>${esc(L('Metric', 'Métrica'))}</span><span>${esc(L('Whole run', 'Toda la ejecución'))}</span><span>${esc(L('Now', 'Ahora'))}</span><span>${esc(L('Δ start', 'Δ inicio'))}</span></div>` + TRENDS.map(tr => `<div class="tr" data-id="${tr.id}" tabindex="0" role="button" aria-haspopup="dialog"><span class="n"></span><canvas></canvas><span class="v num"></span><span class="a num"></span></div>`).join(''); el.querySelectorAll('.tr').forEach(d => { const go = () => select({ k: 'trend', id: d.dataset.id }); d.addEventListener('click', go); d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); }); }
  el.querySelectorAll('.tr').forEach(d => {
    const tr = TRENDS.find(q => q.id === d.dataset.id), c = trendCurve(tr), vn = tr.f(Math.min(R.total - 1e-9, Math.max(0, P.t))), [ar, ac] = trendArrow(tr);
    d.classList.toggle('sel', isSel({ k: 'trend', id: tr.id }));
    d.querySelector('.n').textContent = tr.label(); d.title = `${tr.label()}: ${c.shape}`;
    const vt = vn === null ? '—' : tr.fmt(vn), ve = d.querySelector('.v'); if (ve.textContent !== vt) ve.textContent = vt;
    const pts = trendCurve(tr).pts.filter(q => q[1] !== null), v0 = pts.length ? pts[0][1] : null, ae = d.querySelector('.a');
    const dl = vn === null || v0 === null || !P.t ? null : v0 === 0 ? (vn > 0 ? Infinity : 0) : (vn - v0) / Math.abs(v0);
    ae.textContent = dl === null ? '—' : dl === Infinity ? L('new', 'nuevo') : Math.abs(dl) < .0005 ? '0%' : `${dl > 0 ? '+' : '−'}${pct(Math.abs(dl))}`; ae.style.color = dl === null || Math.abs(dl) < .0005 ? C.dim : dl > 0 ? C.hot : C.cy; void ar; void ac;
    const cv = d.querySelector('canvas'), x = fit(cv, 74, 20); drawSpark(x, tr, 74, 20, false);
  });
  // whole-run settings that do not move: one line of chips
  const short = id => { if (id === 'spec') return R.specInfo ? (R.specInfo.kind === 'mtp' ? `MTP · k ${R.specInfo.k} · ×${dec(R.specInfo.speedup.toFixed(2))}` : L(`on · ×${dec(R.specInfo.speedup.toFixed(2))}`, `activa · ×${dec(R.specInfo.speedup.toFixed(2))}`)) : L('off', 'apagada'); if (id === 'prefix') return R.startAt ? L(`${pct(R.startAt / R.prompt)} reused`, `${pct(R.startAt / R.prompt)} reutilizado`) : L('none', 'ninguno'); return INSTR.find(q => q.id === id).val().replace(/<[^>]+>/g, '').split(' · ')[0]; };
  const ch = `<div class="kvh">${esc(L('In effect', 'En vigor'))}</div>` + ['place', 'spec', 'prefix', 'keep'].map(id => { const ins = INSTR.find(q => q.id === id); return `<button type="button" class="ichip ${ins.level()}" data-id="${id}"><span>${esc(ins.label())}</span><b>${esc(short(id))}</b></button>`; }).join('');
  if ($('ichips').dataset.k !== ch) { $('ichips').dataset.k = ch; $('ichips').innerHTML = ch; $('ichips').querySelectorAll('button').forEach(b => b.addEventListener('click', () => select({ k: 'inst', id: b.dataset.id }))); }
}
function setAlertCount(list, worst) {
  const cnt = list.filter(a => a.lv === 'critical' || a.lv === 'caution').length;
  $('alertBtn').className = `tbtn ${worst}`; $('alertIc').innerHTML = ICON(worst === 'critical' ? 'error' : worst === 'caution' ? 'warning' : 'check', 's'); $('alertCnt').textContent = String(cnt);
  $('alertBtn').title = L(`${cnt} alerts`, `${cnt} alertas`); const sc = $('secAlertCnt'), nc = list.filter(a => a.lv === 'critical').length, nw = list.filter(a => a.lv === 'caution').length; sc.innerHTML = `${nc ? `<i class="c">${nc} ${esc(L('crit', 'crít'))}</i>` : ''}${nw ? `<i class="w">${nw} ${esc(L('warn', 'aviso'))}</i>` : ''}${!nc && !nw ? `<i class="o">${esc(L('clear', 'limpio'))}</i>` : ''}`; sc.className = 'cnts';
}
