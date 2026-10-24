// ===== The machine catalogue: published specs with sources, turned into presets =====
// data/machines.json (baked in as TW_CATALOGUE) holds every machine's spec values (bandwidth, FP16 peak, memory, the
// assumed host of a card), each with a source and a date. The cost model needs effective values: the share of the
// bandwidth a decode step reaches (bwEff), the arithmetic a prefill reaches (tflops) and the fixed cost per layer
// per pass (layerMs). Where they come from is each preset's `estimate`:
//   calibrated  measured on the machine itself (the reference ThinkPad presets); left exactly as they are.
//   family-fit  the factors of its hardware family, fitted to published llama.cpp benchmarks (data/calibration.json,
//               baked in as TW_CALIBRATION, written by tools/fit-families.mjs): bwEff and layerMs as fitted,
//               tflops = computeEff × tflopsSpec (or × compute units where no spec peak is published).
//   assumed     no fit for its family: the presets that existed keep their hand-set values, new ones FAMILY_ASSUMED.
type CatalogueEntry = import('../core/types').CatalogueEntry;
type FamilyFactors = import('../core/types').FamilyFactors;
type FamilyId = import('../core/types').FamilyId;

// The families the fit is done per, by the llama.cpp backend a machine is usually run with. NVIDIA and AMD ROCm are
// split by how their spec peak is stated: a GeForce's tflopsSpec is the half-rate FP32-accumulate figure while
// workstation and datacenter parts state the full rate, and Instinct matrix peaks sit far above what llama.cpp
// reaches on them; one factor per vendor misses one group by 2-4x on prefill. basis: what computeEff multiplies
// (Apple M5 and later publish no FP16 peak and add matrix units per GPU core, so the fit is per core).
const FAMILIES: Record<FamilyId, { label: string; labelEs: string; vendor: string; basis: 'tflopsSpec' | 'units' }> = {
  'apple-metal': { label: 'Apple Metal (M1–M4)', labelEs: 'Apple Metal (M1–M4)', vendor: 'Apple', basis: 'tflopsSpec' },
  'apple-metal-na': { label: 'Apple Metal (M5 and later)', labelEs: 'Apple Metal (M5 y posteriores)', vendor: 'Apple', basis: 'units' },
  'nvidia-cuda': { label: 'NVIDIA CUDA (GeForce, DGX Spark)', labelEs: 'NVIDIA CUDA (GeForce, DGX Spark)', vendor: 'NVIDIA', basis: 'tflopsSpec' },
  'nvidia-cuda-pro': { label: 'NVIDIA CUDA (workstation, datacenter)', labelEs: 'NVIDIA CUDA (estación de trabajo, centro de datos)', vendor: 'NVIDIA', basis: 'tflopsSpec' },
  'amd-rocm': { label: 'AMD ROCm (Radeon, Ryzen AI)', labelEs: 'AMD ROCm (Radeon, Ryzen AI)', vendor: 'AMD', basis: 'tflopsSpec' },
  'amd-rocm-instinct': { label: 'AMD ROCm (Instinct)', labelEs: 'AMD ROCm (Instinct)', vendor: 'AMD', basis: 'tflopsSpec' },
  'amd-vulkan': { label: 'AMD Vulkan', labelEs: 'AMD Vulkan', vendor: 'AMD', basis: 'tflopsSpec' },
  'intel': { label: 'Intel SYCL / Vulkan', labelEs: 'Intel SYCL / Vulkan', vendor: 'Intel', basis: 'tflopsSpec' },
  'cpu': { label: 'CPU only', labelEs: 'Solo CPU', vendor: 'CPU', basis: 'tflopsSpec' },
};
// Used only for a family the fit has no rows for.
const FAMILY_ASSUMED: FamilyFactors = { bwEff: 0.55, computeEff: 0.15, basis: 'tflopsSpec', layerMs: 0.05 };
const FAMILY_CAL: Record<string, FamilyFactors> = typeof TW_CALIBRATION !== 'undefined' && TW_CALIBRATION && TW_CALIBRATION.families ? TW_CALIBRATION.families : {};
const CATALOGUE: CatalogueEntry[] = typeof TW_CATALOGUE !== 'undefined' && TW_CATALOGUE && Array.isArray(TW_CATALOGUE.machines) ? TW_CATALOGUE.machines : [];

