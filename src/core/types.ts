// The cost model's public shapes: what estimate(config, data) takes and returns (src/parts/01e-estimate.ts).
// Units are in the names (GB = 1e9 bytes, GBs = GB per second, Ms = milliseconds, S = seconds) or in the comment.
// These are the types the npm package will export; the app's parts reach them with import('../core/types').

/** A weight format preset (src/parts/01-data.ts, QUANTS). */
export type QuantKey = 'F16' | 'Q8_0' | 'Q6_K' | 'Q4_K_M' | 'Q2_K';
/** A weight format: a preset name, or bits per weight as a number (scales included), e.g. a file's size × 8 / its parameters. */
export type Quant = QuantKey | number;
/** Number format of the KV cache (KV_TYPES). */
export type KvKey = 'f16' | 'q8_0' | 'q4_0';
/** 'unified': CPU and GPU share one memory (APUs, Apple, CPU only). 'discrete': a card with its own VRAM over PCIe. */
export type MachineKind = 'unified' | 'discrete';
/** Where a machine's effective numbers come from: measured on it, fitted to published benchmarks of its family, or assumed. */
export type Provenance = 'calibrated' | 'family-fit' | 'assumed';
/** The hardware families the published-benchmark fit is done per (tools/fit-families.mjs). */
export type FamilyId = 'apple-metal' | 'apple-metal-na' | 'nvidia-cuda' | 'amd-rocm' | 'amd-vulkan' | 'intel' | 'cpu';

export interface PriceUSD {
  /** Launch list price, USD, or null when not verified. */
  msrp: number | null;
  /** A street price, USD, on `date`. */
  street: number | null;
  date: string | null;
  source: string | null;
}

/**
 * A machine as the cost model reads it. The first block is what the formulas use (effective values); the spec block
 * keeps the published numbers they came from, with sources, so the two are never confused.
 */
export interface MachineSpec {
  name: string;
  /** Short label for tables. */
  short: string;
  kind: MachineKind;
  /** System memory, GB (on a card: the assumed host's RAM). */
  ramGB: number;
  /** Memory the accelerator reads at `bw`: VRAM on a card, the usable share of RAM on unified memory. */
  fastGB: number;
  /** GB/s of the memory the weights sit in, theoretical (the spec value). */
  bw: number;
  /** Share of `bw` a decode step reaches (0 to 1). Effective. */
  bwEff: number;
  /** Arithmetic a prefill reaches, TFLOPS. Effective, not the spec peak. */
  tflops: number;
  /** Fixed cost per layer per pass, ms (kernel launches, synchronisation): the per-token overhead that keeps a small
   *  model from reaching the bandwidth ceiling, large on datacenter GPUs. Effective. */
  layerMs: number;
  /** GB/s a card falls back to for weights that do not fit in VRAM (host RAM read by the CPU). */
  hostBw: number;
  /** GB/s of the PCIe link (0 on unified memory). */
  linkBw: number;
  /** CPU cores (of the host, on a card). */
  cores: number;
  /** Compute units of the accelerator, and what they are called (SM, CU, GPU core, Xe-core, core). */
  units: number;
  unitName: string;
  /** True for every machine but the measured reference. */
  est: boolean;
  /** Disk read speed for a cold load, GB/s (default 2). */
  diskGBs?: number;
  /** Set by resolveMachine when a live run's calibration was applied. */
  calibrated?: boolean;

  // ---- catalogue fields (data/machines.json): spec values and where they come from ----
  /** Catalogue id this preset is (the preset key, or the research row it was mapped onto). */
  specId?: string;
  vendor?: 'Apple' | 'NVIDIA' | 'AMD' | 'Intel' | 'CPU';
  /** Hardware family whose fitted factors apply (tools/fit-families.mjs). */
  family?: FamilyId;
  /** Published memory bandwidth, GB/s. */
  bwSpec?: number;
  /** Published dense FP16 matrix peak, TFLOPS (see data/machines.json for each vendor's convention); null when none is published. */
  tflopsSpec?: number | null;
  /** Memory bus: transfer rate MT/s and width in bits (unified memory only), so bw = mts × bits / 8 / 1000. */
  bus?: [number, number];
  /** Field → URL. */
  sources?: Record<string, string>;
  /** Date the spec values were compiled, YYYY-MM-DD. */
  asOf?: string;
  /** Where the effective values (bwEff, tflops, layerMs) come from. */
  estimate?: Provenance;
  priceUSD?: PriceUSD;
  notes?: string;
}

