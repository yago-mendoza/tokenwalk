// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Flow: one layer as a circuit, from the token in to the token out =====
// The classic picture of a transformer block, made exact for the model chosen. A thick residual stream runs down the
// left; each part of the layer branches off it, does its work and is added back (⊕): first attention (or Gated
// DeltaNet, in a hybrid layer), then the feed-forward network or the experts. Above the stream comes the embedding,
// below it the output head and the sampler. Every box is named and says what it does; boxes that hold weights carry a
// violet edge, and memory that outlives the pass (the KV cache, the DeltaNet state) is drawn as its own block.
// What runs now is lit in the phase's colour (cyan prefill, yellow decode). Shapes, in the colour of each dimension,
// appear on the boxes of the current step, when zoomed in, or always with the Shapes toggle. The description comes
// from flowSpec (01f-flow.ts): this part lays it out once per shape and then only draws.
const DIMC = { n: '#c8ccd6', c: '#c8ccd6', d: '#5b9cff', H: '#e49279', Hkv: '#f065de', dh: '#d7e266', F: '#4a9050', E: '#4acdc2', k: '#4acdc2', V: '#9e5394', x: '#a0a0ae', one: '#8a8a96' };
const DIMSYM = { n: 'n', c: 'ctx', d: 'd', H: 'H', Hkv: 'Hkv', dh: 'dh', F: 'F', E: 'E', k: 'k', V: 'V', x: '', one: '' };
const SANS = 'system-ui, -apple-system, "Segoe UI", Inter, Roboto, sans-serif';
// Surfaces lighter than the stage, edges that read, text that does not sink into them.
const FC = { card: '#15151d', cardEdge: '#33333f', box: '#272735', boxW: '#2c2843', node: '#222230', edge: '#5e5e78', ink: '#f2f2f6', sub: '#c0c0cd', dim: '#9696a6', wire: '#8a8aa4', stream: '#5590f0', kvw: '#e3bd3d', stw: '#3fd6c0', frame: '#4a4a5c', plate: '#0f0f15', idle: '#3a3650', chosen: '#c6b8ff' };
// Text sizes in world units: one unit is one CSS pixel when the circuit is drawn at its natural size.
const FT = { t: 13.5, s: 12, d: 10.5, card: 15, csub: 12.5, leg: 13 };
const FL = {
  key: '', items: [], byId: {}, cards: [], wires: [], opItems: {}, frame: null, specs: {}, spec: null, hybrid: false, kind: 'attn', layer: 0, seg: null, segIdx: -1, nt: 1, ctx: 1, ctxRes: 1, nOut: 1, preview: false, nar: false,
  world: [0, 0, 1, 1], cam: { x: 0, y: 0, z: 1 }, tgt: { x: 0, y: 0, z: 1 }, follow: true, fitted: false, fitZ: 1, shapes: (() => { try { return localStorage.getItem('llmc.flowShapes') === '1'; } catch (e) { return false; } })(),
  W: 0, H: 0, dpr: 1, dirty: true, lastT: -1, lastKey: '', hov: null, px: -1, py: -1, drag: null, pinch: null, tap: 0, stop: -1, stopT: 0, act: null, actP: 0, actE: -9, uiKey: '', ft: new Float64Array(240), fi: 0, fn: 0, flash: null, lang: '', slowN: 0,
};
const flSide = f => f.reduce((s, x) => s * x[1], 1);
// Weights wear violet, darker for fewer bits per weight (2.6 to 16, on a log scale).
function flPrecCol(bpw) { const t = Math.max(0, Math.min(1, (Math.log2(bpw) - 1.3) / (4 - 1.3))); const a = [38, 31, 66], b = [178, 164, 255]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }
// The violet edge of a box that holds weights: the same code, kept bright enough to see on a box.
function flStripe(bpw) { const t = Math.max(0, Math.min(1, (Math.log2(bpw) - 1.3) / (4 - 1.3))); const a = [104, 84, 200], b = [214, 204, 255]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }

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

