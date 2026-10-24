// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Memory view =====
function drawMemory(n) {
  const zfm = zTop('memory'); if (zfm) { drawZoomed('memory', n, zfm); return; }
  const id = 'cMemory', c = $(id), [W, H0] = stageSize(), { m, mc } = R;
  hitReset(id);
  const rows = m.kvLayers, rh = Math.max(1.2, Math.min(34, (H0 - 128 - 72) / rows)), gh = rows * rh, dl = m.layers - m.kvLayers;
  const H = H0, x = fit(c, W, H), inCache = tokensInCache(P.t);
  const cap = mc.kind === 'unified' ? mc.ramGB : mc.fastGB;
  const parts0 = mc.kind === 'unified' ? [['sys', SYSTEM_GB, 'sys'], ['weights', R.weights, 'weights'], ['kv', R.kvRes, 'kv'], ['state', R.state, 'state'], ['buf', R.buf, 'buf']] : [['weights', R.weights * R.pl.fastShare, 'weights'], ['kv', R.kvRes, 'kv'], ['state', R.state, 'state'], ['buf', R.buf, 'buf']];
  const used = parts0.reduce((s, p) => s + p[1], 0), sc = Math.max(cap, used);
  const lvl = (k, X, Y) => { x.fillStyle = C.hot; x.fillRect(X, Y - 9, 13, 12); text(x, k, X + 6.5, Y + 1, '#0a0a0d', 'center', 9, 700); };
  lvl('1', 0, 11); text(x, L(`${mc.kind === 'unified' ? 'RAM' : 'VRAM'} ${dec(fmtGB(cap))}, to scale`, `${mc.kind === 'unified' ? 'RAM' : 'VRAM'} ${dec(fmtGB(cap))}, a escala`), 19, 11, C.mid, 'left', 10.5, 600);
  // Parts too thin to see get 5 px; the free space pays for it. The KV sliver is then enlarged below through a funnel.
  // The bar is taller and every part is named above it, with its size and a thin elbow to its stretch.
  let cx = 0, kvX = 0, kvW = 0; const minW = 5, BY = 50, BH = 32, tags = [];
  const pname = { sys: L('Other apps', 'Otras apps'), weights: L('Weights', 'Pesos'), kv: L('KV cache', 'Caché KV'), state: L('DeltaNet state', 'Estado DeltaNet'), buf: L('Buffers', 'Buffers') };
  for (const [k0, v, part] of parts0) {
    const w = Math.max(v > 0 ? minW : 0, (v / sc) * W), sel = { k: 'part', id: part };
    if (v <= 0) continue;
    if (k0 === 'kv') { kvX = cx; kvW = w; }
    if (k0 === 'kv') { fillKind(x, 'kvres', cx, BY, w, BH); kvKinds(x, cx, BY, w, BH, inCache); } else fillKind(x, k0, cx, BY, Math.max(.5, w - 1), BH);
    outlineSel(x, sel, cx, BY, Math.max(1, w - 1), BH); hit(id, [cx, BY, Math.max(3, w), BH], sel);
    tags.push([pname[k0], fmtGB(v), cx + w / 2, k0 === 'kv' ? C.hot : k0 === 'weights' ? C.li : k0 === 'state' ? '#3fd6c0' : C.mid]); cx += w;
  }
  if (used < cap) { fillKind(x, 'free', cx, BY, W - cx, BH); hit(id, [cx, BY, W - cx, BH], { k: 'part', id: 'free' }); tags.push([L('Free', 'Libre'), fmtGB(cap - used), (cx + W) / 2, C.dim]); }
  else tags.push([L('Over by', 'Se pasa en'), fmtGB(used - cap), W - 30, C.red]);
  // Labels spread so none touch, each as close to its part as it can, tied back by a thin elbow. One row when they fit;
  // two alternating rows when they do not; short names when even that is too tight.
  { const SHORT: Record<string, string> = { [L('Other apps', 'Otras apps')]: L('Apps', 'Apps'), [L('DeltaNet state', 'Estado DeltaNet')]: L('State', 'Estado'), [L('KV cache', 'Caché KV')]: 'KV', [L('Over by', 'Se pasa en')]: L('Over', 'Exceso') };
    const gap = 12, meas = (short: boolean) => tags.map(([nm0, val, mid, col]: any) => { const nm = short ? SHORT[nm0] || nm0 : nm0; x.font = `400 10.5px ${FONT}`; const nw = x.measureText(nm + ' ').width; x.font = `650 10.5px ${FONT}`; return { nm, val, mid, col, nw, lw: nw + x.measureText(dec(val)).width + 4, x0: 0, y: 0 }; }).sort((p1: any, p2: any) => p1.mid - p2.mid);
    const spread = (row: any[]) => { row.forEach((q, i) => { q.x0 = Math.max(0, Math.min(W - q.lw, q.mid - q.lw / 2)); if (i) q.x0 = Math.max(q.x0, row[i - 1].x0 + row[i - 1].lw + gap); });
      for (let i = row.length - 1; i >= 0; i--) { const lim = i === row.length - 1 ? W - row[i].lw : row[i + 1].x0 - row[i].lw - gap; if (row[i].x0 > lim) row[i].x0 = lim; }
      return row.every(q => q.x0 >= 0); };
    const total = (it: any[]) => it.reduce((a2, q) => a2 + q.lw + gap, 0);
    let it = meas(false), rows: any[][];
    if (total(it) <= W) rows = [it]; else { it = total(it) <= W * 1.9 ? it : meas(true); rows = [it.filter((_: any, i: number) => i % 2 === 0), it.filter((_: any, i: number) => i % 2 === 1)]; if (!rows.every(spread)) { it = meas(true); rows = [it.filter((_: any, i: number) => i % 2 === 0), it.filter((_: any, i: number) => i % 2 === 1)]; } }
    rows.forEach((row, r) => { spread(row); row.forEach(q => { q.x0 = Math.max(0, q.x0); q.y = rows.length === 1 ? 34 : r === 0 ? 26 : 41; }); });
    for (const q of rows.flat()) {
      const ax = Math.max(q.x0 + 2, Math.min(q.x0 + q.lw - 2, q.mid)), LY = q.y;
      x.strokeStyle = q.col; x.globalAlpha = .8; x.beginPath(); x.moveTo(Math.round(q.mid) + .5, BY - .5); x.lineTo(Math.round(q.mid) + .5, LY + 6); x.lineTo(Math.round(ax) + .5, LY + 6); x.lineTo(Math.round(ax) + .5, LY + 4); x.stroke(); x.beginPath(); x.moveTo(q.x0, LY + 3.5); x.lineTo(q.x0 + q.lw, LY + 3.5); x.stroke(); x.globalAlpha = 1;
      x.font = `400 10.5px ${FONT}`; x.fillStyle = C.mid; x.textAlign = 'left'; x.fillText(q.nm, q.x0, LY); x.font = `650 10.5px ${FONT}`; x.fillStyle = q.col === C.mid || q.col === C.dim ? C.ink : q.col; x.fillText(dec(q.val), q.x0 + q.nw, LY);
    } }
  const gy = 128, bins = Math.max(8, Math.min(96, Math.floor(W / 8))), per = R.ctx / bins, gw = W, cw = gw / bins;
  // funnel: the sliver in the bar, magnified into the grid
  if (kvW > 0) { const fy0 = BY + BH + 1, fy1 = gy - 20; x.fillStyle = 'rgba(255,212,59,.06)'; x.beginPath(); x.moveTo(kvX, fy0); x.lineTo(kvX + kvW, fy0); x.lineTo(gw, fy1); x.lineTo(0, fy1); x.closePath(); x.fill(); x.strokeStyle = 'rgba(255,212,59,.45)'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(kvX, fy0); x.lineTo(0, fy1); x.moveTo(kvX + kvW, fy0); x.lineTo(gw, fy1); x.stroke(); x.setLineDash([]); x.strokeStyle = C.hot; x.strokeRect(kvX - .5, BY - .5, kvW + 1, BH + 1); }
  const zoom2 = kvW > 0 ? gw / Math.max(.01, (R.kvRes / sc) * W) : 1, zf = v => v >= 10 ? num(Math.round(v)) : dec(v.toFixed(1));
  lvl('2', 0, gy - 8); textFit(x, L(`The yellow box ×${zf(zoom2)}: the KV cache, ${B(R.kvRes * 1e9)} · a row per attention layer, a column per ${num(Math.round(per))} tokens`, `Caja amarilla ×${zf(zoom2)}: caché KV, ${B(R.kvRes * 1e9)} · fila por capa de atención, columna por ${num(Math.round(per))} tokens`), 19, gy - 8, gw - 19, C.mid, 'left', 10);
  for (let r = 0; r < rows; r++) for (let b = 0; b < bins; b++) {
    const X = b * cw, Y = gy + (rows - 1 - r) * rh, rin = kvRowFill(r, n, inCache), f = Math.max(0, Math.min(1, (rin - b * per) / per)), cachedCol = (b + .5) * per < R.startAt;
    fillKind(x, 'kvres', X, Y, cw - 1, rh - 1); if (f > 0) { fillKind(x, 'kv_' + tokKind((b + .5) * per), X, Y, (cw - 1) * f, rh - 1); if (cachedCol) { x.fillStyle = C.cy; x.fillRect(X, Y, (cw - 1) * f, 1.5); } }
    if (r === 0) hit(id, [X, gy, cw, gh], { k: 'kvbin', b, per });
  }
  if (inCache >= R.ctx - .5) text(x, L('full', 'llena'), gw - 2, gy + gh + 12, C.red, 'right', 9, 600);
  // Level 3 is a magnifier on level 2: it follows the pointer over the grid, or the newest token while writing.
  // It sits beside the column it enlarges, never on it, and shows one column per token.
  const last = Math.floor(inCache), zn = 10, zc = 16, pt = UI.ptr && UI.ptr.cid === id && UI.ptr.y >= gy && UI.ptr.y <= gy + gh ? UI.ptr : null;
  const writing = n.seg && (n.seg.k === 'decode' || n.seg.k === 'round');
  let t0 = null; if (pt) t0 = Math.max(0, Math.min(R.ctx - zn, Math.floor(pt.x / cw * per) - (zn >> 1))); else if (writing && last > 0) t0 = Math.max(0, last - zn);
  if (t0 !== null) {
    const srcB = Math.min(bins - 1, Math.floor((t0 + zn / 2) / per)), sx = srcB * cw, lw = zn * zc + 12, lh = gh + 30;
    let lx = sx + cw + 22; if (lx + lw > W) lx = sx - 22 - lw; lx = Math.max(0, lx); const ly = gy - 8;
    x.strokeStyle = 'rgba(255,212,59,.75)'; x.strokeRect(sx - .5, gy - 1.5, cw, gh + 2);
    x.beginPath(); x.moveTo(lx > sx ? sx + cw : sx, gy + gh / 2); x.lineTo(lx > sx ? lx : lx + lw, gy + gh / 2); x.stroke();
    x.save(); x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = 18; x.fillStyle = '#121218'; x.fillRect(lx, ly, lw, lh); x.restore(); x.strokeStyle = C.hot; x.strokeRect(lx + .5, ly + .5, lw - 1, lh - 1);
    lvl('3', lx + 6, ly + 13); text(x, `×${zf(zc / (cw / per))}`, lx + 23, ly + 13, C.hot, 'left', 10, 700);
    textFit(x, `${num(t0 + 1)}–${num(t0 + zn)}`, lx + lw - 6, ly + 13, lw - 62, C.mid, 'right', 9.5);
    for (let r = 0; r < rows; r++) for (let j = 0; j < zn; j++) {
      const tk = t0 + j, X = lx + 6 + j * zc, Y = ly + 22 + (rows - 1 - r) * ((lh - 28) / rows), hh = (lh - 28) / rows - 1;
      if (tk >= kvRowFill(r, n, inCache)) fillKind(x, 'kvres', X, Y, zc - 1, hh); else fillKind(x, 'kv_' + tokKind(tk), X, Y, zc - 1, hh);
      if (r === 0) hit(id, [X, ly + 22, zc, lh - 28], { k: 'kvtok', t: tk });
    }
    if (writing && !pt) { const j = last - 1 - t0; if (j >= 0 && j < zn) { x.save(); x.strokeStyle = C.cy; x.lineWidth = 2; x.shadowColor = C.cy; x.shadowBlur = 6; x.strokeRect(lx + 6 + j * zc - 1, ly + 21, zc + 1, lh - 26); x.restore(); } }
  }
  const sy = gy + gh + 44;
  if (dl > 0) {
    textFit(x, L(`DeltaNet state · ${dl} layers · ${B(m.stateMB * 1e6)}, fixed size`, `Estado DeltaNet · ${dl} capas · ${B(m.stateMB * 1e6)}, tamaño fijo`), 0, sy - 8, W, C.mid, 'left', 9.5);
    const sw = Math.min(16, W / dl);
    for (let i = 0; i < dl; i++) { fillKind(x, 'state', i * sw, sy, sw - 2, 14); }
    hit(id, [0, sy, dl * sw, 14], { k: 'part', id: 'state' });
  } else text(x, L('Every layer keeps KV: this model has no fixed-size state.', 'Todas las capas guardan KV: este modelo no tiene estado de tamaño fijo.'), 0, sy, C.dim, 'left', 9.5);
  const per1 = kvBytesPerToken(m, S.kv);
  setCap('memory', L(`Per token: 2 × ${m.kvLayers} layers × ${m.kvHeads} KV heads × ${m.headDim} × ${KV_TYPES[S.kv].bytes} bytes = ${num(per1)} bytes. Filled: ${num(Math.floor(inCache))} tokens, ${B(per1 * inCache)} of the ${B(per1 * R.ctx)} reserved.`, `Por token: 2 × ${m.kvLayers} capas × ${m.kvHeads} cabezas KV × ${m.headDim} × ${dec(KV_TYPES[S.kv].bytes)} bytes = ${num(per1)} bytes. Lleno: ${num(Math.floor(inCache))} tokens, ${B(per1 * inCache)} de los ${B(per1 * R.ctx)} reservados.`));
  drawHover(id, x);
}

