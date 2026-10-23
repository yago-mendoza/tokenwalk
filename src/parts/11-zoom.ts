// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Zoom by levels =====
// Model: layer › matrix › one row (or layer › expert › matrix › row). Memory: KV › one token. A click on a part
// that has an inside zooms in; the bar on top goes back. The timeline follows to the matching scale and returns
// to the user's scale on the way out.
const ZOOM = { model: [], memory: [] };
let ZFX = null, ZSCALE0 = null, ZROW_PH = 0, ZROW_T = 0;
const zTop = l => (ZOOM[l] ? ZOOM[l][ZOOM[l].length - 1] : null) || null;
function zoomable(cid, sel) { return cid === 'cModel' ? ['mat', 'expert', 'zrow', 'zmat', 'zw', 'gcol'].includes(sel.k) : cid === 'cMemory' ? ['kvtok', 'kvbin', 'zkv'].includes(sel.k) : false; }
function frameOf(sel) {
  const sh = R.sh;
  if (sel.k === 'mat') { const s2 = [...layerInfo(sel.layer).mixer, ...(sh.router ? [sh.router] : []), ...(sh.mlp || [])].find(q => q[0] === sel.name); return s2 ? { k: 'mat', layer: sel.layer, name: s2[0], shape: s2 } : null; }
  if (sel.k === 'zmat') return { k: 'mat', layer: sel.layer, name: sel.name, shape: sel.shape, e: sel.e };
  if (sel.k === 'expert') return sh.expert ? { k: 'expert', layer: sel.layer, e: sel.e } : null;
  if (sel.k === 'zrow') { const f = zTop('model'); return f ? { ...f, k: 'row', r: sel.r } : null; }
  if (sel.k === 'zw') { const f = zTop('model'); return f ? { ...f, k: 'num', i: sel.i } : null; }
  if (sel.k === 'zkv') { const f = zTop('memory'); return f ? { ...f, k: 'num', layer: sel.layer } : null; }
  if (sel.k === 'kvtok') return { k: 'tok', t: sel.t };
  if (sel.k === 'kvbin') { const inC = Math.floor(tokensInCache(P.t)), t = Math.min(inC - 1, Math.floor((sel.b + 1) * sel.per) - 1); return t >= 0 ? { k: 'tok', t } : null; }
  return null;
}
function zName(sel) {
  if (sel.k === 'mat' || sel.k === 'zmat') return sel.name;
  if (sel.k === 'expert') return sel.e < 0 ? L('the shared expert', 'el experto compartido') : L(`expert ${sel.e}`, `experto ${sel.e}`);
  if (sel.k === 'zrow') return L(`row ${num(sel.r + 1)}, one dot product`, `fila ${num(sel.r + 1)}, un producto escalar`);
  if (sel.k === 'kvtok') return L(`token ${num(sel.t + 1)}, its keys and values`, `token ${num(sel.t + 1)}, sus claves y valores`);
  if (sel.k === 'kvbin') return L('the newest token in this column', 'el token más nuevo de esta columna');
  if (sel.k === 'gstate') return (sel.scaled ? L(`DeltaNet state of one layer, worth ≈ ${num(sel.tok)} tokens of KV · fixed size: same at token 1 and token 100,000`, `Estado DeltaNet de una capa, ≈ ${num(sel.tok)} tokens de KV · tamaño fijo: igual en el token 1 y en el 100.000`) : L(`DeltaNet state of one layer, ≈ ${num(sel.tok)} tokens of KV (not to scale) · fixed size: same at token 1 and token 100,000`, `Estado DeltaNet de una capa, ≈ ${num(sel.tok)} tokens de KV (sin escala) · tamaño fijo: igual en el token 1 y en el 100.000`));
  if (sel.k === 'gcol') { const q = R.segs[sel.s]; return q && q.k === 'prefill' ? L(`chunk ${q.i + 1}: open the matrices of a layer`, `bloque ${q.i + 1}: abre las matrices de una capa`) : L(`token ${num((q && q.tok || 0) + 1)}: open the matrices of a layer`, `token ${num((q && q.tok || 0) + 1)}: abre las matrices de una capa`); }
  if (sel.k === 'zchain') return L('go to this level', 'ir a este nivel');
  if (sel.k === 'zw') return L(`weight ${num(sel.i + 1)}, its bits`, `peso ${num(sel.i + 1)}, sus bits`);
  if (sel.k === 'zkv') return L(`one number of layer ${sel.layer + 1}, its bits`, `un número de la capa ${sel.layer + 1}, sus bits`);
  return '';
}
const zFrameScale = f => (f.k === 'row' || f.k === 'num' ? 'op' : 'layer');
function zoomIn(lens, f, rect) {
  ZOOM[lens].push(f); ZFX = { t0: performance.now(), rect, dir: 1 };
  if (lens === 'model') { if (ZSCALE0 === null) ZSCALE0 = UI.scale; UI.scale = zFrameScale(f); UI.layer = f.layer; logKey = ''; renderSettings(); }
  if (UI.sel) select(null);
  $('tip').classList.remove('on'); renderZbar();
}
function zoomTo(lens, depth) {
  if (ZOOM[lens].length <= depth) return;
  ZOOM[lens].length = depth; ZFX = { t0: performance.now(), rect: null, dir: -1 };
  if (lens === 'model') { const f = zTop('model'); if (f) UI.scale = zFrameScale(f); else if (ZSCALE0 !== null) { UI.scale = ZSCALE0; ZSCALE0 = null; } logKey = ''; renderSettings(); }
  renderZbar();
}
function zoomReset() { ZOOM.model = []; ZOOM.memory = []; if (ZSCALE0 !== null) { UI.scale = ZSCALE0; ZSCALE0 = null; } renderZbar(); }
function zCrumbs(lens) {
  const st = ZOOM[lens], out = [];
  if (lens === 'model') {
    const f0 = st[0]; out.push(L(`Model · layer ${f0 ? f0.layer + 1 : ''}`, `Modelo · capa ${f0 ? f0.layer + 1 : ''}`));
    for (const f of st) out.push(f.k === 'expert' ? (f.e < 0 ? L('shared expert', 'experto compartido') : L(`expert ${f.e}`, `experto ${f.e}`)) : f.k === 'mat' ? f.name : f.k === 'num' ? L(`weight ${num(f.i + 1)}`, `peso ${num(f.i + 1)}`) : L(`row ${num(f.r + 1)}`, `fila ${num(f.r + 1)}`));
  } else { out.push(L('Memory', 'Memoria')); for (const f of st) out.push(f.k === 'num' ? L(`layer ${f.layer + 1}, one number`, `capa ${f.layer + 1}, un número`) : L(`token ${num(f.t + 1)}`, `token ${num(f.t + 1)}`)); }
  return out;
}
let zbarKey = '';
function renderZbar() {
  const lens = UI.lens, f = zTop(lens), bar = $('zbar');
  if (!f) { bar.hidden = true; zbarKey = ''; return; }
  bar.hidden = false;
  const cr = zCrumbs(lens), h = cr.map((c2, i) => `<li>${i < cr.length - 1 ? `<button type="button" data-d="${i}">${esc(c2)}</button>` : `<span>${esc(c2)}</span>`}</li>`).join('');
  const key = lens + h + lang;
  if (key !== zbarKey) {
    zbarKey = key; $('zCrumbs').innerHTML = h; $('zCrumbs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => zoomTo(lens, +b.dataset.d)));
    $('zUp').innerHTML = `${ICON('chev', 's')}<span>${esc(L('Out', 'Salir'))}</span>`; $('zUp').querySelector('.ic').style.transform = 'rotate(180deg)'; $('zUp').title = L('One level out (Esc)', 'Un nivel afuera (Esc)');
    $('zInfo').innerHTML = `${ICON('info', 's')}<span>${esc(L('Explain', 'Explicar'))}</span>`;
  }
}
// Where this matrix stands in the pass: not reached, running, or done; and when it starts.
function zOpState(f, n) {
  const seg = n.seg && (n.seg.k === 'prefill' || n.seg.k === 'decode' || n.seg.k === 'round') ? n.seg : R.segs[R.firstDecode] || R.segs[R.segs.length - 1];
  if (!seg) return { pr: 0, where: 'idle', seg: null };
  const ops = opsOf(f.layer, seg), sp = layerSpan(seg, f.layer), ld = sp[1] - sp[0];
  let o = null, a = 0, b = 1;
  if (f.e !== undefined && f.k !== 'expert') { o = ops.find(q => q.e === f.e) || ops.find(q => q.kind === 'expertsAll'); const j = Math.max(0, (R.sh.expert || []).findIndex(s2 => s2[0] === f.shape[0])), k3 = (R.sh.expert || [1]).length; if (o) { a = o.a + (o.b - o.a) * j / k3; b = o.a + (o.b - o.a) * (j + 1) / k3; } }
  else if (f.k === 'expert') { o = ops.find(q => q.e === f.e) || ops.find(q => q.kind === 'expertsAll'); if (o) { a = o.a; b = o.b; } }
  else { o = ops.find(q => q.id === f.name); if (o) { a = o.a; b = o.b; } }
  if (!o) return { pr: 0, where: 'skipped', seg };
  const ta = sp[0] + ld * a, tb = sp[0] + ld * b, pr = Math.max(0, Math.min(1, (P.t - ta) / Math.max(1e-15, tb - ta)));
  return { pr, where: P.t < ta ? 'ahead' : P.t > tb ? 'past' : 'now', seg, ta, tb };
}
function renderZStat(st, f) {
  const n = now(), here = n.seg && n.layer >= 0 ? L(`the pass is at layer ${n.layer + 1}`, `la pasada va por la capa ${n.layer + 1}`) : L('no pass running', 'ninguna pasada en marcha');
  let t = '', jump = false;
  if (f.k === 'num') t = L('one number, down to its bits', 'un número, hasta sus bits');
  else if (f.k === 'tok') { const inC = Math.floor(tokensInCache(P.t)); t = f.t < inC ? L(`in the cache · read by <b>${num(Math.max(0, inC - f.t - 1))}</b> later tokens so far`, `en la caché · leído por <b>${num(Math.max(0, inC - f.t - 1))}</b> tokens posteriores hasta ahora`) : L('not written yet: the pass has not reached this token', 'aún sin escribir: la pasada no ha llegado a este token'); }
  else if (st.where === 'now') t = L(`<b>running now</b> · ${pct(st.pr)} of its rows done`, `<b>en marcha</b> · ${pct(st.pr)} de sus filas hechas`);
  else if (st.where === 'ahead') { t = L(`not reached yet · ${here}`, `aún no alcanzado · ${here}`); jump = true; }
  else if (st.where === 'past') { t = L(`done in this pass · ${here}`, `hecho en esta pasada · ${here}`); jump = !!(R.segs.length && P.t < R.total); }
  else if (st.where === 'skipped') t = f.e !== undefined ? L('not read by this token: the router chose other experts', 'este token no lo lee: el router eligió otros expertos') : L('not in this layer’s pass', 'no está en la pasada de esta capa');
  if ($('zStat').dataset.k !== t) { $('zStat').dataset.k = t; $('zStat').innerHTML = t; }
  const jb = $('zJump'); jb.hidden = !jump || locked() === false && !R.segs.length; jb.innerHTML = `${ICON('skip', 's')}<span></span>`; jb.title = st.where === 'past' ? L('Jump to the next time it runs', 'Saltar a la próxima vez que corre') : L('Jump to the moment it runs', 'Saltar al momento en que corre'); $('zInfo').title = L('Explain this', 'Explicar esto');
}
function zJumpGo() {
  const f = zTop(UI.lens); if (!f || f.k === 'tok') return;
  let st = zOpState(f, now());
  if (st.where === 'past') { const i = R.segs.indexOf(st.seg), nx = R.segs.slice(i + 1).find(q => q.k === 'decode' || q.k === 'round'); if (nx) { P.t = nx.a + 1e-12; st = zOpState(f, now()); } }
  if (st.ta !== undefined) { stopAt(st.ta + (st.tb - st.ta) * .4); KEEP.idle = 0; }
}
function zInfoGo() {
  const f = zTop(UI.lens); if (!f) return; LAST_PT = null;
  const sel = f.k === 'tok' ? { k: 'kvtok', t: f.t } : f.k === 'expert' ? { k: 'expert', layer: f.layer, e: f.e } : { k: 'mat', layer: f.layer, name: f.e !== undefined ? 'ffn' : f.name };
  SEL_FROM = 'zbar'; select(sel);
}
// Entering: an outline grows from the part clicked to the whole stage; leaving: the view settles from a slight blur of dark.
function drawZFx(x, W, H) {
  if (!ZFX) return; const e = (performance.now() - ZFX.t0) / 260; if (e >= 1) { ZFX = null; return; }
  const k = 1 - (1 - e) ** 3;
  x.fillStyle = `rgba(6,6,9,${(.75 * (1 - k)).toFixed(3)})`; x.fillRect(0, 0, W, H);
  if (ZFX.dir > 0 && ZFX.rect) { const [rx, ry, rw, rh] = ZFX.rect, X = rx + (8 - rx) * k, Y = ry + (40 - ry) * k, w = rw + (W - 16 - rw) * k, h = rh + (H - 48 - rh) * k; x.save(); x.strokeStyle = C.hot; x.globalAlpha = 1 - k * .7; x.lineWidth = 1.5; x.strokeRect(X, Y, w, h); x.restore(); }
}

// ---- the bottom of the zoom: one number and its bits, and the chain of multiplications that builds every size ----
// How a format stores one number: its own bits, plus its share of a scale kept once per block.
function numFormat(fmt) {
  const f = { F16: { own: 16, blk: 0 }, f16: { own: 16, blk: 0 }, Q8_0: { own: 8, blk: 32 }, q8_0: { own: 8, blk: 32 }, Q6_K: { own: 6, blk: 16 }, Q4_K_M: { own: 4, blk: 32 }, q4_0: { own: 4, blk: 32 }, Q2_K: { own: 2, blk: 16 } }[fmt] || { own: 16, blk: 0 };
  return { ...f, share: f.blk ? 16 / f.blk : 0 };
}
// The chain for this zoom: each size is a count times the size below it.
function zChain(lens, f) {
  if (lens === 'model') {
    const q = QUANTS[S.quant], shp = f.shape || (R.sh.attn || R.sh.delta)[0], li = layerInfo(f.layer), w1 = q.bpw / 8, row = shp[1] * w1, mat = row * shp[2];
    return { at: { num: 0, row: 1, mat: 2, expert: 3 }[f.k] ?? 2, items: [[L('one weight', 'un peso'), w1, ''], [L('one row', 'una fila'), row, `× ${num(shp[1])}`], [L('the matrix', 'la matriz'), mat, `× ${num(shp[2])}`], [L('the layer', 'la capa'), li.stored, L('+ others', '+ otras')], [L('the model', 'el modelo'), R.weights * 1e9, `≈ × ${R.m.layers}`]] };
  }
  const m = R.m, b1 = KV_TYPES[S.kv].bytes, head = m.headDim * b1, lay = 2 * m.kvHeads * head, tok = lay * m.kvLayers;
  return { at: { num: 0, tok: 3 }[f.k] ?? 3, items: [[L('one number', 'un número'), b1, ''], [L('one head', 'una cabeza'), head, `× ${m.headDim}`], [L('a layer, K+V', 'una capa, K+V'), lay, `× ${m.kvHeads} × 2`], [L('one token', 'un token'), tok, `× ${m.kvLayers}`], [L('the KV cache', 'la caché KV'), tok * R.ctx, `× ${num(R.ctx)}`]] };
}
function drawZChainStrip(x, W, H, lens, f) {
  const ch = zChain(lens, f), y = H - 34, n = ch.items.length, gap = 26, cw = (W - 24 - gap * (n - 1)) / n;
  x.fillStyle = '#0d0d11'; x.fillRect(0, y - 18, W, H - y + 18);
  const kinds = lens === 'model' ? ['num', 'row', 'mat', 'layer', 'model'] : ['num', null, null, 'tok', 'cache'];
  ch.items.forEach(([nm, b, mul], i) => {
    const X = 12 + i * (cw + gap), on = i === ch.at, kd = kinds[i], ix = kd ? ZOOM[lens].findIndex(q => q.k === kd) : -1, depth = kd === 'layer' || kd === 'model' || kd === 'cache' ? 0 : ix >= 0 ? ix + 1 : -1, go = !on && depth >= 0;
    x.fillStyle = on ? 'rgba(255,212,59,.12)' : go ? 'rgba(255,255,255,.05)' : 'transparent'; x.fillRect(X, y, cw, 28);
    if (on || go) { x.strokeStyle = on ? C.hot : C.line2; x.strokeRect(X + .5, y + .5, cw - 1, 27); } else { x.strokeStyle = 'rgba(255,255,255,.08)'; x.setLineDash([2, 3]); x.strokeRect(X + .5, y + .5, cw - 1, 27); x.setLineDash([]); }
    if (go) hit(lens === 'model' ? 'cModel' : 'cMemory', [X, y, cw, 28], { k: 'zchain', lens, depth, kd });
    textFit(x, nm, X + 7, y + 12, cw - 10, on ? C.hot : C.mid, 'left', 9.5, 600); textFit(x, B(b), X + 7, y + 24, cw - 10, on ? C.hot : C.ink, 'left', 11, 700);
    if (i) { textFit(x, mul, X - gap / 2, y - 4, gap + 60, C.dim, 'center', 9.5); x.fillStyle = C.faint; x.beginPath(); x.moveTo(X - gap + 6, y + 10); x.lineTo(X - 6, y + 14); x.lineTo(X - gap + 6, y + 18); x.fill(); }
  });
}
function drawZNum(x, id, W, H, f, lens) {
  const isW = lens === 'model', fmt = isW ? S.quant : S.kv, nf = numFormat(fmt), top = 96;
  const rng = rngOf((isW ? (f.r || 0) * 977 + (f.i || 0) : f.t * 131 + f.layer) + 7), bits = Array.from({ length: nf.own }, () => (rng() > .5 ? 1 : 0));
  text(x, isW ? L(`Weight ${num((f.i || 0) + 1)} of row ${num((f.r || 0) + 1)}, ${f.name}, stored as ${fmt}`, `Peso ${num((f.i || 0) + 1)} de la fila ${num((f.r || 0) + 1)}, ${f.name}, guardado en ${fmt}`) : L(`One number of token ${num(f.t + 1)}'s keys at layer ${f.layer + 1}, stored as ${fmt}`, `Un número de las claves del token ${num(f.t + 1)} en la capa ${f.layer + 1}, guardado en ${fmt}`), 24, top - 42, C.ink, 'left', 12, 650);
  // its own bits, one box each, grouped as the format reads them
  const bw = Math.min(46, (W - 120) / Math.max(nf.own, 8)), bx0 = 24, by = top;
  const grp = nf.own === 16 ? [[0, 1, L('sign', 'signo'), C.red], [1, 6, L('exponent', 'exponente'), C.hot], [6, 16, L('mantissa', 'mantisa'), C.cy]] : [[0, nf.own, L(`level index, ${2 ** nf.own} possible`, `índice de nivel, ${2 ** nf.own} posibles`), C.cy]];
  for (const [a, b, nm, col] of grp) { text(x, nm, bx0 + a * bw, by - 10, col, 'left', 10.5, 600); x.strokeStyle = col; x.beginPath(); x.moveTo(bx0 + a * bw, by - 6); x.lineTo(bx0 + b * bw - 4, by - 6); x.stroke(); }
  bits.forEach((bt, i) => { const g = grp.find(q => i >= q[0] && i < q[1]); x.fillStyle = bt ? g[3] : 'rgba(255,255,255,.05)'; x.globalAlpha = bt ? .85 : 1; x.fillRect(bx0 + i * bw, by, bw - 4, bw - 4); x.globalAlpha = 1; x.strokeStyle = g[3]; x.strokeRect(bx0 + i * bw + .5, by + .5, bw - 5, bw - 5); text(x, String(bt), bx0 + i * bw + (bw - 4) / 2, by + (bw - 4) / 2 + 5, bt ? '#0a0a0d' : C.dim, 'center', 13, 700); });
  // its share of the block's scale
  let y = by + bw + 26;
  if (nf.blk) {
    const sx = bx0, sw = Math.min(16 * 12, W - 160);
    text(x, L(`plus its share of one 16-bit scale kept for every ${nf.blk} numbers`, `más su parte de una escala de 16 bits que se guarda cada ${nf.blk} números`), sx, y, C.li, 'left', 10.5, 600);
    for (let i = 0; i < 16; i++) { x.fillStyle = i < 16 / nf.blk * 1 ? C.li : 'rgba(185,162,242,.15)'; x.fillRect(sx + i * (sw / 16), y + 8, sw / 16 - 2, 14); }
    text(x, L(`16 ÷ ${nf.blk} = ${dec(nf.share.toFixed(2))} bits each`, `16 ÷ ${nf.blk} = ${dec(nf.share.toFixed(2))} bits cada uno`), sx + sw + 10, y + 19, C.li, 'left', 10.5);
    y += 44;
  }
  const tot = isW ? QUANTS[S.quant].bpw : nf.own + nf.share, val = isW ? (rng() * 2 - 1) * .12 : (rng() * 2 - 1) * 1.4;
  text(x, L(`${dec(tot.toFixed(2))} bits = ${dec((tot / 8).toFixed(3))} bytes for this one number`, `${dec(tot.toFixed(2))} bits = ${dec((tot / 8).toFixed(3))} bytes para este número`), 24, y + 6, C.hot, 'left', 13, 700);
  text(x, nf.own === 16 ? L(`read back as about ${dec(val.toFixed(4))} · 8 bits make a byte · value illustrative`, `se lee como unos ${dec(val.toFixed(4))} · 8 bits son un byte · valor ilustrativo`) : L(`read back as level × scale ≈ ${dec(val.toFixed(4))} · 8 bits make a byte · value illustrative`, `se lee como nivel × escala ≈ ${dec(val.toFixed(4))} · 8 bits son un byte · valor ilustrativo`), 24, y + 24, C.dim, 'left', 10.5);
  if (isW && fmt.startsWith('Q') && QUANTS[S.quant].bpw > tot - 1e-9) {} // K-quants also carry minimums; bpw already includes them
  setCap(lens, L('One number down to its bits; the chain below builds every size from it.', 'Un número hasta sus bits; la cadena de abajo construye cada tamaño a partir de él.'));
}

function drawZoomed(lens, n, f) {
  const id = lens === 'model' ? 'cModel' : 'cMemory', c = $(id), [W, H] = stageSize(), x = fit(c, W, H); hitReset(id);
  const st = lens === 'model' ? zOpState(f, n) : null;
  if (f.k === 'mat') drawZMat(x, id, W, H, f, st);
  else if (f.k === 'row') drawZRow(x, id, W, H, f, st);
  else if (f.k === 'expert') drawZExpert(x, id, W, H, f, st, n);
  else if (f.k === 'num') drawZNum(x, id, W, H, f, lens);
  else drawZTok(x, id, W, H, f);
  drawZChainStrip(x, W, H, lens, f);
  renderZStat(st || {}, f);
  drawZFx(x, W, H); drawHover(id, x);
}
// Facts on the right of a close-up: label, value.
function zFacts(x, X, Y, w, rows) {
  // Tall stage: label over value. Short stage: one line each, label left and value right, so nothing falls off the bottom.
  const room = stageSize()[1] - Y - 40;
  if (rows.length * 36 > room) { let y = Y + 4; for (const [l, v, col] of rows) { x.font = `650 11px ${FONT}`; const vw = Math.min(w * .62, x.measureText(v).width); textFit(x, v, X + w, y, w * .62, col || C.ink, 'right', 11, 650); textFit(x, l, X, y, w - vw - 10, C.dim, 'left', 9.5); y += 19; } return y; }
  let y = Y;
  rows.forEach(([l, v, col]) => { text(x, l, X, y, C.dim, 'left', 9.5); y += 15; for (const ln of wrapLines(x, v, w, `650 12px ${FONT}`).slice(0, 2)) { text(x, ln, X, y, col || C.ink, 'left', 12, 650); y += 15; } y += 6; });
  return y;
}
function wrapLines(x, s2, w, font) { x.font = font; const out = []; let cur = ''; for (const wd of String(s2).split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (x.measureText(t).width > w && cur) { out.push(cur); cur = wd; } else cur = t; } if (cur) out.push(cur); return out; }
function drawZMat(x, id, W, H, f, st) {
  const [nm, cin, cout] = f.shape, q = QUANTS[S.quant], pre = st.seg && st.seg.k === 'prefill', ntok = pre ? st.seg.to - st.seg.from : 1;
  const side = Math.min(250, W * .3), top = 74, X0 = 46, boxW = W - X0 - side - 150, boxH = H - top - 110;
  const k = Math.min(boxW / cin, boxH / cout), mw = Math.max(60, cin * k), mh = Math.max(40, cout * k), Y0 = top;
  // x: the input column, drawn across the top because the matrix takes it along its width
  text(x, pre ? L(`X · ${num(ntok)} tokens × ${num(cin)} numbers, one read of W serves them all`, `X · ${num(ntok)} tokens × ${num(cin)} números, una lectura de W sirve a todos`) : L(`x · the token's ${num(cin)} numbers coming in`, `x · los ${num(cin)} números del token que entran`), X0, Y0 - 24, C.cy, 'left', 9.5, 600);
  for (let j = 0; j < (pre ? 5 : 1); j++) { x.fillStyle = `rgba(127,227,255,${pre ? .25 + j * .1 : .7})`; x.fillRect(X0, Y0 - 16 + j * 2, mw, pre ? 1.5 : 6); }
  // W: rows as bands, lit as they are read
  fillKind(x, 'weights', X0, Y0, mw, mh, .2);
  const bands = Math.max(1, Math.min(cout, Math.floor(mh / 5))), lit = st.pr * bands;
  for (let b = 0; b < bands; b++) {
    const y = Y0 + (b / bands) * mh, bh = Math.max(1, mh / bands - .8), on = b < Math.floor(lit);
    if (on) fillKind(x, 'weights', X0, y, mw, bh, .85);
    hit(id, [X0, y, mw, mh / bands], { k: 'zrow', r: Math.floor(b * cout / bands) });
  }
  if (st.where === 'now') { const b = Math.min(bands - 1, Math.floor(lit)), y = Y0 + (b / bands) * mh; x.save(); x.strokeStyle = C.hot; x.lineWidth = 1.5; x.shadowColor = C.hot; x.shadowBlur = 8; x.strokeRect(X0 - 1, y - 1, mw + 2, mh / bands + 2); x.restore(); }
  x.strokeStyle = C.li; x.strokeRect(X0 + .5, Y0 + .5, mw - 1, mh - 1);
  text(x, `W · ${nm}`, X0, Y0 + mh + 16, C.ink, 'left', 10.5, 650);
  text(x, L(`${num(cin)} columns × ${num(cout)} rows = ${num(cin * cout)} weights, to scale`, `${num(cin)} columnas × ${num(cout)} filas = ${num(cin * cout)} pesos, a escala`), X0, Y0 + mh + 30, C.dim, 'left', 9.5);
  // y: the output column fills as rows finish
  const yx = X0 + mw + 14; x.fillStyle = 'rgba(255,212,59,.14)'; x.fillRect(yx, Y0, 7, mh); x.fillStyle = C.hot; x.fillRect(yx, Y0, 7, mh * st.pr);
  text(x, L(`y · ${num(cout)} out`, `y · ${num(cout)} salen`), yx + 12, Y0 + 9, C.hot, 'left', 9.5, 600);
  text(x, L('one number per row', 'un número por fila'), yx + 12, Y0 + 22, C.dim, 'left', 9);
  // the arithmetic of reading it
  const bytes = bytesOf(f.shape), fpb = 2 * ntok / (q.bpw / 8), bal = machineBalance();
  const fy = zFacts(x, W - side, top - 8, side - 8, [
    [L('Stored, read once per pass', 'Guardada, leída una vez por pasada'), `${B(bytes)} · ${dec(q.bpw)} bits/weight`],
    [L('One row', 'Una fila'), `${num(cin)} ${L('weights', 'pesos')} · ${B(cin * q.bpw / 8)}`],
    [L('Arithmetic per pass', 'Aritmética por pasada'), `${num(2 * cin * cout * ntok)} FLOP`],
    [L('Tokens served by one read', 'Tokens servidos por una lectura'), num(ntok)],
    [L('Arithmetic per byte read', 'Aritmética por byte leído'), `${num(Math.round(fpb))} FLOP/B`, fpb < bal ? C.cy : C.hot],
    [L('This machine’s balance', 'Equilibrio de esta máquina'), `${num(Math.round(bal))} FLOP/B`],
  ]);
  textWrap(x, fpb < bal ? L(`Below balance: the units wait on memory, ${num(Math.round(bal / fpb))}× more arithmetic would fit.`, `Por debajo del equilibrio: las unidades esperan a la memoria, cabría ${num(Math.round(bal / fpb))}× más aritmética.`) : L('Above balance: arithmetic sets the pace here.', 'Por encima del equilibrio: aquí manda la aritmética.'), W - side, fy + 2, side - 8, fpb < bal ? C.cy : C.hot, 10, 600);
  setCap('model', L('Click a row to see the one dot product it costs. Out, or Esc, goes back.', 'Pulsa una fila para ver el producto escalar que cuesta. Salir, o Esc, vuelve.'));
}
function drawZRow(x, id, W, H, f, st) {
  const [nm, cin, cout] = f.shape, r = f.r, q = QUANTS[S.quant], pre = st.seg && st.seg.k === 'prefill', ntok = pre ? st.seg.to - st.seg.from : 1;
  const side = Math.min(250, W * .3), lx = 24, avail = W - lx - side - 80, cw = Math.max(9, Math.min(20, Math.floor(avail / 48))), nc = Math.min(cin, Math.floor(avail / cw) - 1);
  const top = 84, gap = 50, wY = top, aY = wY + gap, pY = aY + gap, sY = pY + gap;
  // Which part of the row is done: the band this row sits in, and inside it a sweep that moves only while playing.
  const bands = Math.max(1, Math.floor(cout / 64)), band = Math.floor(r / cout * bands), lit = st.pr * bands;
  if (P.on) { const t = performance.now(); ZROW_PH = (ZROW_PH + (t - ZROW_T) / 2400) % 1; ZROW_T = t; } else ZROW_T = performance.now();
  const done = st.where === 'past' || lit >= band + 1 ? nc : st.where === 'now' && Math.floor(lit) === band ? Math.floor(ZROW_PH * nc) : 0;
  const rng = rngOf(r * 977 + cin), wv = [], av = [];
  for (let i = 0; i < nc; i++) { wv.push(Math.round((rng() * 2 - 1) * 7) / 7); av.push(rng() * 2 - 1); }
  text(x, L(`w · row ${num(r + 1)} of ${nm}, ${num(cin)} weights`, `w · fila ${num(r + 1)} de ${nm}, ${num(cin)} pesos`), lx, wY - 10, C.li, 'left', 9.5, 600);
  text(x, L(`x · the ${num(cin)} activations of this token`, `x · las ${num(cin)} activaciones de este token`), lx, aY - 7, C.cy, 'left', 9.5, 600);
  text(x, L('w × x · one multiply each', 'w × x · una multiplicación cada uno'), lx, pY - 7, C.hot, 'left', 9.5, 600);
  const blk = S.quant === 'F16' ? 0 : 32;
  for (let i = 0; i < nc; i++) {
    const X = lx + i * cw;
    x.fillStyle = `rgba(185,162,242,${(.2 + .75 * Math.abs(wv[i])).toFixed(2)})`; x.fillRect(X, wY, cw - 1, cw);
    x.fillStyle = `rgba(127,227,255,${(.2 + .75 * Math.abs(av[i])).toFixed(2)})`; x.fillRect(X, aY, cw - 1, cw);
    x.fillStyle = i < done ? `rgba(255,212,59,${(.25 + .75 * Math.abs(wv[i] * av[i])).toFixed(2)})` : 'rgba(255,255,255,.04)'; x.fillRect(X, pY, cw - 1, cw);
    if (i === done && done < nc && st.where === 'now') { x.strokeStyle = C.hot; x.lineWidth = 1.5; x.strokeRect(X - 1, wY - 2, cw + 1, pY + cw - wY + 4); x.lineWidth = 1; }
    if (blk && i % blk === 0) { x.fillStyle = C.ink; x.fillRect(X, wY - 4, 1.5, 3); }
    hit(id, [X, wY, cw - 1, cw], { k: 'zw', i });
  }
  if (nc < cin) { text(x, L(`… ${num(cin - nc)} more`, `… ${num(cin - nc)} más`), lx + nc * cw + 4, aY + cw - 4, C.dim, 'left', 9.5); }

  // the sum: all products added into one output number
  const sumX = lx, sumW = Math.min(nc * cw, 260), sum = wv.reduce((s2, v, i) => s2 + (i < done ? v * av[i] : 0), 0);
  x.strokeStyle = 'rgba(255,212,59,.5)'; x.beginPath(); x.moveTo(lx, pY + cw + 4); x.lineTo(lx + nc * cw - 1, pY + cw + 4); x.moveTo(lx + Math.min(nc * cw, sumW) / 2, pY + cw + 4); x.lineTo(lx + sumW / 2, sY - 2); x.stroke();
  x.fillStyle = 'rgba(255,212,59,.12)'; x.fillRect(sumX, sY, sumW, 30); x.strokeStyle = C.hot; x.strokeRect(sumX + .5, sY + .5, sumW - 1, 29);
  text(x, L(`y[${num(r + 1)}] = Σ w·x = ${dec(sum.toFixed(3))}`, `y[${num(r + 1)}] = Σ w·x = ${dec(sum.toFixed(3))}`), sumX + 10, sY + 19, C.hot, 'left', 11.5, 700);
  const nd = done >= nc ? (st.where === 'now' ? Math.round(cin * (lit - band)) : cin) : done;
  const hp = textWrap(x, L(`${num(Math.min(cin, nd))} of ${num(cin)} products added · values illustrative, sizes exact`, `${num(Math.min(cin, nd))} de ${num(cin)} productos sumados · valores ilustrativos, tamaños exactos`), lx, sY + 48, avail, C.dim, 9.5);
  if (blk) textWrap(x, L(`Ticks over w: every ${blk} weights share one scale, which is part of the ${dec(q.bpw)} bits per weight of ${S.quant}.`, `Marcas sobre w: cada ${blk} pesos comparten una escala, que es parte de los ${dec(q.bpw)} bits por peso de ${S.quant}.`), lx, sY + 50 + hp, avail, C.dim, 9.5);
  const rb = cin * q.bpw / 8, fpb = 2 * ntok / (q.bpw / 8), bal = machineBalance();
  const fy = zFacts(x, W - side, top - 8, side - 8, [
    [L('Multiplies and adds', 'Multiplicaciones y sumas'), `${num(cin)} + ${num(cin)} = ${num(2 * cin)} FLOP`],
    [L('Bytes read for them', 'Bytes leídos para ello'), B(rb)],
    [pre ? L(`Shared by ${num(ntok)} prompt tokens`, `Compartido por ${num(ntok)} tokens del prompt`) : L('For one token', 'Para un token'), `${num(Math.round(fpb))} FLOP/B`, fpb < bal ? C.cy : C.hot],
    [L('This machine could do', 'Esta máquina podría hacer'), `${num(Math.round(bal))} FLOP/B`],
    [L('Rows like this per pass', 'Filas así por pasada'), L(`${num(cout)} here, every matrix, ${R.m.layers} layers`, `${num(cout)} aquí, cada matriz, ${R.m.layers} capas`)],
  ]);
  textWrap(x, fpb < bal ? L('So decode waits on memory: each byte brings two operations.', 'Por eso el decode espera a la memoria: cada byte trae dos operaciones.') : L('So prefill keeps the units busy: each byte serves many tokens.', 'Por eso el prefill mantiene ocupadas las unidades: cada byte sirve a muchos tokens.'), W - side, fy + 2, side - 8, fpb < bal ? C.cy : C.hot, 10, 600);
  setCap('model', L('One row of one matrix: what every weight costs. Out, or Esc, goes back.', 'Una fila de una matriz: lo que cuesta cada peso. Salir, o Esc, vuelve.'));
}
function drawZExpert(x, id, W, H, f, st, n) {
  const sh = R.sh, mats = sh.expert, side = Math.min(250, W * .3), top = 84, X0 = 46, boxW = W - X0 - side - 60, boxH = H - top - 120;
  const sumIn = mats.reduce((s2, m2) => s2 + m2[1], 0), maxOut = Math.max(...mats.map(m2 => m2[2])), k = Math.min((boxW - mats.length * 24) / sumIn, boxH / maxOut);
  const tok = n.seg && (n.seg.k === 'decode' || n.seg.k === 'round') ? n.seg.tok : 0, picked = f.e < 0 || chosenExperts(tok, f.layer).includes(f.e);
  text(x, f.e < 0 ? L('The shared expert: every token reads it', 'El experto compartido: todo token lo lee') : picked ? L(`Expert ${f.e}: the router picked it for this token`, `Experto ${f.e}: el router lo eligió para este token`) : L(`Expert ${f.e}: not picked for this token, so not read`, `Experto ${f.e}: no elegido para este token, así que no se lee`), X0, top - 30, picked ? C.hot : C.mid, 'left', 11, 650);
  text(x, L('Its three matrices, to scale', 'Sus tres matrices, a escala'), X0, top - 14, C.dim, 'left', 9.5);
  let cx = X0;
  mats.forEach((m2, j) => {
    const w = Math.max(8, m2[1] * k), h = Math.max(8, m2[2] * k), pr = st.where === 'past' ? 1 : st.where === 'now' ? Math.max(0, Math.min(1, st.pr * mats.length - j)) : 0;
    fillKind(x, 'weights', cx, top, w, h, picked ? .3 : .12); fillKind(x, 'weights', cx, top, w, h * pr, .85);
    x.strokeStyle = picked ? C.li : 'rgba(185,162,242,.35)'; x.strokeRect(cx + .5, top + .5, w - 1, h - 1);
    text(x, m2[0], cx, top + h + 14, C.ink, 'left', 10, 650); text(x, `${num(m2[1])}×${num(m2[2])} · ${B(bytesOf(m2))}`, cx, top + h + 27, C.dim, 'left', 9);
    hit(id, [cx, top, w, h + 30], { k: 'zmat', layer: f.layer, name: m2[0], shape: m2, e: f.e });
    cx += w + 24;
  });
  const one = mats.reduce((s2, m2) => s2 + bytesOf(m2), 0);
  zFacts(x, W - side, top - 30, side - 8, [
    [L('One expert', 'Un experto'), B(one)],
    [L('Experts in this layer', 'Expertos en esta capa'), `${R.m.experts} + ${R.m.sharedExperts}`],
    [L('Read per token', 'Leídos por token'), `${R.m.expertsUsed} + ${R.m.sharedExperts} · ${B(one * (R.m.expertsUsed + R.m.sharedExperts))}`],
    [L('Stored', 'Guardados'), B(one * (R.m.experts + R.m.sharedExperts))],
    [L('Share read per token', 'Parte leída por token'), pct((R.m.expertsUsed + R.m.sharedExperts) / (R.m.experts + R.m.sharedExperts)), C.cy],
  ]);
  setCap('model', L('Mixture of experts: all stored, a few read. Out, or Esc, goes back.', 'Mezcla de expertos: todos guardados, unos pocos leídos. Salir, o Esc, vuelve.'));
}
function drawZTok(x, id, W, H, f) {
  const m = R.m, t = f.t, inC = Math.floor(tokensInCache(P.t)), kind = tokKind(t), written = t < inC, b1 = KV_TYPES[S.kv].bytes;
  const side = Math.min(250, W * .3), top = 104, lx = 64, blockW = Math.max(60, (W - lx - side - 60) / 2), rh = Math.max(1.2, Math.min(16, (H - top - 84) / m.layers));
  const kname = { sys: L('system prompt', 'prompt de sistema'), docs: L('documents', 'documentos'), q: L('question', 'pregunta'), ans: L('answer', 'respuesta') }[kind];
  const word = kind === 'ans' && SAMPLED[t - R.prompt] ? ` “${SAMPLED[t - R.prompt].word.trim()}”` : '';
  text(x, L(`Token ${num(t + 1)} · ${kname}${word}: what it leaves in each layer`, `Token ${num(t + 1)} · ${kname}${word}: lo que deja en cada capa`), lx, top - 46, C.ink, 'left', 11, 650);
  text(x, L(`K · ${m.kvHeads} heads × ${m.headDim} numbers`, `K · ${m.kvHeads} cabezas × ${m.headDim} números`), lx, top - 12, C.mid, 'left', 9.5, 600);
  text(x, L(`V · ${m.kvHeads} heads × ${m.headDim} numbers`, `V · ${m.kvHeads} cabezas × ${m.headDim} números`), lx + blockW + 20, top - 12, C.mid, 'left', 9.5, 600);
  const cols = Math.max(8, Math.floor(blockW / 3)), cwid = blockW / cols, col = TOKCOL[kind];
  let firstDelta = true;
  for (let i = 0; i < m.layers; i++) {
    const y = top + i * rh, attn = R.kinds[i] === 'attn' || m.kvLayers >= m.layers;
    if (rh >= 9 || i % 4 === 0) text(x, String(i + 1), lx - 8, y + Math.min(rh, 9), C.dim, 'right', 8.5);
    if (attn) {
      for (const bx of [lx, lx + blockW + 20]) {
        if (!written) { fillKind(x, 'kvres', bx, y, blockW, rh - 1); continue; }
        const rg = rngOf(t * 131 + i * 7 + bx);
        for (let c2 = 0; c2 < cols; c2++) { x.globalAlpha = .25 + .7 * rg(); x.fillStyle = col; x.fillRect(bx + c2 * cwid, y, Math.max(.8, cwid - .4), rh - 1); }
        x.globalAlpha = 1; for (let hh = 1; hh < m.kvHeads; hh++) { x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(bx + blockW * hh / m.kvHeads - .5, y, 1, rh - 1); }
      }
      hit(id, [lx, y, blockW * 2 + 20, rh], { k: 'zkv', layer: i });
    } else {
      x.strokeStyle = 'rgba(255,255,255,.07)'; x.setLineDash([2, 3]); x.strokeRect(lx + .5, y + .5, blockW * 2 + 19, Math.max(1, rh - 2)); x.setLineDash([]);
      if (firstDelta && rh >= 7) { text(x, L('DeltaNet layer: nothing per token, it folds the token into a fixed state', 'Capa DeltaNet: nada por token, pliega el token en un estado fijo'), lx + 6, y + rh - 2.5, C.faint, 'left', 8.5); firstDelta = false; }
    }
  }
  const perL = 2 * m.kvHeads * m.headDim * b1;
  zFacts(x, W - side, top - 46, side - 8, [
    [L('Per attention layer', 'Por capa de atención'), `2 × ${m.kvHeads} × ${m.headDim} × ${dec(b1)} B = ${B(perL)}`],
    [L(`× ${m.kvLayers} attention layers`, `× ${m.kvLayers} capas de atención`), B(perL * m.kvLayers), C.hot],
    [L('Layers that keep nothing per token', 'Capas que no guardan nada por token'), String(m.layers - m.kvLayers)],
    [L('Kept until', 'Se guarda hasta'), L('the request ends', 'que acaba la petición')],
    [L('Read again by', 'Lo vuelve a leer'), written ? L(`every later token: ${num(Math.max(0, inC - t - 1))} so far`, `cada token posterior: ${num(Math.max(0, inC - t - 1))} hasta ahora`) : L('every later token, once written', 'cada token posterior, cuando se escriba')],
    [L(`× num_ctx ${num(R.ctx)} reserved`, `× num_ctx ${num(R.ctx)} reservado`), B(perL * m.kvLayers * R.ctx)],
  ]);
  setCap('memory', L('One token’s keys and values, layer by layer; values illustrative, sizes exact. Out, or Esc, goes back.', 'Las claves y valores de un token, capa a capa; valores ilustrativos, tamaños exactos. Salir, o Esc, vuelve.'));
}