// ---- layout: once per shape (model, layer kind, tokens in flight, language, wide or narrow) ----
const FLM = document.createElement('canvas').getContext('2d');
const flMW = (s, size, weight, fam) => { FLM.font = `${weight} ${size}px ${fam}`; return FLM.measureText(s).width; };
function flWrap(s, size, maxW) { FLM.font = `400 ${size}px ${SANS}`; const out = []; let cur = ''; for (const wd of String(s).split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (FLM.measureText(t).width > maxW && cur) { out.push(cur); cur = wd; } else cur = t; } if (cur) out.push(cur); return out; }
// A shape as coloured pieces, each number in its dimension's colour (the context side live, as the cache grows).
const flF = fs => { const o = []; fs.forEach((f, i) => { if (i) o.push(['·', FC.dim]); o.push([num(f[0] === 'c' ? FL.ctx : f[1]), DIMC[f[0]] || FC.sub]); }); return o; };
function flDet(t) {
  if (!t || t.role === 'ids') return null;
  if (t.role === 'weight') return [...flF(t.r), [' → ', FC.dim], ...flF(t.c)];
  const o = [...flF(t.r), [' × ', FC.dim], ...flF(t.c)]; if (t.mult) o.push([` ×${t.mult}`, DIMC[t.multDim] || FC.sub]); return o;
}
const flDetW = d => (d ? flMW(d.map(p => p[0]).join(''), FT.d, 500, FONT) : 0);
const BH = 52, LH = 19;
function flLayout(ps) {
  const m = R.m, kinds = R.kinds, nar = FL.nar, d = m.hidden;
  FL.hybrid = kinds.includes('delta') && kinds.includes('attn'); FL.slowN = flSlowN(); FL.ctxRes = Math.max(ps.ctx, R.ctx); FL.ctx = ps.ctx;
  const specs = { attn: kinds.includes('attn') ? flSpecOf('attn', ps) : null, delta: kinds.includes('delta') ? flSpecOf('delta', ps) : null };
  FL.specs = specs; const kind = kinds[ps.layer] || 'attn', base = specs[kind] || specs.attn || specs.delta; FL.spec = base; FL.kind = kind;
  const T = base.T, dims = base.dims, items = [], byId = {}, opItems = {}, cards = [], wires = [], mems = [];
  const put = it => { it.i = items.length; items.push(it); byId[it.id] = it; for (const k of it.ops || []) (opItems[k] = opItems[k] || []).push(it); return it; };
  // a box: title, a line under it (a tensor's file name, or what the step does), and room for its shape
  const box = (id, title, sub, o: any = {}) => {
    const sp = o.sp || base, t = o.tid ? sp.T[o.tid] : null, wgt = t && t.role === 'weight';
    const w0 = o.lane ? flMW(title, FT.t, 700, SANS) + 8 + flMW(sub, FT.s, 500, FONT) + 20 + (t ? flMW('→ ' + t.c.map(f => num(f[1])).join('·'), FT.d, 500, FONT) + 12 : 0) : Math.max(flMW(title, FT.t, 650, SANS), sub ? flMW(sub, FT.s, 500, FONT) : 0) + 22;
    return put({ id, kind: o.kind || (t ? 't' : 'node'), title, sub, t, sp, tid: o.tid, op: o.op || (o.ops && o.ops[0]) || null, ops: o.ops || [], w: Math.max(o.minW || 0, w0 + (wgt ? 6 : 0)), h: o.h || (o.lane ? LH : BH), x: 0, y: 0, card: '', res: o.res || '', lane: !!o.lane, bar: o.bar || 0, inner: false, noDet: !!o.noDet, round: !!o.round });
  };
  const one = it => ({ its: [it], w: it.w, h: it.h, lay(x, y) { it.x = x; it.y = y; }, setW(w) { it.w = w; this.w = w; } });
  const lanes = (its, gap = 3) => { const w = Math.max(...its.map(i => i.w)); its.forEach(i => (i.w = w)); return { its, w, h: its.reduce((s, i) => s + i.h, 0) + gap * (its.length - 1), lay(x, y) { let yy = y; for (const i of its) { i.x = x; i.y = yy; yy += i.h + gap; } }, setW(w) { its.forEach(i => (i.w = w)); this.w = w; } }; };
  const nest = (cont, subs) => { const gap = 5; subs.forEach(s => { s.inner = true; if (s.round) { s.w = s.h = 18; } else s.h = 38; }); const inW = subs.reduce((s, i) => s + i.w, 0) + gap * (subs.length - 1); cont.w = Math.max(cont.w, inW + 18); cont.h = 26 + 38 + 7;
    return { its: [cont, ...subs], w: cont.w, h: cont.h, lay(x, y) { cont.x = x; cont.y = y; let xx = x + (cont.w - inW) / 2; for (const s of subs) { s.x = xx; s.y = s.round ? y + 26 + 10 : y + 26; xx += s.w + gap; } }, setW(w) { cont.w = Math.max(w, cont.w); this.w = cont.w; } }; };
  const lk = (pts, k = 'n', to = null, arrow = true) => wires.push({ pts, k, to, arrow });
  const SX = nar ? 12 : 40, WW = 364, GAP = nar ? 22 : 16; let Y = 0;
  // ---- the input: the token ids pick rows of the embedding table, and the residual stream begins ----
  const emb = box('embed', L('Embedding', 'Embedding'), 'token_embd', { tid: 'W_emb', ops: ['embed'], minW: nar ? 200 : 150, h: 48 }); emb.x = 0; emb.y = 0; Y = emb.h;
  FL.streamCap = { x: nar ? SX + 12 : emb.w + 16, y: nar ? Y + 17 : 25, s: L(`residual stream · ${num(d)} numbers per token`, `flujo residual · ${num(d)} números por token`), s2: '' };
  // ---- the layer: a frame around two sections, each a branch off the stream that is added back ----
  const frame = { x: 2, y: Y + (nar ? 34 : 13), w: 0, h: 0 }; Y = frame.y + (nar ? 46 : 16);
  const cardX = nar ? SX + 14 : SX + 22;
  const section = (cid, title, sub, comps, mem, chip, addId, addOps) => {
    const card = { id: cid, x: cardX, y: Y, w: 0, h: 0, title, sub, lines: [], chip: null, hd: 0 };
    let colW = 0;
    if (nar) { card.w = WW - cardX - 2; colW = card.w - 20 - (mem ? 118 : 0); for (const c of comps) c.setW(Math.min(Math.max(c.w, colW), colW)); }
    else card.w = comps.reduce((s, c) => s + c.w, 0) + GAP * (comps.length - 1) + 28 + 14;
    if (chip) { card.chip = put({ id: 'chip', kind: 'chip', title: chip, x: 0, y: 0, w: flMW(chip, 11.5, 600, SANS) + 16, h: 20, ops: [] }); if (!nar) card.w = Math.max(card.w, flMW(title, FT.card, 700, SANS) + card.chip.w + 50); }
    const tw = flMW(title, FT.card, 700, SANS), inl = !nar && tw + 14 + flMW(sub, FT.csub, 400, SANS) + (chip ? card.chip.w + 16 : 0) + 26 <= card.w;
    card.inline = inl ? tw + 14 : 0; card.lines = inl ? [sub] : flWrap(sub, FT.csub, card.w - 28);
    card.hd = inl ? 30 : 30 + card.lines.length * 16 + (chip && nar ? 26 : 0);
    if (chip) { const c = card.chip; if (nar) { c.x = card.x + 12; c.y = Y + 30 + card.lines.length * 16 + 2; } else { c.x = card.x + card.w - c.w - 10; c.y = Y + 8; } }
    let top = Y + card.hd + 6, yRet;
    if (!nar) {
      const memH = 36; if (mem) top += memH + 18;
      const rowH = Math.max(...comps.map(c => c.h)), yc = top + rowH / 2; let x = card.x + 14;
      for (const c of comps) { c.lay(x, yc - c.h / 2); c.x = x; c.y = yc - c.h / 2; x += c.w + GAP; }
      const outY = c => (c.outIt ? c.outIt.y + c.outIt.h / 2 : yc);
      lk([[SX, yc], [comps[0].x, yc]], 'n', comps[0].its[0].id);
      for (let i = 1; i < comps.length; i++) { const a = comps[i - 1], b = comps[i], ay = outY(a), ax = a.x + a.w, bx = b.x; lk(Math.abs(ay - yc) < .5 ? [[ax, yc], [bx, yc]] : [[ax, ay], [ax + 8, ay], [ax + 8, yc], [bx, yc]], 'n', b.its[0].id); }
      const L2 = comps[comps.length - 1]; yRet = top + rowH + 13;
      lk([[L2.x + L2.w, yc], [L2.x + L2.w + 10, yc], [L2.x + L2.w + 10, yRet], [SX + 10, yRet]], 'n', addId);
      if (mem) { const a = mem.from, b = mem.to; mem.x = a.x - 4; mem.w = b.x + b.w + 4 - mem.x; mem.y = top - memH - 18; mem.h = memH;
        for (const [it, off, lane] of mem.writes) lk([[it.x + it.w, it.y + it.h / 2], [it.x + it.w + off, it.y + it.h / 2], [it.x + it.w + off, mem.y + mem.h]], mem.k, lane);
        for (const [it, fx, lane] of mem.reads) lk([[it.x + it.w * fx, mem.y + mem.h], [it.x + it.w * fx, it.y]], mem.k, it.id); }
      card.h = yRet + 10 - Y;
    } else {
      const x0 = card.x + 10; let y = top + 4;
      for (const c of comps) { c.lay(x0, y); c.x = x0; c.y = y; y += c.h + 22; }
      const f0 = comps[0], fy = f0.y + f0.h / 2; lk([[SX, fy], [f0.x, fy]], 'n', f0.its[0].id);
      for (let i = 1; i < comps.length; i++) { const a = comps[i - 1], b = comps[i], cx = x0 + colW / 2; lk([[cx, a.y + a.h], [cx, b.y]], 'n', b.its[0].id); }
      const L2 = comps[comps.length - 1]; yRet = L2.y + L2.h + 16;
      lk([[x0 + colW / 2, L2.y + L2.h], [x0 + colW / 2, yRet], [SX + 10, yRet]], 'n', addId);
      if (mem) { const a = mem.from, b = mem.to; mem.x = x0 + colW + 16; mem.w = card.x + card.w - 10 - mem.x; mem.y = a.y; mem.h = b.y + b.h - a.y;
        for (const [it, , lane] of mem.writes) lk([[it.x + it.w, it.y + it.h / 2], [mem.x, it.y + it.h / 2]], mem.k, lane);
        for (const [it, fy2, lane] of mem.reads) lk([[mem.x, it.y + it.h * fy2], [it.x + it.w, it.y + it.h * fy2]], mem.k, it.id); }
      card.h = yRet + 12 - Y;
    }
    if (mem) {
      if (!nar) { const pw = Math.max(flMW(mem.kind === 'kv' ? L('KV cache, this layer', 'Caché KV, esta capa') : L('DeltaNet state', 'Estado DeltaNet'), 12.5, 700, SANS), flMW(mem.kind === 'kv' ? L(`${num(FL.ctxRes)} of ${num(FL.ctxRes)} tokens · 999 MB`, `${num(FL.ctxRes)} de ${num(FL.ctxRes)} tokens · 999 MB`) : L('32 heads of 128 × 128 · 2.0 MB, fixed', '32 cabezas de 128 × 128 · 2,0 MB, fijo'), 11, 400, SANS)) + 20;
        mem.x = Math.min(mem.x, mem.x + mem.w - pw - 90); mem.w = Math.max(mem.w, pw + 90);
        const lx = mem.x + pw, lw = mem.w - pw - 6, n2 = mem.lanes.length, lh = (mem.h - 8 - 3 * (n2 - 1)) / n2; mem.lanes.forEach((l, i) => { l.x = lx; l.w = lw; l.y = mem.y + 4 + i * (lh + 3); l.h = lh; }); }
      else { const ay = mem.y + 54, ah = Math.max(20, mem.h - 58), n2 = mem.lanes.length, lw = (mem.w - 8 - 4 * (n2 - 1)) / n2; mem.lanes.forEach((l, i) => { l.x = mem.x + 4 + i * (lw + 4); l.w = lw; l.y = ay; l.h = ah; }); }
    }
    put({ id: addId, kind: 'node', round: true, title: '+', sub: '', sp: base, op: addOps[0], ops: addOps, x: SX - 10, y: yRet - 10, w: 20, h: 20, card: cid });
    for (const c of comps) for (const it of c.its) it.card = cid;
    if (mem) { mem.card = cid; mems.push(mem); for (const it of mem.lanes) it.card = cid; }
    cards.push(card); Y += card.h + (nar ? 16 : 11);
    return card;
  };
  // the mixer: attention, or Gated DeltaNet
  const hybChip = FL.hybrid ? (kind === 'attn' ? L(`${m.kvLayers} of ${m.layers} layers · see DeltaNet ›`, `${m.kvLayers} de ${m.layers} capas · ver DeltaNet ›`) : L(`${m.layers - m.kvLayers} of ${m.layers} layers · see attention ›`, `${m.layers - m.kvLayers} de ${m.layers} capas · ver atención ›`)) : null;
  const norm = (id, ops) => box(id, L('Norm', 'Norma'), 'RMSNorm', { ops, minW: 64 });
  if (kind === 'attn') {
    const sp = specs.attn, A = sp.T, qw = flSide(A.Wq.c), kw = flSide(A.Wk.c);
    const n1 = norm('norm1', ['A:norm1']);
    const lk_ = box('k', 'K', A.Wk.name, { sp, tid: 'Wk', ops: ['A:k'], lane: true, bar: kw / qw }), lv = box('v', 'V', A.Wv.name, { sp, tid: 'Wv', ops: ['A:v'], lane: true, bar: flSide(A.Wv.c) / qw }), lq = box('q', 'Q', A.Wq.name, { sp, tid: 'Wq', ops: ['A:q'], lane: true, bar: 1 });
    const qkv = lanes([lk_, lv, lq]); qkv.outIt = lq;
    const sc = box('scores', L('Scores', 'Puntuaciones'), 'Q · Kᵀ', { sp, tid: 's', ops: ['A:split', 'A:scores'], minW: flMW(`${num(ps.nt)} × ${num(FL.ctxRes)} ×${dims.H}`, FT.d, 500, FONT) + 26 });
    const sm = box('softmax', 'Softmax', L('→ weights', '→ pesos'), { sp, ops: ['A:softmax'], minW: 80 });
    const mx = box('mix', L('Weighted sum', 'Suma ponderada'), L('weights · V', 'pesos · V'), { sp, tid: 'oh', ops: ['A:mix', 'A:concat'], minW: flMW(`${num(ps.nt)} × ${num(dims.dh)} ×${dims.H}`, FT.d, 500, FONT) + 26 });
    const ao = box('o', L('Output', 'Salida'), A.Wo.name, { sp, tid: 'Wo', ops: ['A:o'] });
    const kK = box('kvK', L('K cache', 'caché K'), '', { sp, tid: 'KT', ops: ['A:append', 'A:scores'], res: 'c', kind: 't', noDet: true }), kV = box('kvV', L('V cache', 'caché V'), '', { sp, tid: 'Vh', ops: ['A:append', 'A:mix'], res: 'r', kind: 't', noDet: true });
    kK.mem = kV.mem = true;
    const comps = [one(n1), qkv, one(sc), one(sm), one(mx), one(ao)];
    const mem = { k: 'kv', kind: 'kv', from: qkv, to: comps[4], lanes: [kK, kV], writes: [[lk_, 7, 'kvK'], [lv, 14, 'kvV']], reads: [[sc, .5, 'kvK'], [mx, .5, 'kvV']] };
    if (nar) { mem.writes = [[lk_, 0, 'kvK'], [lv, 0, 'kvV']]; mem.reads = [[sc, .5, 'kvK'], [mx, .5, 'kvV']]; }
    const pre = ps.nt > 1;
    section('cA', L('Attention', 'Atención'), pre ? L(`Each of these ${num(ps.nt)} tokens compares itself with the tokens before it, then takes a weighted mix of what they hold.`, `Cada uno de estos ${num(ps.nt)} tokens se compara con los anteriores y toma una mezcla ponderada de lo que guardan.`) : L('The new token compares itself with every earlier token, then takes a weighted mix of what they hold.', 'El token nuevo se compara con cada token anterior y toma una mezcla ponderada de lo que guardan.'), comps, mem, hybChip, 'add1', ['A:add1', 'D:add1']);
  } else {
    const sp = specs.delta, D = sp.T;
    const n1 = norm('norm1', ['D:norm1']);
    const q = box('dqkv', 'q k v', D.Wqkv.name, { sp, tid: 'Wqkv', ops: ['D:qkv'], lane: true }), g = box('dg', L('gate', 'puerta'), D.Wg.name, { sp, tid: 'Wg', ops: ['D:gate'], lane: true });
    const duo = lanes([q, g]); duo.outIt = q;
    const st = box('dstate', L('State', 'Estado'), L('update, then read', 'actualiza y lee'), { sp, tid: 'dy', ops: ['D:dsplit', 'D:state', 'D:dconcat'] });
    const gm = box('dmul', L('Gate', 'Puerta'), L('readout × gate', 'lectura × puerta'), { sp, ops: ['D:dgate'] });
    const dout = box('dout', L('Output', 'Salida'), D.Wso.name, { sp, tid: 'Wso', ops: ['D:out'] });
    const S0 = box('S', L('state', 'estado'), '', { sp, tid: 'S', ops: ['D:state'], kind: 't', noDet: true }); S0.mem = true;
    const comps = [one(n1), duo, one(st), one(gm), one(dout)];
    const mem = { k: 'st', kind: 'state', from: duo, to: comps[2], lanes: [S0], writes: [[st, 0, 'S']], reads: [[st, .72, 'S']] };
    if (!nar) mem.writes = []; // wide: one wire each way, both on the state box
    section('cA', 'Gated DeltaNet', L('The past is folded into a fixed-size state: this token updates it, then reads it. No cache grows here.', 'El pasado se pliega en un estado de tamaño fijo: este token lo actualiza y luego lo lee. Aquí no crece ninguna caché.'), comps, mem, hybChip, 'add1', ['A:add1', 'D:add1']);
    if (!nar) { const mm = mems[mems.length - 1]; lk([[st.x + st.w * .3, st.y], [st.x + st.w * .3, mm.y + mm.h]], 'st', 'S'); }
  }
  // the feed-forward network, or the experts
  const n2 = norm('norm2', ['norm2']);
  if (T.Wr) {
    const E = m.experts, k = m.expertsUsed, sh = m.sharedExperts || 0, pre = ps.nt > 1;
    const rt = box('router', 'Router', T.Wr.name, { tid: 'Wr', ops: ['route', 'topk'] });
    const cols = Math.min(E, E > 64 ? 32 : 16), rows = Math.ceil(E / cols);
    const gsub = pre ? L(`${num(Math.round(expertsTouched(m, ps.nt)))} touched by these tokens`, `${num(Math.round(expertsTouched(m, ps.nt)))} tocados por estos tokens`) : L(`${k} chosen${sh ? ` + ${sh} shared` : ''}`, `${k} elegidos${sh ? ` + ${sh} compartido` : ''}`);
    const gw = Math.max(flMW(L(`${E} experts`, `${E} expertos`), FT.t, 650, SANS), flMW(gsub, FT.s, 500, SANS), 136 + (sh ? 20 : 0)) + 22;
    const grid = put({ id: 'grid', kind: 'grid', title: L(`${E} experts`, `${E} expertos`), sub: gsub, ops: ['topk'], op: 'topk', cols, rows, x: 0, y: 0, w: gw, h: 38 + rows * Math.min(10, 136 / cols) + 7, card: '' });
    const gC = { its: [grid], w: grid.w, h: grid.h, lay(x, y) { grid.x = x; grid.y = y; }, setW(w) { grid.w = w; this.w = w; grid.h = 38 + rows * Math.min(12, (w - 22 - (sh ? 30 : 0)) / cols) + 7; this.h = grid.h; } };
    const ex = box('exp', L('One expert, opened', 'Un experto, abierto'), '', { ops: [], kind: 'ebox', noDet: true, minW: flMW(L('The shared expert, opened', 'El experto compartido, abierto'), FT.t, 650, SANS) + 22 });
    const sub = (id, nm, tid, op) => box(id, nm, '', { tid, ops: [op], minW: 46, noDet: true });
    const subs = [...(T.Weg ? [sub('eg', 'gate', 'Weg', 'egate')] : []), sub('eu', 'up', 'Weu', 'eup'), box('eact', '⊙', '', { ops: ['eact'], kind: 'node', round: true, noDet: true }), sub('ed', 'down', 'Wed', 'edown')];
    const exC = nest(ex, subs);
    const es = box('esum', L('Weighted sum', 'Suma ponderada'), sh ? L(`${k} + shared`, `${k} + compartido`) : L(`of ${k} experts`, `de ${k} expertos`), { ops: ['esum'] });
    const comps = [one(n2), one(rt), gC, exC, one(es)];
    section('cF', L('Experts', 'Expertos'), L(`A router picks ${k} of ${E} small feed-forward networks for each token${sh ? `, plus ${sh} that every token uses` : ''}.`, `Un router elige ${k} de ${E} redes feed-forward pequeñas para cada token${sh ? `, más ${sh} que usan todos` : ''}.`), comps, null, null, 'add2', ['add2']);
  } else {
    const comps = [one(n2)];
    if (T.Wg2) { const g = box('fg', L('gate', 'puerta'), T.Wg2.name, { tid: 'Wg2', ops: ['fgate'], lane: true }), u = box('fu', 'up', T.Wu.name, { tid: 'Wu', ops: ['fup'], lane: true }); const du = lanes([g, u]); du.outIt = u; comps.push(du); comps.push(one(box('fact', 'SiLU ⊙', L('gate × up', 'puerta × up'), { ops: ['fact'], minW: 80 }))); }
    else { comps.push(one(box('fu', 'Up', T.Wu.name, { tid: 'Wu', ops: ['fup'] }))); comps.push(one(box('fact', 'GELU', L('bends each number', 'dobla cada número'), { ops: ['fact'] }))); }
    comps.push(one(box('fd', 'Down', T.Wd.name, { tid: 'Wd', ops: ['fdown'] })));
    section('cF', L('Feed-forward', 'Feed-forward'), L(`Widens each token to ${num(dims.F)} numbers, bends them, and brings them back to ${num(d)}.`, `Ensancha cada token a ${num(dims.F)} números, los dobla y los devuelve a ${num(d)}.`), comps, null, null, 'add2', ['add2']);
  }
  // the frame of the layer, and the pile of layers beside it
  const cR = Math.max(...cards.map(c => c.x + c.w));
  frame.w = cR + 10 - frame.x; frame.h = Y - frame.y + (nar ? -4 : -2);
  const strip = put({ id: 'pillar', kind: 'pillar', x: nar ? frame.x + 12 : frame.x + 8, y: nar ? frame.y + 18 : frame.y + 30, w: nar ? frame.w - 24 : 12, h: nar ? 14 : frame.h - 40, ops: [], card: '' });
  void strip;
  // ---- the output: the last layer's stream becomes a score for every token, and one is drawn ----
  Y = frame.y + frame.h + (nar ? 22 : 12);
  const nf = box('normf', L('Final norm', 'Norma final'), 'RMSNorm', { ops: ['normf'], h: nar ? BH : 50 });
  const hd = box('head', L('Output head', 'Cabeza de salida'), flTied() ? 'token_embd' : 'output', { tid: 'Wout', ops: ['head'], h: nar ? BH : 50 });
  const sa = box('sample', L('Sampling', 'Muestreo'), L('draws one token', 'sortea un token'), { ops: ['sample'], h: nar ? BH : 50 });
  const tk = box('tok', L('Next token', 'Siguiente token'), '', { tid: 'tok', ops: ['sample'], noDet: true, h: nar ? BH : 50, minW: flMW(L('tokens 1,000–1,004', 'token 1.000 de la respuesta'), FT.s, 500, FONT) + 24 });
  const outs = [nf, hd, sa, tk];
  let yo;
  if (!nar) { const h = 50; yo = Y + h / 2; let x = SX + 22; for (const it of outs) { it.x = x; it.y = yo - it.h / 2; x += it.w + GAP; } for (let i = 1; i < outs.length; i++) lk([[outs[i - 1].x + outs[i - 1].w, yo], [outs[i].x, yo]], 'n', outs[i].id); }
  else { let y = Y; const x0 = SX + 14, cw = WW - x0 - 2; for (const it of outs) { it.x = x0; it.w = cw; it.y = y; y += it.h + 20; } yo = nf.y + nf.h / 2; for (let i = 1; i < outs.length; i++) lk([[x0 + cw / 2, outs[i - 1].y + outs[i - 1].h], [x0 + cw / 2, outs[i].y]], 'n', outs[i].id); }
  for (const it of outs) it.card = 'out';
  // the stream itself, under everything: from the embedding, down through the layer, into the final norm
  FL.stream = [[SX, emb.y + emb.h], [SX, yo], [nf.x, yo]];
  put({ id: 'stream', kind: 't', stream: true, t: T.x, sp: base, tid: 'x', ops: [], x: SX - 6, y: emb.y + emb.h, w: 12, h: yo - emb.y - emb.h, card: '' });
  items.unshift(items.pop()); items.forEach((it, i) => (it.i = i));
  FL.items = items; FL.byId = byId; FL.opItems = opItems; FL.cards = cards; FL.wires = wires; FL.mems = mems; FL.frame = frame; FL.SX = SX;
  let x1 = 0, y1 = 0; for (const it of items) { x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); } for (const c of cards) x1 = Math.max(x1, c.x + c.w);
  x1 = Math.max(x1, FL.streamCap.x + flMW(FL.streamCap.s, FT.csub, 400, SANS));
  FL.world = [-4, -6, x1 + 6, y1 + 8];
  FL.nt = ps.nt; FL.nOut = ps.nOut;
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

