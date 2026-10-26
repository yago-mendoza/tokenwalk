// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Flow: what shape the data is, where it goes, and why the dimensions fit =====
// One pass of the model as a strip of 2D tensors, left to right: the token ids, the embedding, one layer (attention
// and, in a hybrid model, DeltaNet as a second lane above it), the feed-forward or the experts, the pile of layers,
// the output head and the sampled token. Every tensor is a rectangle: height is the tokens the pass carries, width
// its columns, both on one stated scale; each side wears the colour of its dimension. A matrix product is drawn the
// classic way, the weight above its output and the input to the left, so the inner dimension shows twice at the
// same length and in the same colour, and is gone from the result. The description comes from flowSpec (01f-flow.ts);
// this part lays it out once per shape, then each frame only draws, with a camera that follows the playhead.
const DIMC = { n: '#c8ccd6', c: '#c8ccd6', d: '#5b9cff', H: '#e49279', Hkv: '#f065de', dh: '#d7e266', F: '#4a9050', E: '#4acdc2', k: '#4acdc2', V: '#9e5394', x: '#8a8a96', one: '#63636f' };
const DIMSYM = { n: 'n', c: 'ctx', d: 'd', H: 'H', Hkv: 'Hkv', dh: 'dh', F: 'F', E: 'E', k: 'k', V: 'V', x: '', one: '' };
const FL = {
  key: '', items: [], byId: {}, opX: {}, lifes: [], specs: {}, spec: null, hybrid: false, kind: 'attn', layer: 0, seg: null, segIdx: -1, nt: 1, ctx: 1, ctxRes: 1, nOut: 1, preview: false,
  world: [0, 0, 1, 1], cam: { x: 0, y: 0, z: 4 }, tgt: { x: 0, y: 0, z: 4 }, follow: true, fitted: false, scale: (() => { try { return localStorage.getItem('llmc.flowScale') === 'lin' ? 'lin' : 'log'; } catch (e) { return 'log'; } })(),
  W: 0, H: 0, dpr: 1, dirty: true, lastT: -1, lastKey: '', hov: null, px: -1, py: -1, drag: null, pinch: null, tap: 0, stop: -1, stopT: 0, act: null, actP: 0, actE: -9, uiKey: '', ft: new Float64Array(240), fi: 0, fn: 0, flash: null, lang: '',
};
const flS = n => (FL.scale === 'lin' ? Math.max(.35, n * FL.kl) : 1 + Math.log2(Math.max(1, n)));
const flSide = f => f.reduce((s, x) => s * x[1], 1);
// Weights wear violet, darker for fewer bits per weight (2.6 to 16, on a log scale).
function flPrecCol(bpw) { const t = Math.max(0, Math.min(1, (Math.log2(bpw) - 1.3) / (4 - 1.3))); const a = [38, 31, 66], b = [178, 164, 255]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }

// Tensor names in the reader's language (weights keep the names their file gives them).
const FL_ES = { 'token ids': 'ids de token', 'residual stream': 'flujo residual', normed: 'normalizado', 'query + gate': 'consulta + puerta', query: 'consulta', key: 'clave', value: 'valor', 'K cache': 'caché K', 'V cache': 'caché V', 'query, one head': 'consulta, una cabeza', 'keys, one KV head': 'claves, una cabeza KV', 'values, one KV head': 'valores, una cabeza KV', scores: 'puntuaciones', 'attention weights': 'pesos de atención', 'output, one head': 'salida, una cabeza', 'heads, side by side': 'cabezas juntas', 'attention out': 'salida de atención', 'q, k, v': 'q, k, v', gate: 'puerta', 'DeltaNet state': 'estado DeltaNet', 'readout, one head': 'lectura, una cabeza', readout: 'lectura', 'gated readout': 'lectura con puerta', 'mixer out': 'salida del mezclador', 'router scores': 'puntuaciones del router', 'chosen experts': 'expertos elegidos', up: 'up', widened: 'ensanchado', activated: 'activado', 'one expert out': 'salida de un experto', 'experts, weighted sum': 'expertos, suma ponderada', 'feed-forward out': 'salida feed-forward', 'final norm': 'norma final', logits: 'logits', 'next token': 'siguiente token', 'token_embd, transposed': 'token_embd, traspuesta' };
const flTN = t => (lang === 'es' && t.role !== 'weight' && FL_ES[t.name] ? FL_ES[t.name] : t.role === 'weight' && lang === 'es' && FL_ES[t.name] ? FL_ES[t.name] : t.name);
// ---- the pass the lens shows: the segment under the playhead, or the first one before anything runs ----
function flPass(n) {
  let seg = n.seg && n.seg.k !== 'load' && n.seg.k !== 'restore' ? n.seg : null, preview = false;
  if (!seg) { seg = P.t >= R.total && R.total ? R.segs[R.segs.length - 1] : R.segs.find(s => s.k === 'prefill') || R.segs.find(s => s.k === 'decode' || s.k === 'round'); preview = true; }
  if (!seg) return null;
  const k = seg.k, nt = k === 'prefill' ? seg.to - seg.from : k === 'round' ? (seg.mtp ? MTP.k + 1 : S.gamma + 1) : 1;
  const ctx = k === 'prefill' ? seg.to : seg.ctx + nt, nOut = k === 'prefill' ? (seg.to >= R.prompt ? 1 : 0) : nt;
  const layer = UI.layer >= 0 ? Math.min(UI.layer, R.m.layers - 1) : n.seg === seg && n.layer >= 0 ? n.layer : FL.layer < R.m.layers ? FL.layer : 0;
  return { seg, segIdx: R.segs.indexOf(seg), nt, ctx: Math.min(ctx, R.ctx), nOut, layer, preview };
}
const flTied = () => { const c = MODEL_CATALOGUE[S.model]; return c ? !!c.tied : null; };
function flSpecOf(kind, ps) {
  const q = quantOf(R.m, S.quant);
  return flowSpec(R.m, R.sh, { kind, nt: ps.nt, ctx: ps.ctx, nOut: ps.nOut, bpw: bpwOf(q), expertBpw: R.m.expertBpw || 0, quant: QUANTS[S.quant] ? QUANTS[S.quant].label : String(S.quant), kvBytes: KV_TYPES[S.kv].bytes, kv: S.kv, tied: flTied() });
}
// Offloaded layers: llama.cpp fills the card from the last layer down, so the first ones stay in system RAM.
function flSlowN() {
  const mc = R.mc, fs = R.pl.fastShare; if (mc.kind === 'unified' || fs >= .999) return 0;
  let tot = 0; for (let i = 0; i < R.m.layers; i++) tot += layerInfo(i).stored;
  let acc = 0, k = 0; while (k < R.m.layers && acc + layerInfo(k).stored / 2 < tot * (1 - fs)) { acc += layerInfo(k).stored; k++; }
  return k;
}
const flDev = layer => (R.mc.kind === 'unified' ? 'uni' : layer < FL.slowN ? 'ram' : 'vram');

// ---- layout: once per shape (model, layer kinds, tokens in flight, reserved context, scale) ----
function flLayout(ps) {
  const m = R.m, kinds = R.kinds; FL.hybrid = kinds.includes('delta') && kinds.includes('attn');
  FL.kl = 12 / m.hidden; FL.slowN = flSlowN(); FL.ctxRes = Math.max(ps.ctx, R.ctx);
  const specs = { attn: kinds.includes('attn') ? flSpecOf('attn', ps) : null, delta: kinds.includes('delta') ? flSpecOf('delta', ps) : null };
  FL.specs = specs; const base = specs[kinds[ps.layer]] || specs.attn || specs.delta; FL.spec = base;
  const items = [], byId = {}, opX = {}, g = 1.6, G = 4.2, gW = 1.4, nh = flS(ps.nt), mid = nh / 2;
  const put = it => { it.i = items.length; items.push(it); byId[it.id] = it; return it; };
  const T = (id, sp, tid, x, y, lane, extra = {}) => { const t = sp.T[tid]; const res = t.c.some(f => f[0] === 'c') ? 'c' : t.r.some(f => f[0] === 'c') ? 'r' : ''; const w = res === 'c' ? flS(FL.ctxRes) : flS(flSide(t.c)), h = res === 'r' ? flS(FL.ctxRes) : flS(flSide(t.r));
    return put({ id, kind: 't', t, sp, tid, x, y, w, h, lane, res, fill: res ? flS(Math.max(1, ps.ctx)) / flS(FL.ctxRes) : 1, ...extra }); };
  const above = (id, sp, tid, out, lane) => { const t = sp.T[tid], h = flS(flSide(t.r)) * (t.r.some(f => f[0] === 'c') ? flS(FL.ctxRes) / flS(flSide(t.r)) : 1); return T(id, sp, tid, out.x, out.y - gW - h, lane, { over: out.id }); };
  const node = (id, sym, x, y, lane, op, sp) => put({ id, kind: 'node', sym, x: x - .95, y: y - .95, w: 1.9, h: 1.9, lane, op, sp });
  let X = 0;
  // input
  const ids = T('ids', base, 'ids', X, 0, 'in'); X += ids.w + g + 1.2;
  const x0 = T('x', base, 'x', X, 0, 'in'); above('W_emb', base, 'W_emb', x0, 'in'); opX.embed = x0.x + x0.w / 2; X += x0.w + G;
  const frame0 = X - 1.6;
  node('norm1', 'N', X + .95, mid, 'main', 'norm1', base); opX.norm1 = X + .95; X += 1.9 + g;
  const xn = T('xn', base, 'xn', X, 0, 'main'); X += xn.w + G;
  const laneX = X; let XA = laneX, XB = laneX, yB = 0, topA = 0;
  const mm = (lane, sp, w, out, x, y) => { const o = T(lane + ':' + out, sp, out, x, y, lane); above(lane + ':' + w, sp, w, o, lane); return o; };
  if (specs.attn) {
    const sp = specs.attn, L = 'A';
    for (const [w, out] of [['Wq', 'q'], ['Wk', 'k'], ['Wv', 'v']]) { const o = mm(L, sp, w, out, XA, 0); opX[L + ':' + out] = o.x + o.w / 2; XA += o.w + g * 1.4; }
    XA += G - g;
    const qh = T('A:qh', sp, 'qh', XA, 0, L); opX['A:split'] = qh.x + qh.w / 2; XA += qh.w + g;
    put({ id: 'gqa', kind: 'gqa', x: qh.x, y: -gW - 7, w: qh.w, h: 7, lane: L });
    const s = T('A:s', sp, 's', XA, 0, L); above('A:KT', sp, 'KT', s, L); opX['A:scores'] = s.x + s.w / 2; opX['A:append'] = s.x + s.w * s.fill; XA += s.w + g;
    node('A:softmax', 'σ', XA + .95, mid, L, 'softmax', sp); opX['A:softmax'] = XA + .95; XA += 1.9 + g;
    const p = T('A:p', sp, 'p', XA, 0, L); XA += p.w + g;
    const oh = T('A:oh', sp, 'oh', XA, 0, L); above('A:Vh', sp, 'Vh', oh, L); opX['A:mix'] = oh.x + oh.w / 2; XA += oh.w + G;
    const o = T('A:o', sp, 'o', XA, 0, L); opX['A:concat'] = o.x + o.w / 2; XA += o.w + g;
    const a = mm(L, sp, 'Wo', 'a', XA, 0); opX['A:o'] = a.x + a.w / 2; XA += a.w + G;
    for (const it of items) if (it.lane === L) topA = Math.min(topA, it.y);
  }
  if (specs.delta) {
    const sp = specs.delta, L = 'D', hasA = !!specs.attn;
    yB = hasA ? topA - 6.5 - nh : 0;
    const qkv = mm(L, sp, 'Wqkv', 'qkv', XB, yB); opX['D:qkv'] = qkv.x + qkv.w / 2; XB += qkv.w + g * 1.4;
    const gg = mm(L, sp, 'Wg', 'g', XB, yB); opX['D:gate'] = gg.x + gg.w / 2; XB += gg.w + G;
    const dq = T('D:dq', sp, 'dq', XB, yB, L); opX['D:dsplit'] = dq.x + dq.w / 2; XB += dq.w + g;
    const dy = T('D:dy', sp, 'dy', XB, yB, L); above('D:S', sp, 'S', dy, L); opX['D:state'] = dy.x + dy.w / 2; XB += dy.w + G;
    const y = T('D:y', sp, 'y', XB, yB, L); opX['D:dconcat'] = y.x + y.w / 2; XB += y.w + g;
    node('D:dgate', '⊙', XB + .95, yB + mid, L, 'dgate', sp); opX['D:dgate'] = XB + .95; XB += 1.9 + g;
    const yg = T('D:yg', sp, 'yg', XB, yB, L); XB += yg.w + g;
    const a = mm(L, sp, 'Wso', 'a', XB, yB); opX['D:out'] = a.x + a.w / 2; XB += a.w + G;
  }
  X = Math.max(XA, XB);
  node('add1', '+', X + .95, mid, 'main', 'add1', base); opX.add1 = X + .95; X += 1.9 + 1.6;
  const xEnd1 = X;
  // the second row: the layer goes on under itself, like a line of text, then the pile of layers and the output
  const row2 = items.length; X = frame0 + 1.6;
  node('norm2', 'N', X + .95, mid, 'main', 'norm2', base); opX.norm2 = X + .95; X += 1.9 + g;
  const xn2 = T('xn2', base, 'xn2', X, 0, 'main'); X += xn2.w + G;
  if (base.T.Wr) {
    const r = T('r', base, 'r', X, 0, 'ffn'); above('Wr', base, 'Wr', r, 'ffn'); opX.route = r.x + r.w / 2; X += r.w + g;
    node('topk', 'k', X + .95, mid, 'ffn', 'topk', base); opX.topk = X + .95; X += 1.9 + g;
    const sel = T('sel', base, 'sel', X, 0, 'ffn'); X += sel.w + G * .7;
    const E = m.experts, cols = 2 ** Math.ceil(Math.log2(E) / 2), rows = Math.ceil(E / cols), cs = Math.max(.7, Math.min(1.1, 15 / cols));
    put({ id: 'grid', kind: 'grid', x: X, y: -gW - rows * cs - (m.sharedExperts ? cs * 1.6 : 0), w: cols * cs, h: rows * cs + (m.sharedExperts ? cs * 1.6 : 0), cols, rows, cs, lane: 'ffn' });
    X += cols * cs + G * .7;
    const ex0 = X;
    if (base.T.Weg) { const eg = mm('E', base, 'Weg', 'eg', X, 0); opX['E:egate'] = eg.x + eg.w / 2; X += eg.w + g * 1.4; }
    const eu = mm('E', base, 'Weu', 'eu', X, 0); opX['E:eup'] = eu.x + eu.w / 2; X += eu.w + g;
    node('E:eact', '⊙', X + .95, mid, 'ffn', 'eact', base); opX['E:eact'] = X + .95; X += 1.9 + g;
    const eh = T('E:eh', base, 'eh', X, 0, 'ffn'); X += eh.w + g;
    const ef = mm('E', base, 'Wed', 'ef', X, 0); opX['E:edown'] = ef.x + ef.w / 2; X += ef.w + g;
    let ey = 0; for (const q of items) if (q.lane === 'E') ey = Math.min(ey, q.y);
    put({ id: 'ebox', kind: 'bracket', x: ex0 - .6, y: ey - 2.6, w: X - ex0 - g + 1.2, h: 1, lane: 'ffn' });
    node('esum', 'Σ', X + .95, mid, 'ffn', 'esum', base); opX.esum = X + .95; X += 1.9 + g;
    const f = T('f', base, 'f', X, 0, 'ffn'); X += f.w + G;
  } else {
    if (base.T.Wg2) { const fg = mm('F', base, 'Wg2', 'fg', X, 0); opX['F:fgate'] = fg.x + fg.w / 2; X += fg.w + g * 1.4; }
    const fu = mm('F', base, 'Wu', 'fu', X, 0); opX['F:fup'] = fu.x + fu.w / 2; X += fu.w + g;
    node('F:fact', base.T.Wg2 ? '⊙' : 'g', X + .95, mid, 'ffn', 'fact', base); opX['F:fact'] = X + .95; X += 1.9 + g;
    const fh = T('F:fh', base, 'fh', X, 0, 'ffn'); X += fh.w + g;
    const f = mm('F', base, 'Wd', 'f', X, 0); opX['F:fdown'] = f.x + f.w / 2; X += f.w + G;
  }
  node('add2', '+', X + .95, mid, 'main', 'add2', base); opX.add2 = X + .95; X += 1.9 + 1.6;
  const frame1b = X; X += 2.4;
  const pil = put({ id: 'pillar', kind: 'pillar', x: X, y: 0, w: 3.2, h: 1, lane: 'main' }); X += 3.2 + G;
  node('normf', 'N', X + .95, Math.min(mid, flS(Math.max(1, ps.nOut)) / 2), 'out', 'normf', base); opX.normf = X + .95; X += 1.9 + g;
  const xf = T('xf', base, 'xf', X, 0, 'out'); X += xf.w + g;
  const lg = T('lg', base, 'lg', X, 0, 'out'); above('Wout', base, 'Wout', lg, 'out'); opX.head = lg.x + lg.w / 2; X += lg.w + g;
  node('sample', '?', X + .95, flS(1) / 2, 'out', 'sample', base); opX.sample = X + .95; X += 1.9 + g;
  const tok = T('tok', base, 'tok', X, 0, 'out'); opX.tokEnd = tok.x + tok.w; X += tok.w + 2;
  const xEnd2 = X;
  // lifelines, per row: every tensor from the operation that makes it to the last one that reads it (the stream is
  // the line itself; the cache and the state outlive the pass and end in an arrow)
  const lx = (sp, opi) => { const o = sp.ops[opi]; if (!o) return null; const k1 = (o.section === 'attn' ? 'A:' : o.section === 'delta' ? 'D:' : '') + o.id; return opX[k1] ?? opX['E:' + o.id] ?? opX['F:' + o.id] ?? opX[o.id] ?? null; };
  const lifeRows = (from, to, xEnd) => { const out = [], ends = []; for (let i = from; i < to; i++) { const it = items[i]; if (it.kind !== 't' || it.id === 'A:Vh') continue; const t = it.t; if (t.role === 'weight' || t.life === 'stream' || (t.born < 0 && t.life === 'op')) continue;
      let a = t.born >= 0 ? lx(it.sp, t.born) : null, b = t.life === 'op' ? lx(it.sp, t.dies) : xEnd; if (a == null) a = it.x + it.w / 2; if (b == null || b < a + .6) b = a + .6;
      let row = 0; while (row < ends.length && ends[row] > a - .8) row++; ends[row] = b; out.push({ it, t, a, b, row }); } return [out, ends.length]; };
  const [l1, n1] = lifeRows(0, row2, xEnd1), [l2, n2] = lifeRows(row2, items.length, frame1b);
  // row 1's extent, then row 2 shifted below it
  let top1 = 0; for (let i = 0; i < row2; i++) top1 = Math.min(top1, items[i].y);
  const yS1 = nh + 4.6, yL1 = yS1 + 3.2, bot1 = yL1 + n1 * 1.25 + 1.4;
  let top2 = 0; for (let i = row2; i < items.length; i++) if (items[i].kind !== 'pillar') top2 = Math.min(top2, items[i].y);
  const dy = bot1 + 5.5 - (top2 - 4.2);
  for (let i = row2; i < items.length; i++) items[i].y += dy;
  const yS2 = dy + nh + 4.6, yL2 = yS2 + 3.2, bot2 = yL2 + n2 * 1.25 + 1;
  for (const l of l1) l.y = yL1 + l.row * 1.25; for (const l of l2) l.y = yL2 + l.row * 1.25;
  put({ id: 'frame', kind: 'frame', x: frame0, y: top1 - 6, w: xEnd1 - frame0, h: yS1 + 2.2 - (top1 - 6), lane: 'main' });
  put({ id: 'frame2', kind: 'frame', x: frame0, y: dy + top2 - 4.2, w: frame1b - frame0, h: yS2 + 2.2 - (dy + top2 - 4.2), lane: 'main' });
  pil.y = dy + top2 - 4.2; pil.h = yS2 + 2.2 - pil.y;
  FL.items = items; FL.byId = byId; FL.opX = opX; FL.lifes = l1.concat(l2); FL.yB = yB; FL.mid = mid; FL.row2 = row2; FL.dy = dy;
  FL.stream = { y1: yS1, y2: yS2, xE1: xEnd1 - .4, yWrap: bot1 + 1.6, x2: frame0 - .4 };
  FL.yL = [yL1, yL2];
  FL.world = [-2, top1 - 8, Math.max(xEnd1, xEnd2) + 1, bot2 + 1];
  FL.nt = ps.nt; FL.ctx = ps.ctx; FL.nOut = ps.nOut;
}

