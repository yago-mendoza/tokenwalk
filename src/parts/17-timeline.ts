// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Timeline at the chosen scale, with the pinned run as a ghost row =====
let timeGeo = null;
function drawTimeline(n) {
  const id = 'cTime', c = $(id), r = $('tlWrap').getBoundingClientRect(), W = Math.max(200, Math.floor(r.width)), H = Math.max(48, Math.floor(r.height)), x = fit(c, W, H); hitReset(id);
  const lab = W < 500 ? 46 : 88, w = W - lab - 8, compact = H < 90;
  let t0 = 0, t1 = R.total, bars = [], lanes;
  // A peeked token or chunk is drawn layer by layer without moving the playhead; otherwise the current one at the chosen scale.
  const pk = UI.tlPeek != null && R.segs[UI.tlPeek] && R.segs[UI.tlPeek].k !== 'load' && R.segs[UI.tlPeek].k !== 'restore' ? R.segs[UI.tlPeek] : null;
  const seg = pk || (n.seg && n.seg.k !== 'load' && n.seg.k !== 'restore' ? n.seg : null);
  const scale = pk ? 'token' : seg ? UI.scale : 'request';
  if (scale === 'request') {
    lanes = [L('load', 'carga'), 'prefill', 'decode'];
    R.segs.forEach((s, i) => bars.push({ a: s.a, b: s.a + s.d, lane: s.k === 'load' || s.k === 'restore' ? 0 : s.k === 'prefill' ? 1 : 2, kind: s.k === 'load' ? 'weights' : s.k === 'restore' ? 'kv' : s.k === 'prefill' ? 'cy' : 'hot', alt: (s.i || s.tok || 0) % 2, sel: { k: 'seg', i } }));
  } else if (scale === 'token') {
    const lf = layerFractions(seg); t0 = seg.a; t1 = seg.a + seg.d;
    lanes = R.m.kvLayers < R.m.layers ? [L('attention', 'atención'), 'DeltaNet', L('output', 'salida')] : [L('layers', 'capas'), '', L('output', 'salida')];
    for (let i = 0; i <= R.m.layers; i++) { const a = seg.a + seg.d * lf[i], b = seg.a + seg.d * lf[i + 1]; if (!(b > a)) continue; const head = i === R.m.layers; bars.push({ a, b, lane: head ? 2 : R.kinds[i] === 'attn' || R.m.kvLayers >= R.m.layers ? 0 : 1, kind: head ? 'cy' : R.kinds[i] === 'attn' ? 'kv' : 'state', alt: i % 2, sel: head ? { k: 'head' } : { k: 'layer', i } }); }
  } else {
    const i = Math.max(0, n.layer), sp = layerSpan(seg, i), ld = sp[1] - sp[0];
    if (scale === 'layer' || !n.op) {
      t0 = sp[0]; t1 = sp[1]; lanes = [L('matrices', 'matrices'), L('KV or state', 'KV o estado'), L('experts', 'expertos')];
      (n.ops || []).forEach(o => bars.push({ a: sp[0] + o.a * ld, b: sp[0] + o.b * ld, lane: o.kind === 'mat' ? 0 : o.kind === 'kv' || o.kind === 'state' ? 1 : 2, kind: o.kind === 'kv' ? 'kv' : o.kind === 'state' ? 'state' : 'weights', alt: 0, label: o.id, sel: o.kind === 'mat' ? { k: 'mat', layer: i, name: o.id } : o.kind === 'expert' ? { k: 'expert', layer: i, e: o.e } : o.kind === 'kv' ? { k: 'kvlayer', layer: i } : { k: 'state', layer: i } }));
    } else {
      const o = n.op, a = sp[0] + o.a * ld, b = sp[0] + o.b * ld; t0 = a; t1 = b;
      lanes = [o.kind === 'mat' ? L('rows read', 'filas leídas') : L('blocks read', 'bloques leídos'), '', ''];
      for (let k2 = 0; k2 < 16; k2++) bars.push({ a: a + (b - a) * k2 / 16, b: a + (b - a) * (k2 + 1) / 16, lane: 0, kind: o.kind === 'kv' ? 'kv' : o.kind === 'state' ? 'state' : 'weights', alt: k2 % 2, sel: o.kind === 'mat' ? { k: 'mat', layer: i, name: o.id } : null });
    }
  }
  // Hovering a counter line or a phase tile lights its part of the run and dims the rest.
  if (UI.tlHl && scale === 'request') { const ln = { load: 0, prefill: 1, decode: 2 }[UI.tlHl], mine = bars.filter(b2 => b2.lane === ln); if (mine.length) bars.forEach(b2 => { b2.dim = b2.lane !== ln; }); }
  const ghost = PIN && scale === 'request' && !compact;
  const nL = lanes.length + (ghost ? 1 : 0), axis = compact ? 12 : 22, topS = 4, laneH = Math.max(8, Math.min(24, (H - axis - topS - 2) / nL - 4)), gapL = compact ? 2 : 4;
  const span = Math.max(1e-12, t1 - t0), X = t => lab + ((t - t0) / span) * w, laneY = i => topS + i * (laneH + gapL);
  const tmax = ghost ? Math.max(R.total, PIN.total) : t1;
  const XR = ghost ? (t => lab + (t / tmax) * w) : X;
  lanes.forEach((l, i) => { const y = laneY(i); if (!l) return; textFit(x, l, lab - 8, y + laneH / 2 + 3.5, lab - 10, C.mid, 'right', compact ? 8.5 : 9.5); x.fillStyle = 'rgba(255,255,255,.025)'; x.fillRect(lab, y, w, laneH); });
  for (const bar of bars) {
    const y = laneY(bar.lane), a = XR(bar.a), bx = Math.max(a + .6, XR(bar.b)), bw = bx - a - (bx - a > 3 ? .6 : 0);
    if (bar.kind === 'cy' || bar.kind === 'hot') { x.fillStyle = bar.kind === 'cy' ? (bar.alt ? 'rgba(127,227,255,.85)' : 'rgba(127,227,255,.6)') : (bar.alt ? 'rgba(255,212,59,.9)' : 'rgba(255,212,59,.62)'); x.fillRect(a, y + (bar.kind === 'hot' ? laneH * .2 : 0), bw, bar.kind === 'hot' ? laneH * .6 : laneH); }
    else fillKind(x, bar.kind, a, y, bw, laneH, bar.alt ? 1 : .8);
    if (bar.label && bw > 40 && laneH >= 12) textFit(x, bar.label, a + 3, y + laneH / 2 + 3.5, bw - 5, C.bg, 'left', 8.5, 700);
    if (bar.sel) { outlineSel(x, bar.sel, a, y, bw, laneH); if (bw >= 1) hit(id, [a, y, Math.max(2, bw), laneH], bar.sel); }
    if (bar.dim) { x.fillStyle = 'rgba(8,8,12,.62)'; x.fillRect(a, y, Math.max(1, bw), laneH); }
  }
  if (UI.tlHl && scale === 'request') {
    const ln = { load: 0, prefill: 1, decode: 2 }[UI.tlHl], mine = bars.filter(b2 => b2.lane === ln);
    if (mine.length) { const a = XR(Math.min(...mine.map(b2 => b2.a))), b = XR(Math.max(...mine.map(b2 => b2.b))), y = laneY(ln), col = UI.tlHl === 'prefill' ? C.cy : UI.tlHl === 'decode' ? C.hot : C.li;
      x.save(); x.strokeStyle = col; x.lineWidth = 1.5; x.shadowColor = col; x.shadowBlur = 10; x.strokeRect(a - 1.5, y - 1.5, Math.max(3, b - a) + 3, laneH + 3); x.restore(); }
  }
  if (ghost) {
    const y = laneY(lanes.length); text(x, L('pinned', 'fijada'), lab - 8, y + laneH / 2 + 3.5, C.dim, 'right', 9.5);
    for (const [a, b, col] of PIN.spans) { x.fillStyle = col; x.globalAlpha = .35; x.fillRect(XR(a), y + 2, Math.max(1, XR(b) - XR(a)), laneH - 4); x.globalAlpha = 1; }
    x.strokeStyle = C.dim; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(XR(PIN.ttft), y); x.lineTo(XR(PIN.ttft), y + laneH); x.stroke(); x.setLineDash([]);
  }
  const ts = scale === 'request' && ghost ? [0, tmax] : [t0, t1], spanA = ts[1] - ts[0], XA = ghost ? XR : X;
  const raw = spanA / 6, p10 = 10 ** Math.floor(Math.log10(raw)), stepT = [1, 2, 5, 10].map(v => v * p10).find(s => s >= raw) || raw;
  const yAxis = laneY(nL) - gapL + 2;
  for (let t = Math.ceil(ts[0] / stepT) * stepT; t <= ts[1] + 1e-15; t += stepT) { const xx = XA(t); x.strokeStyle = C.grid; x.beginPath(); x.moveTo(Math.round(xx) + .5, 2); x.lineTo(Math.round(xx) + .5, yAxis); x.stroke(); if (!compact) text(x, dec(scale === 'request' ? fmtS(t) : `${((t - ts[0]) * 1e3).toFixed(spanA < 1e-3 ? 4 : spanA < .1 ? 3 : 1)} ms`), xx, yAxis + 12, C.dim, 'center', 9); }
  if (scale === 'request' && !compact) { const fx = XA(R.ttft); x.strokeStyle = C.hot; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(fx, 2); x.lineTo(fx, yAxis); x.stroke(); x.setLineDash([]); }
  if (P.t >= ts[0] - 1e-12 && P.t <= ts[1] + 1e-12) {
    const ph = XA(P.t);
    x.strokeStyle = C.ink; x.lineWidth = 2; x.beginPath(); x.moveTo(ph, 0); x.lineTo(ph, yAxis); x.stroke(); x.lineWidth = 1;
    x.fillStyle = C.ink; x.beginPath(); x.moveTo(ph - 5, 0); x.lineTo(ph + 5, 0); x.lineTo(ph, 6); x.fill();
  } else { const right = P.t > ts[1], ex = right ? W - 6 : lab + 2; x.fillStyle = C.ink; x.beginPath(); if (right) { x.moveTo(ex, 12); x.lineTo(ex - 8, 6); x.lineTo(ex - 8, 18); } else { x.moveTo(ex, 12); x.lineTo(ex + 8, 6); x.lineTo(ex + 8, 18); } x.fill(); text(x, L('now', 'ahora'), right ? ex - 12 : ex + 12, 16, C.ink, right ? 'right' : 'left', 10, 650); }
  if (pk) { const done = Math.max(0, Math.min(1, (P.t - pk.a) / pk.d)); $('tlPeek').hidden = false; const ttl = pk.k === 'prefill' ? L(`Chunk ${pk.i + 1} of ${pk.n}`, `Bloque ${pk.i + 1} de ${pk.n}`) : L(`Token ${num(pk.tok + 1)} of ${num(S.ans)}`, `Token ${num(pk.tok + 1)} de ${num(S.ans)}`), st = done >= 1 ? L('done', 'hecho') : done <= 0 ? L('not yet', 'aún no') : pct(done);
    const hh = `<b>${esc(ttl)}</b><span>${esc(st)}</span><button type="button" id="tlPeekX">${ICON('close', 's')}${esc(L('Back to now', 'Volver a ahora'))}</button>`; if ($('tlPeek').dataset.k !== hh) { $('tlPeek').dataset.k = hh; $('tlPeek').innerHTML = hh; $('tlPeekX').addEventListener('click', () => { UI.tlPeek = null; }); } }
  else if (!$('tlPeek').hidden) { $('tlPeek').hidden = true; $('tlPeek').dataset.k = ''; }
  timeGeo = { lab, w, t0: ts[0], t1: ts[1], ghost, scale, laneY: [laneY(0), laneY(1), laneY(2)], laneH };
  drawHover(id, x);
}

