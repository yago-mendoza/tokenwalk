// ===== Where each thing lives =====
// One table: for every entity, the views that draw it (and how to find it there), the timeline phase it belongs to,
// the context-window part it fills and the Configure section that changes it. Every explainer reads its row from
// here, so "See it in" is the same everywhere; following a link flashes the thing where it lands.
const isPart = (...ids) => sel => sel.k === 'part' && ids.includes(sel.id);
const ENTITY = {
  weights: () => ({ in: { system: isPart('weights'), model: q => q.k === 'layer' || q.k === 'mat', memory: isPart('weights') }, cfg: 'model' }),
  kv: () => ({ in: { system: isPart('kv'), model: q => q.k === 'kvlayer', memory: q => isPart('kv')(q) || q.k === 'kvbin' || q.k === 'kvtok' }, ctx: q => q.k === 'ctxseg', cfg: 'engine' }),
  state: () => ({ in: { system: isPart('state'), model: q => q.k === 'state' || (q.k === 'layer' && R.kinds[q.i] !== 'attn'), memory: isPart('state') } }),
  apps: () => ({ in: { system: isPart('sys'), memory: isPart('sys') }, cfg: 'machine' }),
  ram: () => ({ in: { system: isPart('ram', 'sys', 'weights', 'kv', 'state', 'buf', 'free'), memory: q => q.k === 'part' }, cfg: 'machine' }),
  gpu: () => ({ in: { system: q => isPart('gpu', 'chip')(q) || q.k === 'cu' || (q.k === 'inst' && q.id === 'intensity') }, cfg: 'machine' }),
  cpu: () => ({ in: { system: q => isPart('cpu')(q) || q.k === 'core' }, cfg: 'machine' }),
  ssd: () => ({ in: { system: isPart('ssd') }, time: 'load', cfg: 'engine' }),
  layer: a => ({ in: { model: q => q.k === 'layer' && q.i === a.i, system: isPart('weights') } }),
  mat: a => ({ in: { model: q => q.k === 'mat' && q.name === a.name && q.layer === a.layer }, cfg: 'model' }),
  expert: a => ({ in: { model: q => q.k === 'expert' && q.e === a.e } }),
  prompt: a => ({ in: { tokens: q => q.k === 'pchip' && tokKind(q.i * q.per) === a.kind, memory: q => q.k === 'kvbin' && tokKind((q.b + .5) * q.per) === a.kind && q.b * q.per < tokensInCache(P.t) }, ctx: q => q.k === 'ctxseg' && q.id === a.kind, time: 'prefill', cfg: 'request' }),
  answer: () => ({ in: { tokens: 'all', memory: q => q.k === 'kvbin' && tokKind((q.b + .5) * q.per) === 'ans' && q.b * q.per < tokensInCache(P.t) }, ctx: q => q.k === 'ctxseg' && q.id === 'ans', time: 'decode', cfg: 'samp' }),
  token: a => ({ in: { tokens: a.i, memory: q => q.k === 'kvtok' && q.t === R.prompt + a.i }, time: 'decode', cfg: 'samp' }),
  prefill: () => ({ in: { tokens: q => q.k === 'pchip', system: q => q.k === 'cu' || isPart('gpu')(q) }, time: 'prefill', cfg: 'request' }),
  decode: () => ({ in: { tokens: 'all', system: isPart('weights', 'kv') }, time: 'decode', cfg: 'samp' }),
  ctxfree: () => ({ in: { memory: q => q.k === 'kvbin' }, ctx: q => q.k === 'ctxseg' && q.id === 'free', cfg: 'engine' }),
};
const ENT_OF_ID = { fit: 'ram', ram: 'ram', bw: 'weights', place: 'gpu', gpusplit: 'gpu', spill: 'gpu', spec: 'decode', prefix: 'kv', ctx: 'kv', kv: 'kv', kvfull: 'kv', kvq: 'kv', cold: 'ssd', keep: 'ssd', slow: 'weights', slowish: 'weights', ttft: 'prefill', tps: 'decode', intensity: 'gpu', compute: 'gpu', trunc: 'prompt', est: 'gpu', bound: 'gpu' };
function entityOf(sel) {
  if (!sel) return null;
  const pk = { weights: 'weights', kv: 'kv', state: 'state', sys: 'apps', buf: 'ram', free: 'ram', ram: 'ram', board: 'ram', memctl: 'ram', bus: 'ram', link: 'ram', chip: 'gpu', gpu: 'gpu', npu: 'gpu', sram: 'gpu', cpu: 'cpu', ssd: 'ssd' };
  switch (sel.k) {
    case 'part': return pk[sel.id] ? [pk[sel.id], {}] : null;
    case 'cu': return ['gpu', {}]; case 'core': return ['cpu', {}];
    case 'layer': return ['layer', { i: sel.i }];
    case 'mat': return ['mat', { name: sel.name, layer: sel.layer }];
    case 'expert': return ['expert', { e: sel.e }];
    case 'kvlayer': case 'kvbin': return ['kv', {}];
    case 'kvtok': return sel.t >= R.prompt ? ['token', { i: sel.t - R.prompt }] : ['prompt', { kind: tokKind(sel.t) }];
    case 'state': return ['state', {}];
    case 'ctxseg': return sel.id === 'free' ? ['ctxfree', {}] : sel.id === 'ans' ? ['answer', {}] : ['prompt', { kind: sel.id }];
    case 'pchip': return ['prompt', { kind: tokKind(sel.i * sel.per) }];
    case 'tok': case 'cand': return ['token', { i: sel.i }];
    case 'seg': case 'prefill': case 'decode': case 'round': case 'load': case 'restore': { const k = sel.k === 'seg' ? (R.segs[sel.i] || {}).k : sel.k; return k === 'load' || k === 'restore' ? ['ssd', {}] : k === 'prefill' ? ['prefill', {}] : ['decode', {}]; }
    case 'term': return ({ deltanet: ['state', {}], attention: ['kv', {}], kv: ['kv', {}], prefill: ['prefill', {}], decode: ['decode', {}], chunk: ['prefill', {}], experts: ['weights', {}], router: ['weights', {}], head: ['weights', {}], matrix: ['weights', {}], numctx: ['kv', {}], keepalive: ['ssd', {}], logits: ['answer', {}] })[sel.id] || null;
    case 'trend': return ({ bw: ['weights', {}], tpt: ['decode', {}], kvt: ['kv', {}], ctxt: ['kv', {}], gen: ['answer', {}] })[sel.id] || null;
    case 'inst': case 'alert': { const e = ENT_OF_ID[sel.id]; return e ? (e === 'prompt' ? ['prompt', { kind: 'docs' }] : [e, {}]) : null; }
    default: return null;
  }
}
const LENS_NAME = () => ({ system: L('System', 'System'), model: L('Model', 'Model'), memory: L('Memory', 'Memory'), tokens: L('Tokens', 'Tokens') });
const SECTION_NAME = () => ({ machine: L('Machine', 'Máquina'), model: L('Model', 'Modelo'), request: L('Request', 'Petición'), engine: L('Engine', 'Motor'), samp: L('Sampling', 'Muestreo'), adv: L('Caches', 'Cachés') });
// The "See it in" row of an explainer, built from the entity's table row.
function gotoHtml(sel) {
  const e = entityOf(sel); if (!e) return '';
  const row = ENTITY[e[0]](e[1]); UI.gotoRow = { row, key: e };
  const lenses = ['system', 'model', 'memory', 'tokens'].filter(l => row.in && row.in[l]);
  const bt = (k: string, label: string, ic: string, here?: boolean) => `<button type="button" data-go="${k}" ${here ? 'aria-current="true"' : ''}>${ICON(ic, 's')}<span>${esc(label)}</span></button>`;
  const ln = LENS_NAME(), sn = SECTION_NAME();
  const parts = lenses.map(l => bt('lens:' + l, ln[l], 'eye', l === UI.lens));
  if (row.ctx) parts.push(bt('ctx', L('Context window', 'Ventana de contexto'), 'notes'));
  if (row.time) parts.push(bt('time', L('Timeline', 'Línea de tiempo'), 'eq'));
  return `<div class="lsgo"><span class="lbl">${esc(L('See it in', 'Verlo en'))}</span><span class="chips">${parts.join('')}</span></div>`;
}
// The change-it action sits under the values it would change, in the explainer's left column.
function cfgHtml(sel) {
  const e = entityOf(sel); if (!e) return ''; const row = ENTITY[e[0]](e[1]); if (!row.cfg) return '';
  return `<button type="button" class="lscfg" data-go="cfg:${row.cfg}">${ICON('tune', 's')}<span>${esc(L(`Change it in ${SECTION_NAME()[row.cfg]}`, `Cambiarlo en ${SECTION_NAME()[row.cfg]}`))}</span></button>`;
}