// ---- which operation the playhead is on, in Flow's terms ----
// The cost model times the matrices, the attention read, the state and the experts; Flow splits each into the
// steps it draws (scores, softmax, mix...) in equal parts. Norms and residual adds cost nothing there.
const FL_CG = new Map(); let FL_CG_R = null;
function flCostGroups(layer, seg) {
  if (FL_CG_R !== R) { FL_CG.clear(); FL_CG_R = R; } const ck = layer * 1e6 + R.segs.indexOf(seg); const hit0 = FL_CG.get(ck); if (hit0) return hit0; if (FL_CG.size > 4000) FL_CG.clear();
  const ops = opsOf(layer, seg), g = {}; FL_CG.set(ck, g);
  for (const o of ops) { const k = o.kind === 'expert' || o.kind === 'expertsAll' ? 'expert' : o.id; if (!g[k]) g[k] = [o.a, o.b]; else g[k][1] = o.b; }
  return g;
}
const flLaneOf = sp => (sp === FL.specs.attn ? 'A:' : 'D:');
function flSpecOps(sp, cost) { const mm = sp._co || (sp._co = {}); if (mm[cost]) return mm[cost]; const out = mm[cost] = []; for (const o of sp.ops) if (o.cost === cost && (o.section === 'attn' || o.section === 'delta' || o.section === 'ffn')) out.push(o); return out; }
function flActive(n, ps) {
  FL.act = null; FL.actP = 0; FL.actE = -9;
  if (ps.preview || !n.seg || n.seg !== ps.seg) return;
  const sp = FL.specs[R.kinds[n.layer]] || FL.spec;
  if (n.head) { FL.act = 'head'; FL.actP = Math.min(1, (n.f - layerFractions(n.seg)[R.m.layers]) / Math.max(1e-9, 1 - layerFractions(n.seg)[R.m.layers])); return; }
  if (!n.op || n.layer !== ps.layer) return;
  const k = n.op.kind === 'expert' || n.op.kind === 'expertsAll' ? 'expert' : n.op.id, gr = flCostGroups(n.layer, n.seg)[k]; if (!gr) return;
  const list = flSpecOps(k === 'expert' ? FL.spec : sp, k); if (!list.length) return;
  const p = Math.max(0, Math.min(.9999, (n.lp - gr[0]) / Math.max(1e-12, gr[1] - gr[0]))), j = Math.floor(p * list.length), o = list[j];
  FL.act = flItemKeyOfOp(o); FL.actP = p * list.length - j; if (n.op.kind === 'expert') FL.actE = n.op.e;
}
const flItemKeyOfOp = o => (o.section === 'attn' ? 'A:' : o.section === 'delta' ? 'D:' : FL.byId['E:' + o.out] ? 'E:' : FL.byId['F:' + o.out] ? 'F:' : '') + o.id;
// The items an operation touches: its operands and its result (for highlight and the camera).
const FL_OI = new Map();
function flOpItems(key) {
  const c0 = FL_OI.get(key); if (c0 && FL_OI.items === FL.items) return c0; if (FL_OI.items !== FL.items) { FL_OI.clear(); FL_OI.items = FL.items; }
  const r0 = flOpItems0(key); FL_OI.set(key, r0); return r0;
}
function flOpItems0(key) {
  const pre = key.includes(':') ? key.slice(0, key.indexOf(':') + 1) : '', id = key.slice(pre.length);
  const sp = pre === 'A:' ? FL.specs.attn : pre === 'D:' ? FL.specs.delta : FL.spec; if (!sp) return [];
  const o = sp.ops.find(q => q.id === id); if (!o) return FL.byId[key] ? [FL.byId[key]] : [];
  const it = tid => FL.byId[pre + tid] || FL.byId[tid] || (tid === 'Kc' ? FL.byId['A:KT'] : tid === 'Vc' ? FL.byId['A:Vh'] : null);
  const out = []; for (const t of [o.a, o.b, o.out, ...(o.extra || [])]) { const q = t && it(t); if (q && !out.includes(q)) out.push(q); }
  const nd = FL.byId[key] || FL.byId[id]; if (nd && nd.kind === 'node' && !out.includes(nd)) out.push(nd);
  if (o.id === 'append') { const kt = FL.byId['A:KT'], vh = FL.byId['A:Vh']; if (kt && !out.includes(kt)) out.push(kt); if (vh && !out.includes(vh)) out.push(vh); }
  if (o.id === 'topk' || o.id === 'route') { const g = FL.byId.grid; if (g) out.push(g); }
  return out;
}
const flOpOfItem = it => { if (!it) return null; if (it.kind === 'node') return it.id; if (it.kind !== 't') return null; const t = it.t; if (t.role === 'weight') { const ov = FL.byId[it.over]; return ov ? flOpOfItem(ov) : null; } if (t.born < 0) return null; const o = it.sp.ops[t.born]; return o ? flItemKeyOfOp(o) : null; };

