// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Deep timeline: the whole request on one zoomable axis, down to the rows of one matrix =====
// A tree of bars, each with a start and an end in seconds. Children split their parent in proportion to what the
// cost model charges them: bytes over bandwidth, FLOPs over compute, and the fixed cost per layer. Below the rows of
// a matrix (the tokens of a KV read, the heads of a DeltaNet state) there is nothing: that is the finest grain the
// model prices. Children are built the first time their parent is wide enough to show them, then kept; a frame
// only draws what is on screen and allocates nothing in its loops.
const XP = {
  on: false, shown: false, flipT: 0, R: null, real: false, realKey: '', root: null, t0: 0, t1: 1, kx: 1, anim: null, inert: null, dirty: true,
  hov: null, hj: -1, sel: null, sj: -1, px: -1, py: -1, drag: null, pinch: null, tap: 0, tapX: 0,
  rh: new Float64Array(10), rt: new Float64Array(10), ry: new Float64Array(10), rb: new Float64Array(10), mx: new Float64Array(10), vmx: new Float64Array(10), cnt: new Int32Array(10), cntN: new Int32Array(10), rname: new Array(10).fill(''),
  occ: new Float64Array(7 * 6000), nOcc: 0, occD: 2, km: 0, kmShown: -1, lanes: [], W: 0, H: 0, dpr: 1, LX: 0, LW: 1, yOcc: 0, yAxis: 0, laneH: 26,
  focus: new Array(12).fill(null), nf: 0, crumbKey: '', pKey: '', lvl: null, lang: '', refs: [], refKey: '', split: false, slowN: 0, ft: new Float64Array(240), fi: 0, fn: 0, hasDisk: false, empty: false,
};
let XU = 0;
const xNode = (k, a, b, par) => ({ u: ++XU, k, a, b, par, d: par ? par.d + 1 : 0, i: 0, kids: undefined, uni: 0, unit: '', bf: 0, bs: 0, bd: 0, fl: 0, kvo: 0, dev: 0, kind: '', id: '', s: null, li: -1, e: -9, op: null, nt: 1, lb: '', lb2: '', lw: -1, lw2: -1, lf: '' });
const xAdd = (p, n) => { p.bf += n.bf; p.bs += n.bs; p.bd += n.bd; p.fl += n.fl; p.kvo += n.kvo; };
const xReduced = () => document.body.classList.contains('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
// Times at any depth: s, ms, µs, ns.
const xT = s => { const a = Math.abs(s); return dec(a >= 100 ? `${s.toFixed(0)} s` : a >= 1 ? `${s.toFixed(a >= 10 ? 1 : 2)} s` : a >= 1e-3 ? `${(s * 1e3).toFixed(a >= .1 ? 0 : a >= .01 ? 1 : 2)} ms` : a >= 1e-6 ? `${(s * 1e6).toFixed(a >= 1e-4 ? 0 : a >= 1e-5 ? 1 : 2)} µs` : `${(s * 1e9).toFixed(a >= 1e-7 ? 0 : 1)} ns`); };
const xF = f => dec(f >= 1e12 ? `${(f / 1e12).toFixed(f >= 1e13 ? 0 : 1)} TFLOP` : f >= 1e9 ? `${(f / 1e9).toFixed(f >= 1e10 ? 0 : 1)} GFLOP` : f >= 1e6 ? `${(f / 1e6).toFixed(f >= 1e7 ? 0 : 1)} MFLOP` : f >= 1e3 ? `${(f / 1e3).toFixed(0)} kFLOP` : `${Math.round(f)} FLOP`);
const xNodeDur = n => n.b - n.a;
const xNum3 = v => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(2).replace(/0$/, ''));

// ---- the tree, from the cost model ----
function xBuild() {
  XU = 0; XP.R = R; XP.real = isReal(); XP.sel = XP.hov = null; XP.hj = XP.sj = -1; XP.empty = false; XP.pKey = ''; XP.crumbKey = ''; XP.kmShown = -1;
  const root = xNode('req', 0, 1, null); root.kind = 'req';
  if (XP.real) xBuildReal(root); else xBuildSim(root);
  XP.root = root; XP.rh.fill(0); XP.mx.fill(0); XP.cnt.fill(0);
  XP.lanes = XP.real ? [] : xLanes(); XP.refs = XP.real ? [] : xRefs(); XP.refKey = '';
}
function xBuildSim(root) {
  const m = R.m, mc = R.mc, fs = R.pl.fastShare; root.b = R.total;
  XP.split = mc.kind !== 'unified' && fs < .999; XP.hasDisk = R.load > 0 || R.restore > 0;
  // Offloaded layers: llama.cpp fills the card from the last layer down, so the first layers stay in system RAM.
  XP.slowN = 0;
  if (XP.split) { let tot = 0; for (let i = 0; i < m.layers; i++) tot += layerInfo(i).stored; let acc = 0; while (XP.slowN < m.layers && acc + layerInfo(XP.slowN).stored / 2 < tot * (1 - fs)) { acc += layerInfo(XP.slowN).stored; XP.slowN++; } }
  const kids = []; let ph = null;
  R.segs.forEach((s, si) => {
    const p = segPhase(s.k);
    if (!ph || ph.id !== p) { ph = xNode('phase', s.a, s.a + s.d, root); ph.id = p; ph.kind = p; ph.i = kids.length; ph.kids = p === 'load' || p === 'restore' ? null : []; ph.s = s; kids.push(ph); }
    ph.b = s.a + s.d;
    if (ph.kids) {
      const n = xNode('seg', s.a, s.a + s.d, ph), nd = s.k === 'round' ? Math.max(0, Math.round((s.d - s.verifyT) / s.draftT)) : 0, by = (s.bytes + nd * (s.draftGB || 0)) * GB;
      n.s = s; n.li = si; n.kind = s.k; n.i = ph.kids.length; n.nt = s.k === 'prefill' ? s.to - s.from : s.k === 'round' ? nd + 1 : 1;
      n.bf = by * fs; n.bs = by * (1 - fs); n.fl = (s.flops || 0) + nd * (s.draftFlops || 0); n.kvo = (s.kvOut || 0) * GB;
      ph.kids.push(n); xAdd(ph, n);
    } else ph.bd += (s.bytes || 0) * GB;
  });
  for (const p of kids) xAdd(root, p);
  root.kids = kids;
}
// Real mode: only what the server measured. Load and prefill from its own split, then the gap before each token.
function xBuildReal(root) {
  const run = LIVE.run, tk = LIVE.toks, n = tk.length;
  root.b = Math.max(1e-3, LIVE.running ? realElapsed() : run ? run.totalS || realElapsed() : 0);
  XP.split = false; XP.hasDisk = false;
  if (!n && !run) { root.kids = null; XP.empty = true; return; }
  const first = n ? tk[0].t / 1000 : run.ttftS || root.b, ld = run && run.loadS > 0 ? Math.min(run.loadS, first) : 0, kids = [];
  const add = (id, a, b) => { const p = xNode('phase', a, b, root); p.id = id; p.kind = id; p.i = kids.length; p.kids = null; kids.push(p); return p; };
  if (ld > 0) add('load', 0, ld);
  add(run || n ? 'prefill' : 'wait', ld, first).lb2 = run ? '' : L('load + prefill', 'carga + prefill');
  if (n > 1) { const p = add('decode', first, tk[n - 1].t / 1000); p.kids = []; for (let i = 1; i < n; i++) { const q = xNode('seg', tk[i - 1].t / 1000, tk[i].t / 1000, p); q.kind = 'mtok'; q.li = i; q.i = i - 1; q.kids = null; p.kids.push(q); } }
  root.kids = kids;
}
// Children, built once, the first time a parent is wide enough to show them.
function xKids(n) {
  if (n.kids !== undefined) return n.kids;
  n.kids = null;
  if (n.k === 'seg') xLayers(n); else if (n.k === 'layer') xOps(n); else if (n.k === 'op') xInner(n);
  if (XU > 400000) { XP.dirty = true; setTimeout(() => { if (XU > 400000) { const keep = [XP.t0, XP.t1]; xBuild(); [XP.t0, XP.t1] = keep; } }, 0); } // a long session over a huge run: start the cache again
  return n.kids;
}
// One pass: its draft steps (a round), then every layer and the output head, each as long as its operations cost.
function xLayers(n) {
  const s = n.s, m = R.m, nd = s.k === 'round' ? n.nt - 1 : 0, many = n.nt > 1, out = [];
  const ctxKV = s.k === 'prefill' ? s.to : s.ctx, ctxAt = s.k === 'prefill' ? s.from + n.nt / 2 : s.ctx, F = s.k === 'prefill' ? R.flopsEff : R.mc.tflops * 1e12, fs = R.pl.fastShare;
  let a = n.a;
  for (let j = 0; j < nd; j++) { const q = xNode('draft', a, a + s.draftT, n); q.kind = 'draft'; q.id = s.mtp ? 'mtp' : 'draft'; q.i = j; q.kids = null; q.bf = s.draftGB * GB * fs; q.bs = s.draftGB * GB * (1 - fs); q.fl = s.draftFlops; out.push(q); a += s.draftT; }
  const raws = [], tl = []; let T = 0;
  for (let i = 0; i < m.layers; i++) { const r = xOpsRaw(i, n.nt, ctxKV, ctxAt, s.tok || 0, many, F, i < XP.slowN, n.kvo / m.kvLayers); let t = 0; for (const o of r) t += o.t; raws.push(r); tl.push(t); T += t; }
  let hr = null;
  if (s.k !== 'prefill') { const hb = headBytes(), hf = 2 * m.vocab * m.hidden * n.nt; hr = [{ kind: 'mat', id: 'output', shape: ['output', m.hidden, m.vocab], bytes: hb, fl: hf, e: -9, n: 0, t: Math.max(hb / (R.bwFast * 1e9), hf / F) }]; T += hr[0].t; }
  const k = (n.b - a) / T;
  for (let i = 0; i <= m.layers; i++) {
    const r = i < m.layers ? raws[i] : hr; if (!r) break;
    const t = i < m.layers ? tl[i] : hr[0].t, q = xNode('layer', a, a + t * k, n);
    q.li = i; q.kind = i < m.layers ? R.kinds[i] : 'head'; q.dev = i < XP.slowN ? 1 : 0; q.op = r; q.s = s; q.nt = n.nt; q.i = i;
    for (const o of r) { if (q.dev) q.bs += o.bytes; else q.bf += o.bytes; q.fl += o.fl; if (o.kind === 'kv') q.kvo += o.kvo; }
    out.push(q); a += t * k;
  }
  out[out.length - 1].b = n.b; n.kids = out;
}
// What one layer does, in order, with what each step reads and computes; t is its cost on this machine. The order
// is the one opsOf (04-cost-model.ts) uses; here a pass that carries several tokens (a chunk, a verification) reads
// every expert any of them chose, as passReadGB counts it.
function xOpsRaw(i, nt, ctxKV, ctxAt, tok, many, F, slow, kvo) {
  const { m, sh } = R, li = layerInfo(i), B = (slow ? R.bwSlow : R.bwFast) * 1e9, out = [];
  const add = (kind, id, shape, bytes, fl, e, n) => { const o = { kind, id, shape, bytes, fl, e, n, kvo: 0, t: Math.max(bytes / B, fl / F) }; out.push(o); return o; };
  const mat = s2 => add('mat', s2[0], s2, bytesOf(s2), 2 * s2[1] * s2[2] * nt, -9, 0);
  for (const s2 of li.mixer) {
    mat(s2);
    if (li.kind === 'attn' && s2[0] === 'attn_v') add('kv', 'attention', null, kvLayerBytes(ctxKV), 4 * m.qHeads * m.headDim * nt * ctxAt, -9, ctxKV).kvo = kvo;
    if (li.kind === 'delta' && s2[0] === 'attn_gate') add('state', 'state', null, 2 * (sh.deltaState || 0), 0, -9, Math.max(1, Math.round((sh.deltaState || 0) / (128 * 128 * 4))));
  }
  if (sh.expert) {
    const onep = sh.expert.reduce((q, s2) => q + s2[1] * s2[2], 0);
    mat(sh.router);
    if (!many) { for (const e of chosenExperts(tok, i)) add('expert', `expert ${e}`, null, li.one, 2 * onep, e, 0); if (m.sharedExperts) add('expert', 'shared expert', null, li.one, 2 * onep, -1, 0); }
    else { const tc = expertsTouched(m, nt); add('experts', 'experts', null, li.one * (tc + m.sharedExperts), 2 * onep * (m.expertsUsed + m.sharedExperts) * nt, -9, Math.round(tc)); }
  } else if (sh.mlp) for (const s2 of sh.mlp) mat(s2);
  add('fix', 'fixed', null, 0, 0, -9, 0).t = layerMsOf(R.mc, m) / 1000;
  return out;
}
function xOps(n) {
  const r = n.op; let T = 0; for (const o of r) T += o.t;
  const k = (n.b - n.a) / T, out = []; let a = n.a;
  r.forEach((o, j) => { const q = xNode('op', a, a + o.t * k, n); a += o.t * k; xOpFrom(q, o, n); q.i = j; out.push(q); });
  out[out.length - 1].b = n.b; n.kids = out;
}
function xOpFrom(q, o, par) { q.kind = o.kind; q.id = o.id; q.op = o; q.dev = par.dev; q.li = par.li; q.e = o.e; q.nt = par.nt; q.s = par.s; if (q.dev) q.bs = o.bytes; else q.bf = o.bytes; q.fl = o.fl; q.kvo = o.kvo || 0; }
// Inside one operation: rows of a matrix, the cached tokens a KV read goes through, the heads of a state, the
// matrices of an expert, or the experts a chunk touched. Rows, tokens and heads are equal slices (uni), never objects.
function xInner(n) {
  const o = n.op, sh = R.sh;
  if (o.kind === 'mat') { n.uni = o.shape[2]; n.unit = 'row'; }
  else if (o.kind === 'kv') { n.uni = Math.max(1, o.n); n.unit = 'tok'; }
  else if (o.kind === 'state') { n.uni = o.n; n.unit = 'head'; }
  else if (o.kind === 'expert') {
    const T = sh.expert.reduce((q, s2) => q + bytesOf(s2), 0), out = []; let a = n.a;
    sh.expert.forEach((s2, j) => { const f = bytesOf(s2) / T, q = xNode('op', a, a + (n.b - n.a) * f, n); a = q.b; xOpFrom(q, { kind: 'mat', id: s2[0], shape: s2, bytes: o.bytes * f, fl: o.fl * f, e: o.e }, n); q.i = j; out.push(q); });
    out[out.length - 1].b = n.b; n.kids = out;
  } else if (o.kind === 'experts') {
    const N = o.n + R.m.sharedExperts, out = [];
    for (let j = 0; j < N; j++) { const q = xNode('op', n.a + (n.b - n.a) * j / N, n.a + (n.b - n.a) * (j + 1) / N, n); xOpFrom(q, { kind: 'expert', id: j < o.n ? 'touched expert' : 'shared expert', bytes: o.bytes / N, fl: o.fl / N, e: j < o.n ? -2 : -1 }, n); q.i = j; out.push(q); }
    n.kids = out;
  }
}
// The node that covers time t at depth d (null if none is built there), walking down from the request.
function xAt(t, d) {
  let n = XP.root; if (!n || t < n.a || t > n.b) return null;
  while (n.d < d) { const ks = n.kids; if (!ks) return null; const i = xFirst(ks, t); if (i >= ks.length || ks[i].a > t) return null; n = ks[i]; }
  return n;
}
function xFirst(ks, t) { let lo = 0, hi = ks.length - 1; while (lo < hi) { const mm = (lo + hi) >> 1; if (ks[mm].b <= t) lo = mm + 1; else hi = mm; } return lo; }
// The run's own units: how long one chunk, pass, layer, operation and row take, from the typical decode pass.
function xRefs() {
  const segs = R.segs, out = [], med = a => { const b = a.slice().sort((p, q) => p - q); return b.length ? b[b.length >> 1] : 0; };
  const pre = segs.filter(s => s.k === 'prefill'), dec2 = segs.filter(s => s.k === 'decode' || s.k === 'round');
  if (pre.length) out.push(['chunk', L('1 chunk', '1 bloque'), med(pre.map(s => s.d))]);
  if (dec2.length) out.push(['pass', dec2[0].k === 'round' ? L('1 round', '1 ronda') : L('1 pass', '1 pasada'), med(dec2.map(s => s.d))]);
  const ph = (XP.root.kids || []).find(p => p.id === 'decode') || (XP.root.kids || []).find(p => p.id === 'prefill');
  if (ph && ph.kids && ph.kids.length) {
    const sg = ph.kids[ph.kids.length >> 1], ly = (xKids(sg) || []).filter(q => q.k === 'layer' && q.kind !== 'head');
    if (ly.length) {
      out.push(['layer', L('1 layer', '1 capa'), med(ly.map(xNodeDur))]);
      const ops = (xKids(ly[ly.length >> 1]) || []).filter(q => q.kind !== 'fix');
      if (ops.length) { out.push(['op', L('1 op', '1 op'), med(ops.map(xNodeDur))]); const mt = ops.filter(q => q.kind === 'mat').sort((p, q) => xNodeDur(q) - xNodeDur(p))[0]; if (mt) out.push(['row', L('1 row', '1 fila'), xNodeDur(mt) / mt.op.shape[2]]); }
    }
  }
  return out;
}
// Occupancy lanes: memory bandwidth per device, compute, disk. Percent of the machine's peak; the dashed line is what
// the cost model says is reachable (measured on the reference laptop, assumed elsewhere).
function xLanes() {
  const mc = R.mc, out = [];
  if (XP.split) { out.push({ k: 0, name: 'VRAM', sub: dec(`${num(mc.bw)} GB/s`), col: HW.vram, ref: mc.bwEff, peak: mc.bw * 1e9 }); out.push({ k: 1, name: L('System RAM', 'RAM sistema'), sub: dec(`${num(mc.hostBw)} GB/s`), col: HW.ram, ref: .6, peak: mc.hostBw * 1e9 }); }
  else out.push({ k: 0, name: L('Memory', 'Memoria'), sub: dec(`${num(mc.bw)} GB/s`), col: C.li, ref: mc.bwEff, peak: mc.bw * 1e9 });
  out.push({ k: 2, name: L('Compute', 'Cómputo'), sub: dec(`${xNum3(mc.tflops)} TFLOPS`), col: C.cy, ref: R.m.moe ? moeComputeOf(mc) : 1, peak: mc.tflops * 1e12 });
  if (XP.hasDisk) out.push({ k: 3, name: L('Disk', 'Disco'), sub: dec(`${R.diskGBs} GB/s`), col: HW.storage, ref: 1, peak: R.diskGBs * 1e9 });
  return out;
}
const xOccOf = (n, k) => { const d = Math.max(1e-15, n.b - n.a); return k === 0 ? n.bf / d / XP.lanes[0].peak : k === 1 ? n.bs / d / (R.mc.hostBw * 1e9) : k === 2 ? n.fl / d / (R.mc.tflops * 1e12) : n.bd / d / (R.diskGBs * 1e9); };

