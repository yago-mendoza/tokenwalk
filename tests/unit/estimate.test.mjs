import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModel, PURE_PARTS } from './load.mjs';

// estimate(config, data) is the cost model with no state: these check it gives exactly what compute() gave before
// the refactor (tests/unit/legacy, verbatim), and that it reads nothing but its arguments.
// The comparison runs on the catalogue without the fitted calibration: the legacy function has no MoE layer term
// (moeLayerMs, which a family fit may add), so it is the refactor, not the later calibration, that is compared.
const parts = PURE_PARTS;
const M = await loadModel(parts, { extra: ['tests/unit/legacy/compute-94424a6.ts'], calibration: null });

// The Setup's defaults (03-state.ts, defaults()) on a machine preset.
const base = mk => ({
  machine: mk, model: 'qwen36', quant: 'Q4_K_M', kv: 'f16', ctx: 16384, sys: 800, docs: 6500 - 800 - 50, q: 50, ans: 300,
  temp: 0.7, topk: 6, topp: 0.95, seed: 1, cached: false, cold: false, disk: false, spec: false, mtp: true, gamma: 4, alpha: 0.7, keepalive: 5,
  ...M.machineFields(mk),
});
// A few requests that between them take every branch: MTP, plain decode, a separate draft model, cold load, KV
// restore from disk, a cached prefix, truncation at num_ctx, keep_alive unloading, a live calibration and overrides.
const REQUESTS = [
  { name: 'defaults', set: {}, keep: false, calib: {} },
  { name: 'short, no MTP, q8_0 KV', set: { sys: 0, docs: 0, q: 50, ans: 40, mtp: false, kv: 'q8_0' }, keep: false, calib: {} },
  { name: 'long, cached prefix, q4_0 KV, T 0', set: { docs: 120000, ctx: 131072, cached: true, ans: 100, kv: 'q4_0', temp: 0 }, keep: false, calib: {} },
  { name: 'draft model, cold', set: { spec: true, gamma: 5, alpha: 0.8, cold: true, ans: 120 }, keep: false, calib: {} },
  { name: 'KV from disk, unloaded, T 1.4, truncated', set: { disk: true, temp: 1.4, ctx: 2048, docs: 4000 }, keep: true, calib: {} },
  { name: 'calibrated, overrides', set: { ram: 32, tflops: 3.3, mts: 6400, bus: 256, vram: 12, vbw: 700, ans: 60 }, keep: false, calib: mk => ({ [mk]: { bw: 0.8, fl: 1.7 } }) },
];

test('estimate() gives exactly what compute() gave, for every machine, model, weight format and request', () => {
  let n = 0;
  for (const mk of Object.keys(M.MACHINES)) for (const mo of Object.keys(M.MODELS)) for (const q of Object.keys(M.QUANTS)) for (const r of REQUESTS) {
    const S = { ...base(mk), model: mo, quant: q, ...r.set }, KEEP = { idle: 0, unloaded: r.keep }, CALIB = typeof r.calib === 'function' ? r.calib(mk) : r.calib;
    const old = M.legacyCompute(S, KEEP, CALIB);
    const now = M.estimate(M.configFromState(S, { unloaded: KEEP.unloaded, calib: CALIB, machines: M.MACHINES }), { models: M.MODELS, shapes: M.SHAPES });
    assert.deepStrictEqual(now, old, `${mk} · ${mo} · ${q} · ${r.name}`);
    n++;
  }
  assert.ok(n >= 7 * 4 * 5 * REQUESTS.length, `only ${n} combinations`);
});

test('estimate() reads nothing but its arguments: no app state, no DOM, inputs untouched, same answer twice', async () => {
  const touched = [];
  const trap = name => ({ get() { touched.push(name); throw new Error(`estimate read ${name}`); }, configurable: true });
  const globals = {};
  for (const g of ['S', 'UI', 'LIVE', 'R', 'P', 'KEEP', 'CALIB', 'document', 'window', 'localStorage', 'navigator', 'location']) Object.defineProperty(globals, g, trap(g));
  const P = await loadModel(parts, { globals });
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
  const data = deepFreeze({ models: structuredClone(P.MODELS), shapes: structuredClone(P.SHAPES) });
  for (const mk of Object.keys(P.MACHINES)) for (const r of REQUESTS) {
    const st = { ...base(mk), ...r.set };
    const fields = { ram: st.ram, tflops: st.tflops, mts: st.mts, bus: st.bus, vram: st.vram, vbw: st.vbw };
    const cfg = deepFreeze({
      machine: P.resolveMachine(structuredClone(P.MACHINES[mk]), fields, null), model: 'qwen36', quant: 'Q4_K_M', kv: st.kv, ctxTokens: st.ctx,
      systemTokens: st.sys, docsTokens: st.docs, questionTokens: st.q, answerTokens: st.ans, temperature: st.temp,
      prefixCached: st.cached, diskCache: st.disk, cold: st.cold, mtp: st.mtp, speculative: st.spec ? { gamma: st.gamma, alpha: st.alpha } : null,
    });
    const a = P.estimate(cfg, data), b = P.estimate(cfg, data);
    assert.deepStrictEqual(a, b, `${mk} ${r.name}: not deterministic`);
    assert.ok(a.total > 0 && a.tps > 0, `${mk} ${r.name}: no result`);
  }
  assert.deepStrictEqual(touched, []);
});

test('a weight format can be given as bits per weight: the preset number gives the preset result', () => {
  const S = base('rtx4090'), cfg = M.configFromState(S, { unloaded: false, calib: {}, machines: M.MACHINES }), data = { models: M.MODELS, shapes: M.SHAPES };
  const byName = M.estimate(cfg, data), byBits = M.estimate({ ...cfg, quant: M.QUANTS.Q4_K_M.bpw }, data);
  assert.equal(byBits.ttft, byName.ttft); assert.equal(byBits.tps, byName.tps); assert.equal(byBits.weights, byName.weights);
});

test('the micro-batch size changes prefill only, and 512 is the default', () => {
  const S = { ...base('h100'), mtp: false }, cfg = M.configFromState(S, { unloaded: false, calib: {}, machines: M.MACHINES }), data = { models: M.MODELS, shapes: M.SHAPES };
  const d = M.estimate(cfg, data), u512 = M.estimate({ ...cfg, ubatchTokens: 512 }, data), u2k = M.estimate({ ...cfg, ubatchTokens: 2048 }, data);
  assert.equal(u512.ttft, d.ttft);
  assert.ok(u2k.ttft < d.ttft, 'fewer, larger chunks pay the per-pass overhead fewer times');
  assert.equal(u2k.segs.filter(s => s.k === 'prefill').length, Math.ceil(6500 / 2048));
});
