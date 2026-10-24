// Published benchmarks against the cost model: which rows it can represent, what it predicts for them, and the
// per-family fit of its effective factors. Shared by tools/fit-families.mjs and tools/accuracy.mjs.
//
// A benchmark row (data/benchmarks.json) becomes up to two observations, pp (prompt processing, tokens/s over a
// pp-token prompt from an empty context) and tg (generation, tokens/s over tg tokens). An observation is used when
// its hardware is a catalogue machine or a bench-only one (data/bench-hardware.json), its model is a preset or a
// reference model (data/ref-models.json), its bytes are known (the file size, or a preset weight format), it ran on
// llama.cpp at batch 1 with a backend of one of the families, and nothing in its notes makes it a different test.
// Of observations that measure the same thing (machine, family, model, file, test), only the newest build is kept
// (flash attention on, on a tie); the rest are recorded as superseded.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadModel, PURE_PARTS } from './load-model.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const readJson = f => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));

// Hardware as the rows name it -> machine id, with an override of the preset where the row's hardware differs.
export const HARDWARE = {
  'Apple M1 (8-core GPU, 68 GB/s)': ['m1'],
  'Apple M1 Pro (16-core GPU, 200 GB/s)': ['m1pro'], 'Apple M1 Pro (32 GB)': ['m1pro', null, 'GPU core count not stated; the 16-core preset'],
  'Apple M1 Max (32-core GPU, 400 GB/s)': ['m1max'], 'Apple M1 Max (64 GB)': ['m1max', null, 'GPU core count not stated; the 32-core preset'],
  'Apple M1 Ultra (64-core GPU, 800 GB/s)': ['m1ultra'],
  'Apple M2 Ultra (76-core GPU, 800 GB/s)': ['m2ultra'], 'Apple M2 Ultra (76-core GPU, 192 GB)': ['m2ultra'], 'Apple M2 Ultra (76-core GPU, 192 GB, Mac Studio)': ['m2ultra'],
  'Apple M3 Max (40-core GPU, 400 GB/s)': ['m3max40'], 'Apple M3 Ultra (80-core GPU, 512 GB)': ['m3ultra512'],
  'Apple M4 (10-core GPU, 120 GB/s)': ['m4'], 'Apple M4 (10-core, 24 GB, Mac mini)': ['m4'],
  'Apple M4 Pro (20-core GPU, 273 GB/s)': ['m4pro'],
  'Apple M4 Max (40-core GPU, 546 GB/s)': ['m4max'], 'Apple M4 Max (40-core GPU, 128 GB)': ['m4max'],
  'Apple M4 Max (36 GB)': ['m4max32', null, 'the 36 GB configuration ships with the 32-core GPU'], 'Apple M4 Max (32-core GPU, 36 GB, Mac Studio)': ['m4max32'],
  'Apple M5 Pro (20-core GPU, 307 GB/s)': ['m5pro'], 'Apple M5 Max (40-core GPU, 614 GB/s)': ['m5max'], 'Apple M5 Ultra (80-core GPU, 1228 GB/s)': ['m5ultra'],
  'Apple M6 (8-core GPU, 170 GB/s)': ['m6', { units: 8 }, 'the row names an 8-core GPU; the preset has 12 cores'],
  'NVIDIA RTX 5090': ['rtx5090'], 'NVIDIA RTX 5090 (32 GB)': ['rtx5090'],
  'NVIDIA RTX PRO 6000 Blackwell': ['rtxpro6000'], 'NVIDIA RTX PRO 6000 Blackwell Workstation (96 GB)': ['rtxpro6000'],
  'NVIDIA A100 80GB': ['a100_80', null, 'SXM or PCIe not stated: the SXM preset (2039 GB/s; PCIe has 1935)'],
  'NVIDIA RTX 4090': ['rtx4090'], 'NVIDIA RTX 4090 (24 GB)': ['rtx4090'], 'NVIDIA RTX 5080': ['rtx5080'], 'NVIDIA RTX 5070 Ti': ['rtx5070ti'],
  'NVIDIA RTX 3090': ['rtx3090'], 'NVIDIA RTX 3090 (24 GB)': ['rtx3090'], 'NVIDIA RTX 3090 (1 of 4, PCIe 3.0 x16, X99)': ['rtx3090', null, 'one card of a four-card box, run alone (--device cuda0)'],
  'NVIDIA RTX 3060': ['rtx3060'], 'NVIDIA RTX 4060 Ti 8GB': ['rtx4060ti16', { fastGB: 8 }, 'the 8 GB variant of the 16 GB preset: same chip and bandwidth'],
  'NVIDIA RTX 5060 Ti': ['rtx5060ti16', null, 'VRAM not stated; same bandwidth either way'], 'NVIDIA RTX 5060 Ti (16 GB)': ['rtx5060ti16'],
  'NVIDIA DGX Spark (GB10)': ['dgxSpark'], 'NVIDIA DGX Spark (GB10, 128 GB LPDDR5x)': ['dgxSpark'],
  'NVIDIA Tesla V100': ['v100sxm2', null, 'variant not stated (32 GB HBM2): the SXM2 row'], 'NVIDIA Tesla V100-SXM2-32GB': ['v100sxm2'], 'NVIDIA Tesla V100-PCIE-16GB': ['v100pcie'],
  'NVIDIA Tesla T4': ['t4'],
  'AMD Radeon RX 7900 XTX': ['rx7900xtx'], 'AMD Radeon RX 7900 XT (20 GB)': ['rx7900xt'], 'AMD Radeon RX 9070 XT': ['rx9070xt'],
  'AMD Radeon AI Pro R9700': ['r9700'], 'AMD Radeon AI PRO R9700': ['r9700'], 'AMD Radeon AI PRO R9700 (Gigabyte, 32 GB)': ['r9700'],
  'AMD Instinct MI300X': ['mi300x'], 'AMD Instinct MI100': ['mi100'],
  'AMD Ryzen AI Max+ 300 series (Radeon 8060S iGPU)': ['strixHalo'], 'AMD Ryzen AI Max+ 395 (iGPU)': ['strixHalo'], 'AMD Radeon 8060S (Strix Halo iGPU)': ['strixHalo'],
  'AMD Ryzen AI Max+ 395 / Radeon 8060S (128 GB)': ['strixHalo'], 'AMD Ryzen AI Max+ 395 / Radeon 8060S (thread context, Framework)': ['strixHalo', null, 'hardware inferred from the thread'],
  'AMD Strix Halo (Ryzen AI Max+, Fedora 43)': ['strixHalo'],
  'AMD Ryzen AI Max+ 395 CPU (16C Zen 5, LPDDR5x)': ['strix395cpu'],
  'Intel Arc B580': ['arcB580'], 'Intel Arc B580 LE (host Core Ultra 5 250K, CachyOS)': ['arcB580'],
  'Intel Arc A770': ['arcA770'], 'Intel Arc A770 (host i7-13700K, Ubuntu 24.04)': ['arcA770'], 'Intel Arc A770 (host Core Ultra 5 245KF, Debian 13)': ['arcA770'],
  'Intel Arc Graphics iGPU (Lunar Lake) (host Core Ultra 7 258V, Ubuntu 26.04)': ['lunarLake'],
  'AMD Ryzen 9 9900X (4x DIMM DDR5-3600)': ['r9900x3600'], 'AMD Ryzen 9 3950X (DDR4-3600 dual channel)': ['r3950x3600'],
};
// Why hardware that appears in the rows is left out.
export const HARDWARE_OUT = [
  [/H100 80GB/, 'SXM or PCIe not stated (3350 vs 2000 GB/s)'],
  [/Max-Q/, 'power-limited Max-Q variant'],
  [/x2\b|MI100 x2/, 'two GPUs'],
  [/Framework Desktop pre-prod/, 'a best-of-backends summary table, not raw llama-bench output'],
  [/Parallels|VM\)/, 'runs in a virtual machine'],
];

