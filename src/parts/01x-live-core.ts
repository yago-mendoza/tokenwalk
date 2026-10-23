// ===== Live mode, the pure part: reading a local server, mapping its model, calibrating the cost model =====
// No DOM here, so the unit tests can load it next to 01-data with the recorded server responses.

type LiveKind = 'ollama' | 'llama';
// What one real request measured, in seconds and tokens. ttft is client-side: request sent to first text received.
interface LiveRun {
  kind: LiveKind; model: string; text: string;
  loadS: number | null; promptN: number; prefillS: number; evalN: number; decodeS: number; totalS: number | null;
  ttftS: number | null; arrivalsMs: number[]; cacheN?: number;
}

// Quantization names as servers report them, mapped onto the console's presets (nearest bits per weight otherwise).
function quantKey(level: string): string {
  const k = String(level || '').toUpperCase().replace(/^GGML_TYPE_/, '');
  if (QUANTS[k]) return k;
  if (/^F(16|32)|BF16/.test(k)) return 'F16';
  if (/^Q8/.test(k)) return 'Q8_0';
  if (/^Q6/.test(k)) return 'Q6_K';
  if (/^Q[45]/.test(k)) return 'Q4_K_M';
  if (/^Q[23]|^IQ[123]/.test(k)) return 'Q2_K';
  return 'Q4_K_M';
}

// An Ollama /api/show response turned into a model preset with the fields every view needs. Layer counts come
// from the GGUF header: block_count includes multi-token-prediction blocks (nextn_predict_layers), which are
// stored but not run per token; full_attention_interval says one layer in N keeps KV, the rest are linear.
function modelFromOllama(show: any, name: string) {
  const mi = show.model_info || {}, arch = mi['general.architecture'] || '', g = (k: string) => mi[`${arch}.${k}`];
  const blocks = g('block_count') || 0, nextn = g('nextn_predict_layers') || 0, layers = Math.max(1, blocks - nextn);
  const every = g('full_attention_interval') || 1, kvLayers = every > 1 ? Math.max(1, Math.round(layers / every)) : layers;
  const hidden = g('embedding_length') || 4096, qHeads = g('attention.head_count') || 32, kvHeads = g('attention.head_count_kv') || qHeads;
  const headDim = g('attention.key_length') || Math.round(hidden / qHeads);
  // /api/show leaves the token list empty unless asked for it verbosely (9.7 MB for Qwen3.6), so the vocabulary is
  // estimated from the highest special token id, rounded up to the 256 tables are padded to (248,046 -> 248,320).
  const toks = mi['tokenizer.ggml.tokens'], ids = ['eos_token_id', 'bos_token_id', 'padding_token_id', 'unknown_token_id'].map(k => mi[`tokenizer.ggml.${k}`] || 0);
  const vocab = Array.isArray(toks) && toks.length ? toks.length : g('vocab_size') || (Math.max(...ids) > 0 ? Math.ceil((Math.max(...ids) + 1) / 256) * 256 : 32000);
  const experts = g('expert_count') || 0, used = g('expert_used_count') || 0, effn = g('expert_feed_forward_length') || 0;
  const shared = (g('expert_shared_feed_forward_length') || 0) > 0 ? 1 : (g('expert_shared_count') || 0);
  const total = mi['general.parameter_count'] || 0, moe = experts > 0;
  const expertParams = 3 * hidden * effn;
  // Read per token: everything but the experts a token skips (in every block, MTP included) and the embedding table.
  const readParams = Math.max(1, total - (moe ? (experts - used) * expertParams * blocks : 0) - vocab * hidden);
  const ssmHeads = g('ssm.time_step_rank') || 0, ssmState = g('ssm.state_size') || 0;
  const stateMB = every > 1 && ssmHeads ? ((layers - kvLayers) * ssmHeads * ssmState * ssmState * 4) / 1e6 : 0;
  const ctxMax = g('context_length') || (show.details && show.details.context_length) || 8192;
  const model = { name: `Live: ${name}`, tag: name, moe, total, readParams, layers, kvLayers, qHeads, kvHeads, headDim, hidden, vocab,
    experts, expertsUsed: used, sharedExperts: moe ? shared : 0, expertParams: moe ? expertParams : 0, ctxMax, stateMB: Math.round(stateMB), measured: true, live: true };
  const inner = g('ssm.inner_size') || 0, ffn = g('feed_forward_length') || 0, kvw = kvHeads * headDim;
  const shapes: any = { attn: [['attn_q', hidden, qHeads * headDim * (every > 1 ? 2 : 1)], ['attn_k', hidden, kvw], ['attn_v', hidden, kvw], ['attn_output', qHeads * headDim, hidden]] };
  if (every > 1 && inner) { shapes.delta = [['attn_qkv', hidden, inner * 2], ['attn_gate', hidden, inner], ['ssm_out', inner, hidden]]; shapes.deltaState = ssmHeads * ssmState * ssmState * 4; }
  if (moe) { shapes.router = ['ffn_gate_inp', hidden, experts]; shapes.expert = [['ffn_gate', hidden, effn], ['ffn_up', hidden, effn], ['ffn_down', effn, hidden]]; }
  else shapes.mlp = [['ffn_gate', hidden, ffn || 4 * hidden], ['ffn_up', hidden, ffn || 4 * hidden], ['ffn_down', ffn || 4 * hidden, hidden]];
  return { model, shapes, quant: quantKey(show.details && show.details.quantization_level) };
}

