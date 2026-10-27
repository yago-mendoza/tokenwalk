// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Address: where the run is, at every level at once =====
// One line in the Playback header, visible from every lens: the phase, then the chunk or the token, the layer, the
// operation inside the layer and the row of the matrix it is reading, each with its own number and a thin bar. It
// does not depend on the timeline's scale: every level is always there, and each changes at its own speed. When a
// level changes faster than the eye can read at the current playback rate, its digits give way to that rate on the
// simulated machine ("rows ≈ 35 M/s"); paused or slow, the exact numbers come back. Levels come from now() (the same
// clock every lens uses); the finest ones split an operation the way the deep timeline does: rows of a matrix, cached
// tokens of a KV read, heads of a DeltaNet state, the three matrices of an expert in proportion to their bytes.
const ADDR = { key: '', segs: [], els: [], fitW: -1, phase: '' };
const ADDR_HZ = 8; // above this many changes per second on screen, a level shows its rate instead of its digits
const ADDR_HL = { request: 'seg', token: 'layer', layer: 'op', op: 'row' };
function addrRate(v) { const a = Math.abs(v); return dec(a >= 1e9 ? `${(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)} G` : a >= 1e6 ? `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)} M` : a >= 1e4 ? `${(v / 1e3).toFixed(0)} k` : a >= 100 ? num(Math.round(v)) : a >= 10 ? v.toFixed(1) : v.toFixed(2)); }
// The levels at this instant, finest last. Each: k (level), lab (word before the number), i/N (or v, a free value),
// f (progress of the bar, 0..1), d (simulated seconds one unit lasts; 0 for a level that does not tick), u (the
// unit's plural, for the rate), note (a fixed aside), tag (a small kind label), tip (the hover text).
function addrLevels(n) {
  const out = [], seg = n.seg, m = R.m;
  if (!seg) return null;
  if (seg.k === 'load') {
    out.push({ k: 'seg', lab: L('weights', 'pesos'), v: `${dec(fmtGB(R.weights * n.f))} / ${dec(fmtGB(R.weights))}`, f: n.f, d: 0, tip: L('Reading the model file from the SSD into memory, once per load', 'Leyendo el archivo del modelo del SSD a la memoria, una vez por carga') });
    return { ph: 'load', tag: L('LOAD', 'CARGA'), segs: out };
  }
  if (seg.k === 'restore') {
    out.push({ k: 'seg', lab: L('prefix KV from disk', 'KV del prefijo desde disco'), v: `${num(R.prefixLen * n.f)} / ${num(R.prefixLen)} tok`, f: n.f, d: 0, tip: L('The saved KV cache of the prompt prefix comes back from disk instead of being recomputed', 'La caché KV guardada del prefijo vuelve del disco en vez de recalcularse') });
    return { ph: 'load', tag: L('RESTORE', 'RESTAURA'), segs: out };
  }
  const pre = seg.k === 'prefill', round = seg.k === 'round';
  if (pre) {
    const nt = seg.to - seg.from;
    out.push({ k: 'seg', lab: L('chunk', 'bloque'), i: seg.i + 1, N: seg.n, f: (seg.i + n.f) / seg.n, d: seg.d, u: L('chunks', 'bloques'), note: L(`${num(nt)} tok together`, `${num(nt)} tok juntos`),
      tip: L(`Prompt tokens ${num(seg.from + 1)} to ${num(seg.to)}. Inside a chunk there is no token-by-token order: all ${num(nt)} pass each layer together, as the rows of one matrix.`, `Tokens del prompt ${num(seg.from + 1)} a ${num(seg.to)}. Dentro de un bloque no hay orden token a token: los ${num(nt)} pasan cada capa juntos, como las filas de una matriz.`) });
  } else {
    out.push({ k: 'seg', lab: 'token', i: seg.tok + 1, N: S.ans, f: (seg.tok + (round ? seg.n || 1 : 1) * n.f) / Math.max(1, S.ans), d: round ? seg.d / Math.max(1, seg.n || 1) : seg.d, u: 'tokens', tip: L('The answer token this pass writes', 'El token de la respuesta que escribe esta pasada') });
    if (round) {
      const rs = R.segs.filter(q => q.k === 'round'), ri = rs.indexOf(seg), nt = (seg.mtp ? MTP.k : S.gamma) + 1;
      out.push({ k: 'round', lab: seg.mtp ? L('MTP round', 'ronda MTP') : L('draft round', 'ronda borrador'), i: ri + 1, N: rs.length, f: (ri + n.f) / rs.length, d: seg.d, u: L('rounds', 'rondas'), note: L(`${nt} checked together`, `${nt} comprobados juntos`),
        tip: L(`${seg.mtp ? 'The model’s own MTP head' : 'A small draft model'} proposes ${nt - 1} tokens; one pass of the full model checks ${nt} positions together and keeps ${seg.n} of them.`, `${seg.mtp ? 'La cabeza MTP del propio modelo' : 'Un modelo borrador pequeño'} propone ${nt - 1} tokens; una pasada del modelo completo comprueba ${nt} posiciones juntas y se queda con ${seg.n}.`) });
    }
  }
  const lf = layerFractions(seg), Lr = m.layers;
  if (n.head) {
    const hp = Math.max(0, Math.min(.9999, (n.f - lf[Lr]) / Math.max(1e-12, 1 - lf[Lr]))), hd = seg.d * (1 - lf[Lr]);
    out.push({ k: 'layer', lab: L('output head', 'cabeza de salida'), v: '', f: 1, d: 0, tip: L('After the last layer: one matrix scores every token of the vocabulary', 'Tras la última capa: una matriz puntúa cada token del vocabulario') });
    out.push({ k: 'op', lab: 'output', i: 1, N: 1, f: hp, d: hd, u: 'ops' });
    out.push({ k: 'row', lab: L('row', 'fila'), i: Math.floor(hp * m.vocab) + 1, N: m.vocab, f: hp, d: hd / m.vocab, u: L('rows', 'filas'), tip: L('One row of the output matrix per vocabulary token', 'Una fila de la matriz de salida por token del vocabulario') });
    return { ph: pre ? 'prefill' : 'decode', tag: pre ? 'PREFILL' : 'DECODE', segs: out };
  }
  if (n.layer < 0 || !n.op) return { ph: pre ? 'prefill' : 'decode', tag: pre ? 'PREFILL' : 'DECODE', segs: out };
  const sp = layerSpan(seg, n.layer), ld = sp[1] - sp[0], kind = R.kinds[n.layer];
  out.push({ k: 'layer', lab: L('layer', 'capa'), i: n.layer + 1, N: Lr, f: (n.layer + n.lp) / Lr, d: ld, u: L('layers', 'capas'), tag: kind === 'attn' ? (addrHyb() ? L('attn', 'atención') : '') : 'DeltaNet',
    tip: L(`Layer ${n.layer + 1} of ${Lr}${kind === 'attn' ? ', an attention layer' : ', a Gated DeltaNet layer'}`, `Capa ${n.layer + 1} de ${Lr}${kind === 'attn' ? ', de atención' : ', Gated DeltaNet'}`) });
  const o = n.op, ops = n.ops, od = (o.b - o.a) * ld, p = Math.max(0, Math.min(.9999, n.opP));
  const opName = o.kind === 'expert' ? (o.e >= 0 ? L(`expert ${o.e}`, `experto ${o.e}`) : L('shared expert', 'experto compartido')) : o.kind === 'expertsAll' ? L('experts', 'expertos') : o.id;
  out.push({ k: 'op', lab: opName, i: n.opIdx + 1, N: ops.length, f: n.lp, d: od, u: 'ops', mono: true, tip: L(`Operation ${n.opIdx + 1} of ${ops.length} in this layer`, `Operación ${n.opIdx + 1} de ${ops.length} en esta capa`) + (XMAT[o.id] ? ` · ${L(XMAT[o.id][0][0], XMAT[o.id][0][1])}` : '') });
  if (o.kind === 'mat') { const rows = o.shape[2]; out.push({ k: 'row', lab: L('row', 'fila'), i: Math.floor(p * rows) + 1, N: rows, f: p, d: od / rows, u: L('rows', 'filas'), tip: L(`Rows of ${o.id} are read one after another; each gives one output number per token`, `Las filas de ${o.id} se leen una tras otra; cada una da un número de salida por token`) }); }
  else if (o.kind === 'kv') { const c = Math.max(1, Math.round(o.ctxTok)); out.push({ k: 'row', lab: L('KV token', 'token KV'), i: Math.floor(p * c) + 1, N: c, f: p, d: od / c, u: L('KV tokens', 'tokens KV'), tip: L('Attention reads the keys and values every earlier token left at this layer', 'La atención lee las claves y valores que cada token anterior dejó en esta capa') }); }
  else if (o.kind === 'state') { const hs = Math.max(1, Math.round((R.sh.deltaState || 0) / (128 * 128 * 4))); out.push({ k: 'row', lab: L('state head', 'cabeza de estado'), i: Math.floor(p * hs) + 1, N: hs, f: p, d: od / hs, u: L('heads', 'cabezas'), tip: L('Each head of the DeltaNet state is updated with this token, then read', 'Cada cabeza del estado DeltaNet se actualiza con este token y luego se lee') }); }
  else if (o.kind === 'expert') {
    const mats = R.sh.expert, tot = mats.reduce((s2, q) => s2 + bytesOf(q), 0); let acc = 0, j = 0;
    while (j < mats.length - 1 && (acc + bytesOf(mats[j])) / tot <= p) { acc += bytesOf(mats[j]); j++; }
    const sh = bytesOf(mats[j]) / tot, mp = Math.max(0, Math.min(.9999, (p - acc / tot) / sh)), rows = mats[j][2];
    out.push({ k: 'mat', lab: mats[j][0], i: j + 1, N: mats.length, f: p, d: od * sh, u: L('matrices', 'matrices'), mono: true, tip: L('An expert is three matrices: gate, up and down', 'Un experto son tres matrices: gate, up y down') });
    out.push({ k: 'row', lab: L('row', 'fila'), i: Math.floor(mp * rows) + 1, N: rows, f: mp, d: od * sh / rows, u: L('rows', 'filas') });
  } else if (o.kind === 'expertsAll') {
    const tc = Math.max(1, Math.round(expertsTouched(m, seg.to - seg.from))) + (m.sharedExperts || 0);
    out.push({ k: 'row', lab: L('expert', 'experto'), i: Math.floor(p * tc) + 1, N: tc, f: p, d: od / tc, u: L('experts', 'expertos'), tip: L(`This chunk’s tokens chose, between them, about ${num(tc)} of the ${m.experts} experts: each is read once for the whole chunk`, `Entre todos, los tokens de este bloque eligieron unos ${num(tc)} de los ${m.experts} expertos: cada uno se lee una vez para todo el bloque`) });
  }
  return { ph: pre ? 'prefill' : 'decode', tag: pre ? 'PREFILL' : 'DECODE', segs: out };
}
const addrHyb = () => R.m.kvLayers < R.m.layers;
// Real mode: only what the server measured, token by token. No layers: the server does not report them.
function addrLevelsReal() {
  const n = LIVE.toks.length, run = LIVE.run;
  if (!LIVE.running && !run) return null;
  if (LIVE.running && !n) return { ph: 'prefill', tag: L('WAITING', 'ESPERANDO'), segs: [{ k: 'seg', lab: L('load + prefill', 'carga + prefill'), v: S_(realElapsed()), f: 0, d: 0, tip: L('The server reads the prompt; it does not say how far it has got', 'El servidor lee el prompt; no dice por dónde va') }, { k: 'x', lab: L('layers not reported', 'capas no informadas'), v: '', f: 0, d: 0, st: true }] };
  const gap = n > 1 ? LIVE.toks[n - 1].t - LIVE.toks[n - 2].t : 0;
  return { ph: LIVE.running ? 'decode' : 'done', tag: LIVE.running ? 'DECODE' : L('DONE', 'FIN'), segs: [
    { k: 'seg', lab: 'token', i: n, N: LIVE.maxTok, f: n / Math.max(1, LIVE.maxTok), d: 0, tip: L('Tokens the server has streamed so far, of the most this request allows', 'Tokens que el servidor ha enviado hasta ahora, del máximo que permite la petición') },
    { k: 'gap', lab: L('last gap', 'último hueco'), v: gap ? dec(`${gap.toFixed(gap < 10 ? 1 : 0)} ms`) : '—', f: 0, d: 0, st: true, tip: L('Time between the last two tokens, measured by this browser', 'Tiempo entre los dos últimos tokens, medido por este navegador') },
    { k: 'x', lab: L('layers not reported', 'capas no informadas'), v: '', f: 0, d: 0, st: true, tip: L('A real server streams tokens, not layers: below a token there is nothing measured to show', 'Un servidor real envía tokens, no capas: por debajo de un token no hay nada medido que enseñar') },
  ] };
}
function addrSegHtml(s) {
  const nw = s.N ? String(num(s.N)).length : 0;
  const body = s.v != null ? `<b>${esc(s.v)}</b>` : `<b style="min-width:${nw}ch">${esc(num(s.i))}</b><small class="of">/${esc(num(s.N))}</small>`;
  const inner = `<span class="ad-t"><em${s.mono ? ' class="mono"' : ''}>${esc(s.lab)}</em>${body}${s.tag ? `<span class="kd">${esc(s.tag)}</span>` : ''}${s.note ? `<small class="nt">· ${esc(s.note)}</small>` : ''}<span class="rt"></span></span><i class="ad-b"><i></i></i>`;
  return s.st ? `<span class="ad-s st" data-k="${s.k}" title="${esc(s.tip || '')}">${inner}</span>` : `<button type="button" class="ad-s" data-k="${s.k}" title="${esc((s.tip ? s.tip + '. ' : '') + (UI.lens === 'flow' ? L('Click: show it in Flow', 'Clic: verlo en Flujo') : L('Click: open it in the deep timeline', 'Clic: abrirlo en la línea de tiempo profunda')))}">${inner}</button>`;
}
function renderAddr(n) {
  const el = $('addr'); if (!el) return;
  const lv = isReal() ? addrLevelsReal() : fitGate() || (UI.stale && P.t === 0) ? null : addrLevels(n);
  document.body.classList.toggle('addrOn', !!lv);
  if (!lv) { if (ADDR.key) { ADDR.key = ''; el.innerHTML = ''; } return; }
  const key = `${lang}|${UI.lens}|${lv.ph}|${lv.tag}|` + lv.segs.map(s => `${s.k}:${s.lab}:${s.N}:${s.note || ''}:${s.tag || ''}:${s.st ? 1 : 0}:${s.v == null ? '' : 'v'}`).join('|');
  if (key !== ADDR.key) {
    ADDR.key = key; ADDR.phase = lv.ph;
    el.className = lv.ph; el.setAttribute('aria-label', L('Where the run is now, at every level', 'Dónde va la ejecución, a todos los niveles'));
    el.innerHTML = `<span class="ad-ph">${esc(lv.tag)}</span>` + lv.segs.map(addrSegHtml).join('<span class="ad-sep" aria-hidden="true">›</span>');
    ADDR.els = [...el.querySelectorAll('.ad-s')]; ADDR.fitW = -1;
  }
  ADDR.segs = lv.segs;
  const r = isReal() ? 1 : speedNow(n), hl = ADDR_HL[UI.scale] || 'seg', ks = lv.segs.map(s => s.k), hlK = ks.includes(hl) ? hl : hl === 'row' ? ks[ks.length - 1] : 'seg';
  lv.segs.forEach((s, i) => {
    const e = ADDR.els[i]; if (!e) return;
    const hz = s.d > 0 ? r / s.d : 0, fast = !isReal() && P.on && hz > ADDR_HZ;
    e.classList.toggle('fast', fast); e.classList.toggle('hl', s.k === hlK);
    const b = e.querySelector('b'), txt = s.v != null ? s.v : num(s.i); if (!fast && b.textContent !== txt) b.textContent = txt;
    const rt = e.querySelector('.rt'), rtx = fast ? `${s.u || ''} ≈ ${addrRate(1 / s.d)}/s` : ''; if (rt.textContent !== rtx) rt.textContent = rtx;
    if (fast) rt.title = L(`${addrRate(1 / s.d)} ${s.u} per second on the simulated machine; at this playback rate, ${addrRate(hz)} a second on screen`, `${addrRate(1 / s.d)} ${s.u} por segundo en la máquina simulada; a esta velocidad, ${addrRate(hz)} por segundo en pantalla`);
    const bi = e.querySelector('.ad-b > i'), w = `${(Math.max(0, Math.min(1, s.f)) * 100).toFixed(1)}%`; if (!fast && bi.style.width !== w) bi.style.width = w;
  });
  addrFit(el);
}
// Too narrow (a phone, a small window): the coarsest levels go first, from the left; the finest stay.
function addrFit(el) {
  const W = el.clientWidth; if (W === ADDR.fitW) return; ADDR.fitW = W;
  const kids = [...el.children]; kids.forEach(k => k.classList.remove('gone')); el.classList.remove('cut');
  const wrap = getComputedStyle(el).flexWrap === 'wrap', over = () => (wrap ? el.scrollHeight > 56 : el.scrollWidth > el.clientWidth + 1);
  let i = 0; while (over() && i < kids.length - 2) { kids[i].classList.add('gone'); el.classList.add('cut'); i++; }
}
addEventListener('resize', () => { ADDR.fitW = -1; });
// A level, clicked: in Flow, that element in the drawing; elsewhere, that element in the deep timeline.
function addrGo(k) {
  if (isReal()) { xpOpen(); return; }
  const n = now(); if (!n.seg) return;
  if (UI.lens === 'flow' && typeof flAddrGo === 'function') { flAddrGo(k, n); return; }
  select(null); xpOpen(); if (!XP.root) return;
  const ph = (XP.root.kids || []).find(p => p.a <= P.t && P.t <= p.b) || XP.root.kids[0];
  let node = ph, j = -1;
  if (k !== 'phase' && ph && ph.kids) {
    const sg = ph.kids.find(q => q.li === n.idx); if (sg) node = sg;
    if (sg && k !== 'seg' && k !== 'round') {
      const ly = (xKids(sg) || []).filter(q => q.k === 'layer'), L2 = n.head ? ly.find(q => q.kind === 'head') : ly.find(q => q.li === n.layer && q.kind !== 'head');
      if (L2) { node = L2;
        if (k !== 'layer') {
          const ops = xKids(L2) || [], o = n.head ? ops[0] : ops.find(q => q.id === n.op.id || (n.op.kind === 'expertsAll' && q.kind === 'experts'));
          if (o) { node = o;
            const s = ADDR.segs.find(q => q.k === 'mat');
            if ((k === 'mat' || k === 'row') && s) { const mm = (xKids(o) || []).find(q => q.id === s.lab); if (mm) node = mm; }
            if (k === 'row') { xKids(node); const rs = ADDR.segs.find(q => q.k === 'row'); if (node.uni && rs) j = Math.min(node.uni - 1, rs.i - 1); }
          } } } }
  }
  XP.sel = node; XP.sj = j; XP.dirty = true; XP.pKey = '';
  if (j >= 0) { const w = (node.b - node.a) / node.uni, c = node.a + w * (j + .5); xGo(c - w * 6, c + w * 6, 700); } else xGo(node.a, node.b, 700);
}
$('addr').addEventListener('click', e => { const b = e.target.closest('button.ad-s'); if (b) addrGo(b.dataset.k); });
