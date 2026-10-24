// ===== Presets and formulas (mirrored in infraphysics src/figures/_llm/data.js, which the article figures use) =====
const GB = 1e9;

// Bits per weight of each weight format, scales included (llama.cpp block layouts: Q8_0 is 32 int8 plus
// one f16 scale = 8.5; Q4_0 is 32 nibbles plus one f16 scale = 4.5; Q4_K_M mixes Q4_K at 4.5 and Q6_K at
// 6.56 and lands near 4.9 on these files; Q2_K is 84 bytes per 256 weights).
const QUANTS = {
  F16: { label: 'F16', bpw: 16 },
  Q8_0: { label: 'Q8_0', bpw: 8.5 },
  Q6_K: { label: 'Q6_K', bpw: 6.56 },
  Q4_K_M: { label: 'Q4_K_M', bpw: 4.9 },
  Q2_K: { label: 'Q2_K', bpw: 2.63 },
};

// Bytes per number in the KV cache (q8_0 and q4_0 carry one f16 scale per 32 numbers).
const KV_TYPES = {
  f16: { label: 'f16', bytes: 2 },
  q8_0: { label: 'q8_0', bytes: 1.0625 },
  q4_0: { label: 'q4_0', bytes: 0.5625 },
};

// readParams: weights read for every generated token (the embedding table is excluded, since a token only
// reads its own row of it; the output head is included). total: everything that must sit in memory.
// kvLayers: layers that keep keys and values. stateMB: fixed recurrent state of the linear-attention
// layers, independent of the context.
const MODELS = {
  qwen36: {
    name: 'Qwen3.6 35B-A3B', tag: 'qwen3.6:35b-a3b', moe: true,
    total: 35.51e9, readParams: 3.0e9, layers: 40, kvLayers: 10, qHeads: 16, kvHeads: 2, headDim: 256,
    hidden: 2048, vocab: 248320, experts: 256, expertsUsed: 8, sharedExperts: 1, expertParams: 3 * 2048 * 512,
    ctxMax: 262144, stateMB: 63, measured: true, mtp: 1,
  },
  qwen38: {
    name: 'Qwen3.8 27B', tag: 'qwen3.8:27b', moe: false,
    total: 27.32e9, readParams: 26.05e9, layers: 64, kvLayers: 16, qHeads: 24, kvHeads: 4, headDim: 256,
    hidden: 5120, vocab: 248320, experts: 0, expertsUsed: 0, sharedExperts: 0, expertParams: 0,
    ctxMax: 262144, stateMB: 150, measured: true, mtp: 1,
  },
  llama8b: {
    name: 'Llama 3.1 8B', tag: 'llama3.1:8b', moe: false,
    total: 8.03e9, readParams: 7.5e9, layers: 32, kvLayers: 32, qHeads: 32, kvHeads: 8, headDim: 128,
    hidden: 4096, vocab: 128256, experts: 0, expertsUsed: 0, sharedExperts: 0, expertParams: 0,
    ctxMax: 131072, stateMB: 0, measured: false,
  },
  gpt3: {
    name: 'GPT-3 175B', tag: 'gpt-3 (2020)', moe: false,
    total: 175e9, readParams: 174.4e9, layers: 96, kvLayers: 96, qHeads: 96, kvHeads: 96, headDim: 128,
    hidden: 12288, vocab: 50257, experts: 0, expertsUsed: 0, sharedExperts: 0, expertParams: 0,
    ctxMax: 2048, stateMB: 0, measured: false,
  },
};