// ---- names ----
const XSHORT = () => ({ req: L('request', 'petición'), phase: L('phases', 'fases'), seg: L('passes', 'pasadas'), layer: L('layers', 'capas'), op: 'ops', mats: L('mats', 'matr.'), exps: L('experts', 'expertos'), row: L('rows', 'filas'), tok: 'KV', head: L('heads', 'cabezas'), mtok: 'tokens' });
const XNAMES = () => ({ req: L('request', 'petición'), phase: L('phases', 'fases'), seg: L('passes', 'pasadas'), layer: L('layers', 'capas'), op: L('operations', 'operaciones'), mats: L('matrices', 'matrices'), exps: L('experts', 'expertos'), row: L('rows', 'filas'), tok: L('KV tokens', 'tokens KV'), head: L('state heads', 'cabezas'), mtok: L('tokens', 'tokens') });
let XNM = XNAMES(), XNS = XSHORT();
const XMAT = {
  attn_q: [['the queries: what this token looks for in the earlier ones', 'las consultas: lo que este token busca en los anteriores']],
  attn_k: [['the key this token leaves in the KV cache, for later tokens to match against', 'la clave que este token deja en la caché KV, para que los siguientes la comparen']],
  attn_v: [['the value this token leaves in the KV cache: what it hands over when a later token attends to it', 'el valor que este token deja en la caché KV: lo que entrega cuando otro token le presta atención']],
  attn_output: [['mixes what the attention heads found back into the hidden width', 'mezcla lo que encontraron las cabezas de atención y lo devuelve al ancho oculto']],
  attn_qkv: [['queries, keys and values of the DeltaNet mixer, in one matrix', 'consultas, claves y valores del mezclador DeltaNet, en una sola matriz']],
  attn_gate: [['the gate that decides how much of the DeltaNet readout passes', 'la puerta que decide cuánto de la lectura DeltaNet pasa']],
  ssm_out: [['projects the DeltaNet readout back to the hidden width', 'proyecta la lectura DeltaNet de vuelta al ancho oculto']],
  ffn_gate: [['the feed-forward gate: which of the widened features to let through', 'la puerta del feed-forward: qué rasgos ensanchados dejar pasar']],
  ffn_up: [['widens the token into the feed-forward space', 'ensancha el token al espacio del feed-forward']],
  ffn_down: [['brings the feed-forward result back to the hidden width', 'devuelve el resultado del feed-forward al ancho oculto']],
  ffn_gate_inp: [['the router: scores every expert for this token', 'el router: puntúa cada experto para este token']],
  output: [['the output head: one score per vocabulary token', 'la cabeza de salida: una puntuación por token del vocabulario']],
};
// Bar labels: a long one and a short one, measured once per language and size.
function xLabels(n) {
  const nm = n.k === 'req' ? [L(`Request · ${xT(R && !XP.real ? R.total : n.b)}`, `Petición · ${xT(R && !XP.real ? R.total : n.b)}`), L('Request', 'Petición')]
    : n.k === 'phase' ? (() => { const t = { load: L('Load', 'Carga'), restore: L('KV restore', 'Restaurar KV'), prefill: 'Prefill', decode: 'Decode', wait: n.lb2 || L('wait', 'espera') }[n.id] || n.id; return [`${t} · ${xT(n.b - n.a)}${n.kids ? ` · ×${num(n.kids.length)}` : ''}`, t]; })()
    : n.k === 'seg' ? (n.kind === 'prefill' ? [L(`chunk ${n.s.i + 1} · tokens ${num(n.s.from + 1)}–${num(n.s.to)}`, `bloque ${n.s.i + 1} · tokens ${num(n.s.from + 1)}–${num(n.s.to)}`), `${n.s.i + 1}`]
      : n.kind === 'round' ? [n.s.n > 1 ? L(`round · tokens ${num(n.s.tok + 1)}–${num(n.s.tok + n.s.n)}`, `ronda · tokens ${num(n.s.tok + 1)}–${num(n.s.tok + n.s.n)}`) : L(`round · token ${num(n.s.tok + 1)}`, `ronda · token ${num(n.s.tok + 1)}`), `${n.s.tok + 1}`]
      : n.kind === 'mtok' ? [`token ${num(n.li + 1)}`, `${n.li + 1}`] : [`token ${num(n.s.tok + 1)}`, `${n.s.tok + 1}`])
    : n.k === 'draft' ? [n.id === 'mtp' ? L(`MTP draft ${n.i + 1}`, `borrador MTP ${n.i + 1}`) : L(`draft ${n.i + 1}`, `borrador ${n.i + 1}`), 'd']
    : n.k === 'layer' ? (n.kind === 'head' ? [L('output head', 'cabeza de salida'), 'out'] : [`${L('layer', 'capa')} ${n.li + 1} · ${n.kind === 'attn' ? L('attention', 'atención') : 'DeltaNet'}`, `${n.li + 1}`])
    : n.kind === 'fix' ? [L('fixed cost', 'coste fijo'), '·'] : n.kind === 'experts' ? [L(`experts · ${num(n.op.n)} touched`, `expertos · ${num(n.op.n)} tocados`), 'exp'] : n.e === -2 ? [L('touched expert', 'experto tocado'), 'e'] : n.e === -1 && n.kind === 'expert' ? [L('shared expert', 'experto compartido'), 'sh']
    : n.kind === 'expert' ? [L(`expert ${n.e}`, `experto ${n.e}`), `${n.e}`] : n.kind === 'kv' ? [L('attention · KV read', 'atención · lectura KV'), 'KV'] : n.kind === 'state' ? [L('DeltaNet state', 'estado DeltaNet'), 'st'] : [n.id, n.id.replace(/^(attn|ffn|ssm)_/, '')];
  n.lb = nm[0]; n.lb2 = nm[1]; n.lw = n.lw2 = -1; n.lf = lang;
}