// ===== The wiki behind each explainer =====
// Every explainer ends with links to the InfraPhysics wiki notes that explain its idea in full. One table, by
// entity, glossary term, instrument, alert, trend and view; the links open in a new tab.
const WIKI_NAME: Record<string, [string, string]> = { attention: ['Attention', 'Atención'], 'gated-deltanet': ['Gated DeltaNet', 'Gated DeltaNet'], 'kv-cache': ['KV cache', 'Caché KV'], 'kv-cache-quantization': ['KV cache quantization', 'Cuantización de la caché KV'], 'mixture-of-experts': ['Mixture of experts', 'Mezcla de expertos'], router: ['Router', 'Router'], logits: ['Logits', 'Logits'], softmax: ['Softmax', 'Softmax'], temperature: ['Temperature', 'Temperatura'], 'top-p': ['Top-p', 'Top-p'], 'top-k': ['Top-k', 'Top-k'], sampling: ['Sampling', 'Muestreo'], 'memory-bandwidth': ['Memory bandwidth', 'Ancho de banda de memoria'], 'memory-bound': ['Memory-bound', 'Limitado por memoria'], 'roofline-model': ['Roofline model', 'Modelo roofline'], 'keep-alive': ['keep_alive', 'keep_alive'], 'context-window': ['Context window', 'Ventana de contexto'], vram: ['VRAM', 'VRAM'], 'unified-memory': ['Unified memory', 'Memoria unificada'], npu: ['NPU', 'NPU'], integrated: ['Integrated GPU', 'GPU integrada'], gpu: ['GPU', 'GPU'], cpu: ['CPU', 'CPU'], ram: ['RAM', 'RAM'], quantization: ['Quantization', 'Cuantización'], 'speculative-decoding': ['Speculative decoding', 'Decodificación especulativa'], 'prefix-caching': ['Prefix caching', 'Caché de prefijo'], tokenizer: ['Tokenizer', 'Tokenizador'], bpe: ['BPE', 'BPE'], 'multi-head-attention': ['Multi-head attention', 'Atención multicabeza'], 'dot-product-attention': ['Dot-product attention', 'Atención por producto escalar'], gqa: ['Grouped-query attention', 'Atención de consultas agrupadas'], transformer: ['Transformer', 'Transformer'], 'feed-forward-network': ['Feed-forward network', 'Red feed-forward'], 'parameters-and-weights': ['Parameters and weights', 'Parámetros y pesos'], 'model-memory-footprint': ['Model memory footprint', 'Huella de memoria del modelo'], prefill: ['Prefill', 'Prefill'], 'decoding-step': ['Decoding step', 'Paso de decodificación'], 'multi-token-prediction': ['Multi-token prediction', 'Predicción de varios tokens'], gguf: ['GGUF', 'GGUF'], 'llama-cpp': ['llama.cpp', 'llama.cpp'], ollama: ['Ollama', 'Ollama'], 'local-inference': ['Local inference', 'Inferencia local'], throughput: ['Throughput', 'Rendimiento'], latency: ['Latency', 'Latencia'], embedding: ['Embedding', 'Embedding'], 'residual-stream': ['Residual stream', 'Flujo residual'] };
const WIKI = {
  ent: { weights: ['parameters-and-weights', 'model-memory-footprint', 'quantization'], kv: ['kv-cache', 'attention', 'gqa', 'kv-cache-quantization'], state: ['gated-deltanet'], apps: ['unified-memory', 'model-memory-footprint'], ram: ['unified-memory', 'ram', 'memory-bandwidth'], gpu: ['integrated', 'gpu', 'roofline-model'], cpu: ['cpu'], ssd: ['keep-alive', 'gguf'], layer: ['transformer', 'attention', 'feed-forward-network'], mat: ['parameters-and-weights', 'quantization'], expert: ['mixture-of-experts', 'router'], prompt: ['tokenizer', 'context-window', 'prefill'], answer: ['decoding-step', 'sampling'], token: ['logits', 'sampling', 'temperature'], prefill: ['prefill', 'roofline-model'], decode: ['decoding-step', 'memory-bound', 'memory-bandwidth'], ctxfree: ['context-window', 'kv-cache'] },
  term: { mtp: ['multi-token-prediction', 'speculative-decoding'], deltanet: ['gated-deltanet'], attention: ['attention', 'dot-product-attention', 'multi-head-attention'], prefill: ['prefill'], decode: ['decoding-step', 'memory-bound'], kv: ['kv-cache'], chunk: ['prefill'], experts: ['mixture-of-experts'], router: ['router', 'mixture-of-experts'], head: ['logits'], matrix: ['parameters-and-weights'], numctx: ['context-window'], keepalive: ['keep-alive'], logits: ['logits', 'softmax', 'sampling'] },
  inst: { bw: ['memory-bandwidth', 'memory-bound'], place: ['vram', 'unified-memory'], spec: ['speculative-decoding'], prefix: ['prefix-caching'], intensity: ['roofline-model', 'memory-bound'], compute: ['roofline-model'], ttft: ['prefill', 'latency'], tps: ['throughput', 'decoding-step'], fit: ['model-memory-footprint'], kv: ['kv-cache'], ctx: ['context-window'], keep: ['keep-alive'] },
  alert: { ram: ['model-memory-footprint'], spill: ['vram'], gpusplit: ['vram'], ctx: ['context-window'], trunc: ['context-window'], kvfull: ['kv-cache'], kvq: ['kv-cache-quantization'], cold: ['keep-alive'], keep: ['keep-alive'], slow: ['memory-bound'], slowish: ['memory-bound'], ttft: ['prefill'], spec: ['speculative-decoding'], est: ['roofline-model'] },
  trend: { bw: ['memory-bandwidth'], tpt: ['memory-bound', 'kv-cache'], kvt: ['kv-cache'], gen: ['decoding-step'] },
  lens: { system: ['unified-memory', 'integrated', 'memory-bandwidth'], model: ['transformer', 'attention', 'gated-deltanet', 'mixture-of-experts'], memory: ['kv-cache', 'model-memory-footprint'], tokens: ['tokenizer', 'logits', 'sampling'] },
  samp: ['sampling', 'temperature', 'top-k', 'top-p'],
};
function wikiFor(sel) {
  if (!sel) return [];
  let ids = [];
  if (sel.k === 'term') ids = WIKI.term[sel.id] || [];
  else if (sel.k === 'inst') ids = WIKI.inst[sel.id] || [];
  else if (sel.k === 'alert') ids = WIKI.alert[sel.id] || [];
  else if (sel.k === 'trend') ids = WIKI.trend[sel.id] || [];
  else if (sel.k === 'lens') ids = WIKI.lens[sel.id] || [];
  else if (sel.k === 'cand' || sel.k === 'sampstage') ids = WIKI.samp;
  if (!ids.length) { const e = entityOf(sel); if (e) ids = WIKI.ent[e[0]] || []; }
  return [...new Set(ids)].filter(id => WIKI_NAME[id]).slice(0, 4);
}
function wikiHtml(sel) {
  const ids = wikiFor(sel); if (!ids.length) return '';
  return `<div class="lswiki"><span class="lbl">${esc(L('In the wiki', 'En el wiki'))}</span><span class="chips">${ids.map(id => `<a href="https://infraphysics.net/wiki/${id}" target="_blank" rel="noopener">${ICON('notes', 's')}<span>${esc(L(...WIKI_NAME[id]))}</span>${ICON('chev', 's')}</a>`).join('')}</span></div>`;
}