function gaugeArc(x, w, h, v, zones, needle2, labelL, labelR) {
  const cx = w / 2, cy = h - 6, r = Math.min(w / 2 - 6, h - 12), a0 = Math.PI, a1 = 2 * Math.PI;
  x.lineWidth = 6; x.lineCap = 'butt';
  for (const [z0, z1, col] of zones) { x.strokeStyle = col; x.beginPath(); x.arc(cx, cy, r, a0 + (a1 - a0) * z0, a0 + (a1 - a0) * z1); x.stroke(); }
  x.lineWidth = 1;
  const nd = (val, col, len) => { const a = a0 + (a1 - a0) * Math.max(0, Math.min(1, val)); x.strokeStyle = col; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * r * len, cy + Math.sin(a) * r * len); x.stroke(); x.lineWidth = 1; };
  if (needle2 !== undefined && needle2 !== null) nd(needle2, C.dim, .78);
  nd(v, C.ink, .92); x.fillStyle = C.ink; x.beginPath(); x.arc(cx, cy, 3, 0, 7); x.fill();
  if (labelL) text(x, labelL, cx - r, h, C.faint, 'center', 8);
  if (labelR) text(x, labelR, cx + r, h, C.faint, 'center', 8);
}
function hbar(x, X, Y, w, h, parts, cap, label) {
  const used = parts.reduce((s, p) => s + p[1], 0), sc = Math.max(cap, used); let cx = X;
  for (const [kind, v] of parts) { const pw = (v / sc) * w; fillKind(x, kind, cx, Y, Math.max(0, pw - .5), h); cx += pw; }
  if (used < cap) fillKind(x, 'free', cx, Y, X + w - cx, h);
  else { x.strokeStyle = C.red; x.lineWidth = 2; x.beginPath(); x.moveTo(X + (cap / sc) * w, Y - 2); x.lineTo(X + (cap / sc) * w, Y + h + 2); x.stroke(); x.lineWidth = 1; }
  if (label) text(x, label, X, Y - 3, C.dim, 'left', 8.5);
}
const LV = { nominal: 'nominal', caution: 'caution', critical: 'critical', idle: '' };
function machineBalance() { return (R.mc.tflops * 1e12) / (R.mc.bw * 1e9); }
const INSTR = [
  { id: 'fit', label: () => L('Fit check', 'Cabe o no'),
    level: () => { const need = R.weights + R.kvRes + R.state + R.buf; if (R.mc.kind === 'unified' && need + sysGB() > R.mc.ramGB) return 'critical'; if (R.pl.fastShare < .999) return 'critical'; if (R.mc.kind === 'unified' && S.machine !== 'thinkpadCpu' && need > R.mc.fastGB) return 'caution'; return 'nominal'; },
    val: () => { const need = R.weights + R.kvRes + R.state + R.buf; return R.mc.kind === 'unified' ? L(`<b>${dec(fmtGB(need + sysGB()))}</b> of ${dec(fmtGB(R.mc.ramGB))}`, `<b>${dec(fmtGB(need + sysGB()))}</b> de ${dec(fmtGB(R.mc.ramGB))}`) : L(`<b>${dec(fmtGB(need))}</b> of ${dec(fmtGB(R.mc.fastGB))} VRAM`, `<b>${dec(fmtGB(need))}</b> de ${dec(fmtGB(R.mc.fastGB))} VRAM`); },
    draw: (x, w, h) => {
      const mc = R.mc, model = [['weights', R.weights * (mc.kind === 'unified' ? 1 : R.pl.fastShare)], ['kv', R.kvRes], ['state', R.state], ['buf', R.buf]];
      if (mc.kind === 'unified') { hbar(x, 0, 12, w, 12, [['sys', sysGB()], ...model], mc.ramGB, 'RAM'); hbar(x, 0, 40, w, 12, model, mc.fastGB, L('usable by the GPU', 'usable por la GPU')); }
      else { hbar(x, 0, 12, w, 12, model, mc.fastGB, 'VRAM'); hbar(x, 0, 40, w, 12, [['sys', sysGB() / 2], ['spill', R.weights * (1 - R.pl.fastShare)]], mc.ramGB, 'RAM'); }
    },
    info: () => [L('Whether everything the request needs fits: system and apps, weights, the KV cache reserved for num_ctx, the recurrent state and the buffers, against the RAM and against what the GPU may use.', 'Si cabe todo lo que la petición necesita: sistema y apps, pesos, la caché KV reservada para num_ctx, el estado recurrente y los buffers, frente a la RAM y frente a lo que puede usar la GPU.'),
      L('A model that does not fit is checked before play: the system pages to disk, or part of the model moves to the CPU, or a card spills layers to system RAM over PCIe.', 'Un modelo que no cabe se ve antes de pulsar: el sistema pagina a disco, parte del modelo pasa a la CPU, o una tarjeta desborda capas a la RAM por PCIe.'),
      L('Model size and weight format, num_ctx and KV type, the machine’s memory.', 'Tamaño del modelo y formato de pesos, num_ctx y tipo de KV, la memoria de la máquina.')] },
  { id: 'bw', label: () => L('Bandwidth', 'Ancho de banda'),
    level: () => (R.tps < READING[0] ? 'critical' : R.tps < READING[1] ? 'caution' : 'nominal'),
    val: () => L(`<b>${B(R.mid.bytesGB * 1e9)}</b>/token over ${dec(R.mc.bw.toFixed(0))} GB/s`, `<b>${B(R.mid.bytesGB * 1e9)}</b>/token sobre ${dec(R.mc.bw.toFixed(0))} GB/s`),
    draw: (x, w, h) => { const ceil = R.mc.bw / R.mid.bytesGB; gaugeArc(x, w, h, R.tps / ceil, [[0, 1, 'rgba(190,170,255,.18)'], [0, R.tps / ceil, C.cy]], null, '0', dec(ceil.toFixed(ceil < 10 ? 1 : 0))); text(x, dec(`${R.tps.toFixed(R.tps < 10 ? 1 : 0)} tok/s`), w / 2, h - 18, C.ink, 'center', 10, 700); },
    info: () => [L('Bytes read per generated token (the weights a token passes through plus the KV cache it attends to) set against the memory bandwidth. The arc runs from zero to the ceiling, bandwidth divided by bytes per token; the needle is the calibrated speed.', 'Bytes leídos por token generado (los pesos por los que pasa más la caché KV a la que atiende) frente al ancho de banda de memoria. El arco va de cero al techo, ancho de banda entre bytes por token; la aguja es la velocidad calibrada.'),
      L('Decode is memory-bound: every token reads all its active weights for very little arithmetic, so speed is roughly bandwidth over bytes.', 'El decode está limitado por memoria: cada token lee todos sus pesos activos para muy poca aritmética, así que la velocidad es más o menos ancho de banda entre bytes.'),
      L('Active parameters (dense or MoE), bits per weight, context length, the bus width and transfer rate.', 'Parámetros activos (denso o MoE), bits por peso, longitud del contexto, ancho y velocidad del bus.')] },
  { id: 'compute', label: () => L('Compute use', 'Uso de cómputo'),
    level: () => '',
    val: () => { const n = now(), u = utilNow(n); return n.seg ? L(`<b>${pct(u)}</b> busy now`, `<b>${pct(u)}</b> ocupado ahora`) : L(`decode <b>${pct(utilDecode())}</b> · prefill <b>${pct(utilPrefill())}</b>`, `decode <b>${pct(utilDecode())}</b> · prefill <b>${pct(utilPrefill())}</b>`); },
    draw: (x, w, h) => { const n = now(); gaugeArc(x, w, h, n.seg ? utilNow(n) : utilPrefill(), [[0, 1, 'rgba(190,170,255,.18)']], utilDecode(), '0', '100%'); text(x, n.seg ? '' : L('prefill / decode', 'prefill / decode'), w / 2, h - 18, C.dim, 'center', 8.5); },
    info: () => [L('How much of the time the compute units spend multiplying, against waiting for numbers to arrive. White needle: now (or prefill when stopped); grey needle: decode.', 'Qué parte del tiempo pasan las unidades de cómputo multiplicando, frente a esperar a que lleguen los números. Aguja blanca: ahora (o el prefill si está parado); gris: decode.'),
      L('Prefill keeps them busy because each weight read serves 512 tokens; decode leaves them mostly idle because each weight read serves one.', 'El prefill las mantiene ocupadas porque cada peso leído sirve a 512 tokens; el decode las deja casi paradas porque cada peso leído sirve a uno.'),
      L('The phase, the machine’s TFLOPS and bandwidth, batching (one sequence here).', 'La fase, los TFLOPS y el ancho de banda de la máquina, el batching (aquí una secuencia).')] },
  { id: 'intensity', label: () => L('Arithmetic intensity', 'Intensidad aritmética'),
    level: () => '',
    val: () => { const n = now(), dec1 = intensity('decode'), bal = machineBalance(); const ph = n.seg && n.seg.k === 'prefill' ? 'prefill' : 'decode', v = intensity(ph); return L(`${ph} <b>${num(v)}</b> FLOP/B · ${v < bal ? 'memory-bound' : 'compute-bound'}`, `${ph} <b>${num(v)}</b> FLOP/B · ${v < bal ? 'limitado por memoria' : 'limitado por cómputo'}`); },
    draw: (x, w, h) => {
      const lg = v => Math.max(0, Math.min(1, (Math.log10(Math.max(.1, v)) + 1) / 5)), bal = machineBalance();
      const y = 30; x.fillStyle = 'rgba(127,227,255,.12)'; x.fillRect(0, y - 6, lg(bal) * w, 12); x.fillStyle = 'rgba(255,212,59,.12)'; x.fillRect(lg(bal) * w, y - 6, w - lg(bal) * w, 12);
      x.strokeStyle = C.hot; x.lineWidth = 2; x.beginPath(); x.moveTo(lg(bal) * w, y - 10); x.lineTo(lg(bal) * w, y + 10); x.stroke(); x.lineWidth = 1;
      text(x, L('balance', 'equilibrio'), lg(bal) * w, y - 13, C.hot, lg(bal) > .8 ? 'right' : 'center', 8.5);
      const pin = (v, lbl, col) => { const px = lg(v) * w; x.fillStyle = col; x.beginPath(); x.moveTo(px, y + 4); x.lineTo(px - 4, y + 12); x.lineTo(px + 4, y + 12); x.fill(); text(x, lbl, Math.min(w - 2, Math.max(2, px)), y + 23, col, px < 20 ? 'left' : px > w - 20 ? 'right' : 'center', 8.5); };
      pin(intensity('decode'), 'decode', C.cy); pin(intensity('prefill'), 'prefill', C.li);
      text(x, L('memory', 'memoria'), 0, 10, C.faint, 'left', 8); text(x, L('compute', 'cómputo'), w, 10, C.faint, 'right', 8);
    },
    info: () => [L('Arithmetic per byte read from memory (FLOP per byte), on a log scale from 0.1 to 10,000. The yellow mark is this machine’s balance point, TFLOPS over bandwidth: below it a workload waits on memory, above it on arithmetic.', 'Aritmética por byte leído de memoria (FLOP por byte), en escala logarítmica de 0,1 a 10.000. La marca amarilla es el punto de equilibrio de esta máquina, TFLOPS entre ancho de banda: por debajo una carga espera a la memoria, por encima a la aritmética.'),
      L('It explains the two phases in one picture: decode sits near 2 operations per weight byte, far below balance; a prefill chunk of 512 tokens sits hundreds of times higher.', 'Explica las dos fases en una imagen: el decode está cerca de 2 operaciones por byte de peso, muy por debajo del equilibrio; un bloque de prefill de 512 tokens está cientos de veces más arriba.'),
      L('Tokens per pass (prefill chunk, speculative verification, batching), bits per weight, the machine.', 'Tokens por pasada (bloque de prefill, verificación especulativa, batching), bits por peso, la máquina.')] },
  { id: 'ttft', label: () => L('Time to first token', 'Hasta el primer token'),
    level: () => (R.ttft >= 30 ? 'critical' : R.ttft >= 5 ? 'caution' : 'nominal'),
    val: () => [R.load ? L(`load ${S_(R.load)}`, `carga ${S_(R.load)}`) : '', R.restore ? L(`KV disk ${S_(R.restore)}`, `KV disco ${S_(R.restore)}`) : '', `prefill ${S_(R.prefill)}`].filter(Boolean).join(' + '),
    draw: (x, w, h) => { text(x, S_(R.ttft), 0, 30, levelColor(INSTR[4].level()), 'left', 22, 700); const tot = R.ttft || 1; let cx = 0; for (const [v, k] of [[R.load, 'weights'], [R.restore, 'kv'], [R.prefill, 'cy']]) { const pw = (v / tot) * w; if (k === 'cy') { x.fillStyle = C.cy; x.fillRect(cx, 42, Math.max(0, pw - 1), 8); } else fillKind(x, k, cx, 42, Math.max(0, pw - 1), 8); cx += pw; } },
    info: () => [L('Seconds from sending the request to the first word: loading the model if it was not in memory, restoring a saved KV cache if there is one, and prefill, reading the whole prompt.', 'Segundos desde que envías la petición hasta la primera palabra: cargar el modelo si no estaba en memoria, restaurar una caché KV guardada si la hay, y el prefill, leer el prompt entero.'),
      L('If it is slow to start, it is prefill (or loading). Long prompts, RAG documents and patient histories make it grow; prefix caching and saved KV caches remove most of it.', 'Si tarda en empezar, es el prefill (o la carga). Los prompts largos, los documentos RAG y las historias clínicas lo hacen crecer; el prefix caching y las cachés KV guardadas eliminan casi todo.'),
      L('Prompt length, the machine’s compute, keep_alive, prefix cache, KV on disk.', 'Longitud del prompt, el cómputo de la máquina, keep_alive, caché de prefijo, KV en disco.')] },
  { id: 'tps', label: () => L('Writing speed', 'Velocidad de escritura'),
    level: () => (R.tps < READING[0] ? 'critical' : R.tps < READING[1] ? 'caution' : 'nominal'),
    val: () => L(`reading band ${READING[0]} to ${READING[1]} tok/s`, `banda de lectura ${READING[0]} a ${READING[1]} tok/s`),
    draw: (x, w, h) => { text(x, dec(`${R.tps.toFixed(R.tps < 10 ? 1 : 0)} tok/s`), 0, 30, levelColor(INSTR[5].level()), 'left', 22, 700); const mx = Math.max(20, R.tps * 1.25), X = v => (Math.min(v, mx) / mx) * w; x.fillStyle = 'rgba(190,170,255,.12)'; x.fillRect(0, 44, w, 6); x.fillStyle = 'rgba(255,181,71,.35)'; x.fillRect(X(READING[0]), 41, X(READING[1]) - X(READING[0]), 12); x.fillStyle = C.ink; x.fillRect(X(R.tps) - 1, 39, 2, 16); },
    info: () => [L('Tokens written per second during decode, against the band at which a person reads, about 5 to 8 tokens a second. Below the band the answer arrives slower than you read it.', 'Tokens escritos por segundo durante el decode, frente a la banda a la que lee una persona, unos 5 a 8 tokens por segundo. Por debajo, la respuesta llega más despacio de lo que la lees.'),
      L('If it writes slowly, it is decode, and decode is bandwidth over bytes per token.', 'Si escribe despacio, es el decode, y el decode es ancho de banda entre bytes por token.'),
      L('Dense or MoE, weight format, context length, speculative decoding, the machine’s bandwidth.', 'Denso o MoE, formato de pesos, longitud del contexto, speculative decoding, el ancho de banda de la máquina.')] },
  { id: 'ctx', label: () => L('Context', 'Contexto'),
    level: () => (R.truncated ? 'critical' : R.ctx >= 262144 || (R.prompt + S.ans) / R.ctx > .9 ? 'caution' : 'nominal'),
    val: () => L(`<b>${num(R.prompt + S.ans)}</b> used · ${num(R.ctx)} reserved`, `<b>${num(R.prompt + S.ans)}</b> usados · ${num(R.ctx)} reservados`),
    draw: (x, w, h) => { const mx = R.m.ctxMax, lg = v => Math.max(0, Math.log2(Math.max(1, v)) / Math.log2(mx)); x.fillStyle = 'rgba(190,170,255,.1)'; x.fillRect(0, 20, w, 14); fillKind(x, 'kvres', 0, 20, lg(R.ctx) * w, 14); fillKind(x, 'kv', 0, 20, lg(Math.min(R.ctx, R.promptFull + S.ans)) * w, 14); x.strokeStyle = C.mid; x.beginPath(); x.moveTo(w - .5, 16); x.lineTo(w - .5, 38); x.stroke(); text(x, L('model max', 'máx. del modelo'), w, 12, C.faint, 'right', 8); text(x, num(mx), w, 50, C.dim, 'right', 8.5); text(x, 'num_ctx', lg(R.ctx) * w, 50, C.hot, lg(R.ctx) > .75 ? 'right' : 'center', 8.5); },
    info: () => [L('Tokens this request uses (prompt and answer) against num_ctx, the context the server reserves, and the model’s maximum, on a log scale.', 'Tokens que usa esta petición (prompt y respuesta) frente a num_ctx, el contexto que reserva el servidor, y el máximo del modelo, en escala logarítmica.'),
      L('What does not fit in num_ctx is cut. Reserving far more than you use costs memory for nothing: Ollama reserved 262,144 tokens by default on the reference machine.', 'Lo que no cabe en num_ctx se recorta. Reservar mucho más de lo que usas cuesta memoria para nada: Ollama reservaba 262.144 tokens por defecto en la máquina de referencia.'),
      L('num_ctx (OLLAMA_CONTEXT_LENGTH or the request’s options), prompt and answer lengths.', 'num_ctx (OLLAMA_CONTEXT_LENGTH o las opciones de la petición), longitud del prompt y de la respuesta.')] },
  { id: 'kv', label: () => L('KV cache', 'Caché KV'),
    level: () => (tokensInCache(P.t) >= R.ctx - .5 ? 'critical' : R.kvRes > 4 ? 'caution' : 'nominal'),
    val: () => L(`<b>${B(kvBytesPerToken(R.m, S.kv) * tokensInCache(P.t))}</b> of ${B(R.kvRes * 1e9)}`, `<b>${B(kvBytesPerToken(R.m, S.kv) * tokensInCache(P.t))}</b> de ${B(R.kvRes * 1e9)}`),
    draw: (x, w, h) => { const f = Math.min(1, tokensInCache(P.t) / R.ctx); fillKind(x, 'kvres', 0, 16, w, 16); fillKind(x, 'kv', 0, 16, w * f, 16); text(x, L(`${num(kvBytesPerToken(R.m, S.kv))} B per token · ${KV_TYPES[S.kv].label}`, `${num(kvBytesPerToken(R.m, S.kv))} B por token · ${KV_TYPES[S.kv].label}`), 0, 48, C.dim, 'left', 8.5); },
    info: () => [L('The keys and values every earlier token left at every attention layer: filled now against what num_ctx reserved. It grows by one token’s worth per token and is read in full by every new token.', 'Las claves y valores que cada token anterior dejó en cada capa de atención: lo lleno ahora frente a lo que reservó num_ctx. Crece un token por token y cada token nuevo la lee entera.'),
      L('It is the memory a long context costs on top of the weights, and the part of decode that grows with the context.', 'Es la memoria que cuesta un contexto largo además de los pesos, y la parte del decode que crece con el contexto.'),
      L('num_ctx, KV type (f16, q8_0, q4_0), attention layers and KV heads of the model.', 'num_ctx, tipo de KV (f16, q8_0, q4_0), capas de atención y cabezas KV del modelo.')] },
  { id: 'keep', label: () => L('Keep alive', 'Keep alive'),
    level: () => (KEEP.unloaded || R.cold ? 'critical' : S.keepalive * 60 - KEEP.idle < 60 ? 'caution' : 'nominal'),
    val: () => { const left = Math.max(0, S.keepalive * 60 - KEEP.idle), next = fileGB(R.m, S.quant) / ssdGBs(S.machine); return KEEP.unloaded || R.cold ? L(`unloaded · next load <b>${S_(next)}</b>`, `descargado · próxima carga <b>${S_(next)}</b>`) : L(`<b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b> left · then ${S_(next)} to load`, `quedan <b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b> · luego ${S_(next)} de carga`); },
    draw: (x, w, h) => { const cx = 27, cy = 29, r = 22, f = S.keepalive > 0 ? Math.max(0, 1 - KEEP.idle / (S.keepalive * 60)) : 0, gone = KEEP.unloaded || R.cold; x.strokeStyle = 'rgba(190,170,255,.18)'; x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); x.strokeStyle = gone ? C.red : f < .2 ? C.amber : C.ok; x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (gone ? 1 : f)); x.stroke(); x.lineWidth = 1; text(x, gone ? L('off', 'fuera') : `${S.keepalive}m`, cx, cy + 4, C.ink, 'center', 10, 700); text(x, P.on ? L('in use', 'en uso') : gone ? L('unloaded', 'descargado') : L('idle, 10×', 'inactivo, 10×'), 58, 26, C.mid, 'left', 9); text(x, L('model in memory', 'modelo en memoria'), 58, 40, gone ? C.faint : C.dim, 'left', 8.5); },
    info: () => [L('How long the server keeps the model in memory after the last request. The clock runs while nothing plays (here at ten times real time).', 'Cuánto mantiene el servidor el modelo en memoria tras la última petición. El reloj corre mientras no se reproduce nada (aquí a diez veces el tiempo real).'),
      L('After this many idle minutes Ollama unloads the model and the next request pays the load from disk, about 55 seconds for the 21.7 GB file on the laptop. OLLAMA_KEEP_ALIVE=30m keeps it longer.', 'Tras estos minutos inactivo Ollama descarga el modelo y la siguiente petición paga la carga desde disco, unos 55 segundos para el archivo de 21,7 GB en el portátil. OLLAMA_KEEP_ALIVE=30m lo mantiene más tiempo.'),
      L('keep_alive (OLLAMA_KEEP_ALIVE or the request), model file size, disk speed.', 'keep_alive (OLLAMA_KEEP_ALIVE o la petición), tamaño del archivo, velocidad del disco.')] },
  { id: 'spec', label: () => (R.specInfo && R.specInfo.kind === 'mtp' ? L('MTP drafting', 'Borrador MTP') : L('Speculative decoding', 'Speculative decoding')),
    level: () => (!R.specInfo ? '' : R.specInfo.speedup < 1 ? 'critical' : R.specInfo.speedup < 1.2 ? 'caution' : 'nominal'),
    val: () => (R.specInfo && R.specInfo.kind === 'mtp' ? L(`<b>${dec(R.specInfo.speedup.toFixed(2))}×</b> · ${dec(R.specInfo.perRound.toFixed(2))} tokens per round · ${pct(R.specInfo.alpha)} accepted`, `<b>${dec(R.specInfo.speedup.toFixed(2))}×</b> · ${dec(R.specInfo.perRound.toFixed(2))} tokens por ronda · ${pct(R.specInfo.alpha)} aceptados`) : R.specInfo ? L(`<b>${dec(R.specInfo.speedup.toFixed(2))}×</b> · ${dec(R.specInfo.perRound.toFixed(2))} tokens per round`, `<b>${dec(R.specInfo.speedup.toFixed(2))}×</b> · ${dec(R.specInfo.perRound.toFixed(2))} tokens por ronda`) : L('off', 'apagado')),
    draw: (x, w, h) => { if (!R.specInfo) { text(x, L('off · switch it on in settings', 'apagado · actívalo en ajustes'), 0, 32, C.faint, 'left', 9); return; } gaugeArc(x, w, h, Math.min(1, R.specInfo.speedup / 3), [[0, 1 / 3, 'rgba(255,77,109,.5)'], [1 / 3, .4, 'rgba(255,181,71,.5)'], [.4, 1, 'rgba(61,220,151,.4)']], R.specInfo.accRate, '0×', '3×'); },
    info: () => R.specInfo && R.specInfo.kind === 'mtp' ? [L(`MTP (multi-token prediction): the model carries one extra block that guesses the next ${MTP.k} tokens; one pass of the full model then checks the guesses and keeps those that match. Speedup over plain decode (needle) and the share of guesses kept.`, `MTP (predicción de varios tokens): el modelo lleva un bloque extra que adivina los ${MTP.k} tokens siguientes; una pasada del modelo completo comprueba las conjeturas y se queda con las que coinciden. Aceleración frente al decode normal (aguja) y la parte de conjeturas aceptadas.`),
      L(`Each guess costs a read of one block plus the output head, about ${pct(mtpDraftGB(R.m, S.quant) / readGB(R.m, S.quant))} of a full pass, and the check reads a little more than a plain token. It pays off only when most guesses survive: measured on the laptop, greedy decoding (temperature 0) gains about 18%, sampling at 0.7 loses about 15%. Ollama does this by default with both Qwen models (draft_num_predict 2).`, `Cada conjetura cuesta leer un bloque más la cabeza de salida, en torno al ${pct(mtpDraftGB(R.m, S.quant) / readGB(R.m, S.quant))} de una pasada completa, y la comprobación lee algo más que un token normal. Solo compensa si sobreviven la mayoría: medido en el portátil, con decodificación voraz (temperatura 0) gana un 18%, muestreando a 0,7 pierde un 15%. Ollama lo hace por defecto con los dos Qwen (draft_num_predict 2).`),
      L('Temperature (how predictable the text is), the number of drafts k, the model.', 'La temperatura (lo predecible que es el texto), el número de borradores k, el modelo.')] : [L('With speculative decoding on: speedup over plain decode (needle, 0 to 3 times) and the measured acceptance (grey needle). A small draft proposes γ tokens and the large model checks them all in one pass.', 'Con speculative decoding: aceleración frente al decode normal (aguja, de 0 a 3 veces) y la aceptación medida (aguja gris). Un borrador pequeño propone γ tokens y el modelo grande los comprueba todos en una pasada.'),
      L('It works because decode waits on memory: one read of the weights can check several tokens. On an MoE each extra token wakes other experts, so the verification pass reads more and the gain shrinks.', 'Funciona porque el decode espera a la memoria: una lectura de los pesos comprueba varios tokens. En un MoE cada token extra despierta otros expertos, así que la verificación lee más y la ganancia se reduce.'),
      L('γ, acceptance rate α, dense or MoE, draft size.', 'γ, tasa de aceptación α, denso o MoE, tamaño del borrador.')] },
  { id: 'prefix', label: () => L('Prefix cache', 'Caché de prefijo'),
    level: () => (R.startAt > 0 ? 'nominal' : ''),
    val: () => L(`<b>${pct(R.prompt ? R.startAt / R.prompt : 0)}</b> of the prompt reused`, `<b>${pct(R.prompt ? R.startAt / R.prompt : 0)}</b> del prompt reutilizado`),
    draw: (x, w, h) => { const f = R.prompt ? R.startAt / R.prompt : 0; x.fillStyle = 'rgba(199,168,255,.25)'; x.fillRect(0, 18, w, 14); x.fillStyle = C.cy; x.fillRect(0, 18, w * f, 14); text(x, S.disk && !S.cached ? L('from disk', 'del disco') : S.cached ? L('in memory', 'en memoria') : L('nothing cached', 'nada en caché'), 0, 48, C.dim, 'left', 8.5); },
    info: () => [L('Share of the prompt whose KV cache already exists, in memory from an earlier call with the same beginning, or restored from disk.', 'Parte del prompt cuya caché KV ya existe, en memoria de una llamada anterior con el mismo principio, o restaurada del disco.'),
      L('Only the new tail needs prefill. The match must be exact from the first token: change one word near the top and everything after it is computed again.', 'Solo la cola nueva necesita prefill. La coincidencia tiene que ser exacta desde el primer token: cambia una palabra cerca del principio y todo lo de detrás se calcula otra vez.'),
      L('Keep stable material first and append; the cache options in settings.', 'Lo estable primero y añadir al final; las opciones de caché en ajustes.')] },
  { id: 'place', label: () => L('GPU placement', 'Dónde corre'),
    level: () => { const g = gpuShare(); return S.machine === 'thinkpadCpu' ? '' : g >= .999 ? 'nominal' : g >= .7 ? 'caution' : 'critical'; },
    val: () => { const g = gpuShare(); return S.machine === 'thinkpadCpu' ? L('<b>100% CPU</b> by choice', '<b>100% CPU</b> por elección') : g >= .999 ? L('<b>100% GPU</b>', '<b>100% GPU</b>') : L(`<b>${pct(g)} GPU</b> · ${pct(1 - g)} CPU`, `<b>${pct(g)} GPU</b> · ${pct(1 - g)} CPU`); },
    draw: (x, w, h) => { const g = S.machine === 'thinkpadCpu' ? 0 : gpuShare(); x.fillStyle = C.cy; x.fillRect(0, 18, w * g, 14); fillKind(x, 'spill', w * g, 18, w * (1 - g), 14); text(x, 'GPU', 0, 48, C.cy, 'left', 8.5); text(x, 'CPU', w, 48, C.dim, 'right', 8.5); },
    info: () => [L('Where the model’s layers run, as ollama ps reports it: 100% GPU, or a split when part does not fit in the memory the GPU may use.', 'Dónde corren las capas del modelo, como lo informa ollama ps: 100% GPU, o un reparto cuando una parte no cabe en la memoria que puede usar la GPU.'),
      L('The share that runs on the CPU is read at the CPU’s pace; on a desktop card the layers that spilled are read from system RAM, and every token waits for them.', 'La parte que corre en la CPU va al ritmo de la CPU; en una tarjeta de sobremesa las capas desbordadas se leen de la RAM del sistema, y cada token las espera.'),
      L('Model size, weight format, num_ctx, VRAM or the GPU’s share of RAM.', 'Tamaño del modelo, formato de pesos, num_ctx, VRAM o la parte de la RAM que usa la GPU.')] },
];
const levelColor = l => (l === 'critical' ? C.red : l === 'caution' ? C.amber : l === 'nominal' ? C.ok : C.ink);
function gpuShare() { const mc = R.mc, need = R.weights + R.kvRes + R.state + R.buf; return mc.kind === 'unified' ? Math.min(1, mc.fastGB / need) : R.pl.fastShare; }
function utilDecode() { return Math.min(1, (2 * R.m.readParams) / (R.mc.tflops * 1e12) / R.mid.seconds); }
function utilPrefill() { const c0 = R.chunk; return c0 ? Math.min(1, c0.matmul / Math.max(c0.matmul, c0.mem)) : 0; }
function utilNow(n) { if (!n.seg) return 0; if (n.seg.k === 'prefill') return Math.min(1, n.seg.matmul / Math.max(n.seg.matmul, n.seg.mem)); if (n.seg.k === 'decode' || n.seg.k === 'round') return Math.min(1, (2 * R.m.readParams) / (R.mc.tflops * 1e12) / n.seg.d); return 0; }
function intensity(ph) { const m = R.m; if (ph === 'prefill') { const c0 = R.chunk || { bytes: passReadGB(m, S.quant, 512), from: 0, to: 512 }; return (2 * m.readParams * (c0.to - c0.from)) / (c0.bytes * 1e9); } return (2 * m.readParams) / (R.mid.bytesGB * 1e9); }