// Model names as the rows give them -> preset or reference model.
export const MODEL_OF = [
  [/^Llama 2 7B$/, 'llama2-7b'], [/^gpt-oss-20b$/, 'gpt-oss-20b'], [/^gpt-oss-120b$/, 'gpt-oss-120b'],
  [/^(Qwen3-Coder-30B-A3B-Instruct|Qwen3 30B-A3B( Instruct)?)$/, 'qwen3-30b-a3b'], [/^Qwen2\.5-Coder[- ]7B$/, 'qwen2.5-7b'],
  [/^Llama 3\.1 70B Instruct$/, 'llama3.1-70b'], [/^Gemma 3 27B it \(QAT\)$/, 'gemma3-27b'], [/^Qwen3 14B$/, 'qwen3-14b'], [/^Qwen3 32B$/, 'qwen3-32b'],
  [/^Qwen2\.5 14B$/, 'qwen2.5-14b'], [/^Qwen3-8B$/, 'qwen3-8b'], [/^(Llama 3\.1 8B|Llama-3\.1-Tulu-3-8B)$/, 'llama8b'],
];

// The family a row's numbers belong to: its backend, and for Metal the machine's generation.
export function familyOfRow(r, entry) {
  const b = r.backend || '';
  if (b === 'Metal') return entry.family;
  if (/^CUDA$/.test(b)) return entry.family === 'nvidia-cuda-pro' ? 'nvidia-cuda-pro' : 'nvidia-cuda';
  if (/^ROCm \(HIP\)$/.test(b)) return entry.family === 'amd-rocm-instinct' ? 'amd-rocm-instinct' : 'amd-rocm';
  if (/^SYCL/.test(b)) return 'intel';
  if (b === 'Vulkan') return entry.vendor === 'AMD' ? 'amd-vulkan' : entry.vendor === 'Intel' ? 'intel' : null;
  if (/^CPU/.test(b)) return 'cpu';
  return null;
}
const UNIT = { GiB: 1.073741824, GB: 1, MiB: 1.073741824 / 1024 };
const isoDate = d => (/^\d{4}-\d{2}(-\d{2})?$/.test(d || '') ? (d.length === 7 ? d + '-01' : d) : null);
// Builds before 2025 are "old": they are the only rows for many Apple chips (the 2023 build the Metal thread pins),
// and the same hardware decodes up to a third faster on 2026 builds. A family with old rows gets a build term in the
// fit (one multiplier for old pp, one for old tg), so its factors describe current builds; the M2 Ultra, measured on
// both, is what pins it. A row with no usable date counts half.
export const OLD_BEFORE = '2025-01-01';
export const weightOf = date => (date ? 1 : 0.5);
// Rows whose own source doubts them.
export const SUSPECT = [[/check host\/driver/, 'the source flags its tg as suspect (host or driver)']];