function goTo(where) {
  const g = UI.gotoRow; if (!g) return; const row = g.row;
  select(null);
  if (where.startsWith('lens:')) {
    const l = where.slice(5); if (ZOOM[l] && ZOOM[l].length) zoomTo(l, 0); setLens(l);
    const m = row.in[l]; UI.flash = { canvas: { system: 'cSystem', model: 'cModel', memory: 'cMemory', tokens: 'cPrompt' }[l], match: typeof m === 'function' ? m : null, tok: m, t0: performance.now() };
    if (l === 'tokens') { streamKey = ''; }
  } else if (where === 'ctx') { if (matchMedia('(max-width: 760px)').matches) setZone('cfg'); UI.flash = { canvas: 'cCtx', match: row.ctx, t0: performance.now() }; }
  else if (where === 'time') { UI.tlHl = row.time; UI.flash = { canvas: 'cTime', match: null, t0: performance.now() }; setTimeout(() => { if (UI.tlHl === row.time) UI.tlHl = null; }, 1600); }
  else if (where.startsWith('cfg:')) { const acc = document.querySelector(`[data-acc="${where.slice(4)}"]`); if (acc) { if (!acc.classList.contains('open')) acc.querySelector('button').click(); if (matchMedia('(max-width: 760px)').matches) setZone('cfg'); acc.classList.remove('flash'); void acc.offsetWidth; acc.classList.add('flash'); } }
}
const LENS_CV = { system: 'cSystem', model: 'cModel', memory: 'cMemory', tokens: 'cPrompt' };
function brushEntity(e) { if (!e) { UI.brush = null; return; } const row = ENTITY[e[0]](e[1]), m = row.in && row.in[UI.lens]; UI.brush = typeof m === 'function' ? { canvas: LENS_CV[UI.lens], match: m } : null; }
// Legend hover: each item outlines exactly the marks it names in the current view (not the whole entity behind it).
const P_ = (...ids) => q => q.k === 'part' && ids.includes(q.id);
const LEGEND_MATCH = {
  weights: { system: P_('weights'), model: q => q.k === 'layer' || q.k === 'mat' || q.k === 'gcol', memory: P_('weights') },
  kv: { system: P_('kv'), model: q => q.k === 'kvlayer', memory: q => P_('kv')(q) || q.k === 'kvbin' },
  kvres: { system: P_('kv'), memory: q => P_('kv')(q) || q.k === 'kvbin' }, kvby: { memory: q => q.k === 'kvbin' || q.k === 'kvtok' },
  state: { system: P_('state'), model: q => q.k === 'state', memory: P_('state') },
  flight: { system: P_('bus', 'link'), model: q => q.k === 'mat' }, busy: { system: q => q.k === 'cu' || q.k === 'core' },
  sys: { system: P_('sys'), memory: P_('sys') }, free: { memory: P_('free') },
  token: { tokens: q => q.k === 'pchip' }, tk_sys: { tokens: q => q.k === 'pchip' && tokKind(q.i * q.per) === 'sys' }, tk_docs: { tokens: q => q.k === 'pchip' && tokKind(q.i * q.per) === 'docs' }, tk_q: { tokens: q => q.k === 'pchip' && tokKind(q.i * q.per) === 'q' },
  hw_storage: { system: P_('ssd') }, hw_ram: { system: P_('ram', 'sys', 'weights', 'kv', 'state', 'buf', 'free') }, hw_vram: { system: P_('vram', 'card') },
  hw_proc: { system: q => P_('cpu', 'gpu', 'npu', 'sram', 'memctl', 'chip')(q) || q.k === 'cu' || q.k === 'core' }, hw_link: { system: P_('bus', 'link') },
};
function brushLegend(k) { const m = k && LEGEND_MATCH[k] && LEGEND_MATCH[k][UI.lens]; UI.brush = m ? { canvas: LENS_CV[UI.lens], match: m } : null; }
const LEGEND_ENT = { weights: ['weights', {}], flight: ['weights', {}], kv: ['kv', {}], kvres: ['kv', {}], kvby: ['kv', {}], state: ['state', {}], sys: ['apps', {}], free: ['ram', {}], busy: ['gpu', {}], token: ['answer', {}], tk_sys: ['prompt', { kind: 'sys' }], tk_docs: ['prompt', { kind: 'docs' }], tk_q: ['prompt', { kind: 'q' }], tk_ans: ['answer', {}], hw_ram: ['ram', {}], hw_storage: ['ssd', {}], hw_proc: ['gpu', {}], hw_vram: ['gpu', {}], hw_link: ['ram', {}] };
// Outline every hit that matches: each one when few, one box per kind when many.
function outlineMatches(id, x, match, a, fill) {
  // every matching mark is outlined where it is; nothing is boxed together, so marks in between are never covered
  const hs = (HITS[id] || []).filter(h => Array.isArray(h.shape) && match(h.sel)), many = hs.length > 24;
  if (many) { x.save(); x.lineWidth = 1; x.setLineDash([]); }
  for (const h of hs) { const [X, Y, w, hh] = h.shape; if (fill) x.fillRect(X, Y, w, hh); x.strokeRect(X + (many ? .5 : -1), Y + (many ? .5 : -1), w + (many ? -1 : 2), hh + (many ? -1 : 2)); }
  if (many) x.restore();
}
// The flash: two soft pulses around every part that matches, then gone. It is interface, not simulation, so it also runs while paused.
function drawFlash(id, x) {
  const f = UI.flash; if (!f || f.canvas !== id) return;
  const e = (performance.now() - f.t0) / 1500; if (e >= 1) { UI.flash = null; return; }
  if (!f.match) return;
  const a = (.55 + .45 * Math.sin(e * Math.PI * 4 - Math.PI / 2)) * (1 - e * .6);
  x.save(); x.strokeStyle = `rgba(255,212,59,${a.toFixed(3)})`; x.fillStyle = `rgba(255,212,59,${(a * .14).toFixed(3)})`; x.lineWidth = 2; x.shadowColor = C.hot; x.shadowBlur = 10 * a;
  // Few matches: each outlined. Many (cells of a grid): one outline around each kind, so the flash says "here", not "everything".
  const hs = (HITS[id] || []).filter(h => Array.isArray(h.shape) && f.match(h.sel)), groups = {};
  if (hs.length <= 12) for (const h of hs) { x.fillRect(h.shape[0], h.shape[1], h.shape[2], h.shape[3]); x.strokeRect(h.shape[0] - 1, h.shape[1] - 1, h.shape[2] + 2, h.shape[3] + 2); }
  else { for (const h of hs) { const g = groups[h.sel.k + (h.sel.id || '')] || (groups[h.sel.k + (h.sel.id || '')] = [1e9, 1e9, -1e9, -1e9]); g[0] = Math.min(g[0], h.shape[0]); g[1] = Math.min(g[1], h.shape[1]); g[2] = Math.max(g[2], h.shape[0] + h.shape[2]); g[3] = Math.max(g[3], h.shape[1] + h.shape[3]); }
    for (const g of Object.values(groups)) { x.fillRect(g[0], g[1], g[2] - g[0], g[3] - g[1]); x.strokeRect(g[0] - 2, g[1] - 2, g[2] - g[0] + 4, g[3] - g[1] + 4); } }
  x.restore();
}
