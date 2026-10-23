// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Model as a grid: tokens across, layers up =====
// Each column is the prompt chunk or the answer token a pass carries; each row a layer. A done cell in an attention
// row is yellow because it left keys and values behind (the KV cache is the left side of every attention row); a done
// cell in a DeltaNet row is grey, computed and folded into that row's single state box at the end. The cell being
// computed glows; attention lights its row to the left (it reads everything before), DeltaNet points to its box.
function drawModelGrid(n) {
  const id = 'cModel', c = $(id), [W, H] = stageSize(), x = fit(c, W, H); hitReset(id);
  const m = R.m, kinds = R.kinds, chunks = R.segs.filter(q => q.k === 'prefill'), ans = R.segs.filter(q => q.k === 'decode' || q.k === 'round');
  const top = 46, bot = 40, lab = 66, boxW = m.kvLayers < m.layers ? 46 : 0, gx = lab, gw = W - lab - boxW - 14, rh = (H - top - bot) / m.layers;
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
      if (i < dl) { x.fillStyle = attn ? 'rgba(231,194,47,.8)' : 'rgba(150,150,170,.32)'; x.fillRect(col.x, y, w, h); }
      else { x.fillStyle = 'rgba(255,255,255,.035)'; x.fillRect(col.x, y, w, h); }
    }
    hit(id, [col.x, top, Math.max(2, col.w), H - top - bot], { k: 'gcol', s: R.segs.indexOf(col.seg) });
  }
  // the cell being computed, and what it reads
  if (cur && curL >= 0) {
    const col = cols.find(q => q.seg === cur), y = top + (m.layers - 1 - curL) * rh, attn = kinds[curL] === 'attn' || m.kvLayers >= m.layers;
    if (col) {
      if (attn) { x.fillStyle = 'rgba(127,227,255,.14)'; x.fillRect(gx, y - 1, col.x - gx, rh + 1); text(x, L('reads all of this row', 'lee toda esta fila'), Math.max(gx + 4, col.x - 130), y - 4, C.cy, 'left', 9.5, 600); }
      else if (boxW) { x.strokeStyle = C.cy; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(col.x + col.w, y + rh / 2); x.lineTo(W - boxW - 2, y + rh / 2); x.stroke(); x.setLineDash([]); }
      x.save(); x.shadowColor = C.cy; x.shadowBlur = 10; x.fillStyle = C.cy; x.fillRect(col.x - 1, y - 1, Math.max(3, col.w + 1), rh + 1); x.restore();
    }
  }
  // DeltaNet: one state box per row, the same size at every token
  if (boxW) { for (let i = 0; i < m.layers; i++) if (!(kinds[i] === 'attn')) { const y = top + (m.layers - 1 - i) * rh; fillKind(x, 'state', W - boxW, y + .5, boxW - 6, Math.max(.8, rh - 1), i === curL ? 1 : .55); }
    text(x, L('state', 'estado'), W - boxW, top - 4, '#3fd6c0', 'left', 9.5, 600); }
  // column labels
  if (chunks.length) { const x0 = cols[0].x, x1 = cols[chunks.length - 1].x + cwP; x.strokeStyle = C.cy; x.beginPath(); x.moveTo(x0, H - bot + 8); x.lineTo(x1, H - bot + 8); x.stroke(); textFit(x, chunks.length === 1 ? L('prompt: 1 chunk, all layers at once', 'prompt: 1 bloque, todas las capas a la vez') : L(`prompt: ${chunks.length} chunks of 512, all layers at once`, `prompt: ${chunks.length} bloques de 512, todas las capas a la vez`), x0, H - bot + 22, Math.max(80, Math.min(W - x0 - 8, x1 - x0 + 240)), C.cy, 'left', 10); }
  if (ans.length) { const x0 = cols[chunks.length].x, x1 = cols[cols.length - 1].x + cwA; x.strokeStyle = C.hot; x.beginPath(); x.moveTo(x0, H - bot + 8); x.lineTo(x1, H - bot + 8); x.stroke(); textFit(x, L(`answer: one column per token, ${num(ans.length)}`, `respuesta: una columna por token, ${num(ans.length)}`), x1, H - bot + 22, x1 - x0, C.hot, 'right', 10); }
  setCap('model', L('The model as a grid: each pass climbs one column through every layer; attention rows read the yellow cells to their left, DeltaNet rows fold everything into one box.', 'El modelo como cuadrícula: cada pasada sube una columna por todas las capas; las filas de atención leen las celdas amarillas a su izquierda, las DeltaNet lo pliegan todo en una caja.'));
  drawHover(id, x);
}
function modeSwitch(x, id, W) {
  const opts = [['grid', L('Grid', 'Cuadrícula')], ['stack', L('Matrices', 'Matrices')]]; x.font = `600 10.5px ${FONT}`;
  let X = W; for (const [k, l] of [...opts].reverse()) { const w = x.measureText(l).width + 18; X -= w; const on = (UI.modelMode || 'grid') === k; x.fillStyle = on ? C.hot : 'rgba(255,255,255,.04)'; x.fillRect(X, 2, w - 2, 20); x.strokeStyle = on ? C.hot : C.line2; x.strokeRect(X + .5, 2.5, w - 3, 19); text(x, l, X + (w - 2) / 2, 16, on ? '#0a0a0d' : C.mid, 'center', 10.5, 650); hit(id, [X, 2, w - 2, 20], { k: 'mmode', m: k }); X -= 2; }
}