export async function benchContext({ calibration = null, benchmarks, machines, benchHardware, refModels } = {}) {
  const M = await loadModel(PURE_PARTS, { calibration });
  const cat = machines || readJson('data/machines.json'), bh = benchHardware || readJson('data/bench-hardware.json');
  const entries = Object.fromEntries([...cat.machines, ...bh.machines].map(e => [e.id, e]));
  const ref = refModels || readJson('data/ref-models.json');
  const models = { ...M.MODELS }, shapes = { ...M.SHAPES };
  for (const [k, c] of Object.entries(ref.models)) { const r = M.modelFromConfig(k, c); models[k] = r.model; shapes[k] = r.shapes; }
  return { M, entries, catalogue: cat, data: { models, shapes }, benchmarks: benchmarks || readJson('data/benchmarks.json'), refModels: ref };
}

// Every row as observations, each used or left out with a reason.
export function observations(ctx, { dedupe = true } = {}) {
  const { M, entries, data } = ctx, rows = ctx.benchmarks.rows, used = [], out = [];
  // a file size known from another row with the same model and label (the SYCL rows print none)
  const sizeOf = {};
  for (const r of rows) if (r.fileGB && UNIT[r.fileUnit]) { const mk = (MODEL_OF.find(([re]) => re.test(r.model)) || [])[1]; if (mk) sizeOf[`${mk}|${r.quant}`] ??= r.fileGB * UNIT[r.fileUnit]; }
  for (const r of rows) {
    const skip = reason => { for (const kind of ['pp', 'tg']) if (r[kind] && r[kind].tps) out.push({ id: `${r.id}:${kind}`, row: r.id, kind, reason }); };
    if (r.engine !== 'llama.cpp') { skip(`engine ${r.engine}`); continue; }
    if ((r.batch || 1) !== 1) { skip(`batch ${r.batch}: an aggregate over parallel streams`); continue; }
    if (/batched-bench/.test(r.notes || '')) { skip('llama-batched-bench: tg after a deep prompt, another protocol'); continue; }
    const sus = SUSPECT.find(([re]) => re.test(r.notes || '')); if (sus) { skip(sus[1]); continue; }
    const hw = HARDWARE[r.hardware];
    if (!hw) { const o = HARDWARE_OUT.find(([re]) => re.test(r.hardware)); skip(o ? o[1] : 'hardware not in the catalogue'); continue; }
    if (hw[0] === 'thinkpad' || hw[0] === 'thinkpadCpu') throw new Error('the reference ThinkPad is calibrated on its own runs, never fitted');
    const entry = { ...entries[hw[0]], ...(hw[1] || {}) }, family = familyOfRow(r, entry);
    if (!family) { skip(`backend ${r.backend} on ${entry.vendor}: outside the fitted families`); continue; }
    const mk = (MODEL_OF.find(([re]) => re.test(r.model)) || [])[1];
    if (!mk) { skip(`model ${r.model}: no configuration to represent it`); continue; }
    const m = data.models[mk];
    let bytes = null, bytesFrom = null;
    if (r.fileGB && UNIT[r.fileUnit]) { bytes = r.fileGB * UNIT[r.fileUnit]; bytesFrom = `file ${r.fileGB} ${r.fileUnit}`; }
    else if (sizeOf[`${mk}|${r.quant}`]) { bytes = sizeOf[`${mk}|${r.quant}`]; bytesFrom = `file size of the same model and label in another row`; }
    else if (M.QUANTS[r.quant]) { bytes = (m.total * M.QUANTS[r.quant].bpw) / 8 / 1e9; bytesFrom = `${r.quant} at ${M.QUANTS[r.quant].bpw} bits`; }
    if (!bytes) { skip(`weight format ${r.quant}: bytes unknown`); continue; }
    // MXFP4 files keep the routed experts at 4.25 bits; the rest of the file (attention, embeddings, router) is wider
    const mx = /MXFP4/.test(r.quant) && m.moe, routed = m.experts * m.expertParams * m.layers;
    const bpw = mx ? { bpw: (bytes * 8e9 - routed * 4.25) / (m.total - routed), expertBpw: 4.25 } : (bytes * 8e9) / m.total;
    const pl = M.placement({ ...entry, bw: entry.bwSpec }, m, bpw);
    if (!pl.fits) { skip(`${(bytes).toFixed(1)} GB does not fit the preset's ${entry.fastGB} GB of fast memory`); continue; }
    const date = isoDate(r.date), ub = r.ubatch || 512;
    for (const kind of ['pp', 'tg']) {
      const t = r[kind]; if (!t || !t.tps) continue;
      const base = { id: `${r.id}:${kind}`, row: r.id, kind };
      if (kind === 'pp' && /fp32 build/.test(r.backend)) { out.push({ ...base, reason: 'SYCL fp32 build: about a third of the fp16 build\'s prompt speed, a build option' }); continue; }
      if (kind === 'pp' && t.tokens > m.ctxMax) { out.push({ ...base, reason: 'prompt longer than the model context' }); continue; }
      used.push({ ...base, machine: hw[0], mapNote: hw[2] || null, entry, family, model: mk, bpw, bytesGB: bytes, bytesFrom: mx ? `${bytesFrom}, experts at 4.25 bits` : bytesFrom, tokens: t.tokens, published: t.tps,
        ub, fa: r.flashAttention, date, old: !!date && date < OLD_BEFORE, build: r.engineVersion, weight: weightOf(date), hardware: r.hardware, backend: r.backend, source: r.sourceUrl, quant: r.quant, modelName: r.model });
    }
  }
  // the newest build of each measurement (flash attention on, on a tie)
  if (!dedupe) return { obs: used, out, superseded: [] };
  const best = new Map(), superseded = [];
  const key = o => [o.machine, o.family, o.backend, o.model, JSON.stringify(o.bpw), o.kind, o.tokens, o.ub, o.old].join('|');
  const better = (a, b) => ((a.date || '') !== (b.date || '') ? (a.date || '') > (b.date || '') : (a.fa === 1) !== (b.fa === 1) ? a.fa === 1 : false);
  for (const o of used) { const k = key(o), cur = best.get(k); if (!cur) best.set(k, o); else if (better(o, cur)) { superseded.push({ id: cur.id, by: o.id, reason: 'superseded by a newer build or flash attention on' }); best.set(k, o); } else superseded.push({ id: o.id, by: cur.id, reason: 'superseded by a newer build or flash attention on' }); }
  return { obs: [...best.values()], out, superseded };
}