// bw: GB/s of the memory the weights sit in (theoretical). bwEff: share of it a decode step reaches.
// tflops: effective arithmetic during prefill. layerMs: fixed cost per layer per step (kernel launches,
// synchronisation), which is what keeps a small model from reaching its bandwidth ceiling on the iGPU.
// fastGB: memory the accelerator reads at `bw` (VRAM on a card, all usable RAM on unified memory);
// hostBw: what a card falls back to for weights that do not fit (system RAM read by the CPU).
const MACHINES: Record<string, MachineSpec> = {
  thinkpad: {
    name: 'ThinkPad · Radeon 860M', short: '860M iGPU', kind: 'unified',
    ramGB: 64, fastGB: 47.6, bw: 128, bwEff: 0.33, tflops: 0.75, layerMs: 0.9, hostBw: 128, linkBw: 0,
    cores: 8, units: 8, unitName: 'CU', est: false, diskGBs: 0.4,
  },
  thinkpadCpu: {
    name: 'ThinkPad · CPU only', short: 'CPU only', kind: 'unified',
    ramGB: 64, fastGB: 60, bw: 128, bwEff: 0.33, tflops: 0.42, layerMs: 0.9, hostBw: 128, linkBw: 0,
    cores: 8, units: 8, unitName: 'core', est: false, diskGBs: 0.4,
  },
  strixHalo: {
    name: 'Ryzen AI Max+ 395, 128 GB', short: 'Strix Halo', kind: 'unified',
    ramGB: 128, fastGB: 96, bw: 256, bwEff: 0.5, tflops: 4, layerMs: 0.3, hostBw: 256, linkBw: 0,
    cores: 16, units: 40, unitName: 'CU', est: true,
  },
  m4max: {
    name: 'MacBook Pro, M4 Max 128 GB', short: 'M4 Max', kind: 'unified',
    ramGB: 128, fastGB: 96, bw: 546, bwEff: 0.6, tflops: 12, layerMs: 0.1, hostBw: 546, linkBw: 0,
    cores: 16, units: 40, unitName: 'GPU core', est: true,
  },
  rtx4090: {
    name: 'Desktop, RTX 4090 24 GB', short: 'RTX 4090', kind: 'discrete',
    ramGB: 64, fastGB: 24, bw: 1008, bwEff: 0.55, tflops: 80, layerMs: 0.05, hostBw: 70, linkBw: 32,
    cores: 16, units: 128, unitName: 'SM', est: true,
  },
  rtx5090: {
    name: 'Desktop, RTX 5090 32 GB', short: 'RTX 5090', kind: 'discrete',
    ramGB: 64, fastGB: 32, bw: 1792, bwEff: 0.55, tflops: 100, layerMs: 0.05, hostBw: 70, linkBw: 64,
    cores: 16, units: 170, unitName: 'SM', est: true,
  },
  h100: {
    name: 'Cloud, H100 SXM 80 GB', short: 'H100', kind: 'discrete',
    ramGB: 256, fastGB: 80, bw: 3350, bwEff: 0.6, tflops: 400, layerMs: 0.02, hostBw: 100, linkBw: 64,
    cores: 32, units: 132, unitName: 'SM', est: true,
  },
};

// The request the article follows: a clinical copilot on the laptop.
const DEFAULTS = {
  machine: 'thinkpad', model: 'qwen36', quant: 'Q4_K_M', kv: 'f16',
  ctx: 16384, prompt: 6500, output: 300,
};

const SYSTEM_GB = 32; // Windows, Chrome, Cursor and the rest, measured before any model loaded

// A weight format is a preset name (QUANTS) or bits per weight as a number (a file's bytes × 8 / its weights).
const bpwOf = (q: string | number): number => (typeof q === 'number' ? q : QUANTS[q].bpw);
const fileGB = (m, q) => (m.total * bpwOf(q)) / 8 / GB;
const readGB = (m, q) => (m.readParams * bpwOf(q)) / 8 / GB;
// Multi-token prediction (MTP). Both Qwen GGUFs carry one extra "next-n" block (nextn_predict_layers: 1) and
// Ollama runs it as a built-in draft (draft_num_predict 2): the MTP block guesses the next tokens, and one pass of
// the full model checks them all. A draft step reads one block plus the output head; how many guesses survive
// (the acceptance rate) depends on how predictable the text is, so it falls as the temperature rises.
// Fitted on the laptop, qwen3.6:35b-a3b, Ollama 0.40.7, 2026-10-23, 96-token answers: drafting off 13.2 tok/s
// (short and 3,505-token prompts alike); drafting on, temperature 0 on the long prompt 15.6 tok/s (x1.18);
// temperature 0.7, 11.5 and 10.6 tok/s (x0.87, x0.80).
const MTP = { k: 2, alphaT0: 0.55, alphaT07: 0.25 };
const mtpDraftGB = (m, q) => (((m.readParams - m.vocab * m.hidden) / m.layers + m.vocab * m.hidden) * bpwOf(q)) / 8 / GB;
const mtpAlpha = T => { const t = Math.max(0, T); return Math.max(0.05, t <= 0.7 ? MTP.alphaT0 + (MTP.alphaT07 - MTP.alphaT0) * (t / 0.7) : MTP.alphaT07 * (1 - Math.min(1, (t - 0.7) / 1.3) * 0.6)); };
const kvBytesPerToken = (m, kv) => 2 * m.kvLayers * m.kvHeads * m.headDim * KV_TYPES[kv].bytes;
const kvGB = (m, kv, ctx) => (kvBytesPerToken(m, kv) * ctx) / GB;
const buffersGB = m => 0.1 + (m.vocab * 4 * 64) / GB; // compute scratch and logits; ollama ps on the laptop (20.6 GiB) leaves ~0.3 GB for them