/** A model preset (MODELS). Parameter counts are numbers of weights. */
export interface ModelSpec {
  name: string;
  tag: string;
  moe: boolean;
  /** Every weight in the file. */
  total: number;
  /** Weights read for one generated token: everything but the embedding table and the experts a token skips (output head included). */
  readParams: number;
  layers: number;
  /** Layers that keep keys and values (the rest are linear-attention / DeltaNet layers with a fixed state). */
  kvLayers: number;
  qHeads: number;
  kvHeads: number;
  headDim: number;
  hidden: number;
  vocab: number;
  experts: number;
  expertsUsed: number;
  sharedExperts: number;
  /** Weights of one expert in one layer. */
  expertParams: number;
  /** Longest context, tokens. */
  ctxMax: number;
  /** Fixed recurrent state of the linear-attention layers, MB. */
  stateMB: number;
  /** True when the numbers were read from a GGUF header on disk. */
  measured: boolean;
  /** Multi-token-prediction blocks the file carries (0 or absent: none). */
  mtp?: number;
  live?: boolean;
  /** Where the numbers come from (reference models). */
  source?: string;
}

/** One matrix: [name, inputs, outputs]. */
export type Matrix = [string, number, number];
/** Matrices of one layer by kind. */
export interface LayerShapes {
  attn: Matrix[];
  delta?: Matrix[];
  mlp?: Matrix[];
  router?: Matrix;
  expert?: Matrix[];
  /** Bytes of one linear-attention layer's state. */
  deltaState?: number;
}

/** The tables estimate() looks models up in. The weight and KV formats (QUANTS, KV_TYPES) are constants of the model. */
export interface EstimateData {
  models: Record<string, ModelSpec>;
  /** Layer shapes by model key; a model without an entry gets a generic dense shape. */
  shapes: Record<string, LayerShapes>;
}

/** One request on one machine. Token counts are tokens. */
export interface EstimateConfig {
  /** The effective machine (a preset passed through resolveMachine, or any MachineSpec). */
  machine: MachineSpec;
  /** Key in data.models. */
  model: string;
  quant: Quant;
  kv: KvKey;
  /** num_ctx: the context reserved, tokens (clamped to the model's ctxMax). */
  ctxTokens: number;
  systemTokens: number;
  docsTokens: number;
  questionTokens: number;
  /** Tokens to generate. */
  answerTokens: number;
  /** Sampling temperature: sets the MTP acceptance rate. */
  temperature: number;
  /** The system + docs prefix is already in the KV cache (prompt caching). */
  prefixCached: boolean;
  /** The prefix's KV is restored from disk instead of recomputed (when not cached). */
  diskCache: boolean;
  /** The weights are loaded from disk first (cold start, or unloaded by keep_alive). */
  cold: boolean;
  /** Draft with the model's own MTP block (when it has one and no separate draft model is used). */
  mtp: boolean;
  /** Speculative decoding with a separate 0.6B draft model: gamma tokens drafted per round, each accepted with alpha; null: off. */
  speculative: { gamma: number; alpha: number } | null;
  /** Prefill micro-batch, tokens (llama.cpp -ub; default 512). */
  ubatchTokens?: number;
}

/** A stretch of the request's timeline. `a` start and `d` duration, seconds. */
export interface Segment {
  k: 'load' | 'restore' | 'prefill' | 'decode' | 'round';
  a: number;
  d: number;
  /** prefill: token range [from, to), chunk index i of n; mem/matmul/attn the three costs, s; bytes read, GB. */
  from?: number; to?: number; i?: number; n?: number;
  mem?: number; matmul?: number; attn?: number; bytes?: number;
  /** decode / round: first token index, context length, tokens accepted (round), draft and verify time, s. */
  tok?: number; ctx?: number; acc?: number; draftT?: number; verifyT?: number; mtp?: boolean;
  [key: string]: any;
}

/** Decode step at one context length. */
export interface DecodeStep {
  /** Seconds per generated token. */
  seconds: number;
  /** Bytes read per token, GB. */
  bytesGB: number;
  /** Bandwidth ceiling, tokens/s (bw / bytes). */
  ceiling: number;
  /** Share of the weights in fast memory. */
  fastShare: number;
}

export interface Placement {
  weightsGB: number;
  /** Share of the weights in fast memory (VRAM on a card). */
  fastShare: number;
  /** The weights fit in fast memory (1.5 GB kept free). */
  fits: boolean;
  /** Weights plus the system's apps fit in RAM. */
  ramFits: boolean;
}