// The machine one family's factors make of a catalogue entry (what 01c-catalogue.ts does for a preset).
export function fitMachine(entry, f) {
  const ref = f.basis === 'units' ? entry.units : entry.tflopsSpec;
  return { name: entry.name, short: entry.short, kind: entry.kind, ramGB: entry.ramGB, fastGB: entry.fastGB, bw: entry.bwSpec, bwEff: f.bwEff, tflops: (ref || 0) * f.computeEff,
    layerMs: f.layerMs, ...(f.moeLayerMs ? { moeLayerMs: f.moeLayerMs, moeComputeEff: f.moeComputeEff } : {}), hostBw: entry.hostBw, linkBw: entry.linkBw, cores: entry.cores, units: entry.units, unitName: entry.unitName, est: true };
}
// What the model predicts for one observation, tokens/s: llama-bench's pp (a prompt from an empty context) or tg
// (tokens generated from an empty context), plain decoding, f16 KV.
export function predict(ctx, o, f) {
  const { M, data } = ctx, m = data.models[o.model];
  const cfg = { machine: fitMachine(o.entry, f), model: o.model, quant: o.bpw, kv: 'f16', ctxTokens: m.ctxMax, systemTokens: 0, docsTokens: 0, temperature: 0,
    prefixCached: false, diskCache: false, cold: false, mtp: false, speculative: null, ubatchTokens: o.ub };
  if (o.kind === 'pp') { const r = M.estimate({ ...cfg, questionTokens: o.tokens, answerTokens: 0 }, data); return o.tokens / r.prefill; }
  return M.estimate({ ...cfg, questionTokens: 0, answerTokens: o.tokens }, data).tps;
}