// ===== Powers of ten =====
function drawRuler(n) {
  if ($('scaleWin').hidden) return;
  const id = 'ruler', c = $(id), W = Math.max(480, Math.floor($('scaleWin').querySelector('.sw-body').clientWidth - 36)), H = 256, x = fit(c, W, H), { m } = R; hitReset(id);
  const focus = UI.layer >= 0 ? UI.layer : Math.max(0, n.layer), li = layerInfo(focus);
  const big = li.mixer.reduce((a, s2) => (bytesOf(s2) > bytesOf(a) ? s2 : a), li.mixer[0]);
  // [id, name, bytes, what it is]
  const marks = [
    ['w', L('One weight', 'Un peso'), QUANTS[S.quant].bpw / 8, L(`one number of the model, ${S.quant}`, `un número del modelo, ${S.quant}`)],
    ['num', L('One KV number', 'Un número KV'), KV_TYPES[S.kv].bytes, L(`one key or value, ${S.kv}`, `una clave o valor, ${S.kv}`)],
    ['kv1', L('KV of a token', 'KV de un token'), kvBytesPerToken(m, S.kv), L('what each token leaves in memory', 'lo que cada token deja en memoria')],
    ['row', L('A row', 'Una fila'), big[1] * QUANTS[S.quant].bpw / 8, L(`${num(big[1])} weights, one dot product`, `${num(big[1])} pesos, un producto escalar`)],
    ['mat', L('A matrix', 'Una matriz'), bytesOf(big), L(`${big[0]}, the largest of a layer`, `${big[0]}, la mayor de una capa`)],
    ['layer', L('A layer', 'Una capa'), li.stored, L('all the weights of one layer', 'todos los pesos de una capa')],
    ['read', L('Read per token', 'Leído por token'), readGB(m, S.quant) * 1e9, L('what one word costs to read', 'lo que cuesta leer una palabra')],
    ['model', L('The model', 'El modelo'), R.weights * 1e9, L('the whole file in memory', 'el archivo entero en memoria')],
    ['ram', R.mc.kind === 'unified' ? 'RAM' : 'VRAM', (R.mc.kind === 'unified' ? R.mc.ramGB : R.mc.fastGB) * 1e9, L('what the machine has', 'lo que tiene la máquina')],
  ];
  const zf2 = zTop(UI.lens), zhere = zf2 ? (UI.lens === 'model' ? { num: 'w', row: 'row', mat: 'mat', expert: 'layer' }[zf2.k] : { num: 'num', tok: 'kv1' }[zf2.k]) : null;
  const here = zhere || { system: 'read', memory: 'kv1', model: P.anim || UI.scale === 'op' ? 'mat' : 'layer', tokens: 'kv1' }[UI.lens] || 'model';
  const lo = -1, hi = 12.3, AY = 125, X = b2 => 14 + ((Math.log10(Math.max(.1, b2)) - lo) / (hi - lo)) * (W - 28);
  // bands of a thousand, named
  [['bytes', 0], ['KB', 3], ['MB', 6], ['GB', 9], ['TB', 12]].forEach(([nm, e], i) => { const x0 = X(10 ** e), x1 = Math.min(W - 14, X(10 ** (e + 3))); x.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.015)'; x.fillRect(x0, AY - 14, x1 - x0, 28); if (x1 - x0 > 30) text(x, nm, (x0 + x1) / 2, AY + 32, C.mid, 'center', 12, 650); });
  x.strokeStyle = C.line2; x.beginPath(); x.moveTo(14, AY + .5); x.lineTo(W - 14, AY + .5); x.stroke();
  for (let e = 0; e <= 12; e++) { const xx = Math.round(X(10 ** e)) + .5; x.strokeStyle = e % 3 === 0 ? C.mid : C.faint; x.beginPath(); x.moveTo(xx, AY - (e % 3 ? 4 : 14)); x.lineTo(xx, AY + (e % 3 ? 4 : 14)); x.stroke(); }
  // cards: alternate above and below, spread so none overlap
  const cards = marks.map(([k, nm, b2, wh], i) => { x.font = `650 11.5px ${FONT}`; const w1 = x.measureText(`${nm}  ${B(b2)}`).width; x.font = `400 10px ${FONT}`; const w2 = x.measureText(wh).width; return { k, nm, b: b2, wh, mid: X(b2), w: Math.max(w1, w2) + 16, up: i % 2 === 0 }; });
  for (const up of [true, false]) {
    const row = cards.filter(q => q.up === up).sort((p1, p2) => p1.mid - p2.mid);
    row.forEach((q, i) => { q.x0 = Math.max(0, Math.min(W - q.w, q.mid - q.w / 2)); if (i) q.x0 = Math.max(q.x0, row[i - 1].x0 + row[i - 1].w + 10); });
    for (let i = row.length - 1; i >= 0; i--) { const lim = i === row.length - 1 ? W - row[i].w : row[i + 1].x0 - row[i].w - 10; if (row[i].x0 > lim) row[i].x0 = Math.max(0, lim); }
  }
  for (const q of cards) {
    const on = q.k === here, col = on ? C.hot : C.li, cy = q.up ? 14 : AY + 56, ch = 40, ax = Math.max(q.x0 + 6, Math.min(q.x0 + q.w - 6, q.mid));
    x.strokeStyle = col; x.globalAlpha = on ? 1 : .6; x.beginPath(); x.moveTo(q.mid + .5, AY + (q.up ? -6 : 6)); x.lineTo(q.mid + .5, q.up ? cy + ch + 10 : cy - 10); x.lineTo(ax + .5, q.up ? cy + ch + 10 : cy - 10); x.lineTo(ax + .5, q.up ? cy + ch : cy); x.stroke(); x.globalAlpha = 1;
    x.fillStyle = on ? 'rgba(255,212,59,.1)' : 'rgba(255,255,255,.03)'; x.fillRect(q.x0, cy, q.w, ch); x.strokeStyle = on ? C.hot : C.line2; x.strokeRect(q.x0 + .5, cy + .5, q.w - 1, ch - 1);
    text(x, q.nm, q.x0 + 8, cy + 16, on ? C.hot : C.ink, 'left', 11.5, 650); x.font = `650 11.5px ${FONT}`; text(x, B(q.b), q.x0 + 8 + x.measureText(q.nm + '  ').width, cy + 16, on ? C.hot : C.mid, 'left', 11.5, 500);
    text(x, q.wh, q.x0 + 8, cy + 31, C.dim, 'left', 10);
    x.fillStyle = col; x.beginPath(); x.arc(q.mid, AY + .5, on ? 5 : 3.5, 0, 7); x.fill();
    hit(id, [q.x0, cy, q.w, ch], { k: 'mark', id: q.k, n: q.nm, b: q.b }); hit(id, [q.mid - 7, AY - 7, 14, 14], { k: 'mark', id: q.k, n: q.nm, b: q.b });
  }
}
