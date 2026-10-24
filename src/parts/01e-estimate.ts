// ===== The cost model as one pure function: estimate(config, data) -> result =====
// No state, no DOM: everything the request depends on comes in through `config` (the request and the effective
// machine) and `data` (the model tables). The app calls it with its Setup (compute() in 04-cost-model.ts, through
// configFromState); node loads this part next to 01-data.ts (tests/unit/load.mjs), and so will the npm package.
// The weight and KV formats (QUANTS, KV_TYPES), MTP and DRAFT are constants of the model, from 01-data.ts.
type EstimateConfig = import('../core/types').EstimateConfig;
type EstimateData = import('../core/types').EstimateData;
type EstimateResult = import('../core/types').EstimateResult;
type MachineSpec = import('../core/types').MachineSpec;
type MachineOverrides = import('../core/types').MachineOverrides;
type Calibration = import('../core/types').Calibration;
type LayerShapes = import('../core/types').LayerShapes;
type ModelSpec = import('../core/types').ModelSpec;
type Segment = import('../core/types').Segment;

// A small seeded generator (mulberry32): the same seed gives the same sequence everywhere.
function rngOf(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Layer matrices of a model: its own table when it has one, otherwise a generic dense layer from its dimensions.
function shapesFor(m: ModelSpec, own: LayerShapes | undefined): LayerShapes {
  if (own) return own;
  const h = m.hidden, kvw = m.kvHeads * m.headDim;
  return { attn: [['attn_q', h, m.qHeads * m.headDim], ['attn_k', h, kvw], ['attn_v', h, kvw], ['attn_output', m.qHeads * m.headDim, h]], mlp: [['ffn_up', h, 4 * h], ['ffn_down', 4 * h, h]] };
}

// A preset's Setup fields (the overrides resolveMachine applies), as the Setup starts them.
function machineFields(key: string): MachineOverrides { const p = MACHINES[key], b = BUS[key] || [8000, 128]; return { ram: p.ramGB, tflops: p.tflops, mts: b[0], bus: b[1], vram: p.fastGB, vbw: p.bw }; }

// The effective machine: a preset with the Setup's overrides (RAM, compute, the memory bus or the card's VRAM and
// bandwidth) and, when a live run calibrated it, its bandwidth and compute scaled to match.
function resolveMachine(p: MachineSpec, o: MachineOverrides, cal?: Calibration | null): MachineSpec {
  const mc: MachineSpec = { ...p, ramGB: o.ram, tflops: o.tflops };
  if (p.kind === 'unified') { mc.bw = (o.mts * o.bus) / 8 / 1000; mc.hostBw = mc.bw; mc.fastGB = o.ram * (p.fastGB / p.ramGB); }
  else { mc.bw = o.vbw; mc.fastGB = o.vram; }
  if (cal) { mc.bwEff *= cal.bw; mc.tflops *= cal.fl; mc.calibrated = true; }
  return mc;
}

// The app's Setup state (S in 03-state.ts) as a config. `unloaded`: keep_alive has unloaded the model, so the next
// request starts cold; `calib`: live calibrations by machine key.
function configFromState(st: any, opts: { unloaded: boolean; calib: Record<string, Calibration>; machines: Record<string, MachineSpec> }): EstimateConfig {
  return {
    machine: resolveMachine(opts.machines[st.machine], st, opts.calib[st.machine]),
    model: st.model, quant: st.quant, kv: st.kv, ctxTokens: st.ctx,
    systemTokens: st.sys, docsTokens: st.docs, questionTokens: st.q, answerTokens: st.ans, temperature: st.temp,
    prefixCached: !!st.cached, diskCache: !!st.disk, cold: !!(st.cold || opts.unloaded), mtp: !!st.mtp,
    speculative: st.spec ? { gamma: st.gamma, alpha: st.alpha } : null,
  };
}

// One request, computed: load, KV restore, prefill in micro-batches, then plain decoding, MTP rounds or speculative
// rounds with a separate draft model. Every segment of the timeline carries its own costs.
function estimate(cfg: EstimateConfig, data: EstimateData): EstimateResult {
  const mc = cfg.machine, m = data.models[cfg.model], sh = shapesFor(m, data.shapes[cfg.model]), kinds = layerKinds(m) as ('attn' | 'delta')[];
  const q = cfg.quant, kv = cfg.kv, ans = cfg.answerTokens, ub = cfg.ubatchTokens || 512, spec = cfg.speculative;
  const ctx = Math.min(cfg.ctxTokens, m.ctxMax);
  const promptFull = cfg.systemTokens + cfg.docsTokens + cfg.questionTokens, room = Math.max(0, ctx - ans), prompt = Math.min(promptFull, room);
  const prefixLen = Math.min(prompt, cfg.systemTokens + cfg.docsTokens);
  const useCache = (cfg.prefixCached || cfg.diskCache) && prefixLen > 0, startAt = useCache ? prefixLen : 0;
  const pl = placement(mc, m, q);
  const flopsEff = mc.tflops * 1e12 * (m.moe ? 0.75 : 1);
  const bwEff = mc.bw * mc.bwEff * pl.fastShare + mc.hostBw * 0.6 * (1 - pl.fastShare);
  const cold = cfg.cold, disk = mc.diskGBs || 2, overhead = (mc.layerMs * m.layers) / 1000;
  const segs: Segment[] = []; let t = 0;
  const load = cold ? fileGB(m, q) / disk : 0;
  if (load > 0) { segs.push({ k: 'load', a: t, d: load }); t += load; }
  const restore = cfg.diskCache && !cfg.prefixCached && prefixLen > 0 ? kvGB(m, kv, prefixLen) / disk : 0;
  if (restore > 0) { segs.push({ k: 'restore', a: t, d: restore, n: prefixLen }); t += restore; }
  const ttftStart = t;
  let done = startAt, ci = 0; const nChunks = Math.ceil(Math.max(0, prompt - startAt) / ub);
  while (done < prompt) {
    const c = Math.min(ub, prompt - done);
    const bytes = passReadGB(m, q, c), mem = bytes / bwEff, matmul = (2 * m.readParams * c) / flopsEff;
    const attn = (4 * m.kvLayers * m.qHeads * m.headDim * c * (done + c / 2)) / flopsEff;
    const d = Math.max(mem, matmul) + attn + overhead;
    segs.push({ k: 'prefill', a: t, d, from: done, to: done + c, i: ci++, n: nChunks, mem, matmul, attn, bytes });
    t += d; done += c;
  }
  const ttft = t, firstDecode = segs.length;
  let specInfo = null;
  const useMtp = !spec && cfg.mtp && m.mtp;
  if (useMtp) {
    // MTP: draft k tokens with the model's own next-n block, verify them in one pass of the full model.
    const k = MTP.k, alpha = mtpAlpha(cfg.temperature), draftT = mtpDraftGB(m, q) / bwEff + mc.layerMs / 1000;
    // Accepted guesses per round by error diffusion: on average alpha + alpha^2 + ... + alpha^k, as the formula
    // (mtpTokS) has it, with no random drift on short answers.
    const eAcc = Array.from({ length: k }, (_, j) => alpha ** (j + 1)).reduce((s2, v) => s2 + v, 0);
    let i = 0, rounds = 0, acc = 0, carry = 0;
    while (i < ans) {
      carry += eAcc; const a = Math.min(k, Math.floor(carry + 1e-9)); carry -= a;
      const n = Math.min(a + 1, ans - i), ctxNow = prompt + i;
      const vBytes = passReadGB(m, q, k + 1) + kvGB(m, kv, ctxNow);
      const verifyT = Math.max(vBytes / bwEff, (2 * m.readParams * (k + 1)) / (mc.tflops * 1e12)) + overhead;
      segs.push({ k: 'round', a: t, d: k * draftT + verifyT, tok: i, n, acc: a, ctx: ctxNow, bytes: vBytes, draftT, verifyT, mtp: true });
      t += k * draftT + verifyT; i += n; rounds++; acc += a;
    }
    const plain = decodeStep(mc, m, q, kv, prompt + ans / 2);
    specInfo = { kind: 'mtp', k, alpha, draftT, rounds, perRound: ans / rounds, speedup: (ans / (t - ttft)) * plain.seconds, accRate: acc / (rounds * k), plainTps: 1 / plain.seconds };
  } else if (!spec) {
    for (let i = 0; i < ans; i++) { const st = decodeStep(mc, m, q, kv, prompt + i); segs.push({ k: 'decode', a: t, d: st.seconds, tok: i, ctx: prompt + i, bytes: st.bytesGB }); t += st.seconds; }
  } else {
    const { gamma, alpha } = spec;
    const draftT = (DRAFT.params * bpwOf(q)) / 8 / GB / bwEff + (mc.layerMs * DRAFT.layers) / 1000;
    const r = rngOf(4242 + gamma * 7 + Math.round(alpha * 100));
    let i = 0, rounds = 0, acc = 0;
    while (i < ans) {
      let a = 0; while (a < gamma && r() < alpha) a++;
      const n = Math.min(a + 1, ans - i), ctxNow = prompt + i;
      const vBytes = passReadGB(m, q, gamma + 1) + kvGB(m, kv, ctxNow);
      const verifyT = Math.max(vBytes / bwEff, (2 * m.readParams * (gamma + 1)) / (mc.tflops * 1e12)) + overhead;
      segs.push({ k: 'round', a: t, d: gamma * draftT + verifyT, tok: i, n, acc: a, ctx: ctxNow, bytes: vBytes, draftT, verifyT });
      t += gamma * draftT + verifyT; i += n; rounds++; acc += a;
    }
    const plain = decodeStep(mc, m, q, kv, prompt + ans / 2);
    specInfo = { kind: 'draft', draftT, rounds, perRound: ans / rounds, speedup: (ans / (t - ttft)) * plain.seconds, accRate: acc / (rounds * gamma) };
  }
  const total = t, decodeTime = total - ttft, tps = ans / Math.max(1e-9, decodeTime);
  const mid = decodeStep(mc, m, q, kv, Math.min(ctx, prompt + ans / 2));
  return {
    mc, m, sh, kinds, ctx, prompt, promptFull, truncated: promptFull > room, prefixLen, startAt, segs, firstDecode, load, restore, cold,
    ttft, ttftStart, total, decodeTime, tps, mid, pl, specInfo, newTokens: prompt - startAt, prefill: ttft - ttftStart,
    chunk: segs.find(s => s.k === 'prefill'), bwEff, flopsEff,
    weights: fileGB(m, q), kvRes: kvGB(m, kv, ctx), state: m.stateMB / 1000, buf: buffersGB(m),
  };
}