// Experts touched by n tokens in one layer, when each picks k of E: E(1 − (1 − k/E)^n).
const expertsTouched = (m, n) => (m.moe ? m.experts * (1 - (1 - m.expertsUsed / m.experts) ** n) : 0);

// Weights read in one pass that carries n tokens at once (prefill chunk, speculative verification).
function passReadGB(m, q, n) {
  if (!m.moe) return readGB(m, q);
  const perExpert = (m.expertParams * bpwOf(q)) / 8 / GB;
  const routedOne = m.expertsUsed * perExpert * m.layers;
  const rest = readGB(m, q) - routedOne;
  return rest + expertsTouched(m, n) * perExpert * m.layers;
}

// Where the weights live: on a card, what does not fit in VRAM is read from system RAM at hostBw.
function placement(mc, m, q) {
  const w = fileGB(m, q);
  const onFast = Math.min(w, mc.fastGB - 1.5);
  const frac = Math.max(0, Math.min(1, onFast / w));
  return { weightsGB: w, fastShare: frac, fits: w <= mc.fastGB - 1.5, ramFits: w + SYSTEM_GB * (mc.kind === 'unified' ? 1 : 0.5) <= mc.ramGB };
}

// Seconds per generated token at a given context length.
function decodeStep(mc, m, q, kv, ctx) {
  const pl = placement(mc, m, q);
  const bytes = readGB(m, q) + kvGB(m, kv, ctx);
  const fastBw = mc.bw * mc.bwEff, slowBw = mc.hostBw * 0.6;
  const t = (bytes * pl.fastShare) / fastBw + (bytes * (1 - pl.fastShare)) / slowBw + (mc.layerMs * m.layers) / 1000;
  return { seconds: t, bytesGB: bytes, ceiling: mc.bw / bytes, fastShare: pl.fastShare };
}
const decodeTokS = (mc, m, q, kv, ctx) => 1 / decodeStep(mc, m, q, kv, ctx).seconds;
// Expected tokens a second with MTP drafting k tokens at acceptance alpha: (1 - a^(k+1)) / (1 - a) tokens per round,
// each round k draft steps (one block plus the head) and one verification pass carrying k + 1 tokens.
function mtpTokS(mc, m, q, kv, ctx, alpha, k = MTP.k) {
  const bw = mc.bw * mc.bwEff, draftT = mtpDraftGB(m, q) / bw + mc.layerMs / 1000;
  const verifyT = Math.max((passReadGB(m, q, k + 1) + kvGB(m, kv, ctx)) / bw, (2 * m.readParams * (k + 1)) / (mc.tflops * 1e12)) + (mc.layerMs * m.layers) / 1000;
  const perRound = alpha >= 1 ? k + 1 : (1 - alpha ** (k + 1)) / (1 - alpha);
  return perRound / (k * draftT + verifyT);
}

// Seconds to read a prompt of n tokens, in chunks of 512 (llama.cpp's default micro-batch). Each chunk
// costs the larger of reading its weights and doing its arithmetic, plus the attention over the context so
// far, plus the per-layer overhead. An MoE chunk is a little less efficient (scattered experts).
function prefillSeconds(mc, m, q, n, ub = 512) {
  if (n <= 0) return 0;
  const pl = placement(mc, m, q);
  const flopsEff = mc.tflops * 1e12 * (m.moe ? 0.75 : 1);
  const bwEff = mc.bw * mc.bwEff * pl.fastShare + mc.hostBw * 0.6 * (1 - pl.fastShare);
  let t = 0, done = 0;
  while (done < n) {
    const c = Math.min(ub, n - done);
    const mem = passReadGB(m, q, c) / bwEff;
    const matmul = (2 * m.readParams * c) / flopsEff;
    const attn = (4 * m.kvLayers * m.qHeads * m.headDim * c * (done + c / 2)) / flopsEff;
    t += Math.max(mem, matmul) + attn + (mc.layerMs * m.layers) / 1000;
    done += c;
  }
  return t;
}

