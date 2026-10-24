import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadModel, PURE_PARTS } from './load.mjs';

// The model catalogue (data/ref-models.json) and the presets built from it (01c-catalogue.ts), next to the app's own four.
const REF = JSON.parse(fs.readFileSync(new URL('../../data/ref-models.json', import.meta.url), 'utf8'));
const M = await loadModel(PURE_PARTS);
const OWN = ['qwen36', 'qwen38', 'llama8b', 'gpt3'];

test('the app keeps its own four models first, with their keys, and adds every catalogue model after them', () => {
  const keys = Object.keys(M.MODELS);
  assert.deepEqual(keys.slice(0, 4), OWN);
  assert.deepEqual(keys.slice(4), Object.keys(REF.models).filter(k => !OWN.includes(k)));
  for (const k of keys.slice(4)) assert.ok(M.SHAPES[k] && M.SHAPES[k].attn, `${k}: no layer shapes`);
});

test('every model says where its numbers come from and when, and who publishes it', () => {
  for (const [k, m] of Object.entries(M.MODELS)) {
    assert.ok(typeof m.source === 'string' && m.source.length > 0, `${k}: no source`);
    if (!m.measured) assert.match(m.source, /^https:\/\//, `${k}: source is not a link`);
    assert.match(m.asOf || '', /^\d{4}-\d{2}-\d{2}$/, `${k}: asOf`);
    assert.ok(m.vendor && m.family, `${k}: vendor and family`);
    assert.ok(m.tag, `${k}: no tag`);
    if (m.approx) assert.ok(m.notes && m.notes.length > 40, `${k}: approximated without saying how`);
  }
  for (const [k, c] of Object.entries(REF.models)) {
    assert.match(c.source, /^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/blob\/main\/config\.json$/, `${k}: source is not a config.json`);
    assert.match(c.tag, /^[a-z0-9.-]+:[a-z0-9.-]+$/, `${k}: tag ${c.tag} is not an Ollama name`);
    if (c.configCopy) assert.match(c.configCopy, /^https:\/\/huggingface\.co\/.+\/config\.json$/, `${k}: configCopy`);
  }
});

test('a catalogue model is consistent: dimensions, heads, experts and context', () => {
  for (const k of Object.keys(REF.models)) {
    const m = M.MODELS[k];
    assert.ok(m.layers > 0 && m.kvLayers === m.layers && m.stateMB === 0, `${k}: layers`);
    assert.equal(m.qHeads % m.kvHeads, 0, `${k}: query heads are not a multiple of KV heads`);
    assert.ok(m.readParams > 0 && m.readParams <= m.total, `${k}: reads ${m.readParams} of ${m.total}`);
    assert.ok(m.ctxMax >= 4096, `${k}: ctxMax`);
    if (m.moe) assert.ok(m.expertsUsed > 0 && m.expertsUsed < m.experts && m.expertParams > 0 && M.SHAPES[k].expert && M.SHAPES[k].router, `${k}: experts`);
    else assert.ok(M.SHAPES[k].mlp && !M.SHAPES[k].expert, `${k}: dense MLP`);
  }
});

test('gpt-oss keeps its experts at MXFP4 under every label: files near the published GGUFs, F16 never above the native size', () => {
  const m = M.MODELS['gpt-oss-20b'], routed = m.experts * m.expertParams * m.layers;
  for (const q of Object.keys(M.QUANTS)) {
    const want = ((m.total - routed) * M.QUANTS[q].bpw + routed * 4.25) / 8e9;
    assert.ok(Math.abs(M.fileGB(m, q) - want) < 1e-9, `${q}: ${M.fileGB(m, q)} vs ${want}`);
  }
  // ggml-org's gpt-oss-20b-mxfp4.gguf is 12.1 GB (attention and embeddings at 8 bits): Q8_0 lands next to it
  assert.ok(Math.abs(M.fileGB(m, 'Q8_0') - 12.1) < 0.5, `Q8_0: ${M.fileGB(m, 'Q8_0')}`);
  assert.ok(M.fileGB(m, 'F16') < 14, `F16: ${M.fileGB(m, 'F16')}`);
  // a token reads 4 of 32 experts per layer, at 4.25 bits
  const used = m.expertsUsed * m.expertParams * m.layers;
  assert.ok(Math.abs(M.readGB(m, 'Q4_K_M') - ((m.readParams - used) * 4.9 + used * 4.25) / 8e9) < 1e-9);
  // a number or an explicit pair is taken as given (the benchmark rows pass their own bytes)
  assert.equal(M.fileGB(m, 6), (m.total * 6) / 8e9);
  // a model without expertBpw is untouched
  assert.equal(M.fileGB(M.MODELS['qwen3-30b-a3b'], 'Q4_K_M'), (M.MODELS['qwen3-30b-a3b'].total * 4.9) / 8e9);
});

test('the gated models reproduce the official parameter count from their copied configuration', () => {
  for (const k of Object.keys(REF.models).filter(k => REF.models[k].configCopy)) {
    const c = REF.models[k], m = M.MODELS[k];
    // the official count includes the norms, which the model does not count: within 0.1%
    assert.ok(Math.abs(m.total / c.publishedParams - 1) < 0.001, `${k}: ${m.total} vs ${c.publishedParams}`);
  }
});

test('estimate() runs every catalogue model on every machine and weight format', () => {
  const cfg = mk => ({ machine: M.MACHINES[mk], kv: 'f16', ctxTokens: 16384, systemTokens: 800, docsTokens: 5650, questionTokens: 50, answerTokens: 40, temperature: 0.7,
    prefixCached: false, diskCache: false, cold: false, mtp: true, speculative: null });
  for (const mk of Object.keys(M.MACHINES)) for (const mo of Object.keys(REF.models)) for (const q of Object.keys(M.QUANTS)) {
    const r = M.estimate({ ...cfg(mk), model: mo, quant: q }, { models: M.MODELS, shapes: M.SHAPES });
    assert.ok(Number.isFinite(r.total) && r.total > 0 && r.tps > 0 && r.weights > 0, `${mk} · ${mo} · ${q}`);
    assert.ok(r.ctx <= M.MODELS[mo].ctxMax && !r.specInfo, `${mk} · ${mo} · ${q}: context or MTP`);
  }
});