// ---- drawing ----
const XC = { bg: '#08080b', row: 'rgba(255,255,255,.022)', lab: C.mid };
function xFill(x, n, X, Y, w, h) {
  const k = n.k === 'req' ? 'req' : n.kind, alt = n.i & 1;
  switch (k) {
    case 'req': x.fillStyle = '#23232e'; x.fillRect(X, Y, w, h); XP.km |= 0; return;
    case 'load': fillKind(x, 'weights', X, Y, w, h, alt ? 1 : .85); XP.km |= 1 << 2; return;
    case 'restore': fillKind(x, 'kv', X, Y, w, h, .9); XP.km |= 1 << 3; return;
    case 'wait': x.fillStyle = 'rgba(127,227,255,.3)'; x.fillRect(X, Y, w, h); XP.km |= 1 << 0; return;
    case 'prefill': x.fillStyle = alt ? 'rgba(127,227,255,.86)' : 'rgba(127,227,255,.62)'; x.fillRect(X, Y, w, h); XP.km |= 1 << 0; return;
    case 'decode': case 'round': case 'mtok': x.fillStyle = alt ? 'rgba(255,212,59,.92)' : 'rgba(255,212,59,.66)'; x.fillRect(X, Y, w, h); XP.km |= k === 'mtok' ? 1 << 21 : 1 << 1; return;
    case 'draft': x.fillStyle = alt ? '#c9a0dc' : C.pink; x.fillRect(X, Y, w, h); XP.km |= 1 << 4; return;
    case 'attn': fillKind(x, 'kv', X, Y, w, h, alt ? 1 : .85); XP.km |= 1 << 5; return;
    case 'delta': fillKind(x, 'state', X, Y, w, h, alt ? 1 : .85); XP.km |= 1 << 6; return;
    case 'head': x.fillStyle = 'rgba(127,227,255,.8)'; x.fillRect(X, Y, w, h); XP.km |= 1 << 7; return;
    case 'mat': fillKind(x, 'weights', X, Y, w, h, alt ? 1 : .82); XP.km |= 1 << 8; return;
    case 'kv': fillKind(x, 'kv', X, Y, w, h, 1); XP.km |= 1 << 9; return;
    case 'state': fillKind(x, 'state', X, Y, w, h, 1); XP.km |= 1 << 10; return;
    case 'expert': case 'experts': fillKind(x, 'weights', X, Y, w, h, alt ? 1 : .82); x.fillStyle = C.teal; x.fillRect(X, Y, w, Math.min(2, h)); XP.km |= 1 << 11; return;
    case 'fix': fillKind(x, 'sys', X, Y, w, h, 1); XP.km |= 1 << 12; return;
  }
  x.fillStyle = C.sys; x.fillRect(X, Y, w, h);
}
const xDark = n => ['prefill', 'decode', 'round', 'mtok', 'draft', 'head', 'wait'].includes(n.kind);
function xLabel(x, n, X0, X1, y, h, small) {
  const w = X1 - X0; if (w < 22 || h < 11) return;
  if (n.lf !== lang || !n.lb) xLabels(n);
  if (n.lw < 0) { n.lw = x.measureText(n.lb).width; n.lw2 = x.measureText(n.lb2).width; }
  const s = n.lw + 10 <= w ? n.lb : n.lw2 + 8 <= w ? n.lb2 : null; if (!s) return;
  const tw = s === n.lb ? n.lw : n.lw2, pat = !xDark(n) && n.k !== 'req', yy = y + h / 2 + (small ? 3.5 : 4);
  if (pat) { x.fillStyle = 'rgba(8,8,11,.78)'; x.fillRect(X0 + 3, y + h / 2 - (small ? 6 : 7), tw + 6, small ? 12 : 14); }
  x.fillStyle = xDark(n) ? '#0b0b10' : n.k === 'req' ? C.mid : C.ink; x.fillText(s, X0 + 6, yy);
}
// One bar, clipped to the lanes; labels stay inside the visible part (they slide along when the bar is cut).
function xBar(x, n, x0, x1, d) {
  const LX = XP.LX, RX = XP.LX + XP.LW, cx0 = Math.max(LX, x0), cx1 = Math.min(RX, x1); if (cx1 <= cx0) return;
  const y = XP.ry[d] + XP.rb[d], h = Math.max(1, XP.rh[d] - XP.rb[d] - 3), gap = x1 - x0 > 4 ? .75 : 0;
  xFill(x, n, cx0, y, Math.max(.6, cx1 - cx0 - (cx1 === x1 ? gap : 0)), h);
  if (XP.split && n.k === 'layer' && h > 10) { x.fillStyle = n.dev ? HW.ram : HW.vram; x.fillRect(cx0, y + h - 3, Math.max(.6, cx1 - cx0 - gap), 3); XP.km |= n.dev ? 1 << 15 : 1 << 14; }
  if (n === XP.sel && XP.sj < 0) { x.save(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.shadowColor = 'rgba(255,255,255,.7)'; x.shadowBlur = 6; x.strokeRect(cx0 - 1, y - 1, cx1 - cx0 + 2, h + 2); x.restore(); }
  else if (n === XP.hov && XP.hj < 0) { x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1; x.strokeRect(cx0 - .5, y - .5, cx1 - cx0 + 1, h + 1); }
  if (cx1 - cx0 >= 22) { x.font = h < 16 ? `500 10px ${FONT}` : `600 11px ${FONT}`; xLabel(x, n, cx0, cx1, y, h, h < 16); }
}
// Equal slices (rows, cached tokens, state heads), grouped by powers of two until each group is a few pixels wide.
const XUNI = { mat: ['#3b3558', '#4d4574'], kv: ['#e7c22f', '#b8961d'], state: ['#1c5a52', '#2b8073'] };
function xUni(x, n, x0, x1, d) {
  const N = n.uni, w = x1 - x0, pw = w / N; let g = 1; while (pw * g < 4) g *= 2;
  const gw = pw * g, G = Math.ceil(N / g), LX = XP.LX, RX = XP.LX + XP.LW, j0 = Math.max(0, Math.floor((LX - x0) / gw)), j1 = Math.min(G - 1, Math.floor((RX - x0) / gw));
  const y = XP.ry[d] + XP.rb[d], h = Math.max(1, XP.rh[d] - XP.rb[d] - 3), cols = XUNI[n.kind] || XUNI.mat;
  for (let j = j0; j <= j1; j++) { const X = x0 + j * gw, a = Math.max(LX, X), b = Math.min(RX, X + gw - (gw > 5 ? .75 : 0)); if (b <= a) continue; x.fillStyle = cols[j & 1]; x.fillRect(a, y, b - a, h); }
  XP.km |= n.kind === 'kv' ? 1 << 9 : n.kind === 'state' ? 1 << 10 : 1 << 13;
  if (h >= 12 && gw >= 64) {
    x.font = `500 10px ${FONT}`; const unit = n.unit === 'row' ? L('row', 'fila') : n.unit === 'tok' ? 'token' : L('head', 'cabeza'), units = n.unit === 'row' ? L('rows', 'filas') : n.unit === 'tok' ? 'tokens' : L('heads', 'cabezas');
    for (let j = j0; j <= j1; j++) { const X = Math.max(LX, x0 + j * gw), Xe = Math.min(RX, x0 + (j + 1) * gw); if (Xe - X < 64) continue; const s = g === 1 ? `${unit} ${num(j + 1)}` : `${units} ${num(j * g + 1)}–${num(Math.min(N, (j + 1) * g))}`; x.fillStyle = n.kind === 'kv' ? '#0b0b10' : C.ink; x.fillText(s, X + 5, y + h / 2 + 3.5); }
  }
  const hv = XP.hov === n && XP.hj >= 0 ? XP.hj : -1, sv = XP.sel === n && XP.sj >= 0 ? XP.sj : -1;
  for (const [jj, col, lw] of [[hv, 'rgba(255,255,255,.85)', 1], [sv, '#fff', 2]]) if (jj >= 0) { const X = x0 + jj * pw; if (X + pw >= LX && X <= RX) { x.strokeStyle = col; x.lineWidth = lw; x.strokeRect(Math.max(LX, X) - .5, y - .5, Math.max(1.5, Math.min(RX, X + pw) - Math.max(LX, X)) + 1, h + 1); } }
}
// Walk the visible tree: draw each bar on its depth's row, note how wide each depth is (that decides which rows open
// next frame), and collect the slices the occupancy strip shows.
function xVisit(x, n) {
  const d = n.d, x0 = XP.LX + (n.a - XP.t0) * XP.kx, x1 = XP.LX + (n.b - XP.t0) * XP.kx, w = x1 - x0, vis = XP.rh[d] >= 1;
  XP.cnt[d]++; XP.cntN[d]++; const vw = Math.min(x1, XP.LX + XP.LW) - Math.max(x0, XP.LX); if (w > XP.mx[d]) XP.mx[d] = w; if (vw > XP.vmx[d]) XP.vmx[d] = vw;
  if (!XP.rname[d]) XP.rname[d] = n.k === 'op' && n.par.k === 'op' ? (n.par.kind === 'experts' ? XNM.exps : XNM.mats) : n.kind === 'mtok' ? XNM.mtok : XNM[n.k] || '';
  if (vis) xBar(x, n, x0, x1, d);
  let went = false;
  if (vis && w >= 12 && d < 9) {
    const ks = xKids(n);
    if (ks) {
      if (w / ks.length < 1.5) { // too many to tell apart: one band for all of them
        XP.cnt[d + 1]++; XP.cntN[d + 1]++; const kw = w / ks.length * 2; if (kw > XP.mx[d + 1]) XP.mx[d + 1] = kw;
        if (XP.rh[d + 1] >= 1) { const y = XP.ry[d + 1] + XP.rb[d + 1], h = Math.max(1, XP.rh[d + 1] - XP.rb[d + 1] - 3), a = Math.max(XP.LX, x0), b = Math.min(XP.LX + XP.LW, x1); if (b > a) { x.globalAlpha = .55; xFill(x, ks[0], a, y, b - a, h); x.globalAlpha = 1; } }
      } else { went = true; for (let i = xFirst(ks, XP.t0); i < ks.length; i++) { const q = ks[i]; if (q.a > XP.t1) break; xVisit(x, q); } }
    } else if (n.uni) {
      XP.cnt[d + 1]++; const ew = w / 12; if (ew > XP.mx[d + 1]) XP.mx[d + 1] = ew; if (!XP.rname[d + 1] || (n.a <= XP.tc && n.b >= XP.tc)) XP.rname[d + 1] = XNM[n.unit]; // the row is named after what sits under the centre
      if (XP.rh[d + 1] >= 1 && w >= 24) xUni(x, n, x0, x1, d + 1);
    }
  }
  if ((d === XP.occD || (d < XP.occD && !went)) && XP.nOcc < 6000 && vw > 0) { const o = XP.nOcc++ * 7; XP.occ[o] = Math.max(x0, XP.LX); XP.occ[o + 1] = Math.min(x1, XP.LX + XP.LW); for (let k = 0; k < 4; k++) XP.occ[o + 2 + k] = XP.real ? 0 : xOccOf(n, k); XP.occ[o + 6] = n.u; XP.occN[XP.nOcc - 1] = n; }
}
XP.occN = new Array(6000).fill(null);
// Rows: thin context strips for what fills the screen (the request, the pass you are inside), tall rows for what
// you are looking at, nothing for what is still too small to see. Heights ease toward their targets.
function xLayout(dt) {
  const phone = XP.W < 640, top = 6, occH = XP.lanes.length ? 18 + XP.lanes.length * (XP.laneH + 4) : XP.real ? 34 : 0;
  const bottom = XP.H - 24 - occH - 14, avail = bottom - top, ctxH = phone ? 16 : 18, maxH = phone ? Math.max(56, Math.min(110, avail / 3.4)) : Math.max(70, Math.min(150, avail / 3.4));
  let used = 0, wsum = 0; const wts = XP.rt;
  for (let d = 0; d < 10; d++) {
    const mx = XP.mx[d], cnt = XP.cnt[d];
    if (!cnt || mx < 1.5) { wts[d] = 0; continue; }
    if (XP.vmx[d] >= XP.LW * .8) { wts[d] = -1; used += ctxH + 3; continue; } // one bar fills the view: you are inside it
    wts[d] = Math.max(.12, Math.min(1, (Math.log2(mx) - 1.6) / 3)); wsum += wts[d];
  }
  const rest = Math.max(0, avail - used), k = 1 - Math.exp(-dt * 14);
  let y = top;
  for (let d = 0; d < 10; d++) {
    const tgt = wts[d] < 0 ? ctxH : wts[d] > 0 ? Math.min(maxH * wts[d] + 8, rest * wts[d] / Math.max(1e-9, wsum)) : 0;
    XP.rh[d] += (tgt - XP.rh[d]) * (xReduced() ? 1 : k); if (Math.abs(tgt - XP.rh[d]) < .3) XP.rh[d] = tgt; else XP.dirty = true;
    XP.ry[d] = y; XP.rb[d] = XP.rh[d] >= 40 ? 14 : 0; y += XP.rh[d] > .5 ? XP.rh[d] + 3 : 0;
  }
  XP.yOcc = Math.max(y + 8, bottom + 6); XP.yAxis = XP.H - 22;
  if (XP.yOcc + occH > XP.yAxis - 2) XP.yOcc = XP.yAxis - 2 - occH;
  // occupancy is read at the deepest open row that has real slices
  let od = 0; for (let d = 0; d < 10; d++) if (XP.cntN[d] > 0 && XP.rh[d] >= 1 && XP.mx[d] >= 2) od = d; XP.occD = od;
}
const XSTEP = [1, 2, 5];
function xTicks(x) {
  const span = XP.t1 - XP.t0, raw = span * 110 / XP.LW, p10 = 10 ** Math.floor(Math.log10(raw)); let step = p10 * 10; for (const s of XSTEP) if (s * p10 >= raw) { step = s * p10; break; }
  const anc = XP.nf > 1 ? XP.focus[XP.nf - 1] : null, a0 = anc ? anc.a : 0;
  const u = step >= 1 ? 1 : step >= 1e-3 ? 1e-3 : step >= 1e-6 ? 1e-6 : 1e-9, un = u === 1 ? 's' : u === 1e-3 ? 'ms' : u === 1e-6 ? 'µs' : 'ns', dg = Math.max(0, Math.ceil(-Math.log10(step / u) - 1e-9));
  x.font = `400 10px ${FONT}`; x.textAlign = 'center';
  const yb = XP.yOcc + (XP.lanes.length ? 18 + XP.lanes.length * (XP.laneH + 4) : 0);
  for (let t = Math.ceil((XP.t0 - a0) / step) * step + a0; t <= XP.t1; t += step) {
    const X = Math.round(XP.LX + (t - XP.t0) * XP.kx) + .5; if (X < XP.LX || X > XP.LX + XP.LW) continue;
    x.fillStyle = 'rgba(255,255,255,.045)'; x.fillRect(X - .5, 4, 1, yb - 4); x.fillStyle = C.faint; x.fillRect(X - .5, XP.yAxis - 4, 1, 4);
    const v = (t - a0) / u; x.fillStyle = C.dim; x.fillText(dec(`${anc ? '+' : ''}${Math.abs(v) < 1e-9 ? '0' : v.toFixed(dg)} ${un}`), X, XP.yAxis + 10);
  }
  x.textAlign = 'left';
  if (anc) { if (anc.lf !== lang || !anc.lb) xLabels(anc); x.fillStyle = C.faint; x.font = `400 9.5px ${FONT}`; xClipText(x, `${L('from', 'desde')} ${anc.lb2}`, 6, XP.yAxis + 10, XP.LX - 10); }
}
function xClipText(x, s, X, Y, maxW) { let t = s; if (x.measureText(t).width > maxW) { while (t.length > 2 && x.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; } x.fillText(t, X, Y); }
// Repetition, marked: decode is the same pass again and again; inside a pass the layer pattern repeats.
function xBracket(x, a, b, y, label, col) {
  const LX = XP.LX, RX = XP.LX + XP.LW, ca = Math.max(LX, a), cb = Math.min(RX, b); if (cb - ca < 14) return;
  x.strokeStyle = col; x.lineWidth = 1; x.beginPath(); x.moveTo(ca + .5, y + 12); x.lineTo(ca + .5, y + 8.5); x.lineTo(cb - .5, y + 8.5); x.lineTo(cb - .5, y + 12); x.stroke();
  if (label) { x.font = `500 9.5px ${FONT}`; const tw = x.measureText(label).width; if (tw + 12 < cb - ca) { const lx = Math.max(ca + 6, Math.min(cb - tw - 6, (ca + cb) / 2 - tw / 2)); x.fillStyle = XC.bg; x.fillRect(lx - 4, y, tw + 8, 11); x.fillStyle = col; x.fillText(label, lx, y + 8.5); } }
}
function xMarks(x) {
  const root = XP.root; if (!root || !root.kids || XP.real) return; const m = R.m;
  if (XP.rb[2] > 0) for (const p of root.kids) if (p.kids && p.kids.length > 1) {
    const s0 = p.kids[0].s, n = p.kids.length;
    const lab = p.id === 'prefill' ? L(`×${num(n)} chunks of up to 512 tokens · the same weights read for each`, `×${num(n)} bloques de hasta 512 tokens · los mismos pesos leídos en cada uno`)
      : s0.k === 'round' ? L(`×${num(n)} rounds · drafts, then one check of the full model`, `×${num(n)} rondas · borradores y una comprobación del modelo completo`) : L(`×${num(n)} passes · every token reads the whole model again`, `×${num(n)} pasadas · cada token vuelve a leer todo el modelo`);
    xBracket(x, XP.LX + (p.a - XP.t0) * XP.kx, XP.LX + (p.b - XP.t0) * XP.kx, XP.ry[2] + 1, lab, p.id === 'prefill' ? C.cy : C.hot);
  }
  if (XP.rb[3] > 0) {
    const every = m.kvLayers < m.layers ? Math.round(m.layers / m.kvLayers) : 0;
    for (const p of root.kids) { if (!p.kids) continue; for (let i = xFirst(p.kids, XP.t0); i < p.kids.length; i++) { const sg = p.kids[i]; if (sg.a > XP.t1) break; const w = (sg.b - sg.a) * XP.kx; if (w < 160 || !sg.kids) continue;
      const ly = sg.kids, f0 = ly.findIndex(q => q.k === 'layer'), y = XP.ry[3] + 1;
      if (f0 > 0) xBracket(x, XP.LX + (ly[0].a - XP.t0) * XP.kx, XP.LX + (ly[f0 - 1].b - XP.t0) * XP.kx, y, L(`${f0} drafts`, `${f0} borradores`), C.pink);
      if (every) { const gw = (ly[f0 + every - 1].b - ly[f0].a) * XP.kx, G = Math.floor(m.layers / every); let lab0 = 0;
        for (let g = 0; g < G; g++) { const a = ly[f0 + g * every], b = ly[f0 + g * every + every - 1]; if (b.b < XP.t0 || a.a > XP.t1) continue; const lab = gw > 250 ? L(`pattern ${g + 1} of ${G}: ${every - 1} DeltaNet + 1 attention`, `patrón ${g + 1} de ${G}: ${every - 1} DeltaNet + 1 atención`) : !lab0 ? (lab0 = 1, gw > 130 ? L(`×${G} · ${every - 1} DeltaNet + 1 attn`, `×${G} · ${every - 1} DeltaNet + 1 atn`) : `×${G}`) : ''; xBracket(x, XP.LX + (a.a - XP.t0) * XP.kx, XP.LX + (b.b - XP.t0) * XP.kx, y, lab, C.teal); } }
      else xBracket(x, XP.LX + (ly[f0].a - XP.t0) * XP.kx, XP.LX + (ly[f0 + m.layers - 1].b - XP.t0) * XP.kx, y, L(`×${m.layers} layers, the same matrices in each`, `×${m.layers} capas, las mismas matrices en cada una`), C.li);
      if (XP.split && XP.slowN > 0 && XP.slowN < m.layers) { const X = XP.LX + (ly[f0 + XP.slowN].a - XP.t0) * XP.kx; xXfer(x, X, 3); }
    } }
  }
  if (XP.rb[4] > 0 && R.sh.expert) {
    const sg = XP.nf >= 3 ? XP.focus[2] : null; if (!sg || !sg.kids) return;
    for (let i = xFirst(sg.kids, XP.t0); i < sg.kids.length; i++) { const ly = sg.kids[i]; if (ly.a > XP.t1) break; if (!ly.kids || (ly.b - ly.a) * XP.kx < 160) continue;
      const ex = ly.kids.filter(q => q.kind === 'expert' || q.kind === 'experts'); if (!ex.length) continue;
      const lab = ex[0].kind === 'experts' ? L(`${num(ex[0].op.n)} of ${m.experts} experts touched by ${num(ly.nt)} tokens`, `${num(ex[0].op.n)} de ${m.experts} expertos tocados por ${num(ly.nt)} tokens`) : L(`${m.expertsUsed} of ${m.experts} experts${m.sharedExperts ? ' + 1 shared' : ''}, chosen by the router`, `${m.expertsUsed} de ${m.experts} expertos${m.sharedExperts ? ' + 1 compartido' : ''}, elegidos por el router`);
      xBracket(x, XP.LX + (ex[0].a - XP.t0) * XP.kx, XP.LX + (ex[ex.length - 1].b - XP.t0) * XP.kx, XP.ry[4] + 1, lab, C.teal); }
  }
}
// A hand-over between devices: activations cross PCIe where the layers leave system RAM for the card.
function xXfer(x, X, d) {
  if (X < XP.LX || X > XP.LX + XP.LW) return; const y = XP.ry[d] + XP.rb[d], h = XP.rh[d] - XP.rb[d] - 3;
  x.strokeStyle = C.amber; x.lineWidth = 1.5; x.setLineDash([2, 2]); x.beginPath(); x.moveTo(X, y - 2); x.lineTo(X, XP.yOcc + 18 + 2 * (XP.laneH + 4)); x.stroke(); x.setLineDash([]); x.lineWidth = 1;
  x.fillStyle = C.amber; x.beginPath(); x.moveTo(X - 4, y + h / 2); x.lineTo(X, y + h / 2 - 5); x.lineTo(X + 4, y + h / 2); x.lineTo(X, y + h / 2 + 5); x.fill(); XP.km |= 1 << 16;
}
function xOccDraw(x) {
  if (XP.real) { x.font = `400 10.5px ${FONT}`; x.fillStyle = C.dim; xClipText(x, L('Occupancy: not available. A real server reports when each token arrived, not the bytes or FLOPs inside a pass.', 'Ocupación: no disponible. Un servidor real informa de cuándo llegó cada token, no de los bytes ni los FLOPs de una pasada.'), XP.LX, XP.yOcc + 18, XP.LW); return; }
  if (!XP.lanes.length) return;
  const y0 = XP.yOcc, lh = XP.laneH, LX = XP.LX, LW = XP.LW;
  x.font = `700 9.5px ${FONT}`; x.fillStyle = C.mid; const ttl = L('OCCUPANCY · MODELLED', 'OCUPACIÓN · MODELADA'); x.fillText(ttl, LX, y0 + 9); const tw0 = x.measureText(ttl).width;
  x.font = `400 9.5px ${FONT}`; x.fillStyle = C.dim; xClipText(x, L('share of the machine’s peak, slice by slice', 'parte del pico de la máquina, tramo a tramo'), LX + tw0 + 12, y0 + 9, LW - tw0 - 12);
  XP.lanes.forEach((ln, li) => {
    const y = y0 + 18 + li * (lh + 4);
    x.fillStyle = 'rgba(255,255,255,.025)'; x.fillRect(LX, y, LW, lh);
    x.fillStyle = ln.col; x.globalAlpha = .9;
    for (let i = 0; i < XP.nOcc; i++) { const o = i * 7, v = XP.occ[o + 2 + ln.k]; if (!(v > 0)) continue; const hh = Math.max(1, Math.min(1, v) * lh), a = XP.occ[o], b = XP.occ[o + 1]; x.fillRect(a, y + lh - hh, Math.max(.6, b - a - (b - a > 4 ? .75 : 0)), hh); }
    x.globalAlpha = 1;
    if (ln.ref < 1) { const yy = Math.round(y + lh * (1 - ln.ref)) + .5; x.strokeStyle = ln.col; x.globalAlpha = .55; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(LX, yy); x.lineTo(LX + LW, yy); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; XP.km |= 1 << 22; }
    x.strokeStyle = C.line2; x.strokeRect(LX + .5, y + .5, LW - 1, lh - 1);
    x.font = `600 10px ${FONT}`; x.fillStyle = C.mid; x.textAlign = 'right'; x.fillText(ln.name, LX - 8, y + (lh > 22 ? lh / 2 - 1 : lh / 2 + 3.5)); if (lh > 22 && XP.W >= 640) { x.font = `400 9.5px ${FONT}`; x.fillStyle = C.faint; x.fillText(ln.sub, LX - 8, y + lh / 2 + 10); } x.textAlign = 'left';
    XP.km |= 1 << (ln.k === 3 ? 20 : ln.k === 2 ? 19 : 18);
  });
  // the value under the pointer, in each lane
  if (XP.px >= LX && XP.px <= LX + LW) for (let i = 0; i < XP.nOcc; i++) { const o = i * 7; if (XP.px < XP.occ[o] || XP.px > XP.occ[o + 1]) continue;
    XP.lanes.forEach((ln, li) => { const v = XP.occ[o + 2 + ln.k], y = y0 + 18 + li * (lh + 4), s = pct(Math.max(0, v)); x.font = `600 10px ${FONT}`; const tw = x.measureText(s).width, X = Math.min(LX + LW - tw - 8, XP.px + 6); x.fillStyle = 'rgba(8,8,11,.85)'; x.fillRect(X - 3, y + 2, tw + 6, 13); x.fillStyle = ln.col; x.fillText(s, X, y + 12); });
    break; }
}
function xDraw(dt) {
  const c = $('cXp'), wr = $('xpCv'), r = wr.getBoundingClientRect(), W = Math.max(240, Math.floor(r.width)), H = Math.max(220, Math.floor(r.height)), dpr = Math.min(3, window.devicePixelRatio || 1);
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; XP.dirty = true; }
  XP.W = W; XP.H = H; XP.dpr = dpr; XP.LX = W < 640 ? 58 : 108; XP.LW = W - XP.LX - (W < 640 ? 8 : 14); XP.laneH = Math.round(Math.max(24, Math.min(46, H * (W < 640 ? .045 : .052))));
  if (XP.real && xRealKey() !== XP.realKey) { XP.realKey = xRealKey(); const keep = XP.root && !XP.empty; const v = [XP.t0, XP.t1]; xBuild(); if (keep) [XP.t0, XP.t1] = v; else xFit(false); }
  xStep(dt);
  if (!XP.dirty) return;
  XP.dirty = false; const t0 = performance.now();
  xFocus(); xLayout(dt);
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.fillStyle = XC.bg; x.fillRect(0, 0, W, H); x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  XP.kx = XP.LW / (XP.t1 - XP.t0); XP.tc = (XP.t0 + XP.t1) / 2;
  for (let d = 0; d < 10; d++) { if (XP.rh[d] < 1) continue; x.fillStyle = XC.row; x.fillRect(XP.LX, XP.ry[d] + XP.rb[d], XP.LW, Math.max(1, XP.rh[d] - XP.rb[d] - 3)); }
  XP.cnt.fill(0); XP.cntN.fill(0); XP.mx.fill(0); XP.vmx.fill(0); XP.rname.fill(''); XP.nOcc = 0; XP.km = 0;
  if (XP.empty) { x.font = `400 12px ${FONT}`; x.fillStyle = C.dim; x.fillText(L('Nothing measured yet: press Send, and the real run is drawn here as it arrives.', 'Aún no hay nada medido: pulsa Enviar y la ejecución real se dibuja aquí según llega.'), XP.LX, 40); }
  else xVisit(x, XP.root);
  if (!XP.real) xMarks(x);
  // gutter: the name of each open row
  x.textAlign = 'right';
  for (let d = 0; d < 10; d++) { if (XP.rh[d] < 11 || !XP.rname[d]) continue; const big = XP.rh[d] >= 30; x.font = big ? `600 10.5px ${FONT}` : `400 9.5px ${FONT}`; x.fillStyle = big ? C.mid : C.faint; let nm = XP.rname[d]; if (x.measureText(nm).width > XP.LX - 12) { for (const k in XNM) if (XNM[k] === nm) { nm = XNS[k]; break; } } x.fillText(nm, XP.LX - 8, XP.ry[d] + XP.rb[d] + (XP.rh[d] - XP.rb[d] - 3) / 2 + 3.5); }
  x.textAlign = 'left';
  xOccDraw(x); xTicks(x);
  // the playhead
  if (!XP.real && P.t >= XP.t0 && P.t <= XP.t1) { const X = Math.round(XP.LX + (P.t - XP.t0) * XP.kx) + .5; x.fillStyle = C.ink; x.fillRect(X - 1, 2, 2, XP.yAxis - 4); x.beginPath(); x.moveTo(X - 5, 0); x.lineTo(X + 5, 0); x.lineTo(X, 6); x.fill(); XP.km |= 1 << 17; }
  // the pointer: a hairline, and the hovered bar's name and length beside it
  if (XP.px >= XP.LX && XP.px <= XP.LX + XP.LW && !XP.drag) {
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(Math.round(XP.px), 2, 1, XP.yAxis - 4);
    if (XP.hov && matchMedia('(hover: hover)').matches) { const s = xTipText(); x.font = `500 10.5px ${FONT}`; const tw = x.measureText(s).width; let X = XP.px + 12, Y = XP.py + 16; if (X + tw + 12 > XP.W) X = XP.px - tw - 20; if (Y + 18 > XP.H) Y = XP.py - 24; x.fillStyle = 'rgba(13,13,17,.95)'; x.fillRect(X, Y, tw + 10, 18); x.strokeStyle = C.line2; x.strokeRect(X + .5, Y + .5, tw + 9, 17); x.fillStyle = C.ink; x.fillText(s, X + 5, Y + 12.5); }
  }
  const ms = performance.now() - t0; XP.ft[XP.fi] = ms; XP.fi = (XP.fi + 1) % XP.ft.length; XP.fn++;
  xHeader(); xLegend(); xPanel();
}
let xTipK = '', xTipS = '';
function xTipText() { const k = XP.hov.u * 1e7 + XP.hj; if (k === xTipK && XP.lang === lang) return xTipS; xTipK = k; const n = XP.hov; if (n.lf !== lang || !n.lb) xLabels(n); xTipS = XP.hj >= 0 ? `${xUniName(n, XP.hj)} · ${xT((n.b - n.a) / n.uni)}` : `${n.lb} · ${xT(n.b - n.a)}`; return xTipS; }
const xUniName = (n, j) => n.unit === 'row' ? L(`row ${num(j + 1)} of ${num(n.uni)}`, `fila ${num(j + 1)} de ${num(n.uni)}`) : n.unit === 'tok' ? L(`cached token ${num(j + 1)} of ${num(n.uni)}`, `token en caché ${num(j + 1)} de ${num(n.uni)}`) : L(`state head ${j + 1} of ${n.uni}`, `cabeza de estado ${j + 1} de ${n.uni}`);

// ---- the view: zoom, pan, animate ----
const xMinSpan = () => 4e-9, xMaxSpan = () => (XP.root ? XP.root.b : 1) * 1.12;
function xClamp() {
  let s = XP.t1 - XP.t0; const T = XP.root ? XP.root.b : 1, mx = xMaxSpan(), mn = xMinSpan();
  if (s > mx) { const c2 = (XP.t0 + XP.t1) / 2; s = mx; XP.t0 = c2 - s / 2; XP.t1 = c2 + s / 2; }
  if (s < mn) { const c2 = (XP.t0 + XP.t1) / 2; s = mn; XP.t0 = c2 - s / 2; XP.t1 = c2 + s / 2; }
  const pad = s * .06; if (XP.t0 < -pad) { XP.t0 = -pad; XP.t1 = XP.t0 + s; } if (XP.t1 > T + pad) { XP.t1 = T + pad; XP.t0 = XP.t1 - s; }
  XP.dirty = true;
}
function xZoomAt(t, f) { const s = (XP.t1 - XP.t0) * f, mn = xMinSpan(), mx = xMaxSpan(), s2 = Math.max(mn, Math.min(mx, s)), g = s2 / (XP.t1 - XP.t0); XP.t0 = t - (t - XP.t0) * g; XP.t1 = XP.t0 + s2; xClamp(); }
const xEase = e => (e < .5 ? 4 * e * e * e : 1 - (-2 * e + 2) ** 3 / 2);
// Animated moves to [a, b]: zooming in keeps the target under its first screen position as it grows toward the
// centre; zooming out lets the view slide inside the target as it widens. Span is eased in log space.
function xGo(a, b, dur) {
  const s1 = Math.max(xMinSpan(), b - a), m = s1 * .035, A = a - m, Bb = b + m;
  if (xReduced()) { XP.t0 = A; XP.t1 = Bb; xClamp(); return; }
  XP.inert = null; XP.anim = { st: performance.now(), dur: dur || Math.min(950, 380 + 70 * Math.abs(Math.log10((XP.t1 - XP.t0) / (Bb - A)))), a0: XP.t0, b0: XP.t1, a1: A, b1: Bb };
}
function xStep(dt) {
  const an = XP.anim;
  if (an) {
    const e = Math.min(1, (performance.now() - an.st) / an.dur), k = xEase(e), s0 = an.b0 - an.a0, s1 = an.b1 - an.a1, s = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * k);
    if (s1 < s0) { const c1 = (an.a1 + an.b1) / 2, f0 = (c1 - an.a0) / s0, f = f0 + (.5 - f0) * k; XP.t0 = c1 - f * s; }
    else { const r0 = (an.a0 - an.a1) / s1; XP.t0 = an.a1 + r0 * (1 - k) * s1; }
    XP.t1 = XP.t0 + s; XP.dirty = true; if (e >= 1) { XP.anim = null; XP.t0 = an.a1; XP.t1 = an.b1; xClamp(); }
  } else if (XP.inert) {
    const v = XP.inert.v; if (Math.abs(v) < .02) XP.inert = null; else { const dts = (XP.t1 - XP.t0) / XP.LW * v * dt * 1000; XP.t0 -= dts; XP.t1 -= dts; xClamp(); XP.inert.v *= Math.exp(-dt * 5); }
  }
  if (P.on) XP.dirty = true;
}
function xFit(anim = true) { const T = XP.root ? XP.root.b : 1; if (anim) xGo(0, T); else { XP.t0 = -T * .02; XP.t1 = T * 1.02; xClamp(); } }
// Breadcrumb: every bar that holds the centre of the view and covers most of it.
function xFocus() {
  const c2 = (XP.t0 + XP.t1) / 2, s = XP.t1 - XP.t0; let n = XP.root, k = 0;
  if (n) { XP.focus[k++] = n; for (;;) { const ks = n.kids; if (!ks) break; const i = xFirst(ks, c2), q = ks[i]; if (!q || q.a > c2 || q.b - q.a < s * .8) break; XP.focus[k++] = n = q; if (k >= 11) break; } }
  XP.nf = k;
}
// Hover and taps: the bar under a point, by row and time (rows, tokens and heads of an operation by index).
function xHit(px, py) {
  const out = { n: null, j: -1 }; if (!XP.root || px < XP.LX || px > XP.LX + XP.LW) return out;
  const t = XP.t0 + (px - XP.LX) / XP.kx;
  if (py >= XP.yOcc && XP.lanes.length) { for (let i = 0; i < XP.nOcc; i++) { const o = i * 7; if (px >= XP.occ[o] && px <= XP.occ[o + 1]) { out.n = XP.occN[i]; return out; } } return out; }
  for (let d = 0; d < 10; d++) {
    if (XP.rh[d] < 1 || py < XP.ry[d] || py > XP.ry[d] + XP.rh[d]) continue;
    let n = xAt(t, d); if (n) { out.n = n; return out; }
    n = xAt(t, d - 1); if (n && n.uni) { out.n = n; out.j = Math.max(0, Math.min(n.uni - 1, Math.floor((t - n.a) / (n.b - n.a) * n.uni))); }
    return out;
  }
  return out;
}