// ---- which step the playhead is on, in Flow's terms ----
// The cost model times the matrices, the attention read, the state and the experts; Flow splits each into the
// steps it draws (scores, softmax, weighted sum...) in equal parts. Norms and residual adds cost nothing there.
const flKeyOfOp = o => (o.section === 'attn' ? 'A:' : o.section === 'delta' ? 'D:' : '') + o.id;
function flActive(n, ps) {
  FL.act = null; FL.actP = 0; FL.actE = -9;
  if (ps.preview || !n.seg || n.seg !== ps.seg) return;
  if (n.head) { const lf = layerFractions(n.seg)[R.m.layers], p = Math.min(.9999, Math.max(0, (n.f - lf) / Math.max(1e-9, 1 - lf))); FL.act = p < .06 ? 'normf' : p < .94 ? 'head' : 'sample'; FL.actP = p < .06 ? p / .06 : p < .94 ? (p - .06) / .88 : (p - .94) / .06; return; }
  if (!n.op || n.layer !== ps.layer) return;
  const sp = FL.specs[R.kinds[n.layer]] || FL.spec;
  const k = n.op.kind === 'expert' || n.op.kind === 'expertsAll' ? 'expert' : n.op.id, gr = flCostGroups(n.layer, n.seg)[k]; if (!gr) return;
  const list = flSpecOps(k === 'expert' ? FL.spec : sp, k); if (!list.length) return;
  const p = Math.max(0, Math.min(.9999, (n.lp - gr[0]) / Math.max(1e-12, gr[1] - gr[0]))), j = Math.floor(p * list.length), o = list[j];
  FL.act = flKeyOfOp(o); FL.actP = p * list.length - j; if (n.op.kind === 'expert') FL.actE = n.op.e;
}
const flOpItems = key => (key && FL.opItems[key]) || [];
const flOpOfItem = it => (it ? it.op || null : null);