// The whole request: time to first token and time to finish.
function request(s) {
  const mc = MACHINES[s.machine], m = MODELS[s.model];
  const ttft = prefillSeconds(mc, m, s.quant, s.prompt);
  const mid = Math.min(s.ctx, s.prompt + s.output / 2);
  const tps = decodeTokS(mc, m, s.quant, s.kv, mid);
  return { ttft, tps, total: ttft + s.output / tps, mc, m };
}

// Formatting helpers shared by the LLM figures.
const fmtGB = g => (g >= 100 ? `${g.toFixed(0)} GB` : g >= 10 ? `${g.toFixed(1)} GB` : g >= 1 ? `${g.toFixed(2)} GB` : `${(g * 1000).toFixed(0)} MB`);
const fmtS = s => (s >= 120 ? `${(s / 60).toFixed(1)} min` : s >= 10 ? `${s.toFixed(0)} s` : s >= 1 ? `${s.toFixed(1)} s` : `${(s * 1000).toFixed(0)} ms`);
const fmtN = n => (n >= 1e9 ? `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : `${Math.round(n)}`);
// ===== end of the copy =====

// ===== Machine details the formulas do not carry =====
// Bus width and transfer rate behind the unified presets' bandwidth (bandwidth = MT/s × bits / 8 / 1000).
const BUS = { thinkpad: [8000, 128], thinkpadCpu: [8000, 128], strixHalo: [8000, 256], m4max: [8533, 512] };
// Disk reads: the article measured a 55 s cold load of the 21.7 GB file on the laptop (about 0.4 GB/s
// through Ollama, the presets' diskGBs); the other machines are assumed to load at 2 GB/s.
const ssdGBs = key => (MACHINES[key] && MACHINES[key].diskGBs) || 2;
const DRAFT = { params: 0.6e9, layers: 28 }; // draft model for speculative decoding: 0.6B dense, same family
const READING = [5, 8]; // tokens per second a person reads at

// Matrices of one layer, as the GGUF headers list them (input × output). The two Qwen models are read from
// the files on the laptop; Llama 3.1 8B and GPT-3 from their published configurations.
const SHAPES: Record<string, LayerShapes> = {
  qwen36: {
    attn: [['attn_q', 2048, 8192], ['attn_k', 2048, 512], ['attn_v', 2048, 512], ['attn_output', 4096, 2048]],
    delta: [['attn_qkv', 2048, 8192], ['attn_gate', 2048, 4096], ['ssm_out', 4096, 2048]],
    router: ['ffn_gate_inp', 2048, 256],
    expert: [['ffn_gate', 2048, 512], ['ffn_up', 2048, 512], ['ffn_down', 512, 2048]],
    deltaState: 32 * 128 * 128 * 4,
  },
  qwen38: {
    attn: [['attn_q', 5120, 12288], ['attn_k', 5120, 1024], ['attn_v', 5120, 1024], ['attn_output', 6144, 5120]],
    delta: [['attn_qkv', 5120, 10240], ['attn_gate', 5120, 6144], ['ssm_out', 6144, 5120]],
    mlp: [['ffn_gate', 5120, 17408], ['ffn_up', 5120, 17408], ['ffn_down', 17408, 5120]],
    deltaState: 48 * 128 * 128 * 4,
  },
  llama8b: {
    attn: [['attn_q', 4096, 4096], ['attn_k', 4096, 1024], ['attn_v', 4096, 1024], ['attn_output', 4096, 4096]],
    mlp: [['ffn_gate', 4096, 14336], ['ffn_up', 4096, 14336], ['ffn_down', 14336, 4096]],
  },
  gpt3: {
    attn: [['attn_q', 12288, 12288], ['attn_k', 12288, 12288], ['attn_v', 12288, 12288], ['attn_output', 12288, 12288]],
    mlp: [['ffn_up', 12288, 49152], ['ffn_down', 49152, 12288]],
  },
};
function shapesOf(key) { return shapesFor(MODELS[key], SHAPES[key]); } // shapesFor: 01e-estimate.ts
function layerKinds(m) {
  const every = Math.round(m.layers / m.kvLayers);
  return Array.from({ length: m.layers }, (_, i) => (m.kvLayers >= m.layers ? 'attn' : (i + 1) % every === 0 ? 'attn' : 'delta'));
}


function sysGB(mc = R.mc) { return Math.min(SYSTEM_GB, 0.5 * mc.ramGB); } // apps take at most half the RAM; 32 GB was measured on a 64 GB laptop
