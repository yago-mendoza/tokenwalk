// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== System lens: the computer as boards, packages and traces =====
// Hardware code: storage bronze, system RAM blue, VRAM or HBM magenta, processors silver, links copper,
// boards dark green. Memory cells are to scale (one cell is a fixed number of GB); chips, traces and boards
// are not. Yellow dots are weights streaming from memory to the chip; yellow rings are K and V written back.
const SYSP = { mem: [], ssd: [], pcie: [], wb: [], acc: { mem: 0, ssd: 0, pcie: 0, wb: 0 } };
let SYSL = null; // last layout: link geometry for the particles
function chipGrid(n, w, h) {
  let best = [n, 1], bestS = 0;
  for (let c = 1; c <= n; c++) { const r = Math.ceil(n / c), s = Math.min(w / c, h / r); if (s > bestS) { bestS = s; best = [c, r]; } }
  return { cols: best[0], rows: best[1], s: bestS };
}
function drawBoard(x, id, r, label, part, fill = HW.board, edge = HW.boardEdge) {
  const [X, Y, w, h] = r;
  x.fillStyle = fill; x.fillRect(X, Y, w, h);
  x.strokeStyle = HW.trace; x.lineWidth = 1; x.beginPath();
  for (let yy = Y + 26; yy < Y + h - 8; yy += 16) { x.moveTo(X + 8, Math.round(yy) + .5); x.lineTo(X + w - 8, Math.round(yy) + .5); } x.stroke();
  x.strokeStyle = edge; x.lineWidth = 1.5; x.strokeRect(X + .75, Y + .75, w - 1.5, h - 1.5); x.lineWidth = 1;
  for (const [cx, cy] of [[X + 8, Y + 8], [X + w - 8, Y + 8], [X + 8, Y + h - 8], [X + w - 8, Y + h - 8]]) { x.strokeStyle = edge; x.beginPath(); x.arc(cx, cy, 2.5, 0, 7); x.stroke(); }
  textFit(x, label, X + 16, Y + 17, w - 32, '#6f9e86', 'left', 9.5, 600);
  hit(id, [X, Y, w, 22], { k: 'part', id: part });
}
function frameBox(x, r, color, label, sub) {
  const [X, Y, w, h] = r;
  x.fillStyle = HW.pkg; x.fillRect(X, Y, w, h);
  x.strokeStyle = color; x.lineWidth = 1.5; x.strokeRect(X + .75, Y + .75, w - 1.5, h - 1.5); x.lineWidth = 1;
  if (label) textFit(x, label, X + 5, Y + 11, w - 10, color, 'left', 8.5, 700);
  if (sub) textFit(x, sub, X + 5, Y + h - 5, w - 10, C.dim, 'left', 8.5);
}
// Memory chips filled cell by cell with what they hold, in order. Cells are to scale.
function drawMemChips(x, id, chips, capGB, parts, opts = {}) {
  const geo = chips.map(ch => { const [, , w, h] = ch.r, cs = Math.max(4, Math.min(11, Math.floor(Math.min(w - 6, h - 18) / 3))); const cols = Math.max(1, Math.floor((w - 6) / cs)), rows = Math.max(1, Math.floor((h - 18) / cs)); return { cs, cols, rows, n: cols * rows }; });
  const N = geo.reduce((s, c) => s + c.n, 0), cellGB = capGB / Math.max(1, N);
  let acc = 0; const ranges = parts.filter(p => p.gb > 0).map(p => { const a = acc; acc += p.gb; return { ...p, a, b: acc }; });
  let k = 0;
  chips.forEach((ch, ci) => {
    const [X, Y, w, h] = ch.r, g = geo[ci];
    frameBox(x, ch.r, ch.color, ch.label);
    const ox = X + Math.floor((w - g.cols * g.cs) / 2), oy = Y + 14;
    for (let j = 0; j < g.n; j++, k++) {
      const cx = ox + (j % g.cols) * g.cs, cy = oy + Math.floor(j / g.cols) * g.cs, mid = (k + .5) * cellGB;
      const p = ranges.find(q => mid >= q.a && mid < q.b);
      let kind = 'free', part = 'free';
      if (p) {
        kind = p.kind; part = p.part;
        if (p.kind === 'kv') { const tk = ((mid - p.a) / p.gb) * R.ctx; kind = mid < p.a + p.gb * (opts.kvFill || 0) ? 'kv_' + tokKind(tk) : 'kvres'; }
        if ((p.kind === 'weights' || p.kind === 'spill') && p.loaded !== undefined && mid >= p.a + p.gb * p.loaded) kind = 'pending';
      }
      fillKind(x, kind, cx, cy, g.cs - 1, g.cs - 1);
      if (opts.layerRange && p && p.kind === 'weights' && mid >= opts.layerRange[0] && mid < opts.layerRange[1]) { x.strokeStyle = C.cy; x.lineWidth = 1.3; x.strokeRect(cx - .5, cy - .5, g.cs, g.cs); x.lineWidth = 1; }
      hit(id, [cx, cy, g.cs, g.cs], { k: 'part', id: part });
    }
    hit(id, [X, Y, w, 13], { k: 'part', id: ch.part });
  });
  return { cellGB, used: acc, over: acc > capGB * 1.0005, ranges };
}
let UNIT_TICK = 0;
function drawUnits(x, id, r, n, lit, label, sub, selKind, part, dimmed) {
  const [X, Y, w, h] = r;
  frameBox(x, r, HW.proc, label, sub);
  const g = chipGrid(n, w - 10, h - 30), s = Math.max(2, Math.floor(g.s)), gap = s > 7 ? 2 : 1;
  const ox = X + Math.floor((w - g.cols * s) / 2), oy = Y + 15 + Math.floor((h - 30 - g.rows * s) / 2);
  // The busy pattern shuffles only while the run plays; paused, the units freeze with everything else.
  if (P.on) UNIT_TICK = (performance.now() / 140) | 0;
  const t = UNIT_TICK;
  for (let i = 0; i < n; i++) {
    const cx = ox + (i % g.cols) * s, cy = oy + Math.floor(i / g.cols) * s, on = !dimmed && lit > 0 && ((i * 7 + t) % n) < lit;
    glowRect(x, cx, cy, s - gap, s - gap, on, .9);
    if (s >= 5) hit(id, [cx, cy, s - gap, s - gap], { k: selKind, i });
  }
  hit(id, [X, Y, w, 13], { k: 'part', id: part }); hit(id, [X, Y + h - 13, w, 13], { k: 'part', id: part });
}
function traceBand(x, id, a, b, width, color, lanes, part) {
  const horiz = Math.abs(b[1] - a[1]) < Math.abs(b[0] - a[0]);
  const X = Math.min(a[0], b[0]), Y = Math.min(a[1], b[1]), len = horiz ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
  x.save(); x.fillStyle = color; x.globalAlpha = .14;
  if (horiz) x.fillRect(X, a[1] - width / 2, len, width); else x.fillRect(a[0] - width / 2, Y, width, len);
  x.globalAlpha = .75; x.strokeStyle = color; x.lineWidth = 1; x.beginPath();
  const n = Math.max(1, lanes);
  for (let i = 0; i < n; i++) { const o = -width / 2 + (i + .5) * (width / n); if (horiz) { x.moveTo(X, Math.round(a[1] + o) + .5); x.lineTo(X + len, Math.round(a[1] + o) + .5); } else { x.moveTo(Math.round(a[0] + o) + .5, Y); x.lineTo(Math.round(a[0] + o) + .5, Y + len); } }
  x.stroke(); x.restore();
  if (horiz) hit(id, [X, a[1] - Math.max(6, width / 2), len, Math.max(12, width)], { k: 'part', id: part });
  else hit(id, [a[0] - Math.max(6, width / 2), Y, Math.max(12, width), len], { k: 'part', id: part });
}
const bwWidth = bw => Math.max(3, Math.min(34, 3 + 6 * Math.log2(Math.max(1, bw) / 32)));
function moveParticles(list, dt) { for (const p of list) p.s += dt * 1.25; while (list.length && list[0].s >= 1) list.shift(); }
function spawn(list, key, rate, dt, dir = 1) { SYSP.acc[key] += Math.min(90, rate) * dt; while (SYSP.acc[key] >= 1) { SYSP.acc[key] -= 1; list.push({ s: Math.random() * .05, o: Math.random() - .5, dir }); if (list.length > 400) list.shift(); } }
function drawParticles(x, list, a, b, width, ring) {
  const horiz = Math.abs(b[1] - a[1]) < Math.abs(b[0] - a[0]);
  for (const p of list) {
    const f = p.dir > 0 ? p.s : 1 - p.s, px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f;
    const ox = horiz ? 0 : p.o * width * .8, oy = horiz ? p.o * width * .8 : 0;
    x.globalAlpha = P.on ? 1 : .45; x.beginPath(); x.arc(px + ox, py + oy, ring ? 2.6 : 1.5, 0, 7);
    if (ring) { x.strokeStyle = C.hot; x.lineWidth = 1.2; x.stroke(); x.lineWidth = 1; } else { x.fillStyle = C.hot; x.fill(); }
  }
  x.globalAlpha = 1;
}
function hwKey(x, W, stopAt = W - 200) {
  const items = [[HW.storage, L('storage', 'almacenamiento')], [HW.ram, L('system RAM', 'RAM del sistema')], [HW.vram, L('VRAM or HBM', 'VRAM o HBM')], [HW.proc, L('processors', 'procesadores')], [HW.link, L('links', 'enlaces')], ['#3d6b55', L('boards', 'placas')]];
  let X = 12; x.font = `400 9px ${FONT}`;
  for (const [col, lbl] of items) { x.strokeStyle = col; x.lineWidth = 1.5; x.strokeRect(X + .75, 9.75, 10, 8); x.lineWidth = 1; const nx = X + 22 + x.measureText(lbl).width + 10; if (nx > stopAt - 8) break; text(x, lbl, X + 15, 17.5, C.mid, 'left', 9); X = nx; }
}
// Arithmetic per byte read, on a log scale, against this machine's balance: where decode and prefill sit, and how busy the units are now.
function drawArith(x, id, n) {
  // One chip: the verdict in its colour, the two numbers that decide it. The chart lives in its explainer.
  const bal = machineBalance(), ph = n.seg && n.seg.k === 'prefill' ? 'prefill' : 'decode', v = intensity(ph), mem = v < bal, col = mem ? C.cy : C.hot;
  const t1 = mem ? L('Memory-bound', 'Limitado por memoria') : L('Compute-bound', 'Limitado por cómputo'), t2 = L(`${ph} ${num(v)} FLOP per byte · this machine balances at ${num(Math.round(bal))}`, `${ph} ${num(v)} FLOP por byte · esta máquina se equilibra en ${num(Math.round(bal))}`);
  x.font = `700 11px ${FONT}`; const w1 = x.measureText(t1).width; x.font = `400 11px ${FONT}`; const w2 = x.measureText(t2).width, w = w1 + w2 + 34;
  x.fillStyle = mem ? 'rgba(127,227,255,.1)' : 'rgba(255,212,59,.1)'; x.fillRect(12, 4, w, 20); x.strokeStyle = col; x.globalAlpha = .6; x.strokeRect(12.5, 4.5, w - 1, 19); x.globalAlpha = 1;
  x.fillStyle = col; x.beginPath(); x.arc(22, 14, 3.5, 0, 7); x.fill();
  text(x, t1, 31, 18, col, 'left', 11, 700); text(x, t2, 31 + w1 + 10, 18, C.mid, 'left', 11);
  hit(id, [12, 4, w, 20], { k: 'inst', id: 'intensity' });
}
function sysState(n) {
  const phase = n.seg ? n.seg.k : '', decoding = phase === 'decode' || phase === 'round';
  const loadedF = !R.cold ? 1 : phase === 'load' ? n.f : P.t > 0 ? 1 : 0;
  const lr = n.seg && n.layer >= 0 && !n.head && (decoding || phase === 'prefill') ? n.layer : -1;
  return { phase, decoding, loadedF, lr, util: utilNow(n) };
}
function drawSystem(n, dt) {
  const id = 'cSystem', c = $(id), [W, H] = stageSize(), x = fit(c, W, H); hitReset(id);
  const mc = R.mc, m = R.m, st = sysState(n), cpuOnly = S.machine === 'thinkpadCpu';
  drawArith(x, id, n);
  const kvF = Math.min(1, tokensInCache(P.t) / R.ctx), kvC = Math.min(kvF, R.startAt / R.ctx);
  const wGBall = R.weights, top = 28;
  const layerRangeOf = (w0, wGB) => st.lr >= 0 ? [w0 + (st.lr / m.layers) * wGB, w0 + ((st.lr + 1) / m.layers) * wGB] : null;
  const util = st.util, units = mc.units;
  const gpuSub = cpuOnly ? L('unused here', 'sin uso aquí') : st.phase === 'prefill' ? L(`busy ${pct(util)}`, `ocupada ${pct(util)}`) : st.decoding ? L(`waiting on memory, ${pct(util)} busy`, `esperando memoria · ${pct(util)}`) : L('idle', 'inactiva');
  const cpuSub = cpuOnly ? (st.phase && st.phase !== 'load' ? L(`computing ${pct(util)}`, `calculando ${pct(util)}`) : L('idle', 'inactiva')) : st.phase ? L('orchestrating', 'orquestando') : L('idle', 'inactiva');
  let links = {};
  if (mc.kind === 'unified') {
    const bd = [10, top, W - 20, H - top - 10];
    drawBoard(x, id, bd, L(`Motherboard · ${mc.name}`, `Placa base · ${mc.name}`), 'board');
    const bx = bd[0] + 16, by = bd[1] + 28, bw = bd[2] - 32, bh = bd[3] - 40;
    const ssd = [bx, by + bh * .66, Math.max(70, bw * .15), Math.max(46, bh * .22)];
    const pk = Math.max(2, Math.min(8, Math.round(S.bus / 32))), cols = 2, rows = Math.ceil(pk / cols);
    const rr = [bx + bw * .22, by + bh * .02, bw * .32, bh * .92], gap = 8;
    const chips = [];
    for (let i = 0; i < pk; i++) { const cw = (rr[2] - gap) / cols, ch = (rr[3] - gap * (rows - 1)) / rows; chips.push({ r: [rr[0] + (i % cols) * (cw + gap), rr[1] + Math.floor(i / cols) * (ch + gap), cw, ch], color: HW.ram, label: `${cw > 100 ? 'LPDDR5X ' : ''}${dec(fmtGB(mc.ramGB / pk))}`, part: 'ram' }); }
    const parts = [{ kind: 'sys', gb: sysGB(), part: 'sys' }, { kind: 'weights', gb: wGBall, part: 'weights', loaded: st.loadedF }, { kind: 'kv', gb: R.kvRes, part: 'kv' }, { kind: 'state', gb: R.state, part: 'state' }, { kind: 'buf', gb: R.buf, part: 'buf' }];
    const mem = drawMemChips(x, id, chips, mc.ramGB, parts, { kvFill: kvF, kvCached: kvC, layerRange: layerRangeOf(sysGB(), wGBall) });
    const soc = [bx + bw * .62, by + bh * .04, bw * .38, bh * .86];
    x.fillStyle = '#101015'; x.fillRect(...soc); x.strokeStyle = HW.proc; x.setLineDash([4, 3]); x.strokeRect(soc[0] + .5, soc[1] + .5, soc[2] - 1, soc[3] - 1); x.setLineDash([]);
    textFit(x, L('SoC package', 'Encapsulado SoC'), soc[0] + 6, soc[1] - 5, soc[2], HW.proc, 'left', 8.5, 600);
    hit(id, [soc[0], soc[1] - 14, soc[2], 14], { k: 'part', id: 'chip' });
    const mcr = [soc[0] + 6, soc[1] + 8, 20, soc[3] - 16];
    frameBox(x, mcr, HW.proc, ''); x.save(); x.translate(mcr[0] + 13.5, mcr[1] + mcr[3] / 2); x.rotate(-Math.PI / 2); text(x, L('memory controller', 'controlador de memoria'), 0, 0, HW.proc, 'center', 9.5, 700); x.restore(); hit(id, mcr, { k: 'part', id: 'memctl' });
    const ix = mcr[0] + mcr[2] + 6, iw = soc[0] + soc[2] - 6 - ix, upH = (soc[3] - 16) * .34;
    const cpuR = [ix, soc[1] + 8, iw * .5 - 3, upH], npuR = [ix + iw * .5 + 3, soc[1] + 8, iw * .5 - 3, upH * .62], sramR = [ix + iw * .5 + 3, soc[1] + 8 + upH * .62 + 4, Math.min(44, iw * .25), Math.max(14, upH * .38 - 4)];
    drawUnits(x, id, cpuR, mc.cores, cpuOnly && st.phase && st.phase !== 'load' ? Math.round(util * mc.cores) : st.phase && st.phase !== 'load' ? 1 : 0, `CPU · ${mc.cores}`, cpuSub, 'core', 'cpu', false);
    frameBox(x, npuR, HW.proc, 'NPU', L('unused here', 'sin uso aquí'));
    x.save(); x.globalAlpha = .5; fillKind(x, 'free', npuR[0] + 4, npuR[1] + 14, npuR[2] - 8, npuR[3] - 28); x.restore(); hit(id, npuR, { k: 'part', id: 'npu' });
    frameBox(x, sramR, HW.proc, ''); textFit(x, 'SRAM', sramR[0] + sramR[2] / 2, sramR[1] + sramR[3] / 2 + 3, sramR[2] - 2, HW.proc, 'center', 9.5, 700); hit(id, sramR, { k: 'part', id: 'sram' });
    const gpuR = [ix, soc[1] + 8 + upH + 8, iw, soc[3] - 16 - upH - 8];
    drawUnits(x, id, gpuR, units, cpuOnly ? 0 : Math.round(util * units), `iGPU · ${units} ${mc.unitName}`, gpuSub, 'cu', 'gpu', cpuOnly);
    if ((st.decoding || st.phase === 'prefill') && gpuR[3] > 70) textFit(x, L('on chip: a few KB', 'en chip: unos KB'), gpuR[0] + gpuR[2] - 6, gpuR[1] + 25, gpuR[2] - 12, C.cy, 'right', 8.5);
    frameBox(x, ssd, HW.storage, 'SSD', st.phase === 'load' ? L('reading', 'leyendo') : L('idle', 'inactivo'));
    const fy = ssd[1] + 18, fw = ssd[2] - 10; x.fillStyle = 'rgba(139,108,240,.18)'; x.fillRect(ssd[0] + 5, fy, fw, 9); x.fillStyle = C.li; x.fillRect(ssd[0] + 5, fy, fw * (st.phase === 'load' ? n.f : 1), 9);
    if (ssd[3] >= 58) textFit(x, `GGUF ${dec(fmtGB(wGBall))}`, ssd[0] + 5, fy + 21, fw, C.mid, 'left', 8.5); hit(id, ssd, { k: 'part', id: 'ssd' });
    const memY = rr[1] + rr[3] / 2, bwW = bwWidth(mc.bw);
    links.mem = { a: [rr[0] + rr[2], memY], b: [mcr[0], memY], w: bwW };
    traceBand(x, id, links.mem.a, links.mem.b, bwW, HW.link, Math.max(2, Math.min(10, Math.round(S.bus / 32))), 'bus');
    text(x, dec(`${mc.bw.toFixed(0)} GB/s`), (links.mem.a[0] + links.mem.b[0]) / 2, memY - bwW / 2 - 6, HW.link, 'center', 9, 700);
    text(x, `${S.bus} bit`, (links.mem.a[0] + links.mem.b[0]) / 2, memY + bwW / 2 + 12, C.dim, 'center', 8.5);
    const sy = ssd[1] + ssd[3] / 2; links.ssd = { a: [ssd[0] + ssd[2], sy], b: [rr[0], sy], w: 4 };
    traceBand(x, id, links.ssd.a, links.ssd.b, 4, HW.link, 1, 'link');
    if (mem.over) { x.save(); x.strokeStyle = C.red; x.lineWidth = 2; x.strokeRect(rr[0] - 3, rr[1] - 3, rr[2] + 6, rr[3] + 6); x.restore(); text(x, L(`over capacity by ${dec(fmtGB(mem.used - mc.ramGB))}`, `excede la capacidad en ${dec(fmtGB(mem.used - mc.ramGB))}`), rr[0] + rr[2] / 2, rr[1] + rr[3] + 14, C.red, 'center', 9.5, 700); }
    SYSL = { links, cellGB: mem.cellGB };
  } else {
    const hbm = S.machine === 'h100';
    const mb = [10, top, W * .4 - 10, H - top - 10], gc = [W * .4 + 8, top + (H - top) * .06, W * .6 - 18, (H - top) * .82];
    drawBoard(x, id, mb, L('Motherboard', 'Placa base'), 'board');
    drawBoard(x, id, gc, hbm ? L(`SXM module · ${mc.short}`, `Módulo SXM · ${mc.short}`) : L(`Graphics card · ${mc.short}`, `Tarjeta gráfica · ${mc.short}`), 'card', '#101317', '#2c3440');
    const bx = mb[0] + 14, by = mb[1] + 28, bw = mb[2] - 28, bh = mb[3] - 40;
    const cpuR = [bx, by, bw * .46, bh * .34];
    drawUnits(x, id, cpuR, mc.cores, st.phase && st.phase !== 'load' ? 1 + Math.round((1 - R.pl.fastShare) * mc.cores * util) : 0, `CPU · ${mc.cores}`, R.pl.fastShare < .999 && st.decoding ? L('reading spilled layers', 'leyendo capas desbordadas') : cpuSub, 'core', 'host', false);
    const dimms = [0, 1].map(i => ({ r: [bx + bw * .54 + i * (bw * .23), by, bw * .2, bh * .62], color: HW.ram, label: `DIMM ${dec(fmtGB(mc.ramGB / 2))}`, part: 'ram' }));
    const hostParts = [{ kind: 'sys', gb: sysGB() / 2, part: 'sys' }, { kind: 'spill', gb: wGBall * (1 - R.pl.fastShare), part: 'spill', loaded: st.loadedF }];
    drawMemChips(x, id, dimms, mc.ramGB, hostParts);
    const ssd = [bx, by + bh * .62, bw * .34, bh * .24];
    frameBox(x, ssd, HW.storage, 'SSD', st.phase === 'load' ? L('reading', 'leyendo') : L('idle', 'inactivo')); hit(id, ssd, { k: 'part', id: 'ssd' });
    const fw = ssd[2] - 10; x.fillStyle = 'rgba(139,108,240,.18)'; x.fillRect(ssd[0] + 5, ssd[1] + 18, fw, 8); x.fillStyle = C.li; x.fillRect(ssd[0] + 5, ssd[1] + 18, fw * (st.phase === 'load' ? n.f : 1), 8);
    const slot = [bx + bw * .4, by + bh * .92, bw * .6, 9];
    x.fillStyle = '#0a0a0c'; x.fillRect(...slot); x.strokeStyle = HW.link; x.strokeRect(slot[0] + .5, slot[1] + .5, slot[2] - 1, slot[3] - 1);
    text(x, L('PCIe slot', 'ranura PCIe'), slot[0], slot[1] - 4, HW.link, 'left', 8.5);
    // the card: GPU die, its own memory around it
    const gx = gc[0] + 16, gy = gc[1] + 30, gw = gc[2] - 32, gh = gc[3] - 46;
    const die = hbm ? [gx + gw * .3, gy + gh * .12, gw * .4, gh * .76] : [gx + gw * .3, gy + gh * .26, gw * .4, gh * .48];
    drawUnits(x, id, die, units, Math.round(util * units), `GPU · ${units} ${mc.unitName}`, gpuSub, 'sm', 'gpu', false);
    const vchips = [];
    if (hbm) { for (let i = 0; i < 6; i++) { const left = i < 3, j = i % 3, hh = (die[3] - 12) / 3; vchips.push({ r: [left ? die[0] - gw * .22 - 6 : die[0] + die[2] + 6, die[1] + j * (hh + 6), gw * .22, hh], color: HW.vram, label: `HBM3 ${dec(fmtGB(mc.fastGB / 6))}`, part: 'vram' }); } }
    else { for (let i = 0; i < 8; i++) { const topRow = i < 4, j = i % 4, cw = (gw - 18) / 4; vchips.push({ r: [gx + j * (cw + 6), topRow ? gy : die[1] + die[3] + 10, cw, Math.min(gh * .2, die[1] - gy - 10)], color: HW.vram, label: `GDDR ${dec(fmtGB(mc.fastGB / 8))}`, part: 'vram' }); } }
    const vparts = [{ kind: 'weights', gb: wGBall * R.pl.fastShare, part: 'weights', loaded: st.loadedF }, { kind: 'kv', gb: R.kvRes, part: 'kv' }, { kind: 'state', gb: R.state, part: 'state' }, { kind: 'buf', gb: R.buf, part: 'buf' }];
    const vm = drawMemChips(x, id, vchips, mc.fastGB, vparts, { kvFill: kvF, kvCached: kvC, layerRange: layerRangeOf(0, wGBall * R.pl.fastShare) });
    const bwW = bwWidth(mc.bw), vy = hbm ? die[1] + die[3] / 2 : vchips[0].r[1] + vchips[0].r[3];
    links.mem = hbm ? { a: [vchips[0].r[0] + vchips[0].r[2], die[1] + die[3] / 2], b: [die[0], die[1] + die[3] / 2], w: bwW } : { a: [die[0] + die[2] / 2, vy], b: [die[0] + die[2] / 2, die[1]], w: bwW };
    traceBand(x, id, links.mem.a, links.mem.b, bwW, HW.link, 8, 'bus');
    text(x, dec(`${mc.bw.toFixed(0)} GB/s`), die[0] + die[2] + 6, die[1] - 4, HW.link, 'left', 9, 700);
    const fingers = [gc[0] + 18, gc[1] + gc[3], gc[2] * .45, 6];
    x.fillStyle = '#b8902f'; for (let i = 0; i < 22; i++) x.fillRect(fingers[0] + i * (fingers[2] / 22), fingers[1], fingers[2] / 22 - 1.5, fingers[3]);
    const lw = bwWidth(mc.linkBw) * .6, ly = slot[1] + slot[3] / 2;
    links.pcie = { a: [slot[0] + slot[2], ly], b: [fingers[0] + 4, ly], w: lw };
    traceBand(x, id, [slot[0] + slot[2], ly], [Math.max(slot[0] + slot[2] + 4, gc[0]), ly], lw, HW.link, 2, 'pcie');
    text(x, dec(`PCIe ${mc.linkBw} GB/s`), slot[0] + slot[2] - 2, ly + 16, HW.link, 'right', 8.5, 700);
    links.ssd = { a: [ssd[0] + ssd[2], ssd[1] + ssd[3] / 2], b: [dimms[0].r[0], ssd[1] + ssd[3] / 2], w: 4 };
    traceBand(x, id, links.ssd.a, links.ssd.b, 4, HW.link, 1, 'link');
    if (vm.over || R.pl.fastShare < .999) { x.save(); x.strokeStyle = C.red; x.lineWidth = 2; x.setLineDash([5, 3]); x.strokeRect(gx - 4, gy - 4, gw + 8, gh + 8); x.restore(); text(x, L(`${pct(1 - R.pl.fastShare)} of the weights do not fit: they stay in system RAM`, `el ${pct(1 - R.pl.fastShare)} de los pesos no cabe: se queda en la RAM del sistema`), gc[0] + gc[2] / 2, gc[1] + gc[3] + 20, C.red, 'center', 9, 700); }
    SYSL = { links, cellGB: vm.cellGB };
  }
  // particles: weights flowing memory to chip at a rate set by the bytes and the playback rate
  const rate = P.on ? speedNow(n) : 0, dotMB = Math.max(1, (readGB(m, S.quant) * 1000) / 40), seg = n.seg;
  const flow = seg && (seg.k === 'decode' || seg.k === 'round' || seg.k === 'prefill') ? seg.bytes / seg.d : 0;
  spawn(SYSP.mem, 'mem', (flow * R.pl.fastShare * 1000 / dotMB) * rate, dt);
  spawn(SYSP.ssd, 'ssd', seg && (seg.k === 'load' || seg.k === 'restore') ? (ssdGBs(S.machine) * 1000 / dotMB) * rate : 0, dt);
  if (links.pcie) spawn(SYSP.pcie, 'pcie', (flow * (1 - R.pl.fastShare) * 1000 / dotMB) * rate, dt);
  spawn(SYSP.wb, 'wb', seg && (seg.k === 'decode' || seg.k === 'round') ? Math.min(30, rate / seg.d) : seg && seg.k === 'prefill' ? Math.min(30, rate * 4 / seg.d) : 0, dt, -1);
  for (const k of ['mem', 'ssd', 'pcie', 'wb']) moveParticles(SYSP[k], P.on ? dt : 0);
  if (links.mem) { drawParticles(x, SYSP.mem, links.mem.a, links.mem.b, links.mem.w); drawParticles(x, SYSP.wb, links.mem.a, links.mem.b, links.mem.w, true); }
  if (links.ssd) drawParticles(x, SYSP.ssd, links.ssd.a, links.ssd.b, 4);
  if (links.pcie) drawParticles(x, SYSP.pcie, links.pcie.a, links.pcie.b, links.pcie.w);
  drawHover(id, x);
  LEGEND_DOT_MB = dotMB;
  setCap('system', st.decoding ? L(`Each token streams ${B(R.mid.bytesGB * 1e9)} of weights and KV from memory to the chip and writes ${B(kvBytesPerToken(m, S.kv))} of K and V back.`, `Cada token trae ${B(R.mid.bytesGB * 1e9)} de pesos y KV de la memoria al chip y escribe ${B(kvBytesPerToken(m, S.kv))} de K y V de vuelta.`)
    : st.phase === 'prefill' ? L('Prefill: each weight read from memory serves a whole chunk of 512 prompt tokens.', 'Prefill: cada peso leído de memoria sirve a un bloque entero de 512 tokens del prompt.')
    : st.phase === 'load' ? L('Loading: the file goes from the SSD into memory once; after this the SSD is idle.', 'Carga: el archivo pasa del SSD a la memoria una vez; después el SSD queda inactivo.')
    : L('Weights stay in memory and are re-read for every token; nothing moves until a pass runs.', 'Los pesos se quedan en memoria y se releen en cada token; nada se mueve hasta que corre una pasada.'));
}
let LEGEND_DOT_MB = 46;