// ---- The fit: least squares on log error, per family ----
// Parameters in log space: bwEff (capped at 1), computeEff, layerMs. A weak pull towards PRIOR keeps a parameter the
// rows cannot pin down (no prefill rows, say) where it would otherwise drift; it moves an identified one by far
// less than its error.
export const PRIOR = { bwEff: 0.6, computeEff: 0.3, computeEffUnits: 0.5, layerMs: 0.02, moeLayerMs: 0.02, moeComputeEff: 0.75, weight: 0.0002 };
// x: log bwEff (capped at 1), log computeEff, log layerMs; with MoE and dense rows log moeLayerMs and log
// moeComputeEff; with old and new rows log multipliers for old pp and old tg.
const layout = (moe, build) => ({ moe: moe ? 3 : -1, old: build ? 3 + (moe ? 2 : 0) : -1, n: 3 + (moe ? 2 : 0) + (build ? 2 : 0) });
const toF = (x, basis, L) => ({ bwEff: Math.min(1, Math.exp(x[0])), computeEff: Math.exp(x[1]), basis, layerMs: Math.exp(x[2]),
  ...(L.moe >= 0 ? { moeLayerMs: Math.exp(x[L.moe]), moeComputeEff: Math.min(1.5, Math.exp(x[L.moe + 1])) } : {}), ...(L.old >= 0 ? { oldBuild: { pp: Math.exp(x[L.old]), tg: Math.exp(x[L.old + 1]) } } : {}) });