// llama-server only exposes totals (/v1/models meta): a dense model of that size, every layer attention.
function modelFromLlama(models: any, props: any) {
  const d = (models && models.data && models.data[0]) || {}, meta = d.meta || {}, path = String((props && props.model_path) || d.id || 'model');
  const name = path.split(/[\\/]/).pop()!.replace(/\.gguf$/i, ''), hidden = meta.n_embd || 4096, vocab = meta.n_vocab || 32000, total = meta.n_params || 8e9;
  const layers = Math.max(8, Math.round(total / (12 * hidden * hidden))), qHeads = Math.max(1, Math.round(hidden / 128));
  const model = { name: `Live: ${name}`, tag: name, moe: false, total, readParams: Math.max(1, total - vocab * hidden), layers, kvLayers: layers, qHeads, kvHeads: Math.max(1, qHeads / 4), headDim: 128,
    hidden, vocab, experts: 0, expertsUsed: 0, sharedExperts: 0, expertParams: 0, ctxMax: meta.n_ctx_train || 8192, stateMB: 0, measured: false, live: true };
  const q = (name.match(/(BF16|F16|Q\d_\w+|IQ\d\w*)/i) || [])[1] || 'Q4_K_M';
  return { model, shapes: null, quant: quantKey(q) };
}

// Ollama streams one JSON object per line; the last has done: true and the server's own timings in nanoseconds.
function parseOllamaStream(text: string) {
  const objs = text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  return { text: objs.map(o => o.response || '').join(''), final: objs.find(o => o.done) || null, chunks: objs.length };
}
function ollamaRun(final: any, name: string, text: string, ttftS: number | null, arrivalsMs: number[]): LiveRun {
  const s = (ns: any) => (Number(ns) || 0) / 1e9;
  return { kind: 'ollama', model: name, text, loadS: s(final.load_duration), promptN: final.prompt_eval_count || 0, prefillS: s(final.prompt_eval_duration),
    evalN: final.eval_count || 0, decodeS: s(final.eval_duration), totalS: s(final.total_duration), ttftS, arrivalsMs };
}
// llama-server streams server-sent events ("data: {...}"); the last event (stop: true) carries timings in milliseconds.
function parseLlamaStream(text: string) {
  const objs = text.split('\n').filter(l => l.startsWith('data: ') && l.slice(6).trim() !== '[DONE]').map(l => JSON.parse(l.slice(6)));
  return { text: objs.map(o => o.content || '').join(''), final: objs.find(o => o.stop) || null, chunks: objs.length };
}
function llamaRun(final: any, name: string, text: string, ttftS: number | null, arrivalsMs: number[]): LiveRun {
  const t = (final && final.timings) || {};
  return { kind: 'llama', model: name, text, loadS: null, promptN: t.prompt_n || 0, prefillS: (t.prompt_ms || 0) / 1000, evalN: t.predicted_n || 0,
    decodeS: (t.predicted_ms || 0) / 1000, totalS: ((t.prompt_ms || 0) + (t.predicted_ms || 0)) / 1000, ttftS, arrivalsMs, cacheN: t.cache_n || 0 };
}