export interface SpecInfo {
  kind: 'mtp' | 'draft';
  /** Seconds of one draft step. */
  draftT: number;
  rounds: number;
  /** Tokens written per round, on average. */
  perRound: number;
  /** Decode speed over plain decoding. */
  speedup: number;
  /** Share of drafted tokens accepted. */
  accRate: number;
  k?: number;
  alpha?: number;
  plainTps?: number;
}

/** What one request costs. Times in seconds, sizes in GB. */
export interface EstimateResult {
  mc: MachineSpec;
  m: ModelSpec;
  sh: LayerShapes;
  /** Kind of each layer: 'attn' (keeps KV) or 'delta' (linear attention). */
  kinds: ('attn' | 'delta')[];
  /** Context reserved, tokens (num_ctx clamped to the model). */
  ctx: number;
  /** Prompt tokens that fit (room for the answer kept), and the prompt asked for. */
  prompt: number;
  promptFull: number;
  truncated: boolean;
  /** Tokens of the system + docs prefix, and where prefill starts (after a cached prefix). */
  prefixLen: number;
  startAt: number;
  segs: Segment[];
  /** Index of the first decode segment. */
  firstDecode: number;
  /** Cold load and KV restore, s. */
  load: number;
  restore: number;
  cold: boolean;
  /** Time to first token, s, and when prefill starts (after load and restore). */
  ttft: number;
  ttftStart: number;
  /** Whole request, s. */
  total: number;
  decodeTime: number;
  /** Decode speed, tokens/s. */
  tps: number;
  /** Decode step at mid-answer. */
  mid: DecodeStep;
  pl: Placement;
  specInfo: SpecInfo | null;
  /** Tokens prefilled in this request, and their time, s. */
  newTokens: number;
  prefill: number;
  /** The first prefill chunk, if any. */
  chunk: Segment | undefined;
  /** Effective bandwidth for this placement, GB/s, and effective FLOP/s for prefill. */
  bwEff: number;
  flopsEff: number;
  /** Memory: weights, KV reserved, recurrent state, buffers, GB. */
  weights: number;
  kvRes: number;
  state: number;
  buf: number;
}

/** The app's setup fields that override a machine preset (Setup → Machine). */
export interface MachineOverrides {
  /** RAM, GB. */
  ram: number;
  /** Effective TFLOPS. */
  tflops: number;
  /** Unified memory: transfer rate MT/s and bus width, bits. */
  mts: number;
  bus: number;
  /** Card: VRAM GB and its bandwidth GB/s. */
  vram: number;
  vbw: number;
}

/** A live run's calibration of one machine: multipliers on bwEff and tflops. */
export interface Calibration {
  bw: number;
  fl: number;
  at?: string;
}

/** One machine in data/machines.json: spec values only, each with a source. A preset is built from it (01c-catalogue.ts). */
export interface CatalogueEntry {
  /** Preset key. */
  id: string;
  /** The research row an existing preset was mapped onto, when its id differs. */
  researchId?: string;
  name: string;
  short: string;
  kind: MachineKind;
  vendor: 'Apple' | 'NVIDIA' | 'AMD' | 'Intel' | 'CPU';
  /** The family whose fitted factors apply (its usual llama.cpp backend). */
  family: FamilyId;
  ramGB: number;
  fastGB: number;
  bwSpec: number;
  tflopsSpec: number | null;
  hostBw: number;
  linkBw: number;
  cores: number;
  units: number;
  unitName: string;
  bus?: [number, number];
  priceUSD: PriceUSD;
  sources: Record<string, string>;
  asOf: string;
  notes?: string;
  uncertain?: string[];
}

/** Effective factors of one hardware family, fitted to published benchmarks (data/calibration.json). */
export interface FamilyFactors {
  /** Share of spec bandwidth a decode step reaches. */
  bwEff: number;
  /** Effective TFLOPS = computeEff × tflopsSpec (basis 'tflopsSpec'), or computeEff × units (basis 'units': TFLOPS per compute unit). */
  computeEff: number;
  basis: 'tflopsSpec' | 'units';
  /** Fixed cost per layer per pass, ms. */
  layerMs: number;
}

/** data/calibration.json, written by tools/fit-families.mjs. */
export interface CalibrationFile {
  schema: 'tokenwalk-calibration/1';
  fitted: string;
  families: Partial<Record<FamilyId, FamilyFactors & { label: string; rows: number; machines: string[]; rmsLogError: number; medianAbsErrorPct: { pp: number | null; tg: number | null } }>>;
  [key: string]: any;
}