// ---- header, legend, panel ----
function xHeader() {
  let key = lang + XP.nf; for (let i = 0; i < XP.nf; i++) key += ',' + XP.focus[i].u;
  if (key !== XP.crumbKey) {
    XP.crumbKey = key; const cr = [];
    for (let i = 0; i < XP.nf; i++) { const n = XP.focus[i]; if (n.lf !== lang || !n.lb) xLabels(n); cr.push(i < XP.nf - 1 ? `<li><button type="button" data-u="${i}">${esc(xCrumb(n))}</button></li>` : `<li><span>${esc(xCrumb(n))}</span></li>`); }
    $('xpCrumbs').innerHTML = cr.join('');
  }
  const lv = xLevelKey(), pxs = (XP.t1 - XP.t0) / XP.LW, rk = lang + lv + XP.refs.length + '|' + xT(pxs);
  if (rk !== XP.refKey) { XP.refKey = rk; $('xpScale').innerHTML = XP.refs.map(([k, l, s]) => `<span class="${k === lv ? 'on' : ''}">${esc(l)} = <b>${esc(xT(s))}</b></span>`).join('<i>·</i>') + `<span class="px">1 px = <b>${esc(xT(pxs))}</b></span>`; }
}
const xCrumb = n => n.k === 'req' ? L('Request', 'Petición') : n.k === 'phase' ? n.lb2 : n.k === 'seg' ? (n.kind === 'prefill' ? L(`Chunk ${n.s.i + 1}`, `Bloque ${n.s.i + 1}`) : n.kind === 'round' ? L(`Round @ token ${n.s.tok + 1}`, `Ronda @ token ${n.s.tok + 1}`) : n.kind === 'mtok' ? `Token ${n.li + 1}` : `Token ${n.s.tok + 1}`) : n.k === 'layer' ? (n.kind === 'head' ? L('Output head', 'Cabeza de salida') : L(`Layer ${n.li + 1}`, `Capa ${n.li + 1}`)) : n.lb.replace(/ · .*/, '');
// The level you are at: the children of the deepest bar you are inside.
function xLevelKey() {
  const f = XP.nf ? XP.focus[XP.nf - 1] : null; if (!f) return 'req';
  if (f.k === 'req') return 'phase';
  if (f.k === 'phase') return f.id === 'prefill' ? 'chunk' : f.id === 'decode' ? 'pass' : 'phase';
  if (f.k === 'seg') return f.kids === null ? 'pass' : 'layer';
  if (f.k === 'layer' || f.k === 'draft') return f.k === 'draft' ? 'layer' : 'op';
  if (f.uni) return f.unit; return f.kind === 'experts' ? 'exps' : f.kind === 'expert' ? 'mats' : 'op';
}
const XLEG = [
  [0, 'background:rgba(127,227,255,.75)', 'Prefill: reading the prompt', 'Prefill: leer el prompt'], [1, 'background:rgba(255,212,59,.8)', 'Decode: writing the answer', 'Decode: escribir la respuesta'],
  [2, 'background:#34304a;box-shadow:inset 0 0 0 1px #8b6cf0', 'Load: weights from disk', 'Carga: pesos desde disco'], [3, 'kv', 'KV restore from disk', 'KV restaurada desde disco'],
  [4, `background:${C.pink}`, 'Draft step', 'Paso de borrador'], [5, 'kv', 'Attention layer', 'Capa de atención'], [6, 'state', 'DeltaNet layer', 'Capa DeltaNet'], [7, 'background:rgba(127,227,255,.8)', 'Output head', 'Cabeza de salida'],
  [8, 'background:#34304a;box-shadow:inset 0 0 0 1px #8b6cf0', 'Weight matrix', 'Matriz de pesos'], [9, 'kv', 'KV cache read', 'Lectura de la caché KV'], [10, 'state', 'DeltaNet state', 'Estado DeltaNet'],
  [11, `background:#34304a;box-shadow:inset 0 2px 0 ${C.teal}`, 'Expert', 'Experto'], [12, 'sys', 'Fixed cost: launches, sync', 'Coste fijo: lanzamientos, sincronización'], [13, 'background:linear-gradient(90deg,#3b3558 50%,#4d4574 50%)', 'Rows of a matrix', 'Filas de una matriz'],
  [14, `background:${HW.vram}`, 'Layer held in VRAM', 'Capa en VRAM'], [15, `background:${HW.ram}`, 'Layer left in system RAM', 'Capa en RAM del sistema'], [16, `background:${C.amber}`, 'Hand-over over PCIe', 'Paso por PCIe'],
  [17, `background:${C.ink}`, 'Playhead', 'Cabezal'], [18, `background:${C.li}`, 'Memory bandwidth used', 'Ancho de banda usado'], [19, `background:${C.cy}`, 'Compute used', 'Cómputo usado'], [20, `background:${HW.storage}`, 'Disk read', 'Lectura de disco'],
  [21, 'background:rgba(255,212,59,.8)', 'Measured token gap', 'Hueco medido entre tokens'], [22, 'background:repeating-linear-gradient(90deg,#9a9aa6 0 3px,transparent 3px 6px);height:2px;margin:4px 0', 'Reachable, per the model', 'Alcanzable, según el modelo'],
];
let XSW = null;
function xLegend() {
  if (XP.km === XP.kmShown && XP.lang === lang) return; XP.kmShown = XP.km;
  if (!XSW) XSW = { kv: `background:url(${TILES.kv.toDataURL()})`, state: `background:url(${TILES.state.toDataURL()})`, sys: `background:#24242c url(${TILES.sys.toDataURL()})` };
  const el = $('xpLeg'); if (!el) return;
  el.innerHTML = XLEG.filter(([b]) => XP.km & (1 << b)).map(([, st, en, es]) => `<li><i style="${XSW[st] || st}"></i>${esc(L(en, es))}</li>`).join('');
}
// ---- the explainers ----
function xLevelText(k) {
  const m = R.m, every = m.kvLayers < m.layers ? Math.round(m.layers / m.kvLayers) : 0;
  const T = {
    req: [L('The whole request', 'La petición entera'), L('One bar from the first byte read to the last token written. Zoom in with the wheel, a pinch or a double click; every bar opens into the parts that make it up.', 'Una barra desde el primer byte leído hasta el último token escrito. Amplía con la rueda, pellizcando o con doble clic; cada barra se abre en las partes que la forman.')],
    phase: [L('Phases of the request', 'Fases de la petición'), L('Load (only when cold), prefill and decode. Prefill reads the prompt in big chunks and waits on arithmetic; decode writes one token per pass and waits on memory. The occupancy strip below shows the switch.', 'Carga (solo en frío), prefill y decode. El prefill lee el prompt en bloques grandes y espera a la aritmética; el decode escribe un token por pasada y espera a la memoria. La franja de ocupación de abajo muestra el cambio.')],
    chunk: [L('Prefill chunks', 'Bloques de prefill'), L('Each bar is one trip through every layer carrying up to 512 prompt tokens at once. One read of the weights serves all of them, which is why compute, not memory, is what fills up.', 'Cada barra es un viaje por todas las capas con hasta 512 tokens del prompt a la vez. Una lectura de los pesos sirve a todos, por eso lo que se llena es el cómputo, no la memoria.')],
    pass: [L('Decode passes', 'Pasadas de decode'), (R.specInfo ? L(`Each bar is a round: ${R.specInfo.kind === 'mtp' ? 'the model’s own MTP block' : 'a small draft model'} guesses a few tokens, then one pass of the full model checks them all. `, `Cada barra es una ronda: ${R.specInfo.kind === 'mtp' ? 'el bloque MTP del propio modelo' : 'un modelo borrador pequeño'} adivina unos tokens y una pasada del modelo completo los comprueba todos. `) : L('Each bar is one token: a full pass through the model. ', 'Cada barra es un token: una pasada entera por el modelo. ')) + L('The pass repeats with the same weights every time; only the context it reads grows, so each one is a hair longer than the last.', 'La pasada se repite con los mismos pesos cada vez; solo crece el contexto que lee, así que cada una dura un pelo más que la anterior.')],
    layer: [L('Layers of one pass', 'Capas de una pasada'), L(`The ${m.layers} layers run one after another, and the output head closes the pass. `, `Las ${m.layers} capas corren una tras otra y la cabeza de salida cierra la pasada. `) + (every ? L(`They repeat a pattern of ${every - 1} DeltaNet layers and one attention layer, ${m.layers / every} times.`, `Repiten un patrón de ${every - 1} capas DeltaNet y una de atención, ${m.layers / every} veces.`) : L('All of them have the same matrices; only the KV each one reads differs.', 'Todas tienen las mismas matrices; solo cambia la KV que lee cada una.'))],
    op: [L('Operations inside a layer', 'Operaciones dentro de una capa'), L(`The layer’s matrices in order, the read of the KV cache${every ? ' or the DeltaNet state' : ''}${R.sh.expert ? ', the experts the router chose' : ''} and a fixed cost for launching the work. Width is time: a wide bar is a big read or a lot of arithmetic.`, `Las matrices de la capa en orden, la lectura de la caché KV${every ? ' o del estado DeltaNet' : ''}${R.sh.expert ? ', los expertos que eligió el router' : ''} y un coste fijo por lanzar el trabajo. El ancho es tiempo: una barra ancha es una lectura grande o mucha aritmética.`)],
    mats: [L('Matrices of an expert', 'Matrices de un experto'), L('gate and up widen the token, down brings it back. An expert is a small feed-forward network; its three matrices are read in full for every token that chose it.', 'gate y up ensanchan el token, down lo devuelve. Un experto es una red feed-forward pequeña; sus tres matrices se leen enteras para cada token que lo eligió.')],
    exps: [L('Experts touched by many tokens', 'Expertos tocados por muchos tokens'), L('With many tokens at once, nearly every expert is picked by someone, and each one is read once for all of its tokens. The cost model knows how many are touched, not which: the slices are equal on purpose.', 'Con muchos tokens a la vez casi todos los expertos los elige alguien, y cada uno se lee una vez para todos sus tokens. El modelo de costes sabe cuántos se tocan, no cuáles: los tramos son iguales a propósito.')],
    row: [L('Rows of a matrix', 'Filas de una matriz'), L('A matrix is read row by row: each row is one dot product with the token’s activations, and gives one number of the output. This is the finest grain the cost model prices; nothing below a row is drawn.', 'Una matriz se lee fila a fila: cada fila es un producto escalar con las activaciones del token y da un número de la salida. Es el grano más fino que el modelo de costes pone precio; no se dibuja nada por debajo de una fila.')],
    tok: [L('The KV cache, token by token', 'La caché KV, token a token'), L('Attention reads the key and value every earlier token left at this layer. One slice per cached token; this read grows by one slice with every token written.', 'La atención lee la clave y el valor que cada token anterior dejó en esta capa. Un tramo por token en caché; esta lectura crece un tramo con cada token escrito.')],
    head: [L('Heads of the DeltaNet state', 'Cabezas del estado DeltaNet'), L('The state is one small square matrix per head, read and rewritten every token. Its size is fixed: the same at token 1 and at token 100,000.', 'El estado es una matriz cuadrada pequeña por cabeza, leída y reescrita en cada token. Su tamaño es fijo: el mismo en el token 1 y en el 100.000.')],
  };
  if (XP.real) return k === 'req' || k === 'phase' ? [L('A measured request', 'Una petición medida'), L('Only what the server reported: its load time, the wait for the first token, and when every later token arrived. There are no layers here: a real server does not report them.', 'Solo lo que informó el servidor: su tiempo de carga, la espera hasta el primer token y cuándo llegó cada token posterior. Aquí no hay capas: un servidor real no las informa.')] : [L('Measured tokens', 'Tokens medidos'), L('Each bar is the gap between two arrivals as the server streamed them. Uneven bars are real: batching, scheduling and the network all show up here.', 'Cada barra es el hueco entre dos llegadas tal como el servidor las envió. Las barras desiguales son reales: el agrupado, la planificación y la red aparecen aquí.')];
  return T[k] || T.req;
}
// What a bar does and why it takes what it takes, from its bytes, FLOPs and the machine.
function xWhat(n, j) {
  const m = R.m, mc = R.mc, u = n.uni && j >= 0, dur = (n.b - n.a) / (u ? n.uni : 1), f = u ? 1 / n.uni : 1, bytes = (n.bf + n.bs) * f, fl = n.fl * f;
  if (n.lf !== lang || !n.lb) xLabels(n);
  let title = u ? xUniName(n, j) : n.lb, tag = '', what = '';
  const pre = n.s && n.s.k === 'prefill', ntok = n.nt;
  if (XP.real) {
    tag = L('measured', 'medido');
    what = n.k === 'req' ? L('The real request, end to end, as this browser timed it.', 'La petición real, de punta a punta, cronometrada por este navegador.') : n.k === 'phase' ? ({ load: L('The server’s own report of loading the model.', 'El propio informe del servidor sobre la carga del modelo.'), prefill: L('From the end of the load to the first token: reading the prompt.', 'Del final de la carga al primer token: leer el prompt.'), wait: L('Load and prefill together: the server only splits them when the run ends.', 'Carga y prefill juntas: el servidor solo las separa al terminar.'), decode: L('From the first token to the last, as they arrived.', 'Del primer token al último, según llegaron.') }[n.id] || '') : L('The time between this token’s arrival and the one before it.', 'El tiempo entre la llegada de este token y la del anterior.');
    return { title, tag, what, why: L('A real server reports when tokens arrive, not what happens inside a pass, so nothing below this bar is shown and occupancy is not available.', 'Un servidor real informa de cuándo llegan los tokens, no de lo que pasa dentro de una pasada, así que no se muestra nada por debajo de esta barra y la ocupación no está disponible.'), facts: [[L('Starts', 'Empieza'), TT(n.a)], [L('Lasts', 'Dura'), xT(n.b - n.a)]] };
  }
  if (n.k === 'req') { tag = L('request', 'petición'); what = L(`Everything this request costs: ${R.load > 0 ? `a cold load of ${xT(R.load)}, ` : ''}${xT(R.prefill)} of prefill for ${num(R.newTokens)} prompt tokens and ${xT(R.decodeTime)} writing ${num(S.ans)} tokens.`, `Todo lo que cuesta esta petición: ${R.load > 0 ? `una carga en frío de ${xT(R.load)}, ` : ''}${xT(R.prefill)} de prefill para ${num(R.newTokens)} tokens del prompt y ${xT(R.decodeTime)} escribiendo ${num(S.ans)} tokens.`); }
  else if (n.k === 'phase') {
    tag = L('phase', 'fase');
    what = { load: L(`The weights file, ${B(n.bd)}, is read from disk into memory before anything can run.`, `El archivo de pesos, ${B(n.bd)}, se lee de disco a memoria antes de que nada pueda correr.`), restore: L(`The keys and values of the cached prefix, ${B(n.bd)}, come back from disk instead of being recomputed.`, `Las claves y valores del prefijo en caché, ${B(n.bd)}, vuelven de disco en vez de recalcularse.`),
      prefill: L(`Reading the prompt: ${num(R.newTokens)} tokens in ${n.kids.length} chunks, each through every layer, before the first word.`, `Leer el prompt: ${num(R.newTokens)} tokens en ${n.kids.length} bloques, cada uno por todas las capas, antes de la primera palabra.`),
      decode: L(`Writing the answer: ${num(S.ans)} tokens in ${num(n.kids.length)} ${n.kids[0].kind === 'round' ? 'rounds' : 'passes'}, each a trip through the whole model.`, `Escribir la respuesta: ${num(S.ans)} tokens en ${num(n.kids.length)} ${n.kids[0].kind === 'round' ? 'rondas' : 'pasadas'}, cada una un viaje por todo el modelo.`) }[n.id] || '';
  } else if (n.k === 'seg') {
    tag = pre ? L('prefill chunk', 'bloque de prefill') : n.kind === 'round' ? L('decode round', 'ronda de decode') : L('decode pass', 'pasada de decode');
    what = pre ? L(`Prompt tokens ${num(n.s.from + 1)} to ${num(n.s.to)} travel through all ${m.layers} layers together, each one also attending to the ${num(n.s.from)} before them.`, `Los tokens ${num(n.s.from + 1)} a ${num(n.s.to)} del prompt viajan juntos por las ${m.layers} capas, y cada uno atiende también a los ${num(n.s.from)} anteriores.`)
      : n.kind === 'round' ? L(`${ntok - 1} draft steps propose tokens, then one pass of the full model checks ${ntok} positions at once. ${n.s.acc} of the guesses were kept, so this round wrote ${n.s.n} token${n.s.n > 1 ? 's' : ''}.`, `${ntok - 1} pasos de borrador proponen tokens y una pasada del modelo completo comprueba ${ntok} posiciones a la vez. Se aceptaron ${n.s.acc} de las propuestas, así que esta ronda escribió ${n.s.n} token${n.s.n > 1 ? 's' : ''}.`)
      : L(`One pass of the whole model that produces one token, with ${num(n.s.ctx)} tokens already in the context.`, `Una pasada de todo el modelo que produce un token, con ${num(n.s.ctx)} tokens ya en el contexto.`);
  } else if (n.k === 'draft') { tag = L('draft', 'borrador'); what = n.id === 'mtp' ? L(`The model’s own MTP block guesses the next token: one block and the output head, ${B(bytes)}, far less than a full pass.`, `El bloque MTP del propio modelo adivina el siguiente token: un bloque y la cabeza de salida, ${B(bytes)}, mucho menos que una pasada entera.`) : L(`The 0.6B draft model guesses the next token: a full pass of a much smaller model, ${B(bytes)}.`, `El modelo borrador de 0,6B adivina el siguiente token: una pasada entera de un modelo mucho menor, ${B(bytes)}.`); }
  else if (n.k === 'layer') {
    tag = n.kind === 'head' ? L('output head', 'cabeza de salida') : n.kind === 'attn' ? L('attention layer', 'capa de atención') : L('DeltaNet layer', 'capa DeltaNet');
    what = n.kind === 'head' ? L(`Turns the last layer’s output into one score for each of the ${num(m.vocab)} tokens of the vocabulary; sampling picks from those.`, `Convierte la salida de la última capa en una puntuación para cada uno de los ${num(m.vocab)} tokens del vocabulario; el muestreo elige entre ellas.`)
      : (n.kind === 'attn' ? L(`Layer ${n.li + 1} compares the new token with every earlier one through the KV cache`, `La capa ${n.li + 1} compara el token nuevo con todos los anteriores a través de la caché KV`) : L(`Layer ${n.li + 1} updates a fixed-size state instead of looking back at every token`, `La capa ${n.li + 1} actualiza un estado de tamaño fijo en vez de mirar atrás a cada token`)) + L(`, then runs the feed-forward part${R.sh.expert ? ' through the experts the router picks' : ''}.`, `, y luego pasa la parte feed-forward${R.sh.expert ? ' por los expertos que elige el router' : ''}.`);
    if (XP.split) what += ' ' + (n.dev ? L('Its weights did not fit on the card: they are read from system RAM.', 'Sus pesos no cupieron en la tarjeta: se leen de la RAM del sistema.') : L('Its weights live in the card’s VRAM.', 'Sus pesos viven en la VRAM de la tarjeta.'));
  } else if (u) {
    const o = n.op;
    tag = n.unit === 'row' ? L('row', 'fila') : n.unit === 'tok' ? L('cached token', 'token en caché') : L('state head', 'cabeza de estado');
    what = n.unit === 'row' ? L(`${num(o.shape[1])} weights, ${B(bytes)}: one dot product with ${ntok > 1 ? `the activations of each of the ${num(ntok)} tokens` : 'the token’s activations'} gives output number ${num(j + 1)} of ${n.id}. Rows are drawn in order for clarity; the GPU reads many at once across its ${R.mc.units} ${R.mc.unitName}s. The model prices the total, not the order.`, `${num(o.shape[1])} pesos, ${B(bytes)}: un producto escalar con ${ntok > 1 ? `las activaciones de cada uno de los ${num(ntok)} tokens` : 'las activaciones del token'} da la salida número ${num(j + 1)} de ${n.id}. Las filas se dibujan en orden por claridad; la GPU lee muchas a la vez en sus ${R.mc.units} ${R.mc.unitName}. El modelo pone precio al total, no al orden.`)
      : n.unit === 'tok' ? L(`The key and value token ${num(j + 1)} left at this layer, ${B(bytes)}. The new query is compared with this key, and its value is mixed in by how well they match.`, `La clave y el valor que el token ${num(j + 1)} dejó en esta capa, ${B(bytes)}. La consulta nueva se compara con esta clave y su valor se mezcla según lo bien que encajen.`)
      : L(`One square matrix of the DeltaNet state, ${B(bytes)}, read and written back every token.`, `Una matriz cuadrada del estado DeltaNet, ${B(bytes)}, leída y reescrita en cada token.`);
  } else {
    const o = n.op;
    tag = { mat: L('weight matrix', 'matriz de pesos'), kv: L('KV read', 'lectura KV'), state: L('state', 'estado'), expert: L('expert', 'experto'), experts: L('experts', 'expertos'), fix: L('fixed cost', 'coste fijo') }[n.kind] || '';
    if (n.kind === 'mat') { const r = XMAT[n.id]; what = L(`${n.id}, ${num(o.shape[1])} × ${num(o.shape[2])}, ${B(bytes)}: ${r ? r[0][0] : 'a weight matrix'}. It is read entire from memory for every pass.`, `${n.id}, ${num(o.shape[1])} × ${num(o.shape[2])}, ${B(bytes)}: ${r ? r[0][1] : 'una matriz de pesos'}. Se lee entera de memoria en cada pasada.`); }
    else if (n.kind === 'kv') what = L(`Reads the keys and values of the ${num(o.n)} tokens in the context at this layer, ${B(bytes)}, and weighs them against the new ${ntok > 1 ? 'queries' : 'query'}. It grows with every token written.`, `Lee las claves y valores de los ${num(o.n)} tokens del contexto en esta capa, ${B(bytes)}, y los pondera frente a ${ntok > 1 ? 'las consultas nuevas' : 'la consulta nueva'}. Crece con cada token escrito.`);
    else if (n.kind === 'state') what = L(`Reads and rewrites this layer’s state, ${B(bytes / 2)} each way: the whole memory of the past, at a fixed size. The model charges its bytes; its arithmetic is not modelled.`, `Lee y reescribe el estado de esta capa, ${B(bytes / 2)} en cada sentido: toda la memoria del pasado, a tamaño fijo. El modelo cobra sus bytes; su aritmética no está modelada.`);
    else if (n.kind === 'expert') what = n.e === -2 ? L('One of the experts at least one token in this chunk chose. Its weights are read once and serve all of them. Which expert it is, the model does not say.', 'Uno de los expertos que eligió al menos un token de este bloque. Sus pesos se leen una vez y sirven a todos. Cuál es, el modelo no lo dice.') : n.e === -1 ? L(`The shared expert: every token goes through it, on top of the ${m.expertsUsed} the router picks. ${B(bytes)}.`, `El experto compartido: todos los tokens pasan por él, además de los ${m.expertsUsed} que elige el router. ${B(bytes)}.`) : L(`One of the ${m.experts} small feed-forward networks; the router picked it for this token. Three matrices, ${B(bytes)}, read in full.`, `Una de las ${m.experts} redes feed-forward pequeñas; el router la eligió para este token. Tres matrices, ${B(bytes)}, leídas enteras.`);
    else if (n.kind === 'experts') what = L(`With ${num(ntok)} tokens at once, each picking ${m.expertsUsed}, ${num(o.n)} of the ${m.experts} experts get used at least once. Each is read once and shared by the tokens that chose it.`, `Con ${num(ntok)} tokens a la vez, cada uno eligiendo ${m.expertsUsed}, ${num(o.n)} de los ${m.experts} expertos se usan al menos una vez. Cada uno se lee una vez y lo comparten los tokens que lo eligieron.`);
    else if (n.kind === 'fix') what = L(`Kernel launches and synchronisation: ${dec(layerMsOf(mc, m).toFixed(2))} ms per layer whatever its size, ${mc.est ? 'assumed for this machine' : 'measured on this machine'}. Nothing is read and nothing is computed while the processor waits for the next kernel.`, `Lanzamientos de kernels y sincronización: ${dec(layerMsOf(mc, m).toFixed(2))} ms por capa sea cual sea su tamaño, ${mc.est ? 'supuesto para esta máquina' : 'medido en esta máquina'}. No se lee ni se calcula nada mientras el procesador espera al siguiente kernel.`);
  }
  // why it takes what it takes: the larger of moving its bytes and doing its arithmetic, plus any fixed cost
  const slow = n.dev === 1, Bw = n.k === 'phase' && n.bd ? R.diskGBs * 1e9 : (slow ? R.bwSlow : n.k === 'layer' || n.k === 'op' ? R.bwFast : R.bwEff) * 1e9, F = pre ? R.flopsEff : mc.tflops * 1e12, tm = (n.bd ? n.bd * f : bytes) / Bw, tc = fl / F;
  let why = '';
  if (n.kind === 'fix') why = L(`On this machine that is ${pct(n.b - n.a > 0 ? (layerMsOf(mc, m) / 1000) / ((n.par.b - n.par.a)) : 0)} of the layer. On a small model or a fast card, this fixed cost is what keeps a pass from reaching the bandwidth limit.`, `En esta máquina eso es el ${pct((layerMsOf(mc, m) / 1000) / (n.par.b - n.par.a))} de la capa. En un modelo pequeño o una tarjeta rápida, este coste fijo es lo que impide a una pasada llegar al límite del ancho de banda.`);
  else if (n.bd) why = L(`Disk is the slowest memory in the machine: ${B(n.bd)} at about ${dec(R.diskGBs)} GB/s. It is paid once, until keep_alive unloads the model.`, `El disco es la memoria más lenta de la máquina: ${B(n.bd)} a unos ${dec(R.diskGBs)} GB/s. Se paga una vez, hasta que keep_alive descarga el modelo.`);
  else if (bytes > 0 || fl > 0) {
    const bwTxt = dec(`${num(Bw / 1e9)} GB/s`), flTxt = dec(`${(F / 1e12).toFixed(F >= 1e13 ? 0 : 2)} TFLOPS`);
    if (tm >= tc) why = L(`Memory-bound. Reading ${B(bytes)} at the ${bwTxt} ${slow ? 'system RAM' : 'this memory'} reaches takes ${xT(tm)}; its ${xF(fl)} of arithmetic would take only ${xT(tc)} at ${flTxt}.`, `Limitado por memoria. Leer ${B(bytes)} a los ${bwTxt} que alcanza ${slow ? 'la RAM del sistema' : 'esta memoria'} lleva ${xT(tm)}; sus ${xF(fl)} de aritmética llevarían solo ${xT(tc)} a ${flTxt}.`) + (!pre && n.k !== 'phase' && n.k !== 'req' ? L(' The next token reads all of it again, so decode waits on bandwidth.', ' El siguiente token lo vuelve a leer entero, así que el decode espera al ancho de banda.') : '');
    else why = L(`Compute-bound. Its ${xF(fl)} take ${xT(tc)} at the ${flTxt} this machine reaches; reading its ${B(bytes)} would take only ${xT(tm)}.`, `Limitado por cómputo. Sus ${xF(fl)} llevan ${xT(tc)} a los ${flTxt} que alcanza esta máquina; leer sus ${B(bytes)} llevaría solo ${xT(tm)}.`) + (pre && n.kind === 'kv' ? L(` Each of the ${num(ntok)} tokens of the chunk is compared with all ${num(n.op.n)} before it, so this arithmetic grows with the chunk times the context.`, ` Cada uno de los ${num(ntok)} tokens del bloque se compara con los ${num(n.op.n)} anteriores, así que esta aritmética crece con el bloque por el contexto.`) : pre ? L(` One read of the weights serves all ${num(ntok)} tokens of the chunk, so arithmetic sets the pace.`, ` Una lectura de los pesos sirve a los ${num(ntok)} tokens del bloque, así que la aritmética marca el ritmo.`) : '');
    if (['seg', 'layer'].includes(n.k) && !u) { const fx = layerMsOf(mc, m) / 1000 * (n.k === 'seg' ? m.layers : 1), sh2 = fx / (n.b - n.a); if (sh2 > .08) why += ' ' + L(`About ${pct(Math.min(1, sh2))} of it is the fixed per-layer cost, when nothing moves.`, `Cerca del ${pct(Math.min(1, sh2))} es el coste fijo por capa, en el que nada se mueve.`); }
  }
  const facts = [[L('Starts', 'Empieza'), TT(n.a + (u ? j * dur : 0))], [L('Lasts', 'Dura'), xT(dur)]];
  if (n.par && !u) facts.push([L('Share of its parent', 'Parte de su padre'), pct((n.b - n.a) / Math.max(1e-15, n.par.b - n.par.a))]);
  if (n.bd) facts.push([L('Read from disk', 'Leído de disco'), B(n.bd * f)]);
  if (bytes > 0) facts.push([L('Read from memory', 'Leído de memoria'), B(bytes) + (XP.split && n.bf > 0 && n.bs > 0 ? ` (${pct(n.bs / (n.bf + n.bs))} ${L('from RAM', 'de RAM')})` : '')]);
  if (fl > 0) facts.push([L('Arithmetic', 'Aritmética'), xF(fl)]);
  if (n.kvo > 0 && !u) facts.push([L('KV written', 'KV escrita'), B(n.kvo)]);
  if (bytes > 0 || n.bd) { const o = { ...n, a: 0, b: dur, bf: n.bf * f, bs: n.bs * f, bd: n.bd * f, fl }; for (const ln of XP.lanes) facts.push([`${ln.name} · ${L('used', 'usado')}`, pct(Math.max(0, xOccOf(o, ln.k)))]); }
  if (!pre && (bytes > 0) && xOccOf({ ...n, a: 0, b: dur, fl }, 2) > 1) why += ' ' + L('Compute shows above 100%: the cost model charges a decode pass for its weights’ arithmetic but not for attention’s, which at this context length would not fit in the time it gives the pass.', 'El cómputo sale por encima del 100%: el modelo de costes cobra a una pasada de decode la aritmética de sus pesos pero no la de la atención, que con este contexto no cabría en el tiempo que le da.');
  if (XP.split && (n.k === 'layer' || n.k === 'op')) facts.push([L('Device', 'Dispositivo'), n.dev ? L('system RAM, CPU side', 'RAM del sistema, lado CPU') : 'VRAM']);
  return { title, tag, what, why, facts };
}
function xPanel() {
  const it = XP.hov || XP.sel, j = XP.hov ? XP.hj : XP.sj, lv = xLevelKey(), key = `${lang}|${lv}|${it ? it.u : 0}|${j}|${XP.sel ? XP.sel.u : 0}`;
  if (key === XP.pKey) return; XP.pKey = key; XP.lang = lang;
  const [lt, lp] = xLevelText(lv), ref = XP.refs.find(r2 => r2[0] === lv);
  let h = `<section class="xp-lv"><h3>${esc(lt)}</h3><p>${linkify(esc(lp))}</p>${ref ? `<p class="xp-ref">${esc(ref[1])} ≈ <b>${esc(xT(ref[2]))}</b> ${esc(L('in this run', 'en esta ejecución'))}</p>` : ''}</section>`;
  if (it) {
    const w = xWhat(it, j);
    const fl = !XP.real && !XP.hov && (it.k === 'seg' || it.k === 'layer' || it.k === 'op') ? `<button type="button" class="tbtn xp-fl" data-flow="1">${ICON('grid', 's')}<span>${esc(L('See in Flow: what shape, where it goes', 'Ver en Flujo: qué forma, adónde va'))}</span></button>` : '';
    h += `<section class="xp-it${XP.hov ? '' : ' sel'}"><header><b>${esc(w.title)}</b><em>${esc(w.tag)}</em></header>${fl}<dl>${w.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${w.what ? `<h5>${esc(L('What it does', 'Qué hace'))}</h5><p>${linkify(esc(w.what))}</p>` : ''}${w.why ? `<h5>${esc(L('Why it takes this long', 'Por qué tarda esto'))}</h5><p>${linkify(esc(w.why))}</p>` : ''}</section>`;
  } else h += `<section class="xp-it empty"><p>${esc(L('Point at a bar to read what it is. Click to keep it here; double-click to zoom to it.', 'Señala una barra para leer qué es. Clic para fijarla aquí; doble clic para ampliarla.'))}</p></section>`;
  h += `<section class="xp-lg"><h5>${esc(L('On screen', 'En pantalla'))}</h5><ul id="xpLeg"></ul></section>`;
  h += `<section class="xp-note"><p>${esc(XP.real ? L('Real mode: every time here was measured by this browser as the server streamed. The server does not report layers, bytes or FLOPs, so there is nothing to zoom into below a token and no occupancy.', 'Modo real: cada tiempo de aquí lo midió este navegador según el servidor enviaba. El servidor no informa de capas, bytes ni FLOPs, así que no hay nada que ampliar por debajo de un token ni ocupación.')
    : L(`Modelled, not measured. Bytes and FLOPs come from the cost model; occupancy divides them by the time each slice takes and by the machine’s peaks: ${num(R.mc.bw)} GB/s of memory${XP.split ? `, ${num(R.mc.hostBw)} GB/s of system RAM` : ''} and the ${dec(xNum3(R.mc.tflops))} TFLOPS the model credits it with. The dashed line is what the model says can be reached${R.mc.est ? ' (assumed for this machine)' : ' (measured on this machine)'}.${XP.split ? ' Offloaded layers are charged for their slower reads only; the model does not price the CPU’s own arithmetic or the hand-over over PCIe, a few KB per pass.' : ''}`, `Modelado, no medido. Los bytes y los FLOPs salen del modelo de costes; la ocupación los divide por el tiempo de cada tramo y por los picos de la máquina: ${num(R.mc.bw)} GB/s de memoria${XP.split ? `, ${num(R.mc.hostBw)} GB/s de RAM del sistema` : ''} y los ${dec(xNum3(R.mc.tflops))} TFLOPS que el modelo le atribuye. La línea discontinua es lo que el modelo dice que se puede alcanzar${R.mc.est ? ' (supuesto para esta máquina)' : ' (medido en esta máquina)'}.${XP.split ? ' Las capas descargadas solo se cobran por sus lecturas más lentas; el modelo no pone precio a la aritmética de la CPU ni al paso por PCIe, unos pocos KB por pasada.' : ''}`))}</p></section>`;
  $('xpIn').innerHTML = h; XP.kmShown = -1; xLegend();
  $('xpGripT').textContent = it ? xWhat(it, j).title : lt;
}