// The prediction for an observation under fitted factors, the build term included.
export const predictFit = (ctx, o, f) => predict(ctx, o, f) * (o.old && f.oldBuild ? f.oldBuild[o.kind] : 1);
export function loss(ctx, obs, f) {
  let s = 0, w = 0;
  for (const o of obs) { const e = Math.log(predictFit(ctx, o, f) / o.published); s += o.weight * e * e; w += o.weight; }
  return w ? s / w : 0;
}
function nelderMead(fn, x0, { step = 0.7, iters = 400, tol = 1e-9 } = {}) {
  const n = x0.length; let pts = [x0, ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step : 0)))].map(x => ({ x, f: fn(x) }));
  for (let it = 0; it < iters * n; it++) {
    pts.sort((a, b) => a.f - b.f);
    if (Math.abs(pts[n].f - pts[0].f) < tol) break;
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i].x[j] / n;
    const at = t => c.map((v, j) => v + t * (pts[n].x[j] - v)), r = at(-1), fr = fn(r);
    if (fr < pts[0].f) { const e = at(-2), fe = fn(e); pts[n] = fe < fr ? { x: e, f: fe } : { x: r, f: fr }; }
    else if (fr < pts[n - 1].f) pts[n] = { x: r, f: fr };
    else {
      const k = at(fr < pts[n].f ? -0.5 : 0.5), fk = fn(k);
      if (fk < Math.min(fr, pts[n].f)) pts[n] = { x: k, f: fk };
      else for (let i = 1; i <= n; i++) { const x = pts[i].x.map((v, j) => pts[0].x[j] + 0.5 * (v - pts[0].x[j])); pts[i] = { x, f: fn(x) }; }
    }
  }
  pts.sort((a, b) => a.f - b.f); return pts[0];
}
export function fitFamily(ctx, obs, basis = 'tflopsSpec', { starts = null } = {}) {
  const isMoe = o => ctx.data.models[o.model].moe;
  const L = layout(obs.some(isMoe) && obs.some(o => !isMoe(o)), obs.some(o => o.old) && obs.some(o => !o.old));
  const prior = [Math.log(PRIOR.bwEff), Math.log(basis === 'units' ? PRIOR.computeEffUnits : PRIOR.computeEff), Math.log(PRIOR.layerMs)];
  if (L.moe >= 0) { prior[L.moe] = Math.log(PRIOR.moeLayerMs); prior[L.moe + 1] = Math.log(PRIOR.moeComputeEff); }
  if (L.old >= 0) prior[L.old] = prior[L.old + 1] = 0;
  const fn = x => loss(ctx, obs, toF(x, basis, L)) + PRIOR.weight * x.reduce((s, v, i) => s + (v - prior[i]) ** 2, 0);
  // starts: a grid over the three main factors, the others at their prior; or given (the full fit, for the cross-validation)
  const grid = starts ? starts.map(f => fromF(f, L, prior))
    : [[0.35, 0.7], [0.08, 0.6], [0.004, 0.08]].reduce((acc, vals) => acc.flatMap(a => vals.map(v => [...a, v])), [[]]).map(p => prior.map((v, i) => (i < 3 ? Math.log(p[i]) : v)));
  let best = null;
  for (const s of grid) { const r = nelderMead(fn, s); if (!best || r.f < best.f) best = r; }
  const polished = nelderMead(fn, best.x, { step: 0.1 });
  return { factors: toF(polished.x, basis, L), objective: polished.f };
}
// Factors back into a start vector for a layout (missing ones at the prior).
function fromF(f, L, prior) {
  const x = [...prior]; x[0] = Math.log(f.bwEff); x[1] = Math.log(f.computeEff); x[2] = Math.log(f.layerMs);
  if (L.moe >= 0 && f.moeLayerMs) { x[L.moe] = Math.log(f.moeLayerMs); x[L.moe + 1] = Math.log(f.moeComputeEff); }
  if (L.old >= 0 && f.oldBuild) { x[L.old] = Math.log(f.oldBuild.pp); x[L.old + 1] = Math.log(f.oldBuild.tg); }
  return x;
}
// Leave one machine out: fit on the family's other machines, predict the left-out one's rows (current-build
// factors, the build term applied to its old rows). The error a machine with no published numbers would see.
export function crossValidate(ctx, obs, basis, start) {
  const out = [], machines = [...new Set(obs.map(o => o.machine))];
  if (machines.length < 3) return { machines: machines.length, rows: [] };
  for (const mk of machines) {
    const train = obs.filter(o => o.machine !== mk), test = obs.filter(o => o.machine === mk);
    const { factors } = fitFamily(ctx, train, basis, { starts: [start] });
    for (const o of test) { const est = predictFit(ctx, o, factors); out.push({ id: o.id, machine: mk, kind: o.kind, published: o.published, estimate: est, errorPct: (est / o.published - 1) * 100 }); }
  }
  return { machines: machines.length, rows: out };
}
export const median = xs => { const a = [...xs].sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
export { ROOT };
