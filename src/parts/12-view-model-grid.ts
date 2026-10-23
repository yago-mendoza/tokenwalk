// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Model as a grid: tokens across, layers up =====
// Each column is the prompt chunk or the answer token a pass carries; each row a layer. A done cell in an attention
// row is yellow because it left keys and values behind (the KV cache is the left side of every attention row); a done
// cell in a DeltaNet row is grey, computed and folded into that row's single state box at the end. The cell being
// computed glows; attention lights its row to the left (it reads everything before), DeltaNet points to its box.
function drawModelGrid(n) {
  const id = 'cModel', c = $(id), [W, H] = stageSize(), x = fit(c, W, H); hitReset(id);
  const m = R.m, kinds = R.kinds, chunks = R.segs.filter(q => q.k === 'prefill'), ans = R.segs.filter(q => q.k === 'decode' || q.k === 'round');
  // The DeltaNet state box is drawn to scale with the KV cells: one layer's fixed state is worth this many tokens of one
  // attention layer's keys and values, at the same tokens per pixel as the prompt columns; capped (and said) if it cannot fit.
  const top = 46, bot = 40, lab = 66, gx = lab, gw0 = W - lab - 14, rh = (H - top - bot) / m.layers, nDn = m.layers - m.kvLayers;
  const boxTok = nDn > 0 && m.stateMB ? (m.stateMB * 1e6 / nDn) / Math.max(1, kvBytesPerToken(m, S.kv) / Math.max(1, m.kvLayers)) : 0;
  let boxW = 0, boxScaled = true;
  if (nDn > 0) { let g = gw0 - 46; for (let k = 0; k < 3; k++) { const pxTok = chunks.length ? Math.min(28, g * .42 / chunks.length) / 512 : ans.length ? Math.max(.6, (g - 10) / ans.length) : 0; const want = boxTok * pxTok + 6; boxW = Math.max(12, Math.min(gw0 * .22, want)); boxScaled = want <= gw0 * .22 && want >= 12; g = gw0 - boxW; } }
  const gw = gw0 - boxW;
  const cwP = chunks.length ? Math.min(28, gw * .42 / chunks.length) : 0, cwA = ans.length ? Math.max(.6, (gw - chunks.length * cwP - 10) / ans.length) : 0;
  const cols = [...chunks.map(q => ({ seg: q, w: cwP })), ...ans.map(q => ({ seg: q, w: cwA }))];
  let cx = gx; cols.forEach((col, i) => { col.x = cx; cx += col.w + (i === chunks.length - 1 ? 10 : 0); });
  const cur = n.seg && (n.seg.k === 'prefill' || n.seg.k === 'decode' || n.seg.k === 'round') ? n.seg : null, curL = cur && n.layer >= 0 && !n.head ? n.layer : -1;
  const doneLayers = q => P.t >= q.a + q.d - 1e-12 ? m.layers : q === cur ? (n.head ? m.layers : Math.max(0, n.layer)) : 0;
  // titles and the mode switch
  text(x, L('Tokens across, layers up', 'Tokens a lo ancho, capas hacia arriba'), 0, 14, C.ink, 'left', 11.5, 650);
  if (isReal() && (LIVE.running || LIVE.toks.length)) { x.font = `650 11.5px ${FONT}`; const tw0 = x.measureText(L('Tokens across, layers up', 'Tokens a lo ancho, capas hacia arriba')).width; textFit(x, L(' · real tokens, layers interpolated within each real token', ' · tokens reales, capas interpoladas dentro de cada token real'), tw0 + 2, 14, W - tw0 - 6, C.cy, 'left', 10.5); }
  // row labels: the kind of each layer
  for (let i = 0; i < m.layers; i++) { const y = top + (m.layers - 1 - i) * rh, attn = kinds[i] === 'attn' || m.kvLayers >= m.layers; x.fillStyle = attn ? 'rgba(231,194,47,.75)' : 'rgba(63,214,192,.55)'; x.fillRect(lab - 10, y + .5, 5, Math.max(.8, rh - 1)); if (rh >= 9 || (i + 1) % 5 === 0 || i === 0) text(x, String(i + 1), lab - 14, y + Math.min(rh, 10) - .5, i === curL ? C.cy : C.dim, 'right', 9.5); }
  text(x, L('layer', 'capa'), 0, top + (H - top - bot) / 2, C.dim, 'left', 9.5);
  // cells
  for (const col of cols) {
    const dl = doneLayers(col.seg), w = Math.max(.6, col.w - (col.w > 3 ? 1 : 0));
    for (let i = 0; i < m.layers; i++) {
      const y = top + (m.layers - 1 - i) * rh, h = Math.max(.8, rh - (rh > 3 ? 1 : 0)), attn = kinds[i] === 'attn' || m.kvLayers >= m.layers;
      // the legend's own textures: KV cache for attention rows, a faint tint of the fixed state for DeltaNet rows (the solid box at the row end is the one state it keeps)
      if (i < dl) { if (attn) fillKind(x, 'kv', col.x, y, w, h); else fillKind(x, 'state', col.x, y, w, h, .35); }
      else { x.fillStyle = 'rgba(255,255,255,.035)'; x.fillRect(col.x, y, w, h); }
    }
    hit(id, [col.x, top, Math.max(2, col.w), H - top - bot], { k: 'gcol', s: R.segs.indexOf(col.seg) });
  }
  // the cell being computed, and what it reads
  if (cur && curL >= 0) {
    const col = cols.find(q => q.seg === cur), y = top + (m.layers - 1 - curL) * rh, attn = kinds[curL] === 'attn' || m.kvLayers >= m.layers;
    if (col) {
      const h = Math.max(.8, rh - (rh > 3 ? 1 : 0));
      if (attn) { x.fillStyle = 'rgba(127,227,255,.55)'; for (const q of cols) { if (q === col) break; if (doneLayers(q.seg) > curL) x.fillRect(q.x, y, Math.max(.6, q.w - (q.w > 3 ? 1 : 0)), h); } }
      textFit(x, attn ? L('reads the KV of every earlier token', 'lee la KV de todos los tokens anteriores') : L('reads and updates its state', 'lee y actualiza su estado'), gx, top - 4, Math.max(40, W - (boxW ? 130 : 0) - gx - 8), C.cy, 'left', 9.5, 600);
      x.save(); x.shadowColor = C.cy; x.shadowBlur = 10; x.fillStyle = C.cy; x.fillRect(col.x - 1, y - 1, Math.max(3, col.w + 1), rh + 1); x.restore();
    }
  }
  // DeltaNet: one state box per row, the same size at every token
  if (boxW) { for (let i = 0; i < m.layers; i++) if (!(kinds[i] === 'attn')) { const y = top + (m.layers - 1 - i) * rh, on = i === curL; fillKind(x, 'state', W - boxW, y + .5, boxW - 6, Math.max(.8, rh - 1), on ? 1 : .55); if (on) { x.fillStyle = 'rgba(127,227,255,.6)'; x.fillRect(W - boxW, y + .5, boxW - 6, Math.max(.8, rh - 1)); } }
    hit(id, [W - boxW, top, boxW - 6, H - top - bot], { k: 'gstate', scaled: boxScaled, tok: Math.round(boxTok) });
    if (curL < 0 || kinds[curL] === 'attn' || m.kvLayers >= m.layers) textFit(x, boxScaled ? L('state', 'estado') : L('state · not to scale', 'estado · sin escala'), W - 6, top - 4, 120, '#3fd6c0', 'right', 9.5, 600); }
  // column labels
  // The two captions never touch: each under its own block when both fit on one line, else two lines, else the short forms.
  { const cap = [];
    if (chunks.length) { const x0 = cols[0].x, x1 = cols[chunks.length - 1].x + cwP; x.strokeStyle = C.cy; x.beginPath(); x.moveTo(x0, H - bot + 8); x.lineTo(x1, H - bot + 8); x.stroke();
      cap.push({ x0, x1, col: C.cy, align: 'left', long: chunks.length === 1 ? L(`prompt: ${num(R.newTokens)} tokens read in 1 chunk`, `prompt: ${num(R.newTokens)} tokens leídos en 1 bloque`) : L(`prompt: ${num(R.newTokens)} tokens read in ${chunks.length} chunks of 512`, `prompt: ${num(R.newTokens)} tokens leídos en ${chunks.length} bloques de 512`), short: L(`prompt · ${chunks.length} × 512`, `prompt · ${chunks.length} × 512`) }); }
    if (ans.length) { const x0 = cols[chunks.length].x, x1 = cols[cols.length - 1].x + cwA; x.strokeStyle = C.hot; x.beginPath(); x.moveTo(x0, H - bot + 8); x.lineTo(x1, H - bot + 8); x.stroke();
      cap.push({ x0, x1, col: C.hot, align: 'right', long: L(`answer: one column per token, ${num(ans.length)}`, `respuesta: una columna por token, ${num(ans.length)}`), short: L(`answer · ${num(ans.length)} tokens`, `respuesta · ${num(ans.length)} tokens`) }); }
    x.font = `400 10px ${FONT}`; const wd = t => x.measureText(t).width;
    const span = (c, t) => c.align === 'left' ? [c.x0, c.x0 + wd(t)] : [c.x1 - wd(t), c.x1];
    const fitsOne = key => { if (cap.length < 2) return span(cap[0], cap[0][key])[1] <= W && span(cap[0], cap[0][key])[0] >= 0; const a = span(cap[0], cap[0][key]), b = span(cap[1], cap[1][key]); return a[1] + 14 <= b[0] && a[0] >= 0 && b[1] <= W; };
    let key = 'long', two = false;
    if (cap.length && !fitsOne('long')) { if (fitsOne('short')) key = 'short'; else { two = true; key = cap.every(c => wd(c.long) <= W) ? 'long' : 'short'; } }
    window.__GRIDCAP = [];
    cap.forEach((c, j) => { const y = H - bot + 22 + (two && j === 1 ? 13 : 0), t = c[key], X = two ? (c.align === 'left' ? 0 : W) : c.align === 'left' ? c.x0 : c.x1; text(x, t, X, y, c.col, c.align, 10); const sp = c.align === 'left' ? [X, X + wd(t)] : [X - wd(t), X]; window.__GRIDCAP.push([sp[0], y - 10, sp[1], y + 2]); });
  }
  setCap('model', L('The model as a grid: each pass climbs one column through every layer; attention rows read the KV cells to their left (cyan while read), DeltaNet rows read and update one fixed state box.' + (isReal() && (LIVE.running || LIVE.toks.length) ? ' Layers interpolated within each real token.' : ''), 'El modelo como cuadrícula: cada pasada sube una columna por todas las capas; las filas de atención leen las celdas KV a su izquierda (cian mientras se leen), las DeltaNet leen y actualizan una caja de estado fija.' + (isReal() && (LIVE.running || LIVE.toks.length) ? ' Capas interpoladas dentro de cada token real.' : '')));
  drawHover(id, x);
}
function modeSwitch(x, id, W) {
  const opts = [['grid', L('Grid', 'Cuadrícula')], ['stack', L('Matrices', 'Matrices')]]; x.font = `600 10.5px ${FONT}`;
  let X = W; for (const [k, l] of [...opts].reverse()) { const w = x.measureText(l).width + 18; X -= w; const on = (UI.modelMode || 'grid') === k; x.fillStyle = on ? C.hot : 'rgba(255,255,255,.04)'; x.fillRect(X, 2, w - 2, 20); x.strokeStyle = on ? C.hot : C.line2; x.strokeRect(X + .5, 2.5, w - 3, 19); text(x, l, X + (w - 2) / 2, 16, on ? '#0a0a0d' : C.mid, 'center', 10.5, 650); hit(id, [X, 2, w - 2, 20], { k: 'mmode', m: k }); X -= 2; }
}
