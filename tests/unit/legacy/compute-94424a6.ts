// The cost model as it was before estimate() (commit 94424a6): compute() and machine() copied verbatim, with the
// helpers they called that the refactor changed (rngOf, shapesOf, ssdGBs). The globals they read (S, KEEP, CALIB)
// become parameters. tests/unit/estimate.test.mjs runs this and estimate() over every preset and asserts the same
// results. Keep it until the refactor into the package is done; never edit it to make the test pass.
function legacyCompute(S, KEEP, CALIB) {
  function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const ssdGBs = key => (key === 'thinkpad' || key === 'thinkpadCpu' ? 0.4 : 2);
  function shapesOf(key) {
    if (SHAPES[key]) return SHAPES[key];
    const m = MODELS[key], h = m.hidden, kvw = m.kvHeads * m.headDim;
    return { attn: [['attn_q', h, m.qHeads * m.headDim], ['attn_k', h, kvw], ['attn_v', h, kvw], ['attn_output', m.qHeads * m.headDim, h]], mlp: [['ffn_up', h, 4 * h], ['ffn_down', 4 * h, h]] };
  }
  function machine() {
    const p = MACHINES[S.machine], mc = { ...p, ramGB: S.ram, tflops: S.tflops };
    if (p.kind === 'unified') { mc.bw = (S.mts * S.bus) / 8 / 1000; mc.hostBw = mc.bw; mc.fastGB = S.ram * (p.fastGB / p.ramGB); }
    else { mc.bw = S.vbw; mc.fastGB = S.vram; }
    // A live run can calibrate this machine: its effective bandwidth and compute are scaled to match it.
    const cal = CALIB[S.machine]; if (cal) { mc.bwEff *= cal.bw; mc.tflops *= cal.fl; mc.calibrated = true; }
    return mc;
  }
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
  return compute();
}