// ---- open, close, input ----
function xpOpen() {
  if (XP.on) return; const el = $('xp'), r = $('tlWrap').getBoundingClientRect();
  if (!XP.root || XP.R !== R || XP.real !== isReal()) { xBuild(); XP.realKey = xRealKey(); }
  // start on the span the bar was showing, so the bar seems to grow into the explorer
  if (timeGeo && !timeGeo.real && !timeGeo.ghost && timeGeo.t1 > timeGeo.t0) { XP.t0 = timeGeo.t0; XP.t1 = timeGeo.t1; xClamp(); } else xFit(false);
  XP.anim = XP.inert = null; XP.on = XP.shown = true; XP.dirty = true; XP.pKey = XP.crumbKey = XP.refKey = ''; XP.rh.fill(0);
  el.hidden = false; document.body.classList.add('xpOn'); $('xpNow').hidden = XP.real; $('tip').classList.remove('on');
  if (!xReduced() && r.width > 0) {
    el.style.transition = 'none'; el.classList.add('flip'); el.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`;
    void el.offsetWidth; el.style.transition = ''; el.style.transform = ''; el.classList.remove('flip'); XP.flipT = performance.now() + 460;
  } else XP.flipT = 0;
  xDraw(0); $('xpCv').focus({ preventScroll: true });
}
function xpClose() {
  if (!XP.on) return; XP.on = false; XP.drag = XP.pinch = null; const el = $('xp'), r = $('tlWrap').getBoundingClientRect();
  document.body.classList.remove('xpOn'); $('xpPanel').classList.remove('open');
  const done = () => { if (XP.on) return; el.hidden = true; el.style.transform = ''; el.classList.remove('flip'); XP.shown = false; };
  if (xReduced() || !r.width) { done(); return; }
  el.classList.add('flip'); el.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`;
  const end = e => { if (e && e.target !== el) return; el.removeEventListener('transitionend', end); done(); }; el.addEventListener('transitionend', end); setTimeout(end, 600);
  const b = $('xpOpen'); if (b && b.offsetParent) b.focus({ preventScroll: true });
}
const xRealKey = () => (isReal() ? `${LIVE.toks.length}|${LIVE.run ? 1 : 0}|${LIVE.running ? 1 : 0}` : '');
// Called by the frame loop. True while the explorer covers the console, so the console can skip its own drawing.
function xpFrame(dt) {
  if (!XP.shown) return false;
  if (XP.R !== R && !XP.real) { const v = [XP.t0, XP.t1]; xBuild(); [XP.t0, XP.t1] = v; xClamp(); }
  if (XP.lang !== lang) { XNM = XNAMES(); XNS = XSHORT(); XP.lanes = XP.real ? [] : xLanes(); XP.refs = XP.real || !XP.root ? [] : xRefs(); XP.refKey = XP.crumbKey = XP.pKey = ''; XP.kmShown = -1; applyXpText(); XP.lang = lang; XP.dirty = true; }
  xDraw(dt);
  return XP.on && performance.now() > XP.flipT;
}
function applyXpText() {
  const lbl = L('Explore', 'Explorar');
  $('xpOpen').innerHTML = `${ICON('expand', 's')}<span>${esc(lbl)}</span>`; $('xpOpen').title = L('Open the deep timeline: zoom from the request down to the rows of a matrix', 'Abrir la línea de tiempo profunda: amplía de la petición a las filas de una matriz');
  $('xpOpen2').innerHTML = ICON('expand', 's'); $('xpOpen2').title = $('xpOpen').title; $('xpOpen2').setAttribute('aria-label', lbl);
  $('xpT').textContent = L('Deep timeline', 'Línea de tiempo profunda');
  $('xpNow').innerHTML = `${ICON('timer', 's')}<span>${esc(L('Now', 'Ahora'))}</span>`; $('xpNow').title = L('Go to the playhead', 'Ir al cabezal');
  $('xpFit').innerHTML = `${ICON('eye', 's')}<span>${esc(L('Fit all', 'Ver todo'))}</span>`; $('xpFit').title = L('See the whole request (0)', 'Ver la petición entera (0)');
  $('xpX').innerHTML = ICON('close', 's'); $('xpX').title = L('Close (Esc)', 'Cerrar (Esc)');
  $('xpCv').setAttribute('aria-label', L('Deep timeline. Wheel or pinch to zoom, drag to pan, double-click a bar to zoom to it. Keys: plus and minus, arrows, 0 to fit, Esc to close.', 'Línea de tiempo profunda. Rueda o pellizco para ampliar, arrastra para desplazar, doble clic en una barra para ampliarla. Teclas: más y menos, flechas, 0 para ver todo, Esc para cerrar.'));
}
{
  applyXpText(); XP.lang = lang;
  $('xpOpen').addEventListener('click', xpOpen); $('xpOpen2').addEventListener('click', e => { e.stopPropagation(); xpOpen(); }); $('xpOpen2').addEventListener('pointerdown', e => e.stopPropagation());
  $('xpX').addEventListener('click', xpClose); $('xpFit').addEventListener('click', () => xFit());
  $('xpNow').addEventListener('click', () => { const s = XP.t1 - XP.t0; xGo(P.t - s * .45, P.t + s * .45, 420); });
  $('xpCrumbs').addEventListener('click', e => { const b = e.target.closest('button[data-u]'); if (!b) return; const n = XP.focus[+b.dataset.u]; if (n) xGo(n.a, n.b); });
  $('xpIn').addEventListener('click', e => { if (e.target.closest('[data-flow]')) flFromXp(XP.sel); });
  $('xpGrip').addEventListener('click', () => { const p = $('xpPanel'), on = !p.classList.contains('open'); p.classList.toggle('open', on); $('xpGrip').setAttribute('aria-expanded', on); });
  const cv = $('xpCv'), pts = new Map(), loc = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hover = (px, py) => { XP.px = px; XP.py = py; const h = xHit(px, py); if (h.n !== XP.hov || h.j !== XP.hj) { XP.hov = h.n; XP.hj = h.j; } cv.style.cursor = XP.drag ? 'grabbing' : h.n ? 'pointer' : 'grab'; XP.dirty = true; };
  const zoomTo = (px, py) => { const h = xHit(px, py); if (!h.n) return; if (h.j >= 0) { const du = (h.n.b - h.n.a) / h.n.uni, a = h.n.a + h.j * du; xGo(a, a + du); } else xGo(h.n.a, h.n.b); };
  cv.addEventListener('pointerdown', e => {
    const [px, py] = loc(e); cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [px, py]); XP.anim = XP.inert = null;
    if (pts.size === 1) XP.drag = { x0: px, y0: py, a: XP.t0, b: XP.t1, moved: false, lx: px, lt: performance.now(), v: 0, touch: e.pointerType !== 'mouse' };
    else if (pts.size === 2) { const [p1, p2] = [...pts.values()], mid = (p1[0] + p2[0]) / 2; XP.pinch = { d0: Math.max(10, Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1]) * .3), tm: XP.t0 + (mid - XP.LX) / XP.kx, s0: XP.t1 - XP.t0 }; XP.drag = null; }
  });
  cv.addEventListener('pointermove', e => {
    const [px, py] = loc(e);
    if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') hover(px, py); return; }
    pts.set(e.pointerId, [px, py]);
    if (XP.pinch && pts.size >= 2) { const [p1, p2] = [...pts.values()], mid = (p1[0] + p2[0]) / 2, dd = Math.max(10, Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1]) * .3), s = Math.max(xMinSpan(), Math.min(xMaxSpan(), XP.pinch.s0 * XP.pinch.d0 / dd)); XP.t0 = XP.pinch.tm - (mid - XP.LX) / XP.LW * s; XP.t1 = XP.t0 + s; xClamp(); return; }
    const d = XP.drag; if (!d) return;
    if (!d.moved && Math.abs(px - d.x0) + Math.abs(py - d.y0) > (d.touch ? 8 : 4)) d.moved = true;
    if (d.moved) { const s = d.b - d.a, dt2 = (px - d.x0) / XP.LW * s; XP.t0 = d.a - dt2; XP.t1 = d.b - dt2; xClamp(); const now2 = performance.now(), dtm = Math.max(1, now2 - d.lt); d.v = .7 * d.v + .3 * (px - d.lx) / dtm; d.lx = px; d.lt = now2; cv.style.cursor = 'grabbing'; }
  });
  const up = e => {
    const [px, py] = loc(e); pts.delete(e.pointerId);
    if (XP.pinch) { if (pts.size < 2) XP.pinch = null; if (pts.size === 1) { const [q] = [...pts.values()]; XP.drag = { x0: q[0], y0: q[1], a: XP.t0, b: XP.t1, moved: true, lx: q[0], lt: performance.now(), v: 0, touch: true }; } return; }
    const d = XP.drag; XP.drag = null; if (!d) return;
    if (d.moved) { if (Math.abs(d.v) > .25 && performance.now() - d.lt < 80) XP.inert = { v: d.v }; return; }
    const h = xHit(px, py); XP.sel = h.n; XP.sj = h.j; XP.dirty = true;
    if (d.touch) { const t2 = performance.now(); if (t2 - XP.tap < 320 && Math.abs(px - XP.tapX) < 30) { zoomTo(px, py); XP.tap = 0; } else { XP.tap = t2; XP.tapX = px; } XP.hov = null; }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); XP.drag = null; XP.pinch = null; });
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) { XP.px = XP.py = -1; XP.hov = null; XP.hj = -1; XP.dirty = true; } });
  cv.addEventListener('dblclick', e => { const [px, py] = loc(e); zoomTo(px, py); });
  cv.addEventListener('wheel', e => {
    e.preventDefault(); const [px] = loc(e); let dy = e.deltaY, dx = e.deltaX; if (e.deltaMode === 1) { dy *= 16; dx *= 16; } else if (e.deltaMode === 2) { dy *= 400; dx *= 400; }
    XP.anim = XP.inert = null; const t = XP.t0 + (Math.max(XP.LX, Math.min(XP.LX + XP.LW, px)) - XP.LX) / XP.kx;
    if (e.ctrlKey) xZoomAt(t, Math.exp(dy * .012)); // a trackpad pinch arrives as ctrl + wheel
    else if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) { const s = XP.t1 - XP.t0, v = (dx || dy) / XP.LW * s; XP.t0 += v; XP.t1 += v; xClamp(); }
    else xZoomAt(t, Math.exp(dy * .0022));
    hover(px, loc(e)[1]);
  }, { passive: false });
  document.addEventListener('keydown', e => {
    if (!XP.on || e.ctrlKey || e.metaKey || e.altKey) return;
    if (UI.sel && !$('lesson').hidden) return; // an explainer opened from the panel closes first
    const k = e.key, s = XP.t1 - XP.t0, c2 = (XP.t0 + XP.t1) / 2; let done = true;
    if (k === 'Escape') xpClose();
    else if (k === '+' || k === '=') xGo(c2 - s / 4, c2 + s / 4, 220);
    else if (k === '-' || k === '_') xGo(c2 - s, c2 + s, 220);
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { const v = (k === 'ArrowLeft' ? -1 : 1) * s * (e.shiftKey ? .8 : .25); xGo(XP.t0 + v + s * .035 / 1.07, XP.t1 + v - s * .035 / 1.07, 200); }
    else if (k === '0' || k === 'Home') xFit();
    else if (k === 'ArrowUp') { const n = XP.nf > 1 ? XP.focus[XP.nf - 2] : XP.root; if (n) xGo(n.a, n.b); }
    else if (k === 'ArrowDown' || k === 'Enter') { const n = XP.sel || (XP.nf ? xAt(c2, XP.focus[XP.nf - 1].d + 1) : null); if (n) { if (XP.sel && XP.sj >= 0) { const du = (n.b - n.a) / n.uni; xGo(n.a + XP.sj * du, n.a + (XP.sj + 1) * du); } else xGo(n.a, n.b); } }
    else if (k === ' ' && !XP.real) { if (!fitGate()) { UI.stale = false; setPlaying(!P.on); } }
    else done = k !== 'Tab' && k.length === 1; // other single keys stay here, away from the console's shortcuts
    if (done) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  addEventListener('resize', () => { XP.dirty = true; });
}
// Frame times of the explorer's own drawing, for the test harness: [mean, p95, max] in ms over the last frames.
function xpStats() { const n = Math.min(XP.fn, XP.ft.length), a = Array.from(XP.ft.slice(0, n)).sort((p, q) => p - q); return n ? [a.reduce((s, v) => s + v, 0) / n, a[Math.floor(n * .95)], a[n - 1], n] : [0, 0, 0, 0]; }