// Effective factors of a catalogue entry from its family's fit (or the assumed ones).
function effectiveOf(e: { tflopsSpec: number | null; units: number }, f: FamilyFactors) {
  const ref = f.basis === 'units' ? e.units : e.tflopsSpec;
  const tflops = ref != null ? ref * f.computeEff : e.units * 0.1;
  return { bwEff: f.bwEff, tflops: Math.round(tflops * 1000) / 1000, layerMs: f.layerMs, ...(f.moeLayerMs ? { moeLayerMs: f.moeLayerMs } : {}), ...(f.moeComputeEff ? { moeComputeEff: f.moeComputeEff } : {}) };
}

for (const e of CATALOGUE) {
  const spec = { specId: e.researchId || e.id, vendor: e.vendor, family: e.family, bwSpec: e.bwSpec, tflopsSpec: e.tflopsSpec, sources: e.sources, asOf: e.asOf, priceUSD: e.priceUSD };
  const p = MACHINES[e.id], fit = FAMILY_CAL[e.family];
  if (p && !p.est) Object.assign(p, spec, { estimate: 'calibrated' });
  else if (p) Object.assign(p, spec, fit ? { ...effectiveOf(e, fit), estimate: 'family-fit' } : { estimate: 'assumed' });
  else {
    MACHINES[e.id] = {
      name: e.name, short: e.short, kind: e.kind, ramGB: e.ramGB, fastGB: e.fastGB, bw: e.bwSpec,
      ...effectiveOf(e, fit || { ...FAMILY_ASSUMED, basis: FAMILIES[e.family].basis, computeEff: FAMILIES[e.family].basis === 'units' ? 0.1 : FAMILY_ASSUMED.computeEff }),
      hostBw: e.hostBw, linkBw: e.linkBw, cores: e.cores, units: e.units, unitName: e.unitName, est: true,
      ...spec, estimate: fit ? 'family-fit' : 'assumed',
    };
  }
  if (e.bus && !BUS[e.id]) BUS[e.id] = e.bus;
}

// ===== Reference models: a model preset from a published configuration (data/ref-models.json) =====
// Weights are counted from the dimensions: attention (q, k, v, output), a gated MLP (three matrices) or the router
// and experts, the embedding table and, unless tied, the output head. Read per token is everything but the
// embedding table and the experts a token skips; the head (or the tied table used as one) is read.
function modelFromConfig(key: string, c: any): { model: ModelSpec; shapes: LayerShapes } {
  const h = c.hidden, q = c.qHeads * c.headDim, kvw = c.kvHeads * c.headDim, moe = (c.experts || 0) > 0;
  const attn = h * q + 2 * h * kvw + q * h, mlp = moe ? 0 : 3 * h * c.ffn;
  const one = moe ? 3 * h * c.expertFfn : 0, shared = moe ? (c.sharedExperts || 0) * 3 * h * (c.sharedFfn || c.expertFfn) : 0, router = moe ? h * c.experts : 0;
  const stored = attn + mlp + router + one * (c.experts || 0) + shared, read = attn + mlp + router + one * (c.expertsUsed || 0) + shared;
  const table = c.vocab * h, total = c.layers * stored + table + (c.tied ? 0 : table), readParams = c.layers * read + table;
  const model: ModelSpec = {
    name: c.name, tag: key, moe, total, readParams, layers: c.layers, kvLayers: c.layers, qHeads: c.qHeads, kvHeads: c.kvHeads, headDim: c.headDim,
    hidden: h, vocab: c.vocab, experts: c.experts || 0, expertsUsed: c.expertsUsed || 0, sharedExperts: c.sharedExperts || 0, expertParams: one,
    ctxMax: c.ctxMax, stateMB: 0, measured: false, mtp: 0, source: c.source,
  };
  const shapes: LayerShapes = { attn: [['attn_q', h, q], ['attn_k', h, kvw], ['attn_v', h, kvw], ['attn_output', q, h]] };
  if (moe) { shapes.router = ['ffn_gate_inp', h, c.experts]; shapes.expert = [['ffn_gate', h, c.expertFfn], ['ffn_up', h, c.expertFfn], ['ffn_down', c.expertFfn, h]]; }
  else shapes.mlp = [['ffn_gate', h, c.ffn], ['ffn_up', h, c.ffn], ['ffn_down', c.ffn, h]];
  return { model, shapes };
}