// ---- the guided walk: stops inside one pass, each with the playhead time it stands for ----
function flStops(ps) {
  const mk = `${ps.segIdx}|${ps.layer}|${FL.key}`; if (FL.stopsKey === mk && FL.stopsR === R) return FL.stopsMemo;
  const r = flStops0(ps); FL.stopsKey = mk; FL.stopsR = R; FL.stopsMemo = r; return r;
}
function flStops0(ps) {
  const seg = ps.seg, m = R.m, L = m.layers, out = [], lf = layerFractions(seg), pre = seg.k === 'prefill';
  const at = (layer, f) => { const sp = layerSpan(seg, layer); return sp[0] + (sp[1] - sp[0]) * f; };
  const costT = (layer, cost, j, nj) => { const g = flCostGroups(layer, seg)[cost]; if (!g) return at(layer, .5); return at(layer, g[0] + (g[1] - g[0]) * (j + .5) / nj); };
  const push = (key, t, frame, layer) => out.push({ key, t, frame, layer });
  push('embed', seg.a + seg.d * 1e-7, ['ids', 'x', 'W_emb'], 0);
  const lc = Math.max(0, Math.min(L - 1, ps.layer)), kind = R.kinds[lc];
  const mixer = (layer, kd) => {
    const sp = FL.specs[kd], P_ = kd === 'attn' ? 'A:' : 'D:'; if (!sp) return;
    const t0 = at(layer, 1e-6);
    push('norm1', t0, ['xn', 'norm1', 'x'], layer);
    if (kd === 'attn') {
      push('qkv', costT(layer, 'attn_q', 0, 1), ['A:q', 'A:k', 'A:v', 'A:Wq', 'A:Wk', 'A:Wv', 'xn'], layer);
      const att = flSpecOps(sp, 'attention'), j = id => att.findIndex(o => o.id === id);
      push('append', costT(layer, 'attention', j('append'), att.length), ['A:k', 'A:v', 'A:KT', 'A:Vh'], layer);
      push('scores', costT(layer, 'attention', j('scores'), att.length), ['A:qh', 'A:KT', 'A:s', 'gqa'], layer);
      push('mix', costT(layer, 'attention', j('mix'), att.length), ['A:p', 'A:Vh', 'A:oh', 'A:softmax'], layer);
      push('wo', costT(layer, 'attn_output', 0, 1), ['A:o', 'A:Wo', 'A:a', 'add1'], layer);
    } else {
      push('dqkv', costT(layer, 'attn_qkv', 0, 1), ['D:qkv', 'D:Wqkv', 'D:g', 'D:Wg'], layer);
      const st = flSpecOps(sp, 'state'), j = st.findIndex(o => o.id === 'state');
      push('dstate', costT(layer, 'state', j, st.length), ['D:dq', 'D:S', 'D:dy'], layer);
      push('dout', costT(layer, 'ssm_out', 0, 1), ['D:yg', 'D:Wso', 'D:a', 'add1'], layer);
    }
  };
  const ffn = layer => {
    if (FL.spec.T.Wr) { push('route', costT(layer, 'router', 0, 1), ['xn2', 'Wr', 'r', 'sel', 'grid'], layer); push('expert', costT(layer, 'expert', .2, 1), ['E:eu', 'E:Weu', 'E:eh', 'E:ef', 'E:Wed', 'grid'], layer); }
    else push('ffn', costT(layer, FL.spec.T.Wg2 ? 'ffn_gate' : 'ffn_up', 0, 1), ['F:fu', 'F:Wu', 'F:fh', 'F:f', 'F:Wd', 'xn2'], layer);
    push('add2', at(layer, 1 - 1e-6), ['add2', 'f', 'F:f', 'frame2'], layer);
  };
  mixer(lc, kind); ffn(lc);
  if (FL.hybrid) { const other = kind === 'attn' ? 'delta' : 'attn'; let j = lc + 1; while (j < L && R.kinds[j] !== other) j++; if (j < L) mixer(j, other); }
  push('stack', at(L - 1, 1 - 2e-6), ['pillar', 'frame', 'frame2'], L - 1);
  const hT = pre ? seg.a + seg.d * (1 - 2e-7) : seg.a + seg.d * (lf[L] + (1 - lf[L]) * .5);
  push('head', hT, ['xf', 'Wout', 'lg'], L - 1);
  push('sample', seg.a + seg.d * (1 - 1e-7), ['lg', 'sample', 'tok'], L - 1);
  for (let i = 1; i < out.length; i++) if (out[i].t <= out[i - 1].t) out[i].t = out[i - 1].t + seg.d * 1e-9;
  return out;
}
function flStopText(key) {
  const d = FL.spec.dims, m = R.m, nt = FL.nt, f = v => num(v), ps = flPassNow, pre = ps && ps.seg.k === 'prefill';
  const hs = FL.specs.delta ? FL.specs.delta.T.S.mult : 0, Fe = d.F;
  const T = {
    embed: [L('Embedding', 'Embedding'), L(`Each token id picks one row of a ${f(d.V)} × ${f(d.d)} table: the token becomes ${f(d.d)} numbers. A lookup, no arithmetic.`, `Cada id de token elige una fila de una tabla de ${f(d.V)} × ${f(d.d)}: el token pasa a ser ${f(d.d)} números. Una consulta, sin aritmética.`)],
    norm1: [L('Normalisation', 'Normalización'), L('RMSNorm rescales each row so its size is about 1, then the layer works on the copy. The shape does not change.', 'RMSNorm reescala cada fila para que su tamaño ronde 1, y la capa trabaja sobre la copia. La forma no cambia.')],
    qkv: [L('Query, key, value', 'Consulta, clave, valor'), L(`Three matrices read the same ${f(d.d)} numbers. The query is what this token looks for; the key and the value are what it offers to later tokens.`, `Tres matrices leen los mismos ${f(d.d)} números. La consulta es lo que este token busca; la clave y el valor, lo que ofrece a los tokens siguientes.`)],
    append: [L('KV cache', 'Caché KV'), L(`The new keys and values join the cache: ${f(nt)} row${nt > 1 ? 's' : ''} now, one more for every token from here on, in every attention layer. ${f(FL.ctx)} rows so far.`, `Las claves y valores nuevos entran en la caché: ${f(nt)} fila${nt > 1 ? 's' : ''} ahora, una más por cada token a partir de aquí, en cada capa de atención. ${f(FL.ctx)} filas hasta ahora.`)],
    scores: [L('Scores', 'Puntuaciones'), L(`Each of the ${d.H} query heads compares itself with every cached key. There are only ${d.Hkv} sets of keys: ${d.group} heads share each one (grouped-query attention).`, `Cada una de las ${d.H} cabezas de consulta se compara con todas las claves en caché. Solo hay ${d.Hkv} juegos de claves: ${d.group} cabezas comparten cada uno (atención de consultas agrupadas).`) + (pre ? L(' Inside a chunk, a token only sees the ones before it: the masked corner.', ' Dentro de un bloque, cada token solo ve los anteriores: la esquina enmascarada.') : '')],
    mix: [L('Weighted sum', 'Suma ponderada'), L('Softmax turns each row of scores into weights that add up to 1. The cached values are averaged with those weights.', 'Softmax convierte cada fila de puntuaciones en pesos que suman 1. Los valores en caché se promedian con esos pesos.')],
    wo: [L('Back to the stream', 'De vuelta al flujo'), L(`The ${d.H} heads side by side, ${d.H} · ${d.dh} = ${f(d.H * d.dh)} wide, are folded back to ${f(d.d)} by one matrix and added to the stream.`, `Las ${d.H} cabezas, una al lado de otra, ${d.H} · ${d.dh} = ${f(d.H * d.dh)} de ancho, vuelven a ${f(d.d)} con una matriz y se suman al flujo.`)],
    dqkv: [L('DeltaNet input', 'Entrada de DeltaNet'), L('One matrix gives queries, keys and values, another an output gate. There is no cache here: the past lives in a fixed-size state.', 'Una matriz da consultas, claves y valores; otra, una puerta de salida. Aquí no hay caché: el pasado vive en un estado de tamaño fijo.')],
    dstate: [L('Fixed state', 'Estado fijo'), L(`Each of ${hs} heads keeps a 128 × 128 state. The token's key and value update it, its query reads it. It is the same size at token 1 and at token 100,000.`, `Cada una de las ${hs} cabezas guarda un estado de 128 × 128. La clave y el valor del token lo actualizan y su consulta lo lee. Mide lo mismo en el token 1 que en el 100.000.`)],
    dout: [L('Back to the stream', 'De vuelta al flujo'), L(`The readout passes the gate, is projected back to ${f(d.d)} and added to the stream.`, `La lectura pasa la puerta, se proyecta de vuelta a ${f(d.d)} y se suma al flujo.`)],
    route: [L('Router', 'Router'), L(`The router scores all ${d.E} experts for each token and keeps the best ${d.k}${d.shared ? `, plus ${d.shared} shared expert that every token uses` : ''}.`, `El router puntúa los ${d.E} expertos para cada token y se queda con los ${d.k} mejores${d.shared ? `, más ${d.shared} experto compartido que usan todos` : ''}.`)],
    expert: [L('Experts', 'Expertos'), L(`Each chosen expert widens the token to ${f(Fe)}, gates it and brings it back to ${f(d.d)}. The other ${f(d.E - d.k)} are not read at all${pre ? ' by this token' : ''}.`, `Cada experto elegido ensancha el token a ${f(Fe)}, lo filtra con la puerta y lo devuelve a ${f(d.d)}. Los otros ${f(d.E - d.k)} no se leen${pre ? ' para este token' : ''}.`)],
    ffn: [L('Feed-forward', 'Feed-forward'), FL.spec.T.Wg2 ? L(`Two matrices widen the token to ${f(Fe)}; one gates the other; a third brings it back to ${f(d.d)}. Most of the layer's weights are here.`, `Dos matrices ensanchan el token a ${f(Fe)}; una filtra a la otra; una tercera lo devuelve a ${f(d.d)}. Aquí está la mayoría de los pesos de la capa.`) : L(`One matrix widens the token to ${f(Fe)}, an activation bends it, another brings it back to ${f(d.d)}.`, `Una matriz ensancha el token a ${f(Fe)}, una activación lo dobla y otra lo devuelve a ${f(d.d)}.`)],
    add2: [L('Residual', 'Residual'), L(`The result is added to the stream instead of replacing it: each layer nudges the same ${f(d.d)} numbers.`, `El resultado se suma al flujo en vez de sustituirlo: cada capa retoca los mismos ${f(d.d)} números.`)],
    stack: [L('Every layer', 'Todas las capas'), L(`The same steps run in all ${m.layers} layers, each with its own weights.`, `Los mismos pasos corren en las ${m.layers} capas, cada una con sus propios pesos.`) + (FL.hybrid ? L(` ${m.layers - m.kvLayers} are DeltaNet, ${m.kvLayers} attention.`, ` ${m.layers - m.kvLayers} son DeltaNet, ${m.kvLayers} de atención.`) : '') + (FL.slowN ? L(` The first ${FL.slowN} did not fit on the card and run from system RAM.`, ` Las ${FL.slowN} primeras no cupieron en la tarjeta y corren desde la RAM del sistema.`) : '')],
    head: [L('Output head', 'Cabeza de salida'), FL.nOut ? L(`After the last layer, one ${f(d.d)} × ${f(d.V)} matrix gives a score to every token of the vocabulary${FL.nOut > 1 ? `, for each of the ${FL.nOut} positions this pass checks` : ''}.`, `Tras la última capa, una matriz de ${f(d.d)} × ${f(d.V)} da una puntuación a cada token del vocabulario${FL.nOut > 1 ? `, para cada una de las ${FL.nOut} posiciones que comprueba esta pasada` : ''}.`) : L('This prefill chunk stops before the head: only the prompt\'s last position needs scores, and it is in the last chunk.', 'Este bloque de prefill para antes de la cabeza: solo la última posición del prompt necesita puntuaciones, y está en el último bloque.')],
    sample: [L('Sampling', 'Muestreo'), FL.nOut ? L('Sampling picks one token from the scores. It becomes the next input, and the pass starts again.', 'El muestreo elige un token entre las puntuaciones. Pasa a ser la siguiente entrada, y la pasada empieza otra vez.') : L('Nothing is sampled yet: the first token comes after the last chunk.', 'Aún no se muestrea nada: el primer token llega tras el último bloque.')],
  };
  return T[key] || [key, ''];
}
let flPassNow = null;

// ---- camera ----
function flFrameRect(ids) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const id of ids) { const it = FL.byId[id]; if (!it) continue; x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); } return x1 > x0 ? [x0, y0, x1, y1] : null; }
function flAim(r, maxZ = 14) {
  const padT = (HUDP[0] || 30) + 22, padB = FL.W < 640 ? 150 : 128, aw = Math.max(80, FL.W - 40), ah = Math.max(60, FL.H - padT - padB);
  const w = r[2] - r[0] + 4, h = r[3] - r[1] + 5, z = Math.max(.6, Math.min(maxZ, aw / w, ah / h));
  FL.tgt.x = (r[0] + r[2]) / 2; FL.tgt.z = z; FL.tgt.y = (r[1] + r[3]) / 2 + (padB - padT) / 2 / z;
}
function flFit() { flAim(FL.world, 40); }
function flStep(dt) {
  const c = FL.cam, t = FL.tgt, red = xReduced(), k = red ? 1 : 1 - Math.exp(-dt * 6);
  const lz = Math.log(c.z), lt = Math.log(t.z);
  if (Math.abs(c.x - t.x) * c.z < .3 && Math.abs(c.y - t.y) * c.z < .3 && Math.abs(lz - lt) < .002) { if (c.x !== t.x || c.y !== t.y || c.z !== t.z) FL.dirty = true; c.x = t.x; c.y = t.y; c.z = t.z; return; }
  c.z = Math.exp(lz + (lt - lz) * k); c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; FL.dirty = true;
}
const flSX = wx => (wx - FL.cam.x) * FL.cam.z + FL.W / 2, flSY = wy => (wy - FL.cam.y) * FL.cam.z + FL.H / 2;
const flWX = sx => (sx - FL.W / 2) / FL.cam.z + FL.cam.x, flWY = sy => (sy - FL.H / 2) / FL.cam.z + FL.cam.y;

