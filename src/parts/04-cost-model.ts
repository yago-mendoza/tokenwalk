// ===== One request, computed =====
function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const KEEP = { idle: 0, unloaded: false };
function compute() {
  const mc = machine(), m = MODELS[S.model], sh = shapesOf(S.model), kinds = layerKinds(m);
  const ctx = Math.min(S.ctx, m.ctxMax);
  const promptFull = S.sys + S.docs + S.q, room = Math.max(0, ctx - S.ans), prompt = Math.min(promptFull, room);
  const prefixLen = Math.min(prompt, S.sys + S.docs);
  const useCache = (S.cached || S.disk) && prefixLen > 0, startAt = useCache ? prefixLen : 0;
  const pl = placement(mc, m, S.quant);
  const flopsEff = mc.tflops * 1e12 * (m.moe ? 0.75 : 1);
  const bwEff = mc.bw * mc.bwEff * pl.fastShare + mc.hostBw * 0.6 * (1 - pl.fastShare);
  const cold = S.cold || KEEP.unloaded;
  const segs = []; let t = 0;
  const load = cold ? fileGB(m, S.quant) / ssdGBs(S.machine) : 0;
  if (load > 0) { segs.push({ k: 'load', a: t, d: load }); t += load; }
  const restore = S.disk && !S.cached && prefixLen > 0 ? kvGB(m, S.kv, prefixLen) / ssdGBs(S.machine) : 0;
  if (restore > 0) { segs.push({ k: 'restore', a: t, d: restore, n: prefixLen }); t += restore; }
  const ttftStart = t;
  let done = startAt, ci = 0; const nChunks = Math.ceil(Math.max(0, prompt - startAt) / 512);
  while (done < prompt) {
    const c = Math.min(512, prompt - done);
    const bytes = passReadGB(m, S.quant, c), mem = bytes / bwEff, matmul = (2 * m.readParams * c) / flopsEff;
    const attn = (4 * m.kvLayers * m.qHeads * m.headDim * c * (done + c / 2)) / flopsEff;
    const d = Math.max(mem, matmul) + attn + (mc.layerMs * m.layers) / 1000;
    segs.push({ k: 'prefill', a: t, d, from: done, to: done + c, i: ci++, n: nChunks, mem, matmul, attn, bytes });
    t += d; done += c;
  }
  const ttft = t, firstDecode = segs.length;
  let specInfo = null;
  const useMtp = !S.spec && S.mtp && m.mtp;
  if (useMtp) {
    // MTP: draft k tokens with the model's own next-n block, verify them in one pass of the full model.
    const k = MTP.k, alpha = mtpAlpha(S.temp), draftT = mtpDraftGB(m, S.quant) / bwEff + mc.layerMs / 1000;
    // Accepted guesses per round by error diffusion: on average alpha + alpha^2 + ... + alpha^k, as the formula
    // (mtpTokS) has it, with no random drift on short answers.
    const eAcc = Array.from({ length: k }, (_, j) => alpha ** (j + 1)).reduce((s2, v) => s2 + v, 0);
    let i = 0, rounds = 0, acc = 0, carry = 0;
    while (i < S.ans) {
      carry += eAcc; const a = Math.min(k, Math.floor(carry + 1e-9)); carry -= a;
      const n = Math.min(a + 1, S.ans - i), ctxNow = prompt + i;
      const vBytes = passReadGB(m, S.quant, k + 1) + kvGB(m, S.kv, ctxNow);
      const verifyT = Math.max(vBytes / bwEff, (2 * m.readParams * (k + 1)) / (mc.tflops * 1e12)) + (mc.layerMs * m.layers) / 1000;
      segs.push({ k: 'round', a: t, d: k * draftT + verifyT, tok: i, n, acc: a, ctx: ctxNow, bytes: vBytes, draftT, verifyT, mtp: true });
      t += k * draftT + verifyT; i += n; rounds++; acc += a;
    }
    const plain = decodeStep(mc, m, S.quant, S.kv, prompt + S.ans / 2);
    specInfo = { kind: 'mtp', k, alpha, draftT, rounds, perRound: S.ans / rounds, speedup: (S.ans / (t - ttft)) * plain.seconds, accRate: acc / (rounds * k), plainTps: 1 / plain.seconds };
  } else if (!S.spec) {
    for (let i = 0; i < S.ans; i++) { const st = decodeStep(mc, m, S.quant, S.kv, prompt + i); segs.push({ k: 'decode', a: t, d: st.seconds, tok: i, ctx: prompt + i, bytes: st.bytesGB }); t += st.seconds; }
  } else {
    const bpw = QUANTS[S.quant].bpw, draftT = (DRAFT.params * bpw) / 8 / GB / bwEff + (mc.layerMs * DRAFT.layers) / 1000;
    const r = rngOf(4242 + S.gamma * 7 + Math.round(S.alpha * 100));
    let i = 0, rounds = 0, acc = 0;
    while (i < S.ans) {
      let a = 0; while (a < S.gamma && r() < S.alpha) a++;
      const n = Math.min(a + 1, S.ans - i), ctxNow = prompt + i;
      const vBytes = passReadGB(m, S.quant, S.gamma + 1) + kvGB(m, S.kv, ctxNow);
      const verifyT = Math.max(vBytes / bwEff, (2 * m.readParams * (S.gamma + 1)) / (mc.tflops * 1e12)) + (mc.layerMs * m.layers) / 1000;
      segs.push({ k: 'round', a: t, d: S.gamma * draftT + verifyT, tok: i, n, acc: a, ctx: ctxNow, bytes: vBytes, draftT, verifyT });
      t += S.gamma * draftT + verifyT; i += n; rounds++; acc += a;
    }
    const plain = decodeStep(mc, m, S.quant, S.kv, prompt + S.ans / 2);
    specInfo = { kind: 'draft', draftT, rounds, perRound: S.ans / rounds, speedup: (S.ans / (t - ttft)) * plain.seconds, accRate: acc / (rounds * S.gamma) };
  }
  const total = t, decodeTime = total - ttft, tps = S.ans / Math.max(1e-9, decodeTime);
  const mid = decodeStep(mc, m, S.quant, S.kv, Math.min(ctx, prompt + S.ans / 2));
  return {
    mc, m, sh, kinds, ctx, prompt, promptFull, truncated: promptFull > room, prefixLen, startAt, segs, firstDecode, load, restore, cold,
    ttft, ttftStart, total, decodeTime, tps, mid, pl, specInfo, newTokens: prompt - startAt, prefill: ttft - ttftStart,
    chunk: segs.find(s => s.k === 'prefill'), bwEff, flopsEff,
    weights: fileGB(m, S.quant), kvRes: kvGB(m, S.kv, ctx), state: m.stateMB / 1000, buf: buffersGB(m),
  };
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