// ---- camera ----
function flFrameRect(ids) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const id of ids) { const it = FL.byId[id]; if (!it) continue; x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); } return x1 > x0 ? [x0, y0, x1, y1] : null; }
function flPads() { const card = $('flCard'), note = $('flNote'); return [FL.cam.z >= 1.5 || FL.nar ? 40 : 8, (card && card.offsetHeight ? card.offsetHeight : 80) + (note && note.offsetHeight ? note.offsetHeight + 6 : 0) + 18]; }
function flZFor(r, maxZ) { const [padT, padB] = flPads(), aw = Math.max(80, FL.W - 24), ah = Math.max(60, FL.H - padT - padB); return Math.max(.3, Math.min(maxZ, aw / (r[2] - r[0] + 8), ah / (r[3] - r[1] + 8))); }
function flAim(r, maxZ = 1.25) {
  const [padT, padB] = flPads(), z = flZFor(r, maxZ);
  FL.tgt.x = (r[0] + r[2]) / 2; FL.tgt.z = z; FL.tgt.y = (r[1] + r[3]) / 2 + (padB - padT) / 2 / z;
}
function flFit() { flAim(FL.world, 1.25); FL.fitZ = FL.tgt.z; }
// Where the camera goes for a step. When the whole layer is legible at once (a desktop), it stays on the whole
// layer and the step is lit in place; when it is not (a phone), it frames the section at full width, centred on the step.
function flAimFocus(ids, deep = false) {
  const r = flFrameRect(ids || []); if (!r) { flFit(); return; }
  if (deep) { flAim([r[0] - 30, r[1] - 40, r[2] + 30, r[3] + 40], 2.4); return; }
  if (FL.fitZ >= .8 || !FL.nar && FL.fitZ >= .7) { flFit(); return; }
  const it = FL.byId[ids[0]], cd = it && FL.cards.find(c => c.id === it.card);
  const x0 = cd ? cd.x - 6 : FL.world[0], x1 = cd ? cd.x + cd.w + 6 : FL.world[2], cy = (r[1] + r[3]) / 2;
  flAim([x0, cy - 20, x1, cy + 20], 1.3);
}
function flStep(dt) {
  const c = FL.cam, t = FL.tgt, red = xReduced(), k = red ? 1 : 1 - Math.exp(-dt * 6);
  const lz = Math.log(c.z), lt = Math.log(t.z);
  if (Math.abs(c.x - t.x) * c.z < .3 && Math.abs(c.y - t.y) * c.z < .3 && Math.abs(lz - lt) < .002) { if (c.x !== t.x || c.y !== t.y || c.z !== t.z) FL.dirty = true; c.x = t.x; c.y = t.y; c.z = t.z; return; }
  c.z = Math.exp(lz + (lt - lz) * k); c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; FL.dirty = true;
}
const flSX = wx => (wx - FL.cam.x) * FL.cam.z + FL.W / 2, flSY = wy => (wy - FL.cam.y) * FL.cam.z + FL.H / 2;
const flWX = sx => (sx - FL.W / 2) / FL.cam.z + FL.cam.x, flWY = sy => (sy - FL.H / 2) / FL.cam.z + FL.cam.y;