let stackGeo = null;
function drawModel(n) {
  const zfm = zTop('model'); if (zfm) { drawZoomed('model', n, zfm); return; }
  if ((UI.modelMode || 'grid') === 'grid') { drawModelGrid(n); return; }
  const id = 'cModel', c = $(id), [W, H0] = stageSize(), narrow = W < 620, { m, sh, kinds } = R;
  hitReset(id);
  const stackW = narrow ? W : Math.min(220, Math.round(W * .28)), H = H0, x = fit(c, W, H);
  const sy = 18, sh0 = narrow ? Math.min(230, H * .36) : H - 44, lh = sh0 / m.layers, barW = stackW - 64;
  const focus = UI.layer >= 0 ? Math.min(UI.layer, m.layers - 1) : n.layer >= 0 ? n.layer : m.layers - 1;
  // Where the pass is: layer N of M in cyan with a progress bar; otherwise the stack's own title.
  const runL = n.seg && n.layer >= 0 && n.seg.k !== 'load' && n.seg.k !== 'restore';
  if (runL) { textFit(x, n.head ? L(`Output head · after ${m.layers} layers`, `Cabeza de salida · tras ${m.layers} capas`) : L(`Layer ${n.layer + 1} of ${m.layers}`, `Capa ${n.layer + 1} de ${m.layers}`), 0, 11, stackW - 4, C.cy, 'left', 11, 700); x.fillStyle = 'rgba(127,227,255,.15)'; x.fillRect(0, 14.5, stackW - 8, 2.5); x.fillStyle = C.cy; x.fillRect(0, 14.5, (stackW - 8) * Math.min(1, (n.head ? m.layers : n.layer + n.lp) / m.layers), 2.5); }
  else text(x, L(`${m.layers} layers, bottom to top`, `${m.layers} capas, de abajo arriba`), 0, 11, C.mid, 'left', 10.5, 600);
  for (let i = 0; i < m.layers; i++) {
    const y = sy + sh0 - (i + 1) * lh, h = Math.max(.8, lh - (lh > 3 ? 1 : 0)), k = kinds[i], X0 = 26;
    const active = n.layer === i && n.seg;
    fillKind(x, 'weights', X0, y, barW * .62, h, active ? 1 : .72);
    fillKind(x, k === 'attn' ? 'kv' : 'state', X0 + barW * .62 + 1, y, barW * .38 - 1, h, active ? 1 : .8);
    if (active) { x.save(); x.shadowColor = C.cy; x.shadowBlur = 8; x.strokeStyle = C.cy; x.strokeRect(X0 - .5, y - .5, barW + 1, h + 1); x.restore(); }
    if (i === focus) { x.strokeStyle = C.hot; x.lineWidth = 1.5; x.strokeRect(X0 - 2, y - 1, barW + 4, h + 2); x.lineWidth = 1; }
    if (lh >= 8 || (i + 1) % 4 === 0 || i === 0) text(x, String(i + 1), X0 - 5, y + Math.min(h, 9) - .5, i === focus ? C.hot : C.dim, 'right', 8.5);
    hit(id, [0, y - .5, X0 + barW + 4, Math.max(lh, 2)], { k: 'layer', i });
  }
  stackGeo = { sy, sh0, lh };
  text(x, L('weights', 'pesos'), 26, sy + sh0 + 13, C.li, 'left', 9);
  text(x, m.kvLayers < m.layers ? L('KV or state', 'KV o estado') : 'KV', 26 + barW * .62 + 1, sy + sh0 + 13, C.hot, 'left', 9);
  // the token climbing (decode) or a chunk of prompt squares (prefill)
  if (n.seg && n.layer >= 0) {
    const lf = layerFractions(n.seg), y = sy + sh0 - (Math.min(m.layers, n.layer + n.lp) / m.layers) * sh0, X0 = 26 + barW + 8;
    if (n.seg.k === 'prefill') { for (let j = 0; j < 6; j++) chipSq(x, X0 + (j % 3) * 8, y - 8 - Math.floor(j / 3) * 8, 6, C.li); text(x, `×${n.seg.to - n.seg.from}`, X0 + 26, y - 1, C.cy, 'left', 9); }
    else { dots(x, X0 + 4, y - 22, 14, 4, C.cy, 1.8); chipRound(x, X0, y - 8, 9, C.hot); ring(x, X0, y - 8, 9); }
    void lf;
  }
  if (n.head) text(x, L('output head', 'cabeza de salida'), 26 + barW + 6, sy + 8, C.hot, 'left', 9);
  // inside the focused layer
  const ix = narrow ? 0 : stackW + 18, iy = narrow ? sy + sh0 + 30 : 0, iw = W - ix, ih = narrow ? H - iy : H;
  const li = layerInfo(focus), seg = n.seg && n.layer === focus ? n.seg : (n.seg && n.layer >= 0 ? n.seg : R.segs[R.firstDecode]);
  const ops = opsOf(focus, seg && seg.k !== 'load' && seg.k !== 'restore' ? seg : null);
  const kindTxt = li.kind === 'attn' ? L('attention, keeps KV', 'atención, guarda KV') : L('Gated DeltaNet, fixed state', 'Gated DeltaNet, estado fijo');
  const away = UI.layer >= 0 && runL && !n.head && n.layer !== focus;
  if (away) { x.font = `600 10.5px ${FONT}`; const ft = L('Follow the pass', 'Seguir la pasada'), fw = x.measureText(ft).width + 18; x.strokeStyle = 'rgba(127,227,255,.55)'; x.strokeRect(ix + iw - fw + .5, iy + .5, fw - 1, 17); text(x, ft, ix + iw - fw / 2, iy + 12.5, C.cy, 'center', 10.5, 600); hit(id, [ix + iw - fw, iy, fw, 18], { k: 'followPass' }); }
  textFit(x, L(`Layer ${focus + 1} of ${m.layers} · ${kindTxt}${away ? ` · the pass is at ${n.layer + 1}` : ''}`, `Capa ${focus + 1} de ${m.layers} · ${kindTxt}${away ? ` · la pasada va por la ${n.layer + 1}` : ''}`), ix, iy + 11, iw - (away ? 150 : 4), C.ink, 'left', 10.5, 600);
  const mats = li.mixer.slice(); if (sh.router) mats.push(sh.router); if (sh.mlp) mats.push(...sh.mlp);
  const expertsW = sh.expert ? Math.min(narrow ? 150 : 170, iw * .34) : 0;
  const FLOW = 28, availW = iw - 8 - (expertsW ? expertsW + 12 : 0), availH = ih - 96 - FLOW;
  const maxOut = Math.max(...mats.map(s => s[2])), sumIn = mats.reduce((s, o) => s + o[1], 0);
  const k = Math.max(1e-6, Math.min((availH - 24) / maxOut, (availW - mats.length * 18) / sumIn));
  // progress of each operation in the focused layer
  let lp = 1, slow = false;
  if (P.anim && P.anim.layer === focus) { const e = (performance.now() - P.anim.start) / P.anim.dur; if (e < 1) { lp = e; slow = true; } }
  else if (n.layer === focus && n.seg) lp = n.lp;
  else if (n.seg && n.layer >= 0 && n.layer < focus) lp = 0;
  else if (!n.seg && P.t === 0) lp = 0;
  const progOf = name => { const o = ops.find(o2 => o2.id === name); return o ? Math.max(0, Math.min(1, (lp - o.a) / Math.max(1e-9, o.b - o.a))) : 0; };
  const drawMat = (s, X, Y, kk, label, oid) => {
    const w = Math.max(3, s[1] * kk), h = Math.max(3, s[2] * kk), pr = progOf(oid || s[0]), sel = { k: 'mat', layer: focus, name: s[0] };
    fillKind(x, 'weights', X, Y, w, h, .22);
    const bands = Math.max(1, Math.min(48, Math.round(h / 2.5))), lit = Math.floor(bands * pr);
    for (let b = 0; b < lit; b++) fillKind(x, 'weights', X, Y + (b / bands) * h, w, Math.max(.6, h / bands - (h / bands > 2 ? .6 : 0)), b === lit - 1 && pr < 1 ? 1 : .8);
    if (pr > 0 && pr < 1) { const by = Y + (lit / bands) * h; x.save(); x.strokeStyle = C.hot; x.lineWidth = 1.4; x.shadowColor = C.hot; x.shadowBlur = 6; x.strokeRect(X - 1, by - 1, w + 2, Math.max(2, h / bands) + 2); x.restore(); dots(x, X - 6, Y, Math.min(h, 36), 5, C.cy, 1.5); }
    x.fillStyle = 'rgba(127,227,255,.16)'; x.fillRect(X + w + 3, Y, 3, h); x.fillStyle = C.cy; x.fillRect(X + w + 3, Y, 3, h * pr);
    textFit(x, label, X, Y + h + 12, Math.max(84, w + 30), C.ink, 'left', 9, 600);
    text(x, dec(`${num(s[1])}×${num(s[2])}`), X, Y + h + 23, C.dim, 'left', 8.5);
    outlineSel(x, sel, X, Y, w, h); hit(id, [X - 3, Y - 3, Math.max(w, 40) + 6, h + 30], sel);
    return w;
  };
  // Minimap of the layer: the operations in order, each coloured by what it reads (cyan the token's numbers,
  // lilac weights, yellow the KV cache, teal the fixed state), the running one lit, the done ones filled.
  { const fy = iy + 20, fw = availW, nodes = [];
    nodes.push({ id: 'x', lab: 'x', src: 'tok' });
    for (const o of ops) { if (o.kind === 'expert') { if (!nodes.some(q => q.id === 'experts')) nodes.push({ id: 'experts', lab: L(`experts ${activeTxt(R.m)}`, `expertos ${activeTxt(R.m)}`), src: 'w', a: o.a, b: ops.filter(q => q.kind === 'expert').slice(-1)[0].b }); continue; }
      nodes.push({ id: o.id, lab: o.kind === 'kv' ? L('attention', 'atención') : o.kind === 'state' ? L('state', 'estado') : o.kind === 'expertsAll' ? L('experts', 'expertos') : o.id.replace(/^(attn_|ffn_|ssm_)/, ''), src: o.kind === 'kv' ? 'kv' : o.kind === 'state' ? 'st' : 'w', a: o.a, b: o.b }); }
    nodes.push({ id: 'x2', lab: 'x′', src: 'tok' });
    const col = { tok: C.cy, w: C.li, kv: C.hot, st: '#3fd6c0' }, gap = 9; x.font = `700 9.5px ${FONT}`;
    let want = nodes.map(q => x.measureText(q.lab).width + 12), sumW = want.reduce((a2, v) => a2 + v, 0);
    if (sumW > fw - gap * (nodes.length - 1)) { const SH = { output: 'out', router: L('route', 'ruta'), gate: 'gate', [L('attention', 'atención')]: 'attn', [L('state', 'estado')]: L('state', 'est.') }; nodes.forEach(q => { q.lab = SH[q.lab] || (q.id === 'experts' ? activeTxt(R.m) : q.lab); }); want = nodes.map(q => x.measureText(q.lab).width + 12); sumW = want.reduce((a2, v) => a2 + v, 0); }
    const sc2 = Math.min(1.6, (fw - gap * (nodes.length - 1)) / sumW);
    let fx = ix + 8;
    nodes.forEach((q, i) => {
      const nw = want[i] * sc2, X = fx; fx += nw + gap; cur = q.a !== undefined && lp >= q.a && lp < q.b && (n.layer === focus || P.anim), done = q.b !== undefined && lp >= q.b, c2 = col[q.src];
      x.fillStyle = done ? c2 : 'rgba(255,255,255,.03)'; x.globalAlpha = done ? .28 : 1; x.fillRect(X, fy, nw, 18); x.globalAlpha = 1;
      if (cur) { x.save(); x.shadowColor = c2; x.shadowBlur = 10; x.strokeStyle = c2; x.lineWidth = 2; x.strokeRect(X, fy, nw, 18); x.restore(); } else { x.strokeStyle = c2; x.globalAlpha = .7; x.strokeRect(X + .5, fy + .5, nw - 1, 17); x.globalAlpha = 1; }
      textFit(x, q.lab, X + nw / 2, fy + 12.5, nw - 4, cur ? C.ink : C.mid, 'center', 9.5, cur ? 700 : 500);
      if (i) { x.fillStyle = C.faint; x.beginPath(); x.moveTo(X - gap + 2, fy + 6); x.lineTo(X - 2, fy + 9); x.lineTo(X - gap + 2, fy + 12); x.fill(); }
      if (q.a !== undefined) hit(id, [X, fy, nw, 18], q.src === 'kv' ? { k: 'kvlayer', layer: focus } : q.src === 'st' ? { k: 'state', layer: focus } : q.id === 'experts' ? { k: 'expert', layer: focus, e: -1 } : { k: 'mat', layer: focus, name: q.id === 'router' && R.sh.router ? R.sh.router[0] : q.id });
    });
  }
  let cx = ix + 8; const baseY = iy + 28 + FLOW;
  for (const s of mats) { const w = drawMat(s, cx, baseY, k, s[0]); cx += Math.max(w + 10, 64); }
  // attention or state operation, drawn as what it reads
  const special = ops.find(o => o.kind === 'kv' || o.kind === 'state');
  if (special) {
    const sx2 = narrow ? ix + 8 : Math.min(cx, ix + availW - 70), sy2 = iy + ih - (narrow ? 50 : 92), pr = Math.max(0, Math.min(1, (lp - special.a) / (special.b - special.a)));
    const sel = special.kind === 'kv' ? { k: 'kvlayer', layer: focus } : { k: 'state', layer: focus };
    fillKind(x, special.kind === 'kv' ? 'kv' : 'state', sx2, sy2, 62, 12, .35 + .65 * (pr > 0 ? 1 : 0));
    if (pr > 0 && pr < 1) { x.save(); x.strokeStyle = C.cy; x.shadowColor = C.cy; x.shadowBlur = 6; x.strokeRect(sx2 - 1, sy2 - 1, 64, 14); x.restore(); }
    text(x, special.kind === 'kv' ? L(`attention over ${num(special.ctxTok)} tokens`, `atención sobre ${num(special.ctxTok)} tokens`) : L('state update', 'actualización del estado'), sx2, sy2 + 24, C.mid, 'left', 9);
    text(x, B(special.bytes), sx2, sy2 + 35, C.dim, 'left', 8.5);
    outlineSel(x, sel, sx2, sy2, 62, 12); hit(id, [sx2 - 2, sy2 - 2, 120, 40], sel);
  }
  if (sh.expert) {
    // every expert of the layer as one cell, 16 to a row (8 when there are fewer than 64), the shared one below
    const E = m.experts, perRow = E >= 64 ? 16 : 8, rows = Math.ceil(E / perRow), gx = ix + iw - expertsW, gy = baseY + 4;
    const cs = Math.max(4, Math.floor(Math.min((expertsW || 150) / perRow, 150 / 16, (iy + ih - gy - 74) / rows)));
    const prefillSeg = n.seg && n.seg.k === 'prefill' && n.layer >= 0;
    const tok = n.seg && (n.seg.k === 'decode' || n.seg.k === 'round') ? n.seg.tok : 0;
    const chosen = new Set(chosenExperts(tok, focus)), touched = prefillSeg ? expertsTouched(m, n.seg.to - n.seg.from) : 0;
    textFit(x, prefillSeg ? L(`${num(touched)} of ${E} experts touched by this chunk`, `${num(touched)} de ${E} expertos tocados por este bloque`) : L(`${E} experts · ${activeTxt(R.m)} read`, `${E} expertos · ${activeTxt(R.m)} leídos`), gx, gy - 6, W - gx - 4, C.mid, 'left', 9.5);
    for (let e = 0; e < E; e++) {
      const ex = gx + (e % perRow) * cs, ey = gy + Math.floor(e / perRow) * cs, on = prefillSeg ? rngOf(e * 7 + 1)() < touched / E : chosen.has(e);
      const opE = ops.find(o => o.e === e), pr = opE ? Math.max(0, Math.min(1, (lp - opE.a) / (opE.b - opE.a))) : 0;
      fillKind(x, 'weights', ex, ey, cs - 1, cs - 1, on ? (pr > 0 || prefillSeg ? 1 : .55) : .14);
      if (on && pr > 0 && pr < 1) { x.save(); x.shadowColor = C.cy; x.shadowBlur = 8; x.strokeStyle = C.cy; x.strokeRect(ex + .5, ey + .5, cs - 2, cs - 2); x.restore(); }
      const sel = { k: 'expert', layer: focus, e }; outlineSel(x, sel, ex, ey, cs - 1, cs - 1); hit(id, [ex, ey, cs, cs], sel);
    }
    const shY = gy + rows * cs + 6, sel = { k: 'expert', layer: focus, e: -1 };
    if (m.sharedExperts) { fillKind(x, 'weights', gx, shY, cs * 3 - 1, cs - 1, progOf('shared expert') > 0 ? 1 : .6); outlineSel(x, sel, gx, shY, cs * 3 - 1, cs - 1); hit(id, [gx, shY, cs * 3, cs], sel);
      textFit(x, L('Shared', 'Compartido'), gx + cs * 3 + 5, shY + cs - 1, Math.max(30, W - (gx + cs * 3 + 5) - 2), C.dim, 'left', 9.5); }
    // one expert to the same scale as the matrices on the left
    let ex2 = gx; const ey2 = (m.sharedExperts ? shY + cs : shY) + 18;
    textFit(x, L('Expert · to scale', 'Experto · a escala'), gx, ey2 - 5, Math.max(40, W - gx - 2), C.mid, 'left', 9.5);
    for (const s of sh.expert) { const w = Math.max(3, s[1] * k), h = Math.max(3, s[2] * k); fillKind(x, 'weights', ex2, ey2, w, h, .7); ex2 += w + 6; }
  }
  // inset: where this sits in the whole
  const model = R.weights * 1e9, big = mats.reduce((a, s) => (bytesOf(s) > bytesOf(a) ? s : a), mats[0]);
  const fr = (a, b) => `1/${num(Math.max(1, Math.round(b / a)))}`, insetY = iy + ih - 30;
  if (!narrow) {
  textFit(x, L(`Stores ${B(li.stored)} · reads ${B(li.read)} per token · ${fr(li.stored, model)} of the model`, `Guarda ${B(li.stored)} · lee ${B(li.read)} por token · ${fr(li.stored, model)} del modelo`), ix + 4, insetY, iw - 8, C.mid, 'left', 9);
  const bx = ix + 4, by = insetY + 8, bw = Math.min(iw - 12, 300);
  for (let i = 0; i < m.layers; i++) fillKind(x, 'weights', bx + (i / m.layers) * bw, by, Math.max(.6, bw / m.layers - .5), 6, i === focus ? 1 : .22);
  text(x, L('this layer in the model', 'esta capa en el modelo'), bx + bw + 6, by + 6, C.dim, 'left', 8.5);
  }
  setCap('model', slow ? L('Slow motion: the cyan dots, the activation column of this token, meet each row of each matrix in turn. Matrices to scale.', 'Cámara lenta: los puntos cian, la columna de activaciones de este token, se cruzan con cada fila de cada matriz. Matrices a escala.') : L('Matrices to scale: width is the input, height the output, as the GGUF lists them. Click a layer, a matrix or an expert.', 'Matrices a escala: el ancho es la entrada y el alto la salida, como las lista el GGUF. Haz clic en una capa, una matriz o un experto.'));
  drawHover(id, x);
}