// ---- Calibration: scale the machine's effective bandwidth (decode) and compute (prefill) to match a measured run ----
// Decode time per token is A/k + B: A the weights and KV read from fast memory at bw·bwEff·k, B the part read from
// slower memory plus the per-layer overhead, which k does not touch. So k = A / (measured − B).
// Prefill is fitted by bisection on the compute factor, and only from a prompt long enough (≥ 256 tokens) for
// arithmetic to matter: a short prompt is dominated by fixed costs that no compute factor explains.
function calibrateTo(mc: any, m: any, q: string, kv: string, run: LiveRun) {
  const out: { bw: number; fl: number; notes: string[] } = { bw: 1, fl: 1, notes: [] };
  if (run.evalN > 1 && run.decodeS > 0) {
    const ctx = run.promptN + run.evalN / 2, target = run.decodeS / run.evalN;
    const t1 = decodeStep(mc, m, q, kv, ctx).seconds, B = decodeStep({ ...mc, bwEff: mc.bwEff * 1e9 }, m, q, kv, ctx).seconds, A = t1 - B;
    out.bw = target > B ? Math.max(0.1, Math.min(10, A / (target - B))) : 10;
  } else out.notes.push('decode not measured');
  if (run.promptN >= 256 && run.prefillS > 0) {
    const mc2 = { ...mc, bwEff: mc.bwEff * out.bw }, f = (k: number) => prefillSeconds({ ...mc2, tflops: mc2.tflops * k }, m, q, run.promptN);
    let lo = 0.02, hi = 50;
    if (f(hi) > run.prefillS) { out.fl = hi; out.notes.push('prefill slower than memory alone allows'); }
    else if (f(lo) < run.prefillS) { out.fl = lo; }
    else { for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (f(mid) > run.prefillS) lo = mid; else hi = mid; } out.fl = Math.sqrt(lo * hi); }
  } else out.notes.push('prompt too short to calibrate prefill');
  return out;
}

// Stored per machine: { bw, fl, at } in localStorage; machine() multiplies the preset by it.
const CALIB_KEY = 'tw.calib';
function loadCalib(): Record<string, { bw: number; fl: number; at: string }> { try { return JSON.parse(localStorage.getItem(CALIB_KEY) || '{}') || {}; } catch (e) { return {}; } }
let CALIB = loadCalib();
function saveCalib(key: string, c: { bw: number; fl: number } | null) {
  if (c) CALIB[key] = { bw: c.bw, fl: c.fl, at: new Date().toISOString() }; else delete CALIB[key];
  try { localStorage.setItem(CALIB_KEY, JSON.stringify(CALIB)); } catch (e) {}
}

// A live model joins MODELS (and SHAPES) under the key 'live', and survives a reload.
const LIVE_MODEL_KEY = 'tw.liveModel';
function registerLiveModel(p: { model: any; shapes: any; quant: string } | null, persist = true) {
  if (!p) { delete (MODELS as any).live; delete (SHAPES as any).live; if (persist) try { localStorage.removeItem(LIVE_MODEL_KEY); } catch (e) {} return; }
  (MODELS as any).live = p.model; if (p.shapes) (SHAPES as any).live = p.shapes; else delete (SHAPES as any).live;
  if (persist) try { localStorage.setItem(LIVE_MODEL_KEY, JSON.stringify(p)); } catch (e) {}
}
try { const saved = JSON.parse(localStorage.getItem(LIVE_MODEL_KEY) || 'null'); if (saved && saved.model) registerLiveModel(saved, false); } catch (e) {}