// ---- drawing ----
function flDimText(fs) { let s = ''; for (let i = 0; i < fs.length; i++) s += (i ? '·' : '') + num(fs[i][1]); return s; }
// "[1 × 16·256]" with each number in its dimension's colour; returns the width drawn.
function flDims(x, t, X, Y, size, alpha = 1, strikeC = false) {
  x.font = `600 ${size}px ${FONT}`; x.globalAlpha = alpha; let cx = X;
  const seg = (s, col) => { x.fillStyle = col; x.fillText(s, cx, Y); cx += x.measureText(s).width; };
  seg('[', C.dim);
  const side2 = (fs, isC) => { for (let i = 0; i < fs.length; i++) { if (i) seg('·', C.dim); const s = num(fs[i][1]); const x0 = cx; seg(s, DIMC[fs[i][0]] || C.mid); if (isC && strikeC) { x.fillRect(x0, Y - size * .35, cx - x0, 1); } } };
  side2(t.r, false); seg(' × ', C.dim); side2(t.c, true); seg(']', C.dim);
  if (t.mult) seg(` ×${t.mult}`, DIMC[t.multDim] || C.mid);
  x.globalAlpha = 1; return cx - X;
}
function flDimSyms(t) { const f = fs => fs.map(q => DIMSYM[q[0]] || num(q[1])).join('·'); return `${f(t.r)} × ${f(t.c)}`; }
// The edge of a side, in its dimensions' colours: on the log scale each factor's share is its own log, exactly.
function flEdge(x, fs, X, Y, len, horiz, th) {
  const tot = flS(flSide(fs)); let acc = 0;
  for (let i = 0; i < fs.length; i++) {
    const part = FL.scale === 'lin' ? 1 / fs.length : (i === 0 ? 1 + Math.log2(Math.max(1, fs[0][1])) : Math.log2(Math.max(1, fs[i][1]))) / tot;
    const a = acc * len, b = Math.min(len, (acc + part) * len); acc += part; x.fillStyle = DIMC[fs[i][0]] || C.mid;
    if (horiz) x.fillRect(X + a, Y, Math.max(.8, b - a - (i < fs.length - 1 ? 1 : 0)), th); else x.fillRect(X, Y + a, th, Math.max(.8, b - a - (i < fs.length - 1 ? 1 : 0)));
  }
}
function flDraw(n, dt) {
  const c = $('cFlow'), r = $('stage').getBoundingClientRect(), W = Math.max(220, Math.floor(r.width)), H = Math.max(200, Math.floor(r.height)), dpr = Math.min(3, window.devicePixelRatio || 1);
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; FL.dirty = true; }
  FL.W = W; FL.H = H; FL.dpr = dpr;
  const ps = flPass(n); flPassNow = ps; if (!ps) return;
  const key = `${S.model}|${S.quant}|${S.kv}|${ps.nt}|${R.ctx}|${ps.nOut}|${FL.scale}|${R.mc.kind}|${R.pl.fastShare.toFixed(3)}|${ps.layer}|${lang}`;
  // the layer shown changes only what is lit, not the layout, except which spec feeds the shared parts
  const shapeKey = key.replace(/\|\d+\|[a-z]+$/, '') + '|' + R.kinds[ps.layer];
  if (shapeKey !== FL.key || R !== FL.R) { const fresh = !FL.items.length || FL.R === undefined; FL.key = shapeKey; FL.R = R; flLayout(ps); FL.dirty = true; if (fresh || !FL.fitted) { flFit(); FL.cam.x = FL.tgt.x; FL.cam.y = FL.tgt.y; FL.cam.z = FL.tgt.z; FL.fitted = true; } }
  if (ps.ctx !== FL.ctx) { FL.ctx = ps.ctx; for (const it of FL.items) if (it.res) it.fill = flS(Math.max(1, ps.ctx)) / flS(FL.ctxRes); FL.dirty = true; }
  FL.layer = ps.layer; FL.seg = ps.seg; FL.segIdx = ps.segIdx; FL.kind = R.kinds[ps.layer]; FL.preview = ps.preview;
  flActive(n, ps);
  // follow: the camera frames whatever the playhead is doing; when paused on a stop, that stop
  if (FL.follow && !FL.drag && !FL.pinch) {
    // while playing, the camera holds still enough to read: one operation if it lasts long on screen, else the layer, else the pass
    let fk = 'fit';
    if (P.on && FL.act) { const sp2 = speedNow(n), ls = layerSpan(ps.seg, Math.min(ps.layer, R.m.layers - 1)), lr = (ls[1] - ls[0]) / sp2, or2 = n.op ? (n.op.b - n.op.a) * (ls[1] - ls[0]) / sp2 : 0; fk = or2 > .7 ? 'op:' + FL.act : lr > .7 ? 'layer' : 'fit'; }
    else if (P.on) fk = FL.lastKey || 'fit';
    else if (FL.stop >= 0 && FL.stopT === P.t) fk = 'stop:' + FL.stop;
    else if (FL.act) fk = 'op:' + FL.act;
    if (fk !== FL.lastKey) { FL.lastKey = fk; let rr = null;
      if (fk.startsWith('op:')) rr = flFrameRect(flOpItems(FL.act).map(q => q.id));
      else if (fk === 'layer') rr = flFrameRect(['frame', 'frame2']);
      else if (fk.startsWith('stop:')) { const st = flWalk(ps)[FL.stop]; if (st) rr = flFrameRect(st.frame); }
      if (rr) flAim(rr); else flFit(); }
  }
  flStep(dt);
  if (UI.flash && UI.flash.canvas === 'cFlow' && FL.flashSeen !== UI.flash) { FL.flashSeen = UI.flash; const f = UI.flash; if (typeof f.match === 'function') { const ids = FL.items.filter(it => f.match(flSelOf(it) || {})).map(it => it.id); const rr = flFrameRect(ids); if (rr) { FL.follow = false; FL.lastKey = 'flash'; flAim(rr); } } }
  if (P.on || (UI.flash && UI.flash.canvas === 'cFlow') || (UI.brush && UI.brush.canvas === 'cFlow')) FL.dirty = true;
  if (P.t !== FL.lastT) { FL.lastT = P.t; FL.dirty = true; }
  flUi(ps);
  if (!FL.dirty) return;
  FL.dirty = false; const t0 = performance.now();
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H); x.textBaseline = 'alphabetic'; x.textAlign = 'left'; x.lineJoin = 'round';
  const z = FL.cam.z, m = R.m, actItems = FL.act ? flOpItems(FL.act) : null, selId = UI.sel && UI.sel.k === 'flow' ? UI.sel.id : null, hovId = FL.hov ? FL.hov.id : null;
  const hovOp = FL.hov ? flOpOfItem(FL.hov) : null, focusOp = hovOp || (selId ? flOpOfItem(FL.byId[selId]) : null) || FL.act, focusItems = focusOp ? flOpItems(focusOp) : null, hudOp = hovOp || (selId ? flOpOfItem(FL.byId[selId]) : null) || (P.on ? FL.act : null);
  const laneDim = it => (FL.hybrid && (it.lane === 'A' || it.lane === 'D') && (it.lane === 'A') !== (FL.kind === 'attn') ? .28 : 1);
  // the layer: two frames (it wraps onto a second row), a header above, and where its weights and buffers live
  { const dv = flDev(FL.layer), dcol = dv === 'ram' ? HW.ram : dv === 'vram' ? HW.vram : C.li;
    for (const id of ['frame', 'frame2']) { const fr = FL.byId[id], X0 = flSX(fr.x), Y0 = flSY(fr.y), w = fr.w * z, h = fr.h * z; x.fillStyle = 'rgba(255,255,255,.016)'; x.fillRect(X0, Y0, w, h); x.strokeStyle = C.line2; x.lineWidth = 1; x.strokeRect(Math.round(X0) + .5, Math.round(Y0) + .5, Math.round(w), Math.round(h)); x.fillStyle = dcol; x.fillRect(X0, Y0, w, 2); }
    const fr = FL.byId.frame, X0 = flSX(fr.x), Y0 = flSY(fr.y);
    const hd = L(`Layer ${FL.layer + 1} of ${m.layers} · ${FL.kind === 'attn' ? 'attention' : 'DeltaNet'}`, `Capa ${FL.layer + 1} de ${m.layers} · ${FL.kind === 'attn' ? 'atención' : 'DeltaNet'}`);
    const where = dv === 'ram' ? L('weights and buffers in system RAM', 'pesos y búferes en RAM del sistema') : dv === 'vram' ? L('weights and buffers in VRAM', 'pesos y búferes en VRAM') : L('weights and buffers in shared memory', 'pesos y búferes en memoria compartida');
    x.font = `650 ${z >= 5 ? 13 : 11.5}px ${FONT}`; x.fillStyle = C.ink; x.fillText(hd, X0, Y0 - 7); const hw = x.measureText(hd).width;
    x.font = `400 10px ${FONT}`; x.fillStyle = dcol; if (z >= 3) x.fillText(where, X0 + hw + 12, Y0 - 7);
    const f2 = FL.byId.frame2; if (z >= 3) { x.font = `400 10px ${FONT}`; x.fillStyle = C.dim; x.fillText(L('… the same layer, continued', '… la misma capa, sigue'), flSX(f2.x), flSY(f2.y) - 7); }
    if (z >= 3) { x.font = `600 10px ${FONT}`; x.fillStyle = C.dim; const ids = FL.byId.ids; x.fillText(L('input', 'entrada'), flSX(ids.x), Y0 - 7); const xf = FL.byId.xf; x.fillText(L('output', 'salida'), flSX(xf.x), flSY(f2.y) - 7); }
    if (FL.hybrid && z > 2.6) { x.font = `600 10px ${FONT}`; for (const [ln, lab, col] of [['A', L('attention lane', 'carril de atención'), C.hot], ['D', L('DeltaNet lane', 'carril DeltaNet'), C.teal]]) { const q = FL.byId[ln === 'A' ? 'A:q' : 'D:qkv']; if (!q) continue; let ty = 1e9; for (const it of FL.items) if (it.lane === ln) ty = Math.min(ty, it.y); const on = (ln === 'A') === (FL.kind === 'attn'); x.globalAlpha = on ? 1 : .5; x.fillStyle = col; x.fillText(lab + (on ? '' : L(' · not this layer', ' · no en esta capa')), flSX(q.x), flSY(ty) - 5); x.globalAlpha = 1; } }
  }
  // the residual stream: one line under the rail from the embedding to the final norm, wrapping to the second row,
  // with a tap up into every norm and every add
  { const S2 = FL.stream, y1 = Math.round(flSY(S2.y1)) + .5, y2 = Math.round(flSY(S2.y2)) + .5, yw = Math.round(flSY(S2.yWrap)) + .5, a = flSX(FL.opX.embed), e1 = flSX(S2.xE1), x2 = flSX(S2.x2), b = flSX(FL.opX.normf), nf = FL.byId.normf;
    x.strokeStyle = DIMC.d; x.globalAlpha = .5; x.lineWidth = Math.max(1.5, Math.min(4, z * .32)); x.beginPath(); x.moveTo(a, flSY(FL.byId.x.y + FL.byId.x.h)); x.lineTo(a, y1); x.lineTo(e1, y1); x.lineTo(e1, yw); x.lineTo(x2, yw); x.lineTo(x2, y2); x.lineTo(b, y2); x.lineTo(b, flSY(nf.y + nf.h)); x.stroke();
    x.lineWidth = 1.2; x.beginPath(); for (const k of ['norm1', 'add1', 'norm2', 'add2']) { const nd = FL.byId[k], X = flSX(FL.opX[k]); x.moveTo(X, k === 'norm1' || k === 'add1' ? y1 : y2); x.lineTo(X, flSY(nd.y + nd.h)); } x.stroke(); x.globalAlpha = 1; x.lineWidth = 1;
    if (z > 3.2) { x.font = `500 10px ${FONT}`; x.fillStyle = C.dim; const s = L(`residual stream · [${num(FL.nt)} × ${num(m.hidden)}] · lives the whole pass`, `flujo residual · [${num(FL.nt)} × ${num(m.hidden)}] · vive toda la pasada`); x.fillText(s, flSX(FL.opX.norm1) + 8, y1 + 13); } }
  // arrows along the rail: each operand to its result
  x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 1;
  for (const it of FL.items) if (it.kind === 't' && it.t.role !== 'weight' && it.over == null) { /* links drawn per op below */ }
  for (const sp of [FL.specs.attn, FL.specs.delta]) if (sp) for (const o of sp.ops) {
    if (!o.a || o.kind === 'gather') continue; const key = flItemKeyOfOp(o), outI = FL.byId[(key.includes(':') ? key.slice(0, key.indexOf(':') + 1) : '') + o.out] || FL.byId[o.out]; if (!outI || outI.kind !== 't') continue;
    if (FL.hybrid && sp !== FL.spec && o.section !== (sp === FL.specs.attn ? 'attn' : 'delta')) continue;
    const pre = key.includes(':') ? key.slice(0, key.indexOf(':') + 1) : '', aI = FL.byId[pre + o.a] || FL.byId[o.a]; if (!aI || aI === outI || aI.kind !== 't') continue;
    const ya = flSY(aI.y + Math.min(aI.h, FL.byId.xn.h) / 2), yb = flSY(outI.y + Math.min(outI.h, FL.byId.xn.h) / 2), xa = flSX(aI.x + aI.w), xb = flSX(outI.x);
    if (xb - xa < 3 && Math.abs(ya - yb) < 2) continue;
    x.globalAlpha = laneDim(outI); x.beginPath(); x.moveTo(xa + 1, ya); if (Math.abs(ya - yb) > 1) { const mx = xa + Math.min(14, (xb - xa) / 2); x.lineTo(mx, ya); x.lineTo(mx, yb); } x.lineTo(xb - 2, yb); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.moveTo(xb - 1, yb); x.lineTo(xb - 5, yb - 2.5); x.lineTo(xb - 5, yb + 2.5); x.fill(); x.globalAlpha = 1;
  }
  // the items
  for (const it of FL.items) {
    const X = flSX(it.x), Y = flSY(it.y), w = it.w * z, h = it.h * z;
    if (X > W + 40 || Y > H + 40 || X + w < -40 || Y + h < -40) continue;
    const dimA = laneDim(it), isAct = actItems && actItems.includes(it), inFocus = focusItems && focusItems.includes(it);
    x.globalAlpha = dimA;
    if (it.kind === 't') flDrawT(x, it, X, Y, w, h, z, isAct, inFocus, focusOp);
    else if (it.kind === 'node') flDrawNode(x, it, X, Y, w, isAct || inFocus);
    else if (it.kind === 'grid') flDrawGrid(x, it, X, Y, z, inFocus || FL.act === 'E:egate' || FL.act === 'E:eup' || FL.act === 'E:edown');
    else if (it.kind === 'pillar') flDrawPillar(x, it, X, Y, w, h);
    else if (it.kind === 'gqa') flDrawGqa(x, it, X, Y, w, h, z, inFocus || FL.act === 'A:scores' || FL.act === 'A:mix');
    else if (it.kind === 'bracket' && z > 2.4) { x.strokeStyle = C.teal; x.globalAlpha = .7 * dimA; x.beginPath(); x.moveTo(X, Y + 5); x.lineTo(X, Y); x.lineTo(X + w, Y); x.lineTo(X + w, Y + 5); x.stroke(); x.font = `500 10px ${FONT}`; x.fillStyle = C.teal; const s = L(`one expert, drawn · ×${m.expertsUsed}${m.sharedExperts ? ` + ${m.sharedExperts} shared` : ''} run alike`, `un experto, dibujado · ×${m.expertsUsed}${m.sharedExperts ? ` + ${m.sharedExperts} compartido` : ''} iguales`); flClip(x, s, X + 4, Y - 4, w - 4); }
    if (it.id === selId) { x.globalAlpha = 1; x.save(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.shadowColor = 'rgba(255,255,255,.8)'; x.shadowBlur = 6; x.strokeRect(X - 2, Y - 2, w + 4, h + 4); x.restore(); }
    else if (it.id === hovId) { x.globalAlpha = 1; x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1; x.strokeRect(X - 1.5, Y - 1.5, w + 3, h + 3); }
    x.globalAlpha = 1;
  }
  flDrawLifes(x, z, focusItems || (selId && FL.byId[selId] ? [FL.byId[selId]] : null));
  // the flash from "See it in Flow" elsewhere, and the legend brush
  if (UI.flash && UI.flash.canvas === 'cFlow' && typeof UI.flash.match === 'function') { const e = (performance.now() - UI.flash.t0) / 1500; if (e >= 1) UI.flash = null; else { const a = (.55 + .45 * Math.sin(e * Math.PI * 4 - Math.PI / 2)) * (1 - e * .6); x.save(); x.strokeStyle = `rgba(255,212,59,${a.toFixed(3)})`; x.lineWidth = 2; x.shadowColor = C.hot; x.shadowBlur = 10 * a; for (const it of FL.items) if (UI.flash.match(flSelOf(it) || {})) x.strokeRect(flSX(it.x) - 2, flSY(it.y) - 2, it.w * z + 4, it.h * z + 4); x.restore(); } }
  if (UI.brush && UI.brush.canvas === 'cFlow') { x.save(); x.strokeStyle = 'rgba(255,255,255,.75)'; x.setLineDash([4, 3]); for (const it of FL.items) if (UI.brush.match(flSelOf(it) || {})) x.strokeRect(flSX(it.x) - 2, flSY(it.y) - 2, it.w * z + 4, it.h * z + 4); x.restore(); }
  flDrawHud(x, W, H, hudOp);
  const ms = performance.now() - t0; FL.ft[FL.fi] = ms; FL.fi = (FL.fi + 1) % FL.ft.length; FL.fn++;
}
function flClip(x, s, X, Y, maxW) { if (maxW < 12) return; let t = s; if (x.measureText(t).width > maxW) { while (t.length > 2 && x.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; } x.fillText(t, X, Y); }
function flDrawT(x, it, X, Y, w, h, z, isAct, inFocus, focusOp) {
  const t = it.t, role = t.role, th = Math.max(1.5, Math.min(3.5, z * .28));
  // heads and experts that run alike: a few sheets behind the one drawn
  if (t.mult && t.mult > 1) { const o = Math.max(2, Math.min(5, z * .35)); for (let k = Math.min(3, t.mult - 1); k >= 1; k--) { x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 1; x.strokeRect(Math.round(X + o * k) + .5, Math.round(Y - o * k) + .5, Math.round(w), Math.round(h)); } }
  if (role === 'weight') { x.fillStyle = flPrecCol(t.bpw || 4.9); x.fillRect(X, Y, w, h); x.strokeStyle = C.li; x.lineWidth = 1; x.strokeRect(Math.round(X) + .5, Math.round(Y) + .5, Math.round(w) - 1, Math.round(h) - 1); }
  else if (role === 'kv' || role === 'state') {
    if (it.res) { fillKind(x, 'kvres', X, Y, w, h); const fw = it.res === 'c' ? w * it.fill : w, fh = it.res === 'r' ? h * it.fill : h; fillKind(x, role === 'kv' ? 'kv' : 'state', X, Y, fw, fh, 1, Math.max(.6, Math.min(1.6, z * .14)));
      // the newest rows: what this pass just wrote
      x.fillStyle = C.cy; if (it.res === 'c') x.fillRect(X + fw - 2, Y, 2, h); else x.fillRect(X, Y + fh - 2, w, 2); }
    else fillKind(x, role === 'kv' ? 'kv' : 'state', X, Y, w, h, 1, Math.max(.6, Math.min(1.6, z * .14)));
  } else if (role === 'ids') { x.fillStyle = '#14141a'; x.fillRect(X, Y, w, h); const rows = Math.min(24, Math.max(1, Math.floor(h / 4))); for (let i = 0; i < rows; i++) { x.fillStyle = it.id === 'tok' ? C.hot : TOKCOL[i % 3 === 0 ? 'docs' : 'sys']; x.fillRect(X + 1, Y + 1 + i * (h - 2) / rows, Math.max(1, w - 2), Math.max(1, (h - 2) / rows - (h / rows > 3 ? 1 : 0))); } }
  else {
    x.fillStyle = role === 'logits' ? '#1b1a26' : '#16161f'; x.fillRect(X, Y, w, h); x.strokeStyle = '#3c3c4a'; x.lineWidth = 1; x.strokeRect(Math.round(X) + .5, Math.round(Y) + .5, Math.round(w) - 1, Math.round(h) - 1);
    if (it.res) { x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(X, Y, w * it.fill, h); }
    // the causal mask of a prefill chunk: each of its tokens sees itself and the ones before, not the ones after
    if ((it.id === 'A:s' || it.id === 'A:p') && FL.nt > 1) { const cw = Math.max(w * .12, w * it.fill * Math.min(1, FL.nt / Math.max(1, FL.ctx))), x1 = X + w * it.fill; x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.moveTo(x1 - cw, Y); x.lineTo(x1, Y); x.lineTo(x1, Y + h); x.fill(); }
    if (role === 'logits' && FL.nOut === 0) { x.fillStyle = 'rgba(7,7,10,.6)'; x.fillRect(X, Y, w, h); }
  }
  // the gather: the rows of the embedding table this pass reads
  if (it.id === 'W_emb') { const rows = Math.min(FL.nt, 6); x.fillStyle = C.cy; for (let i = 0; i < rows; i++) { const fy = ((i * 0.6180339 * 7919 + (FL.segIdx * 13)) % 1 + 1) % 1; x.fillRect(X, Y + fy * (h - 2), w, Math.max(1, Math.min(2, h / 60))); } }
  // being computed now: the weight's rows read so far, the result filling, a glow
  if (isAct) {
    x.save(); x.shadowColor = C.cy; x.shadowBlur = 10; x.strokeStyle = C.cy; x.lineWidth = 1.6; x.strokeRect(X - 1, Y - 1, w + 2, h + 2); x.restore();
    if (role === 'weight') { x.fillStyle = 'rgba(127,227,255,.22)'; x.fillRect(X, Y, w * FL.actP, h); x.fillStyle = C.cy; x.fillRect(X + w * FL.actP - 1, Y, 2, h); }
    else if (it.t.born >= 0 && flOpOfItem(it) === FL.act) { x.fillStyle = 'rgba(127,227,255,.35)'; x.fillRect(X, Y, w * FL.actP, h); }
  }
  // dimension edges: columns along the top, rows down the left
  const emph = inFocus && focusOp;
  flEdge(x, t.c, X, Y - th, w, true, th); flEdge(x, t.r, X - th, Y, h, false, th);
  // the inner dimension of the product in focus: the first operand's columns and the second's rows, side by side
  if (emph && focusItems_(focusOp, it)) { x.save(); x.shadowColor = '#fff'; x.shadowBlur = 6; if (focusItems_(focusOp, it) === 'a') flEdge(x, t.c, X, Y - th * 2.2, w, true, th * 1.6); else flEdge(x, t.r, X - th * 2.2, Y, h, false, th * 1.6); x.restore(); }
  // labels, when there is room
  if (z >= 3.6 && w >= 30) {
    const big = z >= 6, sz = big ? 10.5 : 9.5, below = role !== 'weight' && role !== 'kv' && role !== 'state';
    const nm = flTN(t); x.font = `${role === 'weight' ? 600 : 500} ${sz}px ${FONT}`;
    if (role === 'weight') { if (h > 30 && w > 46) { x.fillStyle = 'rgba(10,10,14,.92)'; flClip(x, nm, X + 5, Y + 14, w - 8); x.font = `500 9.5px ${FONT}`; if (h > 46) flClip(x, `${t.prec}${t.bpw ? ` · ${dec(String(t.bpw))} b` : ''}`, X + 5, Y + 27, w - 8); } else if (z >= 5) { x.fillStyle = C.ink; flClip(x, nm, X, Y - th - 4, w + 8); } }
    else if (role === 'kv' || role === 'state') { x.fillStyle = C.ink; const lx = X, ly = Y - th - 5; x.font = `600 ${sz}px ${FONT}`; flClip(x, flTN(t) + (role === 'kv' ? ` · ${t.prec}` : ''), lx, ly, Math.max(w + 10, 60)); }
    if (below) {
      const yy = Y + h + (big ? 15 : 13); x.font = `500 ${sz}px ${FONT}`; x.fillStyle = C.mid; flClip(x, nm, X, yy, w + 10);
      if (big) flDims(x, t, X, yy + 13, 10, 1, false);
    } else if (big && role === 'weight') flDims(x, t, X, Y + h + 13, 9.5, .9);

  }
}
// Which operand of the product in focus an item is ('a' its first, 'b' its second), for the inner-dimension highlight.
let FOCUS_AB = { key: '', a: null, b: null };
function focusItems_(key, it) {
  if (FOCUS_AB.key !== key) { FOCUS_AB.key = key; FOCUS_AB.a = FOCUS_AB.b = null; const pre = key.includes(':') ? key.slice(0, key.indexOf(':') + 1) : '', id = key.slice(pre.length), sp = pre === 'A:' ? FL.specs.attn : pre === 'D:' ? FL.specs.delta : FL.spec, o = sp && sp.ops.find(q => q.id === id);
    if (o && (o.kind === 'matmul' || o.kind === 'attn' || o.kind === 'state' || (o.kind === 'route' && o.b))) { FOCUS_AB.a = FL.byId[pre + o.a] || FL.byId[o.a]; FOCUS_AB.b = FL.byId[pre + o.b] || FL.byId[o.b]; } }
  return it === FOCUS_AB.a ? 'a' : it === FOCUS_AB.b ? 'b' : null;
}
const FL_NODE = { N: 'RMS', '+': '+', 'σ': 'σ', '⊙': '⊙', k: 'top', 'Σ': 'Σ', '?': '↓', g: 'act' };
function flDrawNode(x, it, X, Y, w, on) {
  const r = w / 2, cx = X + r, cy = Y + r; x.fillStyle = on ? 'rgba(127,227,255,.18)' : '#111116'; x.strokeStyle = on ? C.cy : '#56566a'; x.lineWidth = on ? 1.6 : 1;
  x.beginPath(); x.arc(cx, cy, Math.max(4, r), 0, 7); x.fill(); x.stroke();
  if (r >= 5) { x.font = `700 ${Math.max(8.5, Math.min(13, r * .9))}px ${FONT}`; x.fillStyle = on ? C.ink : C.mid; x.textAlign = 'center'; x.fillText(FL_NODE[it.sym] || it.sym, cx, cy + Math.min(13, r * .9) * .36); x.textAlign = 'left'; }
}
function flDrawGrid(x, it, X, Y, z, on) {
  const m = R.m, E = m.experts, cs = it.cs * z, ps = flPassNow, pre = ps && ps.seg.k !== 'decode', tok = ps && !pre ? ps.seg.tok : 0;
  const chosen = flChosen(tok, FL.layer, pre), lit = FL.act && (FL.act.startsWith('E:') || FL.act === 'esum');
  for (let e = 0; e < E; e++) {
    const cx = X + (e % it.cols) * cs, cy = Y + Math.floor(e / it.cols) * cs, on2 = chosen.has(e);
    x.fillStyle = on2 ? flPrecCol(FL.spec.T.Weu.bpw) : '#1a1826'; x.globalAlpha = on2 ? 1 : .55; x.fillRect(cx, cy, Math.max(1, cs - (cs > 3 ? 1 : 0)), Math.max(1, cs - (cs > 3 ? 1 : 0)));
    if (on2 && cs > 4) { x.strokeStyle = C.teal; x.lineWidth = 1; x.strokeRect(cx + .5, cy + .5, cs - 2, cs - 2); }
    if (lit && e === FL.actE) { x.globalAlpha = 1; x.save(); x.shadowColor = C.cy; x.shadowBlur = 8; x.strokeStyle = C.cy; x.lineWidth = 1.6; x.strokeRect(cx - .5, cy - .5, cs, cs); x.restore(); }
  }
  x.globalAlpha = 1;
  if (m.sharedExperts) { const sy = Y + it.rows * cs + cs * .6; x.fillStyle = flPrecCol(FL.spec.T.Weu.bpw); x.fillRect(X, sy, cs * 3 - 1, cs - 1); x.strokeStyle = C.teal; x.strokeRect(X + .5, sy + .5, cs * 3 - 2, cs - 2); if (z > 2.5) { x.font = `500 9.5px ${FONT}`; x.fillStyle = C.mid; x.fillText(L('shared', 'compartido'), X + cs * 3 + 4, sy + cs - 2); } }
  if (z > 2.2) { x.font = `600 10px ${FONT}`; x.fillStyle = C.ink; const nT = Math.round(expertsTouched(m, FL.nt)), s = pre ? (ps.seg.k === 'prefill' ? L(`${num(nT)} of ${E} touched by this chunk`, `${num(nT)} de ${E} tocados por este bloque`) : L(`${num(nT)} of ${E} touched by these ${FL.nt} tokens`, `${num(nT)} de ${E} tocados por estos ${FL.nt} tokens`)) : L(`${E} experts · ${m.expertsUsed} chosen`, `${E} expertos · ${m.expertsUsed} elegidos`); flClip(x, s, X, Y - 6, it.w * z + 8); }
}
let flChosenKey = '', flChosenSet = new Set();
function flChosen(tok, layer, pre) {
  const k = `${tok}|${layer}|${pre}|${FL.nt}|${S.model}`; if (k === flChosenKey) return flChosenSet; flChosenKey = k; flChosenSet = new Set();
  if (pre) { const p = expertsTouched(R.m, FL.nt) / R.m.experts; for (let e = 0; e < R.m.experts; e++) if (rngOf(e * 7 + 1 + layer * 131)() < p) flChosenSet.add(e); }
  else for (const e of chosenExperts(tok, layer)) flChosenSet.add(e);
  return flChosenSet;
}
// Grouped-query attention, drawn: every query head (top) points to the KV head its group shares (bottom).
function flDrawGqa(x, it, X, Y, w, h, z, on) {
  const d = FL.specs.attn.dims, H = d.H, K = d.Hkv; if (!H || !K || w < 18) return;
  const qw = w / H, kw = w / K, y0 = Y + h * .12, y1 = Y + h * .62, ch = Math.max(2, h * .22);
  x.globalAlpha *= on ? 1 : .7;
  x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 1; x.beginPath();
  for (let i = 0; i < H; i++) { const g = Math.floor(i / (H / K)); x.moveTo(X + (i + .5) * qw, y0 + ch); x.lineTo(X + (g + .5) * kw, y1); } x.stroke();
  x.fillStyle = DIMC.H; for (let i = 0; i < H; i++) x.fillRect(X + i * qw + (qw > 3 ? .5 : 0), y0, Math.max(.8, qw - (qw > 3 ? 1 : 0)), ch);
  x.fillStyle = DIMC.Hkv; for (let g = 0; g < K; g++) x.fillRect(X + g * kw + (kw > 4 ? 1 : 0), y1, Math.max(1, kw - (kw > 4 ? 2 : 0)), ch);
  if (z >= 4.5) { x.font = `500 9.5px ${FONT}`; x.fillStyle = C.mid; flClip(x, d.group > 1 ? L(`${H} heads → ${K} KV`, `${H} cabezas → ${K} KV`) : L(`${H} heads, own keys`, `${H} cabezas, claves propias`), X, Y - 3, w + 8); }
}
function flDrawPillar(x, it, X, Y, w, h) {
  const m = R.m, n2 = m.layers, top = Y + 22, hh = h - 30, lh = hh / n2;
  x.font = `600 10px ${FONT}`; x.fillStyle = C.mid; x.textAlign = 'center'; x.fillText(`×${n2}`, X + w / 2, Y + 14); x.textAlign = 'left';
  for (let i = 0; i < n2; i++) {
    const y = top + (n2 - 1 - i) * lh, attn = R.kinds[i] === 'attn', on = i === FL.layer;
    x.fillStyle = attn ? 'rgba(231,194,47,.8)' : 'rgba(63,214,192,.6)'; x.globalAlpha = on ? 1 : .55; x.fillRect(X + 3, y, w - 6, Math.max(.8, lh - (lh > 3 ? 1 : 0)));
    if (FL.slowN) { x.fillStyle = i < FL.slowN ? HW.ram : HW.vram; x.fillRect(X, y, 2, Math.max(.8, lh - (lh > 3 ? 1 : 0))); }
    if (on) { x.globalAlpha = 1; x.save(); x.shadowColor = C.cy; x.shadowBlur = 8; x.strokeStyle = C.cy; x.lineWidth = 1.5; x.strokeRect(X + 1.5, y - 1, w - 3, Math.max(2.5, lh + 1)); x.restore(); }
  }
  x.globalAlpha = 1;
}
function flDrawLifes(x, z, focusItems) {
  if (z < 2.2) return;
  const th = Math.max(1.2, Math.min(2.6, z * .2));
  for (const l of FL.lifes) {
    const a = flSX(l.a), b = flSX(l.b), y = flSY(l.y); if (b < -10 || a > FL.W + 10) continue;
    const lit = focusItems && focusItems.includes(l.it), col = l.t.role === 'kv' ? C.hot : l.t.role === 'state' ? C.teal : lit ? C.ink : '#6e6e7c';
    x.globalAlpha = (FL.hybrid && (l.it.lane === 'A' || l.it.lane === 'D') && (l.it.lane === 'A') !== (FL.kind === 'attn') ? .3 : 1) * (lit ? 1 : .55);
    x.fillStyle = col; x.fillRect(a, y, Math.max(2, b - a), th); x.fillRect(a - 1, y - 2, 2, th + 4);
    if (l.t.life === 'op') x.fillRect(b - 1, y - 2, 2, th + 4); else { x.beginPath(); x.moveTo(b + 6, y + th / 2); x.lineTo(b, y - 3); x.lineTo(b, y + th + 3); x.fill(); }
    if (lit && z > 3) { x.font = `500 10px ${FONT}`; const s = l.t.life === 'request' ? L('KV cache · kept for the tokens after this one', 'caché KV · se guarda para los tokens siguientes') : l.t.life === 'fixed' ? L('state · fixed size, kept for the next token', 'estado · tamaño fijo, se guarda para el siguiente token') : L(`${flTN(l.t)} · from ${flOpName(l.it.sp, l.t.born)} to ${flOpName(l.it.sp, l.t.dies)}`, `${flTN(l.t)} · de ${flOpName(l.it.sp, l.t.born)} a ${flOpName(l.it.sp, l.t.dies)}`);
      const tw = x.measureText(s).width; x.fillStyle = 'rgba(8,8,11,.9)'; x.fillRect(a + 3, y - 13, tw + 6, 12); x.fillStyle = C.ink; x.fillText(s, a + 6, y - 3.5); }
  }
  x.globalAlpha = 1;
  if (z > 3.2) { x.fillStyle = C.faint; x.font = `600 9.5px ${FONT}`; const s = L('LIFETIMES · made → last read', 'VIDAS · creado → última lectura'); for (let r = 0; r < 2; r++) { const it = FL.byId[r ? 'norm2' : 'norm1']; x.fillText(s, flSX(it.x) - 2, flSY(FL.yL[r]) - 6); } }
}
// Top band: what is in focus, as the product that makes it, with the inner dimension crossed out of the result.
function flDrawHud(x, W, H, focusOp) {
  const ph = W < 640, d = FL.spec.dims;
  x.fillStyle = 'rgba(8,8,11,.9)'; x.fillRect(0, 0, W, HUDP[0] || 24); x.fillStyle = C.line; x.fillRect(0, HUDP[0] || 24, W, 1);
  x.font = `600 10px ${FONT}`;
  // the model's dimensions, each in its colour: the key to every edge on screen
  let X = 8, Y = 16, rows = 1;
  for (const k of ['n', 'd', 'H', 'Hkv', 'dh', 'F', 'E', 'V']) {
    const v = k === 'n' ? FL.nt : d[k]; if (!v) continue;
    const s = `${DIMSYM[k]} ${fmtN(v)}`, w = x.measureText(s).width + 18; if (X + w > W - 6) { X = 8; Y += 15; rows++; }
    x.fillStyle = DIMC[k]; x.fillRect(X, Y - 8, 8, 8); x.fillStyle = C.mid; x.fillText(s, X + 11, Y - .5); X += w;
  }
  x.font = `400 9.5px ${FONT}`; x.fillStyle = C.dim;
  const sc = FL.scale === 'lin' ? L('scale: linear, true proportions', 'escala: lineal, proporciones reales') : L('scale: log₂ · each doubling adds one notch · equal sizes, equal lengths', 'escala: log₂ · cada duplicación suma una muesca · tamaños iguales, longitudes iguales');
  const sw = x.measureText(sc).width; if (!ph && X + sw + 24 < W) x.fillText(sc, W - sw - 10, 15.5); else { Y += 14; flClip(x, sc, 8, Y, W - 16); }
  HUDP[0] = Y + 7;
  if (focusOp) { const f = flFormula(focusOp); if (f) { x.font = `600 11px ${FONT}`; flFormulaDraw(x, f, 12, Y + 22); } }
}
const HUDP = new Float64Array(2);
function flFormula(key) {
  const pre = key.includes(':') ? key.slice(0, key.indexOf(':') + 1) : '', id = key.slice(pre.length), sp = pre === 'A:' ? FL.specs.attn : pre === 'D:' ? FL.specs.delta : FL.spec, o = sp && sp.ops.find(q => q.id === id);
  if (!o || !o.a || !o.b || !(o.kind === 'matmul' || o.kind === 'attn' || o.kind === 'state' || (o.kind === 'route' && o.b))) return null;
  return { a: sp.T[o.a], b: sp.T[o.b], c: sp.T[o.out], name: o.id };
}
function flFormulaDraw(x, f, X, Y) {
  let cx = X; const seg = (s, col) => { x.fillStyle = col; x.fillText(s, cx, Y); cx += x.measureText(s).width; };
  const side2 = (fs, strike) => { for (let i = 0; i < fs.length; i++) { if (i) seg('·', C.dim); const x0 = cx; seg(num(fs[i][1]), DIMC[fs[i][0]] || C.mid); if (strike) { x.fillStyle = '#fff'; x.fillRect(x0 - 1, Y - 2, cx - x0 + 2, 1.5); } } };
  const w0 = x.measureText(`[${flDimText(f.a.r)} × ${flDimText(f.a.c)}] · [${flDimText(f.b.r)} × ${flDimText(f.b.c)}] → [${flDimText(f.c.r)} × ${flDimText(f.c.c)}]`).width + 12;
  x.fillStyle = 'rgba(10,10,13,.88)'; x.fillRect(X - 6, Y - 13, w0 + 4, 19); x.strokeStyle = C.line2; x.strokeRect(X - 5.5, Y - 12.5, w0 + 3, 18);
  seg('[', C.dim); side2(f.a.r, false); seg(' × ', C.dim); side2(f.a.c, true); seg('] · [', C.dim); side2(f.b.r, true); seg(' × ', C.dim); side2(f.b.c, false); seg('] → [', C.dim); side2(f.c.r, false); seg(' × ', C.dim); side2(f.c.c, false); seg(']', C.dim);
}

// ---- the DOM bar: the walk, the camera and the scale ----
function flUi(ps) {
  const stops = flWalk(ps), cur = flStopAt(stops), k = `${lang}|${cur}|${stops.length}|${FL.follow}|${FL.scale}|${ps.preview}|${ps.seg.k}|${FL.nOut}|${FL.kind}|${FL.layer}|${FL.ctx}`;
  if (k === FL.uiKey) return; FL.uiKey = k;
  const st = stops[Math.max(0, cur)], [title, body] = flStopText(st.key), f = flFormula(flStopOp(st.key));
  $('flStep').innerHTML = `<b>${esc(title)}</b><span class="n">${Math.max(0, cur) + 1}/${stops.length}</span><p>${esc(body)}</p>${f ? `<p class="fx">${flFormulaHtml(f)}</p>` : ''}`;
  $('flFollow').setAttribute('aria-pressed', FL.follow); $('flScale').innerHTML = FL.scale === 'lin' ? `<span>${esc(L('linear', 'lineal'))}</span>` : '<span>log₂</span>';
  $('flScale').title = FL.scale === 'lin' ? L('Lengths in true proportion. Switch to log₂ to see small and huge dimensions together.', 'Longitudes en proporción real. Cambia a log₂ para ver juntas las dimensiones pequeñas y las enormes.') : L('Lengths on a log₂ scale: every doubling adds one notch. Switch to linear for true proportions.', 'Longitudes en escala log₂: cada duplicación suma una muesca. Cambia a lineal para proporciones reales.');
  $('flNote').textContent = ps.preview ? (P.t >= R.total && R.total ? L('The run has ended: showing the last pass.', 'La ejecución ha terminado: se muestra la última pasada.') : L('Nothing runs yet: showing the first pass. Step with ← → or press play.', 'Aún no corre nada: se muestra la primera pasada. Avanza con ← → o pulsa reproducir.')) : '';
}
function flFormulaHtml(f) {
  const s = (fs, strike) => fs.map(q => `<i style="color:${DIMC[q[0]] || C.mid}"${strike ? ' class="x"' : ''}>${esc(num(q[1]))}</i>`).join('·');
  return `[${s(f.a.r)} × ${s(f.a.c, true)}] · [${s(f.b.r, true)} × ${s(f.b.c)}] → [${s(f.c.r)} × ${s(f.c.c)}]`;
}
const FL_STOP_OP = { embed: null, norm1: 'norm1', qkv: 'A:q', append: 'A:append', scores: 'A:scores', mix: 'A:mix', wo: 'A:o', dqkv: 'D:qkv', dstate: 'D:state', dout: 'D:out', route: 'route', expert: 'E:eup', ffn: 'F:fup', add2: 'add2', stack: null, head: 'head', sample: 'sample' };
const flStopOp = k => FL_STOP_OP[k] || '';
// While the playhead stays where the walk left it, the walk keeps its own list (a hybrid walk visits two layers).
const flWalk = ps => (FL.walk && FL.stopT === P.t && FL.walk.seg === ps.segIdx ? FL.walk.stops : flStops(ps));
function flStopAt(stops) { if (FL.stop >= 0 && FL.stopT === P.t && FL.stop < stops.length) return FL.stop; let j = -1; for (let i = 0; i < stops.length; i++) if (stops[i].t <= P.t + 1e-12) j = i; return j; }
function flGo(dir) {
  if (fitGate && fitGate()) return;
  let n = now(), ps = flPass(n); if (!ps) return;
  let stops = flWalk(ps), cur = flStopAt(stops), j = cur + dir;
  if (ps.preview && P.t === 0 && dir > 0) j = 0;
  if (j >= stops.length) { const nx = R.segs[ps.segIdx + 1]; if (!nx) return; P.t = nx.a + 1e-12; UI.layer = -1; ps = flPass(now()); stops = flStops(ps); j = 0; }
  if (j < 0) { const pv = R.segs[ps.segIdx - 1]; if (!pv || pv.k === 'load' || pv.k === 'restore') { j = 0; } else { P.t = pv.a + pv.d * .999; ps = flPass(now()); stops = flStops(ps); j = stops.length - 1; } }
  const st = stops[j]; UI.layer = -1; stopAt(st.t); FL.stop = j; FL.stopT = P.t; FL.walk = { seg: ps.segIdx, stops }; FL.follow = true; FL.lastKey = '';
  const rr = flFrameRect(st.frame); if (rr) flAim(rr);
  FL.uiKey = ''; FL.dirty = true; KEEP.idle = 0; UI.stale = false;
}

// ---- selection and the explainer ----
function flSelOf(it) {
  if (!it) return null;
  if (it.kind === 't') return { k: 'flow', id: it.id, kind: it.t.role === 'weight' ? 'weight' : it.t.role, name: it.t.role === 'weight' ? it.t.w : it.tid };
  if (it.kind === 'grid') return { k: 'flow', id: 'grid', kind: 'egrid' };
  if (it.kind === 'pillar') return { k: 'flow', id: 'pillar', kind: 'pillar' };
  if (it.kind === 'node') return { k: 'flow', id: it.id, kind: 'node' };
  return null;
}
function flHit(px, py) {
  const wx = flWX(px), wy = flWY(py), pad = 4 / FL.cam.z;
  for (let i = FL.items.length - 1; i >= 0; i--) { const it = FL.items[i]; if (it.kind === 'frame' || it.kind === 'bracket' || it.kind === 'gqa') continue; if (wx >= it.x - pad && wx <= it.x + it.w + pad && wy >= it.y - pad && wy <= it.y + it.h + pad) return it; }
  return null;
}
const flOpName = (sp, i) => { const o = sp && sp.ops[i]; return o ? ({ embed: L('embedding lookup', 'consulta del embedding'), norm1: 'RMSNorm', norm2: 'RMSNorm', normf: L('final norm', 'norma final'), add1: L('residual add', 'suma residual'), add2: L('residual add', 'suma residual'), softmax: 'softmax', scores: L('scores', 'puntuaciones'), mix: L('weighted sum', 'suma ponderada'), append: L('cache write', 'escritura en caché'), split: L('split into heads', 'reparto en cabezas'), concat: L('heads side by side', 'cabezas juntas'), topk: 'top-k', route: 'router', esum: L('weighted sum of experts', 'suma ponderada de expertos'), sample: L('sampling', 'muestreo'), head: L('output head', 'cabeza de salida'), state: L('state update and read', 'actualización y lectura del estado'), dsplit: L('split into heads', 'reparto en cabezas'), dconcat: L('heads side by side', 'cabezas juntas'), dgate: L('output gate', 'puerta de salida'), eact: L('gated activation', 'activación con puerta'), fact: L('activation', 'activación') }[o.id] || (o.kind === 'matmul' && sp.T[o.b] ? sp.T[o.b].name : o.id)) : '—'; };
function flInspect(sel) {
  const it = FL.byId[sel.id]; if (!it) return null;
  const m = R.m, dv = flDev(FL.layer), devTxt = d2 => d2 === 'ram' ? L('system RAM, run by the CPU', 'RAM del sistema, la ejecuta la CPU') : d2 === 'vram' ? 'VRAM' : L('shared memory (unified)', 'memoria compartida (unificada)');
  if (it.kind === 'grid') { const d = FL.spec.dims; return { title: L(`${d.E} experts of layer ${FL.layer + 1}`, `${d.E} expertos de la capa ${FL.layer + 1}`), tag: [L('experts', 'expertos'), 'idle'], rows: [[L('Chosen per token', 'Elegidos por token'), `${d.k}${d.shared ? ` + ${d.shared}` : ''}`], [L('One expert', 'Un experto'), B(layerInfo(FL.layer).one)], [L('Where', 'Dónde'), devTxt(dv)]],
    what: L(`Every expert is a small feed-forward network with its own three matrices. The router keeps ${d.k} of ${d.E} for each token; the rest of the layer's experts are not read.`, `Cada experto es una red feed-forward pequeña con sus tres matrices. El router se queda con ${d.k} de ${d.E} por token; el resto de expertos de la capa no se leen.`),
    why: L('Which experts light up is illustrative: the console does not run the router, it draws a fixed pseudo-random choice per token and layer. How many are read, and so the bytes, is what the cost model uses.', 'Qué expertos se encienden es ilustrativo: la consola no ejecuta el router, dibuja una elección pseudoaleatoria fija por token y capa. Cuántos se leen, y por tanto los bytes, es lo que usa el modelo de costes.'), moves: '' }; }
  if (it.kind === 'pillar') return { title: L(`${m.layers} layers`, `${m.layers} capas`), tag: [L('layers', 'capas'), 'idle'], rows: [[L('Attention', 'Atención'), num(m.kvLayers)], ['DeltaNet', num(m.layers - m.kvLayers)], [L('In system RAM', 'En RAM del sistema'), FL.slowN ? num(FL.slowN) : '0']], what: L('The pass climbs every layer in order; the drawing above is the one lit here. Each layer has the same shapes and its own weights.', 'La pasada sube por todas las capas en orden; el dibujo de arriba es la que está encendida aquí. Todas tienen las mismas formas y sus propios pesos.'), why: FL.slowN ? L(`The first ${FL.slowN} layers did not fit on the card: llama.cpp fills it from the last layer down, and the rest run on the CPU from system RAM.`, `Las ${FL.slowN} primeras capas no cupieron en la tarjeta: llama.cpp la llena desde la última hacia abajo, y el resto corre en la CPU desde la RAM del sistema.`) : '', moves: '' };
  if (it.kind === 'node') { const sp = it.sp, o = sp.ops.find(q => q.id === (it.op || it.id.replace(/^[A-Z]:/, ''))); const nm = flOpName(sp, o ? o.i : -1);
    const W2 = { norm1: L('Divides each row by its root mean square and scales it by a learned vector of the same width. Cheap, and it keeps the numbers in a range the next matrices expect.', 'Divide cada fila por su media cuadrática y la escala por un vector aprendido del mismo ancho. Barata, y mantiene los números en el rango que esperan las matrices siguientes.'), add1: L('Adds the mixer’s output to the stream, element by element. Both are the same shape, which is why they can be added.', 'Suma la salida del mezclador al flujo, elemento a elemento. Ambos tienen la misma forma, por eso se pueden sumar.'), softmax: L('Exponentiates each score and divides by the row’s sum, so each row of weights adds up to 1.', 'Exponencia cada puntuación y divide por la suma de la fila, así cada fila de pesos suma 1.'), topk: L('Keeps the highest router scores and renormalises them into the weights of the chosen experts.', 'Se queda con las puntuaciones más altas del router y las renormaliza como pesos de los expertos elegidos.'), esum: L('Adds the chosen experts’ outputs, each weighted by its router score, plus the shared expert.', 'Suma las salidas de los expertos elegidos, cada una ponderada por su puntuación del router, más el experto compartido.'), sample: L('Turns the logits into probabilities and draws one token, as the Tokens view shows step by step.', 'Convierte los logits en probabilidades y sortea un token, como la vista Tokens enseña paso a paso.'), dgate: L('Multiplies the readout by the gate, element by element: the gate decides how much of each number passes.', 'Multiplica la lectura por la puerta, elemento a elemento: la puerta decide cuánto pasa de cada número.'), eact: L('SiLU of the gate times the up projection, element by element (SwiGLU).', 'SiLU de la puerta por la proyección up, elemento a elemento (SwiGLU).'), fact: FL.spec.T.Wg2 ? L('SiLU of the gate times the up projection, element by element (SwiGLU).', 'SiLU de la puerta por la proyección up, elemento a elemento (SwiGLU).') : L('A non-linear function applied to every number (GELU in GPT-3).', 'Una función no lineal aplicada a cada número (GELU en GPT-3).') };
    const key = it.id.replace(/^[A-Z]:/, ''), w2 = W2[key] || W2[key === 'norm2' || key === 'normf' ? 'norm1' : key === 'add2' ? 'add1' : key] || '';
    return { title: nm, tag: [L('operation', 'operación'), 'idle'], rows: [[L('Weights', 'Pesos'), key.startsWith('norm') ? L(`a vector of ${num(m.hidden)}`, `un vector de ${num(m.hidden)}`) : L('none', 'ninguno')], [L('Shape', 'Forma'), L('unchanged', 'sin cambios')]], what: w2, why: L('Not priced by the cost model: next to the matrices, it moves almost nothing.', 'El modelo de costes no lo cobra: al lado de las matrices, apenas mueve nada.'), moves: '' }; }
  const t = it.t, sp = it.sp, numbers = flSide(t.r) * flSide(t.c) * (t.mult || 1) * (it.res ? 1 : 1), shape = `[${flDimText(t.r)} × ${flDimText(t.c)}]${t.mult ? ` ×${t.mult}` : ''}`;
  const madeBy = t.born >= 0 ? flOpName(sp, t.born) : t.role === 'weight' ? L('the file, at load', 'el archivo, al cargar') : t.role === 'kv' ? L('earlier tokens, and this pass', 'tokens anteriores, y esta pasada') : t.role === 'state' ? L('every earlier token, folded in', 'todos los tokens anteriores, plegados') : '—';
  const usedBy = t.role === 'weight' ? flOpName(sp, sp.ops.findIndex(o => o.b === it.tid || (it.tid === 'W_emb' && o.id === 'embed'))) : t.life === 'op' ? flOpName(sp, t.dies) : t.life === 'stream' ? L('every layer, then the head', 'cada capa, y luego la cabeza') : L('this and every later token', 'este y todos los tokens siguientes');
  const life = { op: L('inside this layer’s step, then freed', 'dentro de este paso de la capa, y se libera'), stream: L('the whole pass: each layer adds to it', 'toda la pasada: cada capa le suma'), request: L('until the request ends; grows by one row per token', 'hasta que acaba la petición; crece una fila por token'), fixed: L('until the request ends; fixed size', 'hasta que acaba la petición; tamaño fijo'), model: L('while the model is loaded (keep_alive)', 'mientras el modelo esté cargado (keep_alive)') }[t.life];
  const sec = t.section, devOf = sec === 'in' ? (R.mc.kind === 'unified' ? 'uni' : 'ram') : sec === 'out' ? (R.mc.kind === 'unified' ? 'uni' : FL.slowN ? 'ram?' : 'vram') : dv;
  const where = devOf === 'ram?' ? L('VRAM or system RAM: it depends on whether the head fits after the layers (not modelled)', 'VRAM o RAM del sistema: depende de si la cabeza cabe tras las capas (no modelado)') : sec === 'in' && t.role === 'weight' && R.mc.kind !== 'unified' ? L('system RAM: llama.cpp keeps the input table with the CPU, since a lookup reads only a few rows', 'RAM del sistema: llama.cpp deja la tabla de entrada con la CPU, porque una consulta lee pocas filas') : devTxt(devOf);
  const rows = [[L('Shape', 'Forma'), shape], [L('Dimensions', 'Dimensiones'), flDimSyms(t) + (t.mult ? ` · ×${t.mult}` : '')], [L('Numbers', 'Números'), num(numbers)], [L('Size', 'Tamaño'), `${B(t.bytes)} · ${t.prec}`], [L('Made by', 'Lo crea'), madeBy], [L('Last read by', 'Último en leerlo'), usedBy], [L('Lives', 'Vive'), life], [L('Where', 'Dónde'), where]];
  if (it.res) rows.splice(3, 0, [L('Reserved', 'Reservado'), L(`${num(FL.ctxRes)} rows by num_ctx · ${num(FL.ctx)} used`, `${num(FL.ctxRes)} filas por num_ctx · ${num(FL.ctx)} usadas`)]);
  const r2 = XMAT[t.w] || XMAT[flTN(t)];
  const what = t.role === 'weight' ? (r2 ? L(`${flTN(t)}: ${r2[0][0]}.`, `${flTN(t)}: ${r2[0][1]}.`) : t.w === 'token_embd' ? L('The embedding table: one row of numbers per vocabulary token.', 'La tabla de embedding: una fila de números por token del vocabulario.') : L('A weight matrix.', 'Una matriz de pesos.')) + ' ' + L(`Stored at ${t.prec}${t.bpw ? `, ${dec(String(t.bpw))} bits per weight` : ''}; drawn in the shade of that precision, never by its values.`, `Guardada en ${t.prec}${t.bpw ? `, ${dec(String(t.bpw))} bits por peso` : ''}; dibujada con el tono de esa precisión, nunca por sus valores.`) + (t.prec === 'Q4_K_M' ? L(' Q4_K_M mixes Q4_K and Q6_K per tensor; which tensor got which is not in the data, so every one is drawn at the 4.9-bit average.', ' Q4_K_M mezcla Q4_K y Q6_K por tensor; cuál le tocó a cada uno no está en los datos, así que todos se dibujan con la media de 4,9 bits.') : '')
    : t.role === 'kv' ? L(`The ${it.tid === 'KT' ? 'keys' : 'values'} every earlier token left at this layer, ${num(FL.ctx)} rows of ${num(flSide(it.res === 'c' ? t.r : t.c))}. The dashed part is reserved by num_ctx and still empty; the cyan edge is what this pass just wrote.`, `Las ${it.tid === 'KT' ? 'claves' : 'valores'} que cada token anterior dejó en esta capa, ${num(FL.ctx)} filas de ${num(flSide(it.res === 'c' ? t.r : t.c))}. Lo discontinuo lo reserva num_ctx y sigue vacío; el borde cian es lo que esta pasada acaba de escribir.`)
    : t.role === 'state' ? L(`The DeltaNet state: ${t.mult} heads of 128 × 128, all of the past in a fixed size. Head count derived from the file's state size (${B(t.bytes)} in f32) with head_dim 128.`, `El estado DeltaNet: ${t.mult} cabezas de 128 × 128, todo el pasado en tamaño fijo. Número de cabezas derivado del tamaño del estado en el archivo (${B(t.bytes)} en f32) con head_dim 128.`)
    : L(`${flTN(t)}: ${num(flSide(t.r))} row${flSide(t.r) > 1 ? 's' : ''}, one per token this pass carries, of ${num(flSide(t.c))} numbers.`, `${flTN(t)}: ${num(flSide(t.r))} fila${flSide(t.r) > 1 ? 's' : ''}, una por token de esta pasada, de ${num(flSide(t.c))} números.`) + (it.id === 'A:s' || it.id === 'A:p' ? L(' llama.cpp’s flash attention computes this in tiles and never keeps it whole; it is drawn whole for clarity.', ' La flash attention de llama.cpp lo calcula por teselas y nunca lo guarda entero; se dibuja entero por claridad.') : '') + (it.id === 'A:q' && t.c[0][0] === 'k' ? L(' Twice the heads’ width: this model projects a query and an output gate together.', ' El doble del ancho de las cabezas: este modelo proyecta a la vez una consulta y una puerta de salida.') : '');
  const why = t.role === 'weight' ? L(`It is read whole from memory for every pass, ${B(t.bytes)} of it: that is what decode waits on.`, `Se lee entera de memoria en cada pasada, ${B(t.bytes)}: eso es lo que espera el decode.`) : t.role === 'kv' ? L('Attention reads all of it for every new token, so each token takes a little longer than the last.', 'La atención la lee entera por cada token nuevo, así que cada token tarda un poco más que el anterior.') : t.role === 'state' ? L('Its size does not depend on the context, which is why DeltaNet layers stay cheap on long prompts.', 'Su tamaño no depende del contexto, por eso las capas DeltaNet siguen siendo baratas con prompts largos.') : L(`Its height is the ${num(FL.nt)} token${FL.nt > 1 ? 's' : ''} in flight: a prefill chunk is tall, a decode step is one row. Small next to the weights it meets.`, `Su altura son los ${num(FL.nt)} token${FL.nt > 1 ? 's' : ''} en vuelo: un bloque de prefill es alto, un paso de decode es una fila. Pequeño al lado de los pesos con los que se cruza.`);
  return { title: `${flTN(t)} ${shape}`, tag: [t.role === 'weight' ? L('weights', 'pesos') : t.role === 'kv' ? L('KV cache', 'caché KV') : t.role === 'state' ? L('state', 'estado') : L('tensor', 'tensor'), 'idle'], rows, what, why, moves: '' };
}
// The op a selection stands for, as the deep timeline names it: [segment index, layer or -1 for the head, op id].
function flXpTarget(sel) {
  if (!sel || sel.k !== 'flow' || FL.segIdx < 0) return null;
  const it = FL.byId[sel.id]; const key = flOpOfItem(it); if (!key) return [FL.segIdx, FL.layer, null];
  const id = key.replace(/^[A-Z]:/, ''); if (id === 'head') return [FL.segIdx, -1, 'output'];
  const sp = FL.specs[R.kinds[FL.layer]] || FL.spec, o = (key.startsWith('A:') ? FL.specs.attn : key.startsWith('D:') ? FL.specs.delta : FL.spec).ops.find(q => q.id === id);
  if (!o || !o.cost) return [FL.segIdx, FL.layer, null];
  let layer = FL.layer; if (o.section === 'attn' && R.kinds[layer] !== 'attn') { layer = R.kinds.indexOf('attn', layer); if (layer < 0) layer = R.kinds.indexOf('attn'); } if (o.section === 'delta' && R.kinds[layer] !== 'delta') { layer = R.kinds.indexOf('delta', layer); if (layer < 0) layer = R.kinds.indexOf('delta'); }
  void sp; return [FL.segIdx, layer, o.cost === 'head' ? 'output' : o.cost];
}
function flOpenXp(tg) {
  if (!tg) return; select(null); xpOpen();
  const seg = (XP.root.kids || []).flatMap(p => p.kids || []).find(q => q.li === tg[0]); if (!seg) return;
  let n = seg; const ly = (xKids(seg) || []).filter(q => q.k === 'layer'), L2 = tg[1] < 0 ? ly.find(q => q.kind === 'head') : ly.find(q => q.li === tg[1] && q.kind !== 'head');
  if (L2) { n = L2; if (tg[2]) { const ops = xKids(L2) || [], o = tg[2] === 'expert' ? ops.find(q => q.kind === 'expert' || q.kind === 'experts') : ops.find(q => q.id === tg[2] || (tg[2] === 'attention' && q.kind === 'kv') || (tg[2] === 'state' && q.kind === 'state')); if (o) n = o; } }
  XP.sel = n; XP.sj = -1; XP.dirty = true; xGo(n.a, n.b, 700);
}
// From the deep timeline: show this bar's operation in Flow.
function flFromXp(node) {
  if (!node) return; xpClose(); setLens('flow');
  let n = node; while (n && n.k !== 'seg') n = n.par; if (!n || n.li < 0) return;
  const seg = R.segs[n.li]; if (!seg) return;
  let t = seg.a + seg.d * 1e-6, layer = -1;
  let ly = node; while (ly && ly.k !== 'layer') ly = ly.par;
  if (ly && ly.kind !== 'head') {
    layer = ly.li; const sp = layerSpan(seg, layer); t = sp[0] + (sp[1] - sp[0]) * .02;
    let op = node; while (op && op.k === 'op' && op.par && op.par.k === 'op') op = op.par;
    if (op && op.k === 'op' && op.kind !== 'fix') { const g = flCostGroups(layer, seg), k = op.kind === 'expert' || op.kind === 'experts' ? 'expert' : op.kind === 'kv' ? 'attention' : op.kind === 'state' ? 'state' : op.id, gr = g[k]; if (gr) t = sp[0] + (sp[1] - sp[0]) * (gr[0] + (gr[1] - gr[0]) * .35); }
  } else if (ly && ly.kind === 'head') { const lf = layerFractions(seg); t = seg.a + seg.d * (lf[R.m.layers] + (1 - lf[R.m.layers]) * .5); }
  UI.layer = -1; stopAt(t); FL.stop = -1; FL.follow = true; FL.lastKey = ''; FL.uiKey = ''; FL.dirty = true;
}
function flowStats() { const n = Math.min(FL.fn, FL.ft.length), a = Array.from(FL.ft.slice(0, n)).sort((p, q) => p - q); return n ? [a.reduce((s, v) => s + v, 0) / n, a[Math.floor(n * .95)], a[n - 1], n] : [0, 0, 0, 0]; }

// ---- input ----
function applyFlowText() {
  $('flPrev').innerHTML = ICON('skipback', 's'); $('flPrev').title = L('Previous step (←)', 'Paso anterior (←)'); $('flPrev').setAttribute('aria-label', $('flPrev').title);
  $('flNext').innerHTML = ICON('skip', 's'); $('flNext').title = L('Next step (→)', 'Paso siguiente (→)'); $('flNext').setAttribute('aria-label', $('flNext').title);
  $('flFollow').innerHTML = `${ICON('eye', 's')}<span>${esc(L('Follow', 'Seguir'))}</span>`; $('flFollow').title = L('The camera follows the playhead', 'La cámara sigue al cabezal');
  $('flAll').innerHTML = `${ICON('layers', 's')}<span>${esc(L('Whole pass', 'Pasada entera'))}</span>`; $('flAll').title = L('See the whole pass (0)', 'Ver la pasada entera (0)');
  $('flXp').innerHTML = `${ICON('expand', 's')}<span>${esc(L('Explore', 'Explorar'))}</span>`; $('flXp').title = L('See this step in the deep timeline: when it runs and how long it takes', 'Ver este paso en la línea de tiempo profunda: cuándo corre y cuánto tarda');
  $('cFlow').setAttribute('aria-label', L('Flow: one pass of the model as tensors to scale. Drag to pan, wheel or pinch to zoom, click a tensor to learn about it. Arrow keys walk the pass step by step.', 'Flujo: una pasada del modelo como tensores a escala. Arrastra para desplazar, rueda o pellizco para ampliar, clic en un tensor para saber qué es. Las flechas recorren la pasada paso a paso.'));
  FL.uiKey = '';
}
{
  applyFlowText(); FL.lang = lang;
  const cv = $('cFlow'), pts = new Map(), loc = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }, tip = $('tip');
  const manual = () => { FL.follow = false; FL.lastKey = ''; FL.uiKey = ''; };
  const zoomAt = (px, py, f) => { const wx = flWX(px), wy = flWY(py), z = Math.max(.4, Math.min(60, FL.tgt.z * f)); FL.tgt.z = z; FL.tgt.x = wx - (px - FL.W / 2) / z; FL.tgt.y = wy - (py - FL.H / 2) / z; FL.cam.z = z; FL.cam.x = FL.tgt.x; FL.cam.y = FL.tgt.y; FL.dirty = true; };
  const hover = (px, py, e) => {
    FL.px = px; FL.py = py; const h = flHit(px, py); if (h !== FL.hov) { FL.hov = h; FL.dirty = true; }
    cv.style.cursor = FL.drag && FL.drag.moved ? 'grabbing' : h ? 'pointer' : 'grab';
    if (h && e && e.pointerType === 'mouse') { const d = flInspect(flSelOf(h)); if (d) { tip.textContent = `${d.title} · ${d.tag[0]}`; tip.classList.add('on'); const tw = tip.offsetWidth, th = tip.offsetHeight; let lx = e.clientX + 16, ly = e.clientY + 18; if (lx + tw > innerWidth - 8) lx = e.clientX - tw - 16; if (ly + th > innerHeight - 8) ly = e.clientY - th - 16; tip.style.left = `${lx}px`; tip.style.top = `${ly}px`; } } else tip.classList.remove('on');
  };
  cv.addEventListener('pointerdown', e => { const [px, py] = loc(e); cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [px, py]);
    if (pts.size === 1) FL.drag = { x0: px, y0: py, cx: FL.cam.x, cy: FL.cam.y, moved: false, touch: e.pointerType !== 'mouse' };
    else if (pts.size === 2) { const [p1, p2] = [...pts.values()]; FL.pinch = { d0: Math.max(10, Math.hypot(p1[0] - p2[0], p1[1] - p2[1])), z0: FL.cam.z, mx: (p1[0] + p2[0]) / 2, my: (p1[1] + p2[1]) / 2, wx: flWX((p1[0] + p2[0]) / 2), wy: flWY((p1[1] + p2[1]) / 2) }; FL.drag = null; manual(); } });
  cv.addEventListener('pointermove', e => { const [px, py] = loc(e);
    if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') hover(px, py, e); return; }
    pts.set(e.pointerId, [px, py]);
    if (FL.pinch && pts.size >= 2) { const [p1, p2] = [...pts.values()], dd = Math.max(10, Math.hypot(p1[0] - p2[0], p1[1] - p2[1])), mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, z = Math.max(.4, Math.min(60, FL.pinch.z0 * dd / FL.pinch.d0)); FL.cam.z = FL.tgt.z = z; FL.cam.x = FL.tgt.x = FL.pinch.wx - (mx - FL.W / 2) / z; FL.cam.y = FL.tgt.y = FL.pinch.wy - (my - FL.H / 2) / z; FL.dirty = true; return; }
    const d = FL.drag; if (!d) return;
    if (!d.moved && Math.hypot(px - d.x0, py - d.y0) > (d.touch ? 8 : 4)) { d.moved = true; manual(); tip.classList.remove('on'); }
    if (d.moved) { FL.cam.x = FL.tgt.x = d.cx - (px - d.x0) / FL.cam.z; FL.cam.y = FL.tgt.y = d.cy - (py - d.y0) / FL.cam.z; FL.dirty = true; cv.style.cursor = 'grabbing'; }
  });
  const up = e => { const [px, py] = loc(e); pts.delete(e.pointerId);
    if (FL.pinch) { if (pts.size < 2) FL.pinch = null; return; }
    const d = FL.drag; FL.drag = null; if (!d || d.moved) return;
    const h = flHit(px, py);
    if (d.touch) { const t2 = performance.now(); if (h && t2 - FL.tap < 320) { const rr = flFrameRect([h.id]); if (rr) { manual(); flAim(rr, 18); } FL.tap = 0; return; } FL.tap = t2; }
    SEL_FROM = 'cFlow'; select(h ? flSelOf(h) : null); FL.dirty = true;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); FL.drag = null; FL.pinch = null; });
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) { FL.hov = null; FL.dirty = true; tip.classList.remove('on'); } });
  cv.addEventListener('dblclick', e => { const [px, py] = loc(e), h = flHit(px, py); if (!h) return; const rr = flFrameRect([h.id]); if (rr) { manual(); flAim(rr, 18); } });
  cv.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = loc(e); let dy = e.deltaY, dx = e.deltaX; if (e.deltaMode === 1) { dy *= 16; dx *= 16; } else if (e.deltaMode === 2) { dy *= 400; dx *= 400; } manual();
    if (e.ctrlKey) zoomAt(px, py, Math.exp(-dy * .012)); else if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) { FL.cam.x = FL.tgt.x = FL.cam.x + (dx || dy) / FL.cam.z; FL.dirty = true; } else zoomAt(px, py, Math.exp(-dy * .0022)); }, { passive: false });
  $('flPrev').addEventListener('click', () => flGo(-1)); $('flNext').addEventListener('click', () => flGo(1));
  $('flFollow').addEventListener('click', () => { FL.follow = !FL.follow; FL.lastKey = ''; FL.uiKey = ''; FL.dirty = true; });
  $('flAll').addEventListener('click', () => { manual(); flFit(); });
  $('flScale').addEventListener('click', () => { FL.scale = FL.scale === 'lin' ? 'log' : 'lin'; try { localStorage.setItem('llmc.flowScale', FL.scale); } catch (er) {} FL.key = ''; FL.fitted = false; FL.lastKey = ''; FL.uiKey = ''; });
  $('flXp').addEventListener('click', () => { const ps = flPassNow; if (!ps) return; const st = flStops(ps)[Math.max(0, flStopAt(flStops(ps)))], op = FL.act || flStopOp(st.key); const it = op ? flOpItems(op).find(q => flOpOfItem(q) === op) || FL.byId[op] : null; flOpenXp(it ? flXpTarget(flSelOf(it)) : [ps.segIdx, st.key === 'head' || st.key === 'sample' ? -1 : ps.layer, st.key === 'head' ? 'output' : null]); });
  document.addEventListener('keydown', e => {
    if (UI.lens !== 'flow' || XP.on || e.ctrlKey || e.metaKey || e.altKey || isReal()) return;
    const t = e.target, tagn = (t && t.tagName) || ''; if ((tagn === 'INPUT' && !['checkbox', 'range'].includes(t.type)) || tagn === 'SELECT' || tagn === 'TEXTAREA') return;
    if (!$('lesson').hidden && UI.sel) return;
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); flGo(e.key === 'ArrowRight' ? 1 : -1); }
    else if (e.key === '0') { e.preventDefault(); manual(); flFit(); }
  }, true);
  addEventListener('resize', () => { FL.dirty = true; FL.lastKey = ''; });
}
// The frame loop's entry: draws only while the lens is shown; a language change rebuilds the labels.
function drawFlow(n, dt) {
  if (FL.lang !== lang) { FL.lang = lang; applyFlowText(); FL.key = ''; }
  flDraw(n, dt);
}