// ---- drawing ----
const flRR = (x, X, Y, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); else x.rect(X, Y, w, h); };
// Text at a size in world units; skipped when it would be too small to read.
function flTx(x, s, X, Y, size, weight, fam, col, align = 'left') { const px = size * FL.cam.z; if (px < 5.5 || !s) return 0; x.font = `${weight} ${px}px ${fam}`; x.fillStyle = col; x.textAlign = align; x.fillText(s, X, Y); const w = x.measureText(s).width; x.textAlign = 'left'; return w; }
function flSegs(x, segs, X, Y, size, align = 'left', maxW = 1e9) { let px = size * FL.cam.z; if (px < 5.5 || !segs) return; x.font = `500 ${px}px ${FONT}`; let w = 0; for (const s of segs) w += x.measureText(s[0]).width; if (w > maxW) { px *= maxW / w; if (px < 7.5) return; x.font = `500 ${px}px ${FONT}`; w = maxW; } let cx = X; if (align === 'right') cx = X - w; for (const s of segs) { x.fillStyle = s[1]; x.fillText(s[0], cx, Y); cx += x.measureText(s[0]).width; } }
function flAccRGB() { return FL.seg && FL.seg.k === 'prefill' ? '127,227,255' : '255,212,59'; }
function flDraw(n, dt) {
  const c = $('cFlow'), r = $('stage').getBoundingClientRect(), W = Math.max(220, Math.floor(r.width)), H = Math.max(200, Math.floor(r.height)), dpr = Math.min(3, window.devicePixelRatio || 1);
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; FL.dirty = true; }
  FL.W = W; FL.H = H; FL.dpr = dpr;
  const ps = flPass(n); flPassNow = ps; if (!ps) return;
  const nar = W < 560, ch = $('flCard').offsetHeight; if (ch !== FL.cardH) { FL.cardH = ch; FL.lastKey = ''; }
  const key = `${S.model}|${S.quant}|${S.kv}|${ps.nt}|${R.ctx}|${ps.nOut}|${R.mc.kind}|${R.pl.fastShare.toFixed(3)}|${R.kinds[ps.layer]}|${lang}|${nar}`;
  if (key !== FL.key || R !== FL.R) { const narCh = FL.nar !== nar; FL.nar = nar; FL.key = key; FL.R = R; flLayout(ps); FL.dirty = true; FL.lastKey = ''; FOCUS_AB.key = ''; if (!FL.fitted || narCh) { flFit(); FL.cam.x = FL.tgt.x; FL.cam.y = FL.tgt.y; FL.cam.z = FL.tgt.z; FL.fitted = true; } }
  if (ps.ctx !== FL.ctx) { FL.ctx = ps.ctx; FL.dirty = true; }
  FL.layer = ps.layer; FL.seg = ps.seg; FL.segIdx = ps.segIdx; FL.kind = R.kinds[ps.layer]; FL.preview = ps.preview;
  flActive(n, ps);
  const onStop = FL.stop >= 0 && FL.stopT === P.t, st = onStop ? flWalk(ps)[FL.stop] : null;
  const curIds = st ? st.frame : FL.act ? flOpItems(FL.act).map(q => q.id) : [];
  // follow: on a desktop the whole layer stays in view; on a phone the camera frames the section of the step
  if (FL.follow && !FL.drag && !FL.pinch) {
    let fk = 'fit', ids = null;
    if (FL.fitZ < .8 && !curIds.length) { fk = 'top'; ids = [FL.kind === 'attn' ? 'q' : 'dqkv']; }
    else if (FL.fitZ < .8 && curIds.length) {
      if (P.on && FL.act) { const sp2 = speedNow(n), ls = layerSpan(ps.seg, Math.min(ps.layer, R.m.layers - 1)), lr = (ls[1] - ls[0]) / sp2, or2 = n.op ? (n.op.b - n.op.a) * (ls[1] - ls[0]) / sp2 : 0; fk = or2 > .7 ? 'op:' + curIds[0] : lr > .7 ? 'card:' + (FL.byId[curIds[0]] || {}).card : 'fit'; ids = fk.startsWith('card:') ? FL.items.filter(q => q.card === fk.slice(5)).map(q => q.id).slice(0, 3) : curIds; }
      else { fk = 'op:' + curIds.join(','); ids = curIds; }
    }
    if (fk !== FL.lastKey) { FL.lastKey = fk; if (fk === 'fit') flFit(); else flAimFocus(ids); }
  }
  flStep(dt);
  if (UI.flash && UI.flash.canvas === 'cFlow' && FL.flashSeen !== UI.flash) { FL.flashSeen = UI.flash; const f = UI.flash; if (typeof f.match === 'function') { const ids = FL.items.filter(it => f.match(flSelOf(it) || {})).map(it => it.id); if (ids.length && FL.fitZ < .8) { FL.follow = false; FL.lastKey = 'flash'; flAimFocus(ids); } } }
  if (P.on || (UI.flash && UI.flash.canvas === 'cFlow') || (UI.brush && UI.brush.canvas === 'cFlow') || curIds.length) FL.dirty = true;
  if (P.t !== FL.lastT) { FL.lastT = P.t; FL.dirty = true; }
  flUi(ps);
  if (!FL.dirty) return;
  FL.dirty = false; const t0 = performance.now();
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H); x.textBaseline = 'alphabetic'; x.textAlign = 'left'; x.lineJoin = 'round'; x.lineCap = 'round';
  const z = FL.cam.z, m = R.m, acc = flAccRGB(), cur = new Set(curIds), selId = UI.sel && UI.sel.k === 'flow' ? UI.sel.id : null, hovId = FL.hov ? FL.hov.id : null;
  const hovOp = FL.hov ? flOpOfItem(FL.hov) : null, selOp = selId ? flOpOfItem(FL.byId[selId]) : null;
  const focus = new Set((hovOp ? flOpItems(hovOp) : selOp ? flOpItems(selOp) : []).map(q => q.id).concat(curIds)); if (hovId) focus.add(hovId); if (selId) focus.add(selId);
  const detAll = FL.shapes || z >= 1.5, dimOut = FL.nOut === 0;
  const tAnim = performance.now();
  // the layer's frame, its title on the border, and the pile of layers
  { const f = FL.frame, X = flSX(f.x), Y = flSY(f.y), w = f.w * z, h = f.h * z, dv = flDev(FL.layer);
    flRR(x, X, Y, w, h, 9 * z); x.strokeStyle = FC.frame; x.lineWidth = 1.2; x.stroke();
    const kw = FL.kind === 'attn' ? L('attention', 'atención') : 'DeltaNet', where = dv === 'ram' ? L('weights in system RAM', 'pesos en RAM del sistema') : dv === 'vram' ? L('weights in VRAM', 'pesos en VRAM') : L('weights in shared memory', 'pesos en memoria compartida');
    const s1 = L(`Layer ${FL.layer + 1} of ${m.layers}`, `Capa ${FL.layer + 1} de ${m.layers}`), s2 = FL.hybrid ? ` · ${kw}` : '', s3 = ` · ${where}`;
    x.font = `700 ${FT.leg * z}px ${SANS}`; const w1 = x.measureText(s1).width; x.font = `600 ${FT.leg * z}px ${SANS}`; const w2 = x.measureText(s2).width; x.font = `400 ${12 * z}px ${SANS}`; const w3 = FL.nar ? 0 : x.measureText(s3).width;
    const lx = X + (FL.nar ? 14 : 58) * z, ly = Y + 4.5 * z; x.fillStyle = '#0c0c11'; x.fillRect(lx - 6 * z, Y - 9 * z, w1 + w2 + w3 + 12 * z, 18 * z);
    flTx(x, s1, lx, ly, FT.leg, 700, SANS, FC.ink); flTx(x, s2, lx + w1, ly, FT.leg, 600, SANS, FL.kind === 'attn' ? '#e7c22f' : C.teal); if (!FL.nar) flTx(x, s3, lx + w1 + w2, ly, 12, 400, SANS, dv === 'ram' ? HW.ram : dv === 'vram' ? HW.vram : FC.dim);
    flDrawStrip(x, FL.byId.pillar, z, acc); }
  // the stream's caption, beside the embedding
  { const cp = FL.streamCap; flTx(x, cp.s, flSX(cp.x), flSY(cp.y), FT.csub, 600, SANS, '#8fb4f5'); if (cp.s2) flTx(x, cp.s2, flSX(cp.x), flSY(cp.y + 16), FT.csub, 400, SANS, FC.dim); }
  // the sections: a card each, with a title that says what the part is and a line that says what it does
  for (const cd of FL.cards) {
    const X = flSX(cd.x), Y = flSY(cd.y), w = cd.w * z, h = cd.h * z, on = curIds.some(id => FL.byId[id] && FL.byId[id].card === cd.id);
    flRR(x, X, Y, w, h, 8 * z); x.fillStyle = FC.card; x.fill(); x.strokeStyle = on ? `rgba(${acc},.55)` : FC.cardEdge; x.lineWidth = on ? 1.5 : 1; x.stroke();
    flTx(x, cd.title, X + 13 * z, Y + 21 * z, FT.card, 700, SANS, on ? `rgb(${acc})` : FC.ink);
    if (cd.inline) flTx(x, cd.lines[0], X + (13 + cd.inline) * z, Y + 21 * z, FT.csub, 400, SANS, FC.sub); else cd.lines.forEach((ln, i) => flTx(x, ln, X + 13 * z, Y + (39 + i * 16) * z, FT.csub, 400, SANS, FC.sub));
  }
  // memory that outlives the pass: the KV cache of this layer, or its DeltaNet state
  for (const mm of FL.mems) flDrawMem(x, mm, z, acc, cur);
  // the wires: the residual stream first and thickest, then the branches, then the cache's reads and writes
  { const sp = FL.stream; x.strokeStyle = FC.stream; x.lineWidth = Math.max(4, 8 * z); x.beginPath(); sp.forEach((p, i) => (i ? x.lineTo(flSX(p[0]), flSY(p[1])) : x.moveTo(flSX(p[0]), flSY(p[1])))); x.stroke();
    x.strokeStyle = 'rgba(200,220,255,.35)'; x.lineWidth = Math.max(1, 1.6 * z); x.stroke();
    const a = sp[sp.length - 2], b = sp[sp.length - 1]; flArrow(x, flSX(a[0]), flSY(a[1]), flSX(b[0]), flSY(b[1]), FC.stream, Math.max(7, 10 * z)); }
  for (const wr of FL.wires) {
    const on = wr.to && cur.has(wr.to), col = on ? `rgb(${acc})` : wr.k === 'kv' ? FC.kvw : wr.k === 'st' ? FC.stw : FC.wire;
    x.strokeStyle = col; x.lineWidth = Math.max(1.3, (on ? 2.4 : 1.7) * z);
    if (on && !xReduced()) { x.setLineDash([6 * z, 4 * z]); x.lineDashOffset = -((tAnim * .04) % (10 * z)); }
    x.beginPath(); wr.pts.forEach((p, i) => (i ? x.lineTo(flSX(p[0]), flSY(p[1])) : x.moveTo(flSX(p[0]), flSY(p[1])))); x.stroke(); x.setLineDash([]);
    if (wr.arrow) { const a = wr.pts[wr.pts.length - 2], b = wr.pts[wr.pts.length - 1]; flArrow(x, flSX(a[0]), flSY(a[1]), flSX(b[0]), flSY(b[1]), col, Math.max(5, 7 * z)); }
  }
  // the boxes
  for (const it of FL.items) {
    if (it.stream || it.mem || it.kind === 'pillar') continue;
    const X = flSX(it.x), Y = flSY(it.y), w = it.w * z, h = it.h * z;
    if (X > W + 30 || Y > H + 30 || X + w < -30 || Y + h < -30) continue;
    x.globalAlpha = dimOut && it.card === 'out' ? .42 : 1;
    if (it.kind === 'grid') flDrawGrid(x, it, X, Y, w, h, z, acc, cur.has(it.id), focus.has(it.id));
    else if (it.kind === 'chip') flDrawChip(x, it, X, Y, w, h, z, it.id === hovId);
    else flDrawBox(x, it, X, Y, w, h, z, acc, cur.has(it.id), focus.has(it.id), detAll || focus.has(it.id));
    x.globalAlpha = 1;
  }
  // "now", on the box the playhead is in
  { const it0 = curIds.map(id => FL.byId[id]).find(q => q && !q.mem && !q.stream && q.kind !== 'pillar'); if (it0 && !FL.preview) { const X = flSX(it0.x + it0.w), Y = flSY(it0.y); x.font = `700 ${10.5}px ${SANS}`; const s = L('now', 'ahora'), tw = x.measureText(s).width + 10; flRR(x, X - tw - 4, Y - 9, tw, 15, 7.5); x.fillStyle = `rgb(${acc})`; x.fill(); x.fillStyle = '#111'; x.fillText(s, X - tw + 1, Y + 2.5); } }
  // selection, hover, the flash from elsewhere and the legend's brush
  for (const id of [hovId, selId]) { const it = id && FL.byId[id]; if (!it || it.stream) continue; const X = flSX(it.x), Y = flSY(it.y); x.save(); x.strokeStyle = '#fff'; x.lineWidth = id === selId ? 2 : 1; if (id === selId) { x.shadowColor = 'rgba(255,255,255,.7)'; x.shadowBlur = 6; } flRR(x, X - 2.5, Y - 2.5, it.w * z + 5, it.h * z + 5, 6 * z); x.stroke(); x.restore(); }
  if (UI.flash && UI.flash.canvas === 'cFlow' && typeof UI.flash.match === 'function') { const e = (performance.now() - UI.flash.t0) / 1500; if (e >= 1) UI.flash = null; else { const a = (.55 + .45 * Math.sin(e * Math.PI * 4 - Math.PI / 2)) * (1 - e * .6); x.save(); x.strokeStyle = `rgba(255,212,59,${a.toFixed(3)})`; x.lineWidth = 2; x.shadowColor = C.hot; x.shadowBlur = 10 * a; for (const it of FL.items) if (UI.flash.match(flSelOf(it) || {})) x.strokeRect(flSX(it.x) - 2, flSY(it.y) - 2, it.w * z + 4, it.h * z + 4); x.restore(); } }
  if (UI.brush && UI.brush.canvas === 'cFlow') { x.save(); x.strokeStyle = 'rgba(255,255,255,.8)'; x.setLineDash([4, 3]); for (const it of FL.items) if (UI.brush.match(flSelOf(it) || {})) x.strokeRect(flSX(it.x) - 2, flSY(it.y) - 2, it.w * z + 4, it.h * z + 4); x.restore(); }
  if (detAll && z >= 1.5) flDrawHud(x, W);
  const ms = performance.now() - t0; FL.ft[FL.fi] = ms; FL.fi = (FL.fi + 1) % FL.ft.length; FL.fn++;
}
function flArrow(x, ax, ay, bx, by, col, s) { const a = Math.atan2(by - ay, bx - ax); x.fillStyle = col; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx - s * Math.cos(a - .42), by - s * Math.sin(a - .42)); x.lineTo(bx - s * Math.cos(a + .42), by - s * Math.sin(a + .42)); x.closePath(); x.fill(); }
function flTokSub() { const s = FL.seg; if (!s || FL.preview) return '—'; if (s.k === 'prefill') return FL.nOut ? L('answer token 1', 'token 1 de la respuesta') : L('not yet', 'aún no'); const nt = FL.nt; return nt > 1 ? L(`tokens ${num(s.tok + 1)}–${num(s.tok + nt)}`, `tokens ${num(s.tok + 1)}–${num(s.tok + nt)}`) : L(`answer token ${num(s.tok + 1)}`, `token ${num(s.tok + 1)} de la respuesta`); }
function flDrawBox(x, it, X, Y, w, h, z, acc, on, foc, det) {
  const t = it.t, wgt = t && t.role === 'weight', node = it.kind === 'node', eb = it.kind === 'ebox';
  if (it.round) { const cx = X + w / 2, cy = Y + h / 2, rr = w / 2, add = it.title === '+'; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.fillStyle = on ? `rgb(${acc})` : add ? '#1a2338' : FC.node; x.fill(); x.strokeStyle = on ? `rgb(${acc})` : add ? FC.stream : FC.edge; x.lineWidth = add ? 2 : 1.2; x.stroke(); x.strokeStyle = on ? '#111' : '#e6ecff'; x.fillStyle = x.strokeStyle; x.lineWidth = Math.max(1.5, 2 * z);
    if (add) { x.beginPath(); x.moveTo(cx - rr * .5, cy); x.lineTo(cx + rr * .5, cy); x.moveTo(cx, cy - rr * .5); x.lineTo(cx, cy + rr * .5); x.stroke(); } else { x.beginPath(); x.arc(cx, cy, rr * .55, 0, 7); x.lineWidth = Math.max(1, 1.3 * z); x.stroke(); x.beginPath(); x.arc(cx, cy, rr * .16, 0, 7); x.fill(); } return; }
  flRR(x, X, Y, w, h, (it.lane ? 4 : 6) * z);
  x.fillStyle = eb ? '#1c1c27' : node ? FC.node : wgt ? FC.boxW : FC.box; x.fill();
  if (on) { x.fillStyle = `rgba(${acc},.15)`; x.fill(); }
  if (eb) x.setLineDash([5 * z, 3 * z]);
  x.strokeStyle = on ? `rgb(${acc})` : foc ? '#b0b0ca' : FC.edge; x.lineWidth = on ? 2 : foc ? 1.4 : 1; x.stroke(); x.setLineDash([]);
  if (on) { x.save(); x.shadowColor = `rgba(${acc},.7)`; x.shadowBlur = 12; x.strokeStyle = `rgba(${acc},.6)`; x.lineWidth = 1; x.stroke(); x.restore(); }
  if (it.lane && it.bar) { x.fillStyle = 'rgba(150,128,255,.20)'; x.fillRect(X + 4 * z, Y + 2 * z, Math.max(2, (w - 6 * z) * it.bar), h - 4 * z); }
  if (wgt) { x.fillStyle = flStripe(t.bpw || 4.9); x.fillRect(X + 1.5 * z, Y + 3 * z, 3.2 * z, h - 6 * z); }
  if (on && !node && !eb) { x.fillStyle = `rgb(${acc})`; x.fillRect(X + 4 * z, Y + h - 3.5 * z, Math.max(0, (w - 8 * z) * FL.actP), 2 * z); }
  const pl = X + (wgt ? 12 : 10) * z, ink = FC.ink;
  if (it.lane) {
    const by = Y + h / 2 + 4.6 * z, tw = flTx(x, it.title, pl, by, FT.t, 700, SANS, ink);
    const sw = flTx(x, it.sub, pl + tw + 8 * z, by, FT.s, 500, FONT, FC.sub);
    if (det && t) flSegs(x, [['→ ', FC.dim], ...flF(t.c)], X + w - 7 * z, by - .5 * z, FT.d, 'right', X + w - 7 * z - (pl + tw + sw + 12 * z));
    return;
  }
  if (eb) { const e = FL.actE, s = FL.seg && FL.seg.k !== 'prefill' && !FL.preview ? (e === -1 ? L('The shared expert, opened', 'El experto compartido, abierto') : L(`Expert ${e >= 0 ? e : flChosenFirst()}, opened`, `Experto ${e >= 0 ? e : flChosenFirst()}, abierto`)) : it.title; flTx(x, s, X + 10 * z, Y + 18 * z, FT.t, 650, SANS, FC.sub); return; }
  const sub = it.id === 'tok' ? flTokSub() : it.sub;
  if (it.inner) { flTx(x, it.title, X + w / 2, Y + 23.5 * z, FT.t, 650, FONT, ink, 'center'); return; }
  if (node) { flTx(x, it.title, X + w / 2, Y + 21 * z, FT.t, 650, SANS, ink, 'center'); flTx(x, sub, X + w / 2, Y + 37 * z, FT.s, 500, FONT, FC.sub, 'center'); return; }
  const dd = det && !it.noDet && t, top = dd ? 0 : (it.h - 52) / 2 + 5;
  flTx(x, it.title, pl, Y + (17.5 + top) * z, FT.t, 650, SANS, ink);
  flTx(x, sub, pl, Y + (32 + top) * z, FT.s, 500, FONT, FC.sub);
  if (dd) flSegs(x, flDet(t), pl, Y + h - 6 * z, FT.d, 'left', X + w - pl - 6 * z);
}
function flDrawChip(x, it, X, Y, w, h, z, hov) { flRR(x, X, Y, w, h, h / 2); x.fillStyle = hov ? '#2c2c3c' : '#1f1f2b'; x.fill(); x.strokeStyle = hov ? '#9a9ab8' : '#5a5a76'; x.lineWidth = 1; x.stroke(); flTx(x, it.title, X + w / 2, Y + h / 2 + 4 * z, 11.5, 600, SANS, FC.ink, 'center'); }
function flDrawMem(x, mm, z, acc, cur) {
  const X = flSX(mm.x), Y = flSY(mm.y), w = mm.w * z, h = mm.h * z, kv = mm.kind === 'kv', on = mm.lanes.some(l => cur.has(l.id));
  flRR(x, X, Y, w, h, 6 * z); x.fillStyle = '#17150e'; if (!kv) x.fillStyle = '#0f1a19'; x.fill(); x.strokeStyle = on ? `rgb(${acc})` : kv ? 'rgba(227,189,61,.55)' : 'rgba(63,214,192,.55)'; x.lineWidth = on ? 2 : 1; x.stroke();
  for (const l of mm.lanes) {
    const lx = flSX(l.x), ly = flSY(l.y), lw = l.w * z, lh = l.h * z;
    if (kv) { const f = Math.max(.002, Math.min(1, FL.ctx / Math.max(1, FL.ctxRes))), horiz = !FL.nar; fillKind(x, 'kvres', lx, ly, lw, lh); const fw = horiz ? lw * f : lw, fh = horiz ? lh : lh * f; fillKind(x, 'kv', lx, ly, fw, fh, .95, Math.max(.7, Math.min(1.4, z))); x.fillStyle = `rgb(${acc})`; if (horiz) x.fillRect(lx + fw - 2, ly, 2.5, lh); else x.fillRect(lx, ly + fh - 2, lw, 2.5);
      x.font = `700 ${11 * z}px ${FONT}`; const s = l.id === 'kvK' ? 'K' : 'V', tw = x.measureText(s).width + 8 * z; x.fillStyle = 'rgba(12,12,16,.88)'; x.fillRect(lx + 2 * z, ly + 2 * z, tw, Math.min(lh - 4 * z, 14 * z)); flTx(x, s, lx + 6 * z, ly + Math.min(lh - 4 * z, 14 * z) / 2 + 6 * z, 11, 700, FONT, FC.ink); }
    else fillKind(x, 'state', lx, ly, lw, lh, 1, Math.max(.7, Math.min(1.4, z)));
  }
  // the plate: what this block is, and how big
  const d = FL.spec.dims, px = X + 10 * z, py = Y + (FL.nar ? 17 : 17) * z;
  if (kv) { const bytes = 2 * FL.ctx * d.Hkv * d.dh * KV_TYPES[S.kv].bytes;
    if (FL.nar) { flTx(x, L('KV cache', 'Caché KV'), px, py, 12.5, 700, SANS, '#f3d878'); flTx(x, `${num(FL.ctx)} tok`, px, py + 15 * z, 11, 400, SANS, FC.sub); flTx(x, B(bytes), px, py + 29 * z, 11, 400, SANS, FC.sub); }
    else { flTx(x, L('KV cache, this layer', 'Caché KV, esta capa'), px, py, 12.5, 700, SANS, '#f3d878'); flTx(x, L(`${num(FL.ctx)} of ${num(FL.ctxRes)} tokens · ${B(bytes)}`, `${num(FL.ctx)} de ${num(FL.ctxRes)} tokens · ${B(bytes)}`), px, py + 15 * z, 11, 400, SANS, FC.sub); } }
  else { const S0 = FL.specs.delta.T.S;
    if (FL.nar) { flTx(x, L('State', 'Estado'), px, py, 12.5, 700, SANS, '#7fe9d8'); flTx(x, `${S0.mult} × 128²`, px, py + 15 * z, 11, 400, SANS, FC.sub); flTx(x, `${B(S0.bytes)}, ${L('fixed', 'fijo')}`, px, py + 29 * z, 11, 400, SANS, FC.sub); }
    else { flTx(x, L('DeltaNet state', 'Estado DeltaNet'), px, py, 12.5, 700, SANS, '#7fe9d8'); flTx(x, L(`${S0.mult} heads of 128 × 128 · ${B(S0.bytes)}, fixed`, `${S0.mult} cabezas de 128 × 128 · ${B(S0.bytes)}, fijo`), px, py + 15 * z, 11, 400, SANS, FC.sub); } }
}
let flChosenKey = '', flChosenSet = new Set();
function flChosen(tok, layer, pre) {
  const k = `${tok}|${layer}|${pre}|${FL.nt}|${S.model}`; if (k === flChosenKey) return flChosenSet; flChosenKey = k; flChosenSet = new Set();
  if (pre) { const p = expertsTouched(R.m, FL.nt) / R.m.experts; for (let e = 0; e < R.m.experts; e++) if (rngOf(e * 7 + 1 + layer * 131)() < p) flChosenSet.add(e); }
  else for (const e of chosenExperts(tok, layer)) flChosenSet.add(e);
  return flChosenSet;
}
const flChosenFirst = () => { const s = FL.seg; const set = flChosen(s && s.k !== 'prefill' ? s.tok : 0, FL.layer, !s || s.k === 'prefill'); for (const e of set) return e; return 0; };
function flDrawGrid(x, it, X, Y, w, h, z, acc, on, foc) {
  const m = R.m, E = m.experts, sh = m.sharedExperts || 0, ps = flPassNow, pre = !ps || ps.seg.k === 'prefill' || FL.nt > 1, tok = ps && !pre ? ps.seg.tok : 0;
  flRR(x, X, Y, w, h, 6 * z); x.fillStyle = FC.box; x.fill(); x.strokeStyle = on ? `rgb(${acc})` : foc ? '#b0b0ca' : FC.edge; x.lineWidth = on ? 2 : 1; x.stroke();
  flTx(x, it.title, X + 10 * z, Y + 17 * z, FT.t, 650, SANS, FC.ink); flTx(x, it.sub, X + 10 * z, Y + 31 * z, FT.s, 500, SANS, FC.sub);
  const cs = (it.h - 45) / it.rows, c2 = cs * z, gx = X + 10 * z, gy = Y + 38 * z, chosen = ps ? flChosen(tok, FL.layer, pre) : new Set(), lit = FL.act && ['egate', 'eup', 'eact', 'edown'].includes(FL.act);
  for (let e = 0; e < E; e++) {
    const cx = gx + (e % it.cols) * c2, cy = gy + Math.floor(e / it.cols) * c2, ch = chosen.has(e), g = c2 > 3.5 ? 1 : 0;
    x.fillStyle = lit && e === FL.actE ? `rgb(${acc})` : ch ? FC.chosen : FC.idle; x.fillRect(cx, cy, Math.max(1, c2 - g), Math.max(1, c2 - g));
  }
  if (sh) { const cx = gx + it.cols * c2 + 8 * z, cy = gy; x.fillStyle = lit && FL.actE === -1 ? `rgb(${acc})` : FC.chosen; x.fillRect(cx, cy, Math.max(2, c2 * 1.6), Math.max(2, c2 * 1.6)); x.strokeStyle = C.teal; x.lineWidth = 1.2; x.strokeRect(cx - 1.5, cy - 1.5, c2 * 1.6 + 3, c2 * 1.6 + 3); }
}
function flDrawStrip(x, it, z, acc) {
  if (!it) return; const n2 = R.m.layers, X = flSX(it.x), Y = flSY(it.y), w = it.w * z, h = it.h * z, horiz = FL.nar, step = (horiz ? w : h) / n2;
  for (let i = 0; i < n2; i++) {
    const on = i === FL.layer, attn = R.kinds[i] === 'attn', g = step > 3 ? 1 : 0;
    x.fillStyle = on ? `rgb(${acc})` : FL.hybrid ? (attn ? 'rgba(231,194,47,.75)' : 'rgba(63,214,192,.6)') : 'rgba(160,160,190,.55)';
    if (horiz) x.fillRect(X + i * step, Y, Math.max(.8, step - g), h); else x.fillRect(X, Y + i * step, w, Math.max(.8, step - g));
    if (FL.slowN && i < FL.slowN) { x.fillStyle = HW.ram; if (horiz) x.fillRect(X + i * step, Y + h + 1.5, Math.max(.8, step - g), 2); else x.fillRect(X - 3.5, Y + i * step, 2, Math.max(.8, step - g)); }
  }
  const i = FL.layer; x.strokeStyle = '#fff'; x.lineWidth = 1.5; if (horiz) x.strokeRect(X + i * step - 1, Y - 2, step + 1, h + 4); else x.strokeRect(X - 2, Y + i * step - 1, w + 4, step + 1);
  if (!horiz) { flTx(x, `×${n2}`, X + w / 2, Y - 8 * z, 12, 700, SANS, FC.sub, 'center'); }
}
// Detail band: the model's dimensions, each in its colour, the key to every shape on screen.
function flDrawHud(x, W) {
  const d = FL.spec.dims, ph = W < 640, maxX = W - (ph ? 160 : 330);
  x.font = `600 10.5px ${FONT}`; let X = 10, Y = 18, rows = 1;
  const parts = []; for (const k of ['n', 'd', 'H', 'Hkv', 'dh', 'F', 'E', 'V']) { const v = k === 'n' ? FL.nt : d[k]; if (v) parts.push([k, `${DIMSYM[k]} ${fmtN(v)}`]); }
  let w0 = 0; for (const [, s] of parts) w0 += x.measureText(s).width + 20;
  x.fillStyle = 'rgba(10,10,14,.92)'; x.fillRect(4, 4, Math.min(w0 + 10, maxX), w0 + 10 > maxX ? 40 : 22);
  for (const [k, s] of parts) { const w = x.measureText(s).width + 20; if (X + w > maxX) { X = 10; Y += 16; rows++; } x.fillStyle = DIMC[k]; x.fillRect(X, Y - 8.5, 8, 8); x.fillStyle = FC.sub; x.fillText(s, X + 11, Y - .5); X += w; }
}
// Grouped-query attention, for the explainer and the step text.
let FOCUS_AB = { key: '' };

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
  push('embed', seg.a + seg.d * 1e-7, ['embed'], 0);
  const lc = Math.max(0, Math.min(L - 1, ps.layer)), kind = R.kinds[lc];
  const mixer = (layer, kd) => {
    const sp = FL.specs[kd], P_ = kd === 'attn' ? 'A:' : 'D:'; if (!sp) return;
    const t0 = at(layer, 1e-6);
    push('norm1', t0, ['norm1'], layer);
    if (kd === 'attn') {
      push('qkv', costT(layer, 'attn_q', 0, 1), ['k', 'v', 'q'], layer);
      const att = flSpecOps(sp, 'attention'), j = id => att.findIndex(o => o.id === id);
      push('append', costT(layer, 'attention', j('append'), att.length), ['k', 'v', 'kvK', 'kvV'], layer);
      push('scores', costT(layer, 'attention', j('scores'), att.length), ['scores', 'kvK'], layer);
      push('mix', costT(layer, 'attention', j('mix'), att.length), ['softmax', 'mix', 'kvV'], layer);
      push('wo', costT(layer, 'attn_output', 0, 1), ['o', 'add1'], layer);
    } else {
      push('dqkv', costT(layer, 'attn_qkv', 0, 1), ['dqkv', 'dg'], layer);
      const st = flSpecOps(sp, 'state'), j = st.findIndex(o => o.id === 'state');
      push('dstate', costT(layer, 'state', j, st.length), ['dstate', 'S'], layer);
      push('dout', costT(layer, 'ssm_out', 0, 1), ['dmul', 'dout', 'add1'], layer);
    }
  };
  const ffn = layer => {
    if (FL.spec.T.Wr) { push('route', costT(layer, 'router', 0, 1), ['router', 'grid'], layer); push('expert', costT(layer, 'expert', .2, 1), ['grid', 'eg', 'eu', 'eact', 'ed'], layer); }
    else push('ffn', costT(layer, FL.spec.T.Wg2 ? 'ffn_gate' : 'ffn_up', 0, 1), ['fg', 'fu', 'fact', 'fd'], layer);
    push('add2', at(layer, 1 - 1e-6), [FL.spec.T.Wr ? 'esum' : 'fd', 'add2'], layer);
  };
  mixer(lc, kind); ffn(lc);
  if (FL.hybrid) { const other = kind === 'attn' ? 'delta' : 'attn'; let j = lc + 1; while (j < L && R.kinds[j] !== other) j++; if (j < L) mixer(j, other); }
  push('stack', at(L - 1, 1 - 2e-6), ['pillar'], L - 1);
  const hT = pre ? seg.a + seg.d * (1 - 2e-7) : seg.a + seg.d * (lf[L] + (1 - lf[L]) * .5);
  push('head', hT, ['normf', 'head'], L - 1);
  push('sample', seg.a + seg.d * (1 - 1e-7), ['sample', 'tok'], L - 1);
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
function flDimText(fs) { let s = ''; for (let i = 0; i < fs.length; i++) s += (i ? '·' : '') + num(fs[i][1]); return s; }
function flDimSyms(t) { const f = fs => fs.map(q => DIMSYM[q[0]] || num(q[1])).join('·'); return `${f(t.r)} × ${f(t.c)}`; }
function flFormula(key) {
  const pre = key.includes(':') ? key.slice(0, key.indexOf(':') + 1) : '', id = key.slice(pre.length), sp = pre === 'A:' ? FL.specs.attn : pre === 'D:' ? FL.specs.delta : FL.spec, o = sp && sp.ops.find(q => q.id === id);
  if (!o || !o.a || !o.b || !(o.kind === 'matmul' || o.kind === 'attn' || o.kind === 'state' || (o.kind === 'route' && o.b))) return null;
  return { a: sp.T[o.a], b: sp.T[o.b], c: sp.T[o.out], name: o.id };
}
function flUi(ps) {
  const stops = flWalk(ps), cur = flStopAt(stops), k = `${lang}|${cur}|${stops.length}|${FL.follow}|${FL.shapes}|${ps.preview}|${ps.seg.k}|${FL.nOut}|${FL.kind}|${FL.layer}|${FL.ctx}`;
  if (k === FL.uiKey) return; FL.uiKey = k;
  const st = stops[Math.max(0, cur)], [title, body] = flStopText(st.key), f = flFormula(flStopOp(st.key));
  $('flStep').innerHTML = `<b>${esc(title)}</b><span class="n">${Math.max(0, cur) + 1}/${stops.length}</span><p>${esc(body)}</p>${f ? `<p class="fx">${flFormulaHtml(f)}</p>` : ''}`;
  $('flFollow').setAttribute('aria-pressed', FL.follow); $('flScale').setAttribute('aria-pressed', FL.shapes);
  $('flNote').textContent = ps.preview ? (P.t >= R.total && R.total ? L('The run has ended: showing the last pass.', 'La ejecución ha terminado: se muestra la última pasada.') : L('Nothing runs yet: showing the first pass. Step with ← → or press play.', 'Aún no corre nada: se muestra la primera pasada. Avanza con ← → o pulsa reproducir.')) : '';
}
function flFormulaHtml(f) {
  const s = (fs, strike) => fs.map(q => `<i style="color:${DIMC[q[0]] || C.mid}"${strike ? ' class="x"' : ''}>${esc(num(q[1]))}</i>`).join('·');
  return `[${s(f.a.r)} × ${s(f.a.c, true)}] · [${s(f.b.r, true)} × ${s(f.b.c)}] → [${s(f.c.r)} × ${s(f.c.c)}]`;
}
const FL_STOP_OP = { embed: 'embed', qkv: 'A:q', append: 'A:append', scores: 'A:scores', mix: 'A:mix', wo: 'A:o', dqkv: 'D:qkv', dstate: 'D:state', dout: 'D:out', route: 'route', expert: 'eup', ffn: 'fup', add2: 'add2', stack: null, head: 'head', sample: 'sample' };
const flStopOp = k => (k === 'norm1' ? (FL.kind === 'attn' ? 'A:norm1' : 'D:norm1') : FL_STOP_OP[k] || '');
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
  FL.uiKey = ''; FL.dirty = true; KEEP.idle = 0; UI.stale = false;
}
function flFormulaHtml(f) {
  const s = (fs, strike) => fs.map(q => `<i style="color:${DIMC[q[0]] || C.mid}"${strike ? ' class="x"' : ''}>${esc(num(q[1]))}</i>`).join('·');
  return `[${s(f.a.r)} × ${s(f.a.c, true)}] · [${s(f.b.r, true)} × ${s(f.b.c)}] → [${s(f.c.r)} × ${s(f.c.c)}]`;
}
// ---- selection and the explainer ----
function flSelOf(it) {
  if (!it) return null;
  if (it.kind === 't') return { k: 'flow', id: it.id, kind: it.t.role === 'weight' ? 'weight' : it.t.role, name: it.t.role === 'weight' ? it.t.w : it.tid };
  if (it.kind === 'chip' || it.kind === 'ebox') return null;
  if (it.kind === 'grid') return { k: 'flow', id: 'grid', kind: 'egrid' };
  if (it.kind === 'pillar') return { k: 'flow', id: 'pillar', kind: 'pillar' };
  if (it.kind === 'node') return { k: 'flow', id: it.id, kind: 'node' };
  return null;
}
function flHit(px, py) {
  const wx = flWX(px), wy = flWY(py), pad = 4 / FL.cam.z;
  for (let i = FL.items.length - 1; i >= 0; i--) { const it = FL.items[i]; if (it.kind === 'ebox') continue; if (wx >= it.x - pad && wx <= it.x + it.w + pad && wy >= it.y - pad && wy <= it.y + it.h + pad) return it; }
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
  if (it.kind === 'node') { const sp = it.sp, oid = (it.op || it.id).replace(/^[A-Z]:/, ''), o = sp.ops.find(q => q.id === oid); const nm = flOpName(sp, o ? o.i : -1);
    const W2 = { norm1: L('Divides each row by its root mean square and scales it by a learned vector of the same width. Cheap, and it keeps the numbers in a range the next matrices expect.', 'Divide cada fila por su media cuadrática y la escala por un vector aprendido del mismo ancho. Barata, y mantiene los números en el rango que esperan las matrices siguientes.'), add1: L('Adds the mixer’s output to the stream, element by element. Both are the same shape, which is why they can be added.', 'Suma la salida del mezclador al flujo, elemento a elemento. Ambos tienen la misma forma, por eso se pueden sumar.'), softmax: L('Exponentiates each score and divides by the row’s sum, so each row of weights adds up to 1.', 'Exponencia cada puntuación y divide por la suma de la fila, así cada fila de pesos suma 1.'), topk: L('Keeps the highest router scores and renormalises them into the weights of the chosen experts.', 'Se queda con las puntuaciones más altas del router y las renormaliza como pesos de los expertos elegidos.'), esum: L('Adds the chosen experts’ outputs, each weighted by its router score, plus the shared expert.', 'Suma las salidas de los expertos elegidos, cada una ponderada por su puntuación del router, más el experto compartido.'), sample: L('Turns the logits into probabilities and draws one token, as the Tokens view shows step by step.', 'Convierte los logits en probabilidades y sortea un token, como la vista Tokens enseña paso a paso.'), dgate: L('Multiplies the readout by the gate, element by element: the gate decides how much of each number passes.', 'Multiplica la lectura por la puerta, elemento a elemento: la puerta decide cuánto pasa de cada número.'), eact: L('SiLU of the gate times the up projection, element by element (SwiGLU).', 'SiLU de la puerta por la proyección up, elemento a elemento (SwiGLU).'), fact: FL.spec.T.Wg2 ? L('SiLU of the gate times the up projection, element by element (SwiGLU).', 'SiLU de la puerta por la proyección up, elemento a elemento (SwiGLU).') : L('A non-linear function applied to every number (GELU in GPT-3).', 'Una función no lineal aplicada a cada número (GELU en GPT-3).') };
    const key = oid, w2 = W2[key] || W2[key === 'norm2' || key === 'normf' ? 'norm1' : key === 'add2' ? 'add1' : key] || '';
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
  if (key === 'normf' || key === 'sample') return [FL.segIdx, -1, 'output'];
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
  $('flScale').innerHTML = `${ICON('eq', 's')}<span>${esc(L('Shapes', 'Formas'))}</span>`; $('flScale').title = L('Show the shape of every tensor, not only the current step’s (each number in its dimension’s colour)', 'Mostrar la forma de cada tensor, no solo la del paso actual (cada número con el color de su dimensión)');
  $('flXp').innerHTML = `${ICON('expand', 's')}<span>${esc(L('Explore', 'Explorar'))}</span>`; $('flXp').title = L('See this step in the deep timeline: when it runs and how long it takes', 'Ver este paso en la línea de tiempo profunda: cuándo corre y cuánto tarda');
  $('cFlow').setAttribute('aria-label', L('Flow: one layer of the model as a circuit, from the token in to the token out. Click a part to learn about it; drag to pan, wheel or pinch to zoom. Arrow keys walk the pass step by step.', 'Flujo: una capa del modelo como un circuito, del token que entra al que sale. Clic en una parte para saber qué es; arrastra para desplazar, rueda o pellizco para ampliar. Las flechas recorren la pasada paso a paso.'));
  FL.uiKey = '';
}
{
  applyFlowText(); FL.lang = lang;
  const cv = $('cFlow'), pts = new Map(), loc = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }, tip = $('tip');
  const manual = () => { FL.follow = false; FL.lastKey = ''; FL.uiKey = ''; };
  const zoomAt = (px, py, f) => { const wx = flWX(px), wy = flWY(py), z = Math.max(.25, Math.min(8, FL.tgt.z * f)); FL.tgt.z = z; FL.tgt.x = wx - (px - FL.W / 2) / z; FL.tgt.y = wy - (py - FL.H / 2) / z; FL.cam.z = z; FL.cam.x = FL.tgt.x; FL.cam.y = FL.tgt.y; FL.dirty = true; };
  const hover = (px, py, e) => {
    FL.px = px; FL.py = py; const h = flHit(px, py); if (h !== FL.hov) { FL.hov = h; FL.dirty = true; }
    cv.style.cursor = FL.drag && FL.drag.moved ? 'grabbing' : h ? 'pointer' : 'grab';
    if (h && h.kind === 'chip') { tip.classList.remove('on'); return; }
    if (h && e && e.pointerType === 'mouse') { const d = flInspect(flSelOf(h)); if (d) { tip.textContent = `${d.title} · ${d.tag[0]}`; tip.classList.add('on'); const tw = tip.offsetWidth, th = tip.offsetHeight; let lx = e.clientX + 16, ly = e.clientY + 18; if (lx + tw > innerWidth - 8) lx = e.clientX - tw - 16; if (ly + th > innerHeight - 8) ly = e.clientY - th - 16; tip.style.left = `${lx}px`; tip.style.top = `${ly}px`; } } else tip.classList.remove('on');
  };
  cv.addEventListener('pointerdown', e => { const [px, py] = loc(e); cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [px, py]);
    if (pts.size === 1) FL.drag = { x0: px, y0: py, cx: FL.cam.x, cy: FL.cam.y, moved: false, touch: e.pointerType !== 'mouse' };
    else if (pts.size === 2) { const [p1, p2] = [...pts.values()]; FL.pinch = { d0: Math.max(10, Math.hypot(p1[0] - p2[0], p1[1] - p2[1])), z0: FL.cam.z, mx: (p1[0] + p2[0]) / 2, my: (p1[1] + p2[1]) / 2, wx: flWX((p1[0] + p2[0]) / 2), wy: flWY((p1[1] + p2[1]) / 2) }; FL.drag = null; manual(); } });
  cv.addEventListener('pointermove', e => { const [px, py] = loc(e);
    if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') hover(px, py, e); return; }
    pts.set(e.pointerId, [px, py]);
    if (FL.pinch && pts.size >= 2) { const [p1, p2] = [...pts.values()], dd = Math.max(10, Math.hypot(p1[0] - p2[0], p1[1] - p2[1])), mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, z = Math.max(.25, Math.min(8, FL.pinch.z0 * dd / FL.pinch.d0)); FL.cam.z = FL.tgt.z = z; FL.cam.x = FL.tgt.x = FL.pinch.wx - (mx - FL.W / 2) / z; FL.cam.y = FL.tgt.y = FL.pinch.wy - (my - FL.H / 2) / z; FL.dirty = true; return; }
    const d = FL.drag; if (!d) return;
    if (!d.moved && Math.hypot(px - d.x0, py - d.y0) > (d.touch ? 8 : 4)) { d.moved = true; manual(); tip.classList.remove('on'); }
    if (d.moved) { FL.cam.x = FL.tgt.x = d.cx - (px - d.x0) / FL.cam.z; FL.cam.y = FL.tgt.y = d.cy - (py - d.y0) / FL.cam.z; FL.dirty = true; cv.style.cursor = 'grabbing'; }
  });
  const up = e => { const [px, py] = loc(e); pts.delete(e.pointerId);
    if (FL.pinch) { if (pts.size < 2) FL.pinch = null; return; }
    const d = FL.drag; FL.drag = null; if (!d || d.moved) return;
    const h = flHit(px, py);
    if (h && h.kind === 'chip') { flJumpKind(); return; }
    if (d.touch) { const t2 = performance.now(); if (h && t2 - FL.tap < 320) { const rr = flFrameRect([h.id]); if (rr) { manual(); flAim([rr[0] - 30, rr[1] - 30, rr[2] + 30, rr[3] + 30], 2.6); } FL.tap = 0; return; } FL.tap = t2; }
    SEL_FROM = 'cFlow'; select(h ? flSelOf(h) : null); FL.dirty = true;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); FL.drag = null; FL.pinch = null; });
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) { FL.hov = null; FL.dirty = true; tip.classList.remove('on'); } });
  cv.addEventListener('dblclick', e => { const [px, py] = loc(e), h = flHit(px, py); if (!h) return; const rr = flFrameRect([h.id]); if (rr) { manual(); flAim([rr[0] - 30, rr[1] - 30, rr[2] + 30, rr[3] + 30], 2.6); } });
  cv.addEventListener('wheel', e => { e.preventDefault(); const [px, py] = loc(e); let dy = e.deltaY, dx = e.deltaX; if (e.deltaMode === 1) { dy *= 16; dx *= 16; } else if (e.deltaMode === 2) { dy *= 400; dx *= 400; } manual();
    if (e.ctrlKey) zoomAt(px, py, Math.exp(-dy * .012)); else if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) { FL.cam.x = FL.tgt.x = FL.cam.x + (dx || dy) / FL.cam.z; FL.dirty = true; } else zoomAt(px, py, Math.exp(-dy * .0022)); }, { passive: false });
  $('flPrev').addEventListener('click', () => flGo(-1)); $('flNext').addEventListener('click', () => flGo(1));
  $('flFollow').addEventListener('click', () => { FL.follow = !FL.follow; FL.lastKey = ''; FL.uiKey = ''; FL.dirty = true; });
  $('flAll').addEventListener('click', () => { manual(); flFit(); });
  $('flScale').addEventListener('click', () => { FL.shapes = !FL.shapes; try { localStorage.setItem('llmc.flowShapes', FL.shapes ? '1' : '0'); } catch (er) {} FL.uiKey = ''; FL.dirty = true; });
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
// The hybrid chip: the next layer of the other kind, in this same pass.
function flJumpKind() {
  const other = FL.kind === 'attn' ? 'delta' : 'attn', L0 = R.m.layers; let j = FL.layer + 1; while (j < L0 && R.kinds[j] !== other) j++; if (j >= L0) j = R.kinds.indexOf(other); if (j < 0) return;
  const ps = flPassNow; if (ps && !ps.preview) { const sp = layerSpan(ps.seg, j); UI.layer = -1; stopAt(sp[0] + (sp[1] - sp[0]) * 1e-3); } else UI.layer = j;
  FL.stop = -1; FL.walk = null; FL.follow = true; FL.lastKey = ''; FL.uiKey = ''; FL.dirty = true; KEEP.idle = 0; UI.stale = false;
}
// From the address line: the layer, the operation or the row, framed in the drawing.
function flAddrGo(k, n) {
  FL.follow = false; FL.lastKey = 'addr'; FL.dirty = true;
  if (k === 'seg' || k === 'round' || k === 'phase') { flFit(); return; }
  if (k === 'layer') { if (n.head) flAimFocus(['normf', 'head', 'sample'], true); else { const f = FL.frame; flAim([f.x - 4, f.y - 12, f.x + f.w + 40, f.y + f.h + 4], 1.6); } return; }
  const ids = FL.act ? flOpItems(FL.act).map(q => q.id) : []; if (ids.length) flAimFocus(ids, true); else flFit();
}
