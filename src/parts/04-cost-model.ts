// ===== One request, computed =====
const KEEP = { idle: 0, unloaded: false };
// The cost model itself is estimate() (01e-estimate.ts), a pure function; the app runs it on its Setup.
function compute() {
  return estimate(configFromState(S, { unloaded: KEEP.unloaded, calib: CALIB, machines: MACHINES }), { models: MODELS, shapes: SHAPES });
}

// ===== Bytes and time inside a step =====
const bytesOf = s => (s[1] * s[2] * QUANTS[S.quant].bpw) / 8;
function layerInfo(i) {
  const { m, sh, kinds } = R, kind = kinds[i], mixer = kind === 'attn' ? sh.attn : sh.delta || sh.attn;
  const mixBytes = mixer.reduce((s, x) => s + bytesOf(x), 0);
  let ffnRead = 0, ffnStored = 0, one = 0;
  if (sh.expert) { one = sh.expert.reduce((s, x) => s + bytesOf(x), 0); ffnRead = bytesOf(sh.router) + one * (m.expertsUsed + m.sharedExperts); ffnStored = bytesOf(sh.router) + one * (m.experts + m.sharedExperts); }
  else if (sh.mlp) ffnRead = ffnStored = sh.mlp.reduce((s, x) => s + bytesOf(x), 0);
  return { kind, mixer, mixBytes, ffnRead, ffnStored, read: mixBytes + ffnRead, stored: mixBytes + ffnStored, one };
}
const headBytes = () => (R.m.vocab * R.m.hidden * QUANTS[S.quant].bpw) / 8;
const kvLayerBytes = ctxTok => (kvBytesPerToken(R.m, S.kv) / R.m.kvLayers) * ctxTok;
function chosenExperts(tok, layer) {
  const m = R.m; if (!m.moe) return [];
  const r = rngOf(9001 + tok * 131 + layer * 17), set = new Set<number>();
  while (set.size < m.expertsUsed) set.add(Math.floor(r() * m.experts));
  return [...set].sort((a, b) => a - b);
}
// Operations of layer i in a pass that carries `ntok` tokens with `ctxTok` tokens of context: each with the
// bytes it reads, so time can be split in proportion.
function opsOf(i, seg) {
  const { m, sh } = R, li = layerInfo(i), ops = [];
  const decodeTok = seg && (seg.k === 'decode' || seg.k === 'round') ? seg.tok : 0;
  const ctxTok = seg ? (seg.k === 'prefill' ? seg.to : seg.ctx) : R.prompt;
  for (const s of li.mixer) {
    ops.push({ id: s[0], kind: 'mat', shape: s, bytes: bytesOf(s) });
    if (li.kind === 'attn' && s[0] === 'attn_v') ops.push({ id: 'attention', kind: 'kv', bytes: kvLayerBytes(ctxTok), ctxTok });
    if (li.kind === 'delta' && s[0] === 'attn_gate') ops.push({ id: 'state', kind: 'state', bytes: 2 * (sh.deltaState || 0) });
  }
  if (sh.expert) {
    ops.push({ id: 'router', kind: 'mat', shape: sh.router, bytes: bytesOf(sh.router) });
    const chosen = seg && seg.k === 'prefill' ? null : chosenExperts(decodeTok, i);
    if (chosen) { for (const e of chosen) ops.push({ id: `expert ${e}`, kind: 'expert', e, bytes: li.one }); ops.push({ id: 'shared expert', kind: 'expert', e: -1, bytes: li.one }); }
    else ops.push({ id: 'experts', kind: 'expertsAll', bytes: li.one * (expertsTouched(m, seg.to - seg.from) + 1) });
  } else if (sh.mlp) for (const s of sh.mlp) ops.push({ id: s[0], kind: 'mat', shape: s, bytes: bytesOf(s) });
  const tot = ops.reduce((s, o) => s + o.bytes, 0);
  let acc = 0; for (const o of ops) { o.a = acc / tot; acc += o.bytes; o.b = acc / tot; }
  return ops;
}
// Cumulative share of a step taken by each layer (and the output head last), from the bytes each reads.
function layerFractions(seg) {
  if (seg._lf) return seg._lf;
  const { m, mc } = R, L1 = m.layers, w = [];
  if (seg.k === 'prefill') for (let i = 0; i < L1; i++) w.push(1);
  else {
    const ov = mc.layerMs / 1000;
    for (let i = 0; i < L1; i++) { const li = layerInfo(i); w.push((li.read + (li.kind === 'attn' ? kvLayerBytes(seg.ctx) : 0)) / (R.bwEff * 1e9) + ov); }
    w.push(headBytes() / (R.bwEff * 1e9));
  }
  const tot = w.reduce((s, x) => s + x, 0); let acc = 0;
  seg._lf = [0, ...w.map(x => (acc += x) / tot)];
  return seg._lf;
}
