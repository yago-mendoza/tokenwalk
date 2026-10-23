import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadModel } from './load.mjs';

const M = await loadModel(['01-data.ts', '01x-live-core.ts']);
const fx = f => fs.readFileSync(new URL('../fixtures/' + f, import.meta.url), 'utf8');
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${what}: ${a} vs ${b}`);

test('an Ollama /api/show maps onto the hand-written Qwen3.6 preset', () => {
  const p = M.modelFromOllama(JSON.parse(fx('ollama-show-qwen36.json')), 'qwen3.6:35b-a3b'), m = p.model, ref = M.MODELS.qwen36;
  for (const k of ['layers', 'kvLayers', 'qHeads', 'kvHeads', 'headDim', 'hidden', 'experts', 'expertsUsed', 'sharedExperts', 'ctxMax']) assert.equal(m[k], ref[k], k);
  near(m.total, ref.total, 0.01, 'total'); near(m.readParams, ref.readParams, 0.03, 'readParams'); near(m.stateMB, ref.stateMB, 0.05, 'stateMB');
  assert.equal(p.quant, 'Q4_K_M'); assert.equal(m.live, true); assert.match(m.name, /^qwen3.6:35b-a3b$/);
  assert.deepEqual(p.shapes.expert, M.SHAPES.qwen36.expert);
});

test('a dense model maps too: Qwen3.8 27B', () => {
  const m = M.modelFromOllama(JSON.parse(fx('ollama-show-qwen38.json')), 'qwen3.8:27b').model, ref = M.MODELS.qwen38;
  for (const k of ['layers', 'kvLayers', 'qHeads', 'kvHeads', 'headDim', 'hidden', 'moe']) assert.equal(m[k], ref[k], k);
  near(m.readParams, ref.readParams, 0.01, 'readParams'); near(m.stateMB, ref.stateMB, 0.05, 'stateMB');
});

test('an Ollama stream gives the text and the server timings in seconds', () => {
  const s = M.parseOllamaStream(fx('ollama-generate-warm.ndjson'));
  assert.ok(s.final && s.final.done); assert.ok(s.text.length > 50);
  const r = M.ollamaRun(s.final, 'qwen3.6:35b-a3b', s.text, 4.25, []);
  assert.equal(r.promptN, 36); assert.equal(r.evalN, 80);
  near(r.decodeS, 8.851, 1e-3, 'decodeS'); near(r.prefillS, 2.091, 1e-3, 'prefillS'); near(r.evalN / r.decodeS, 9.04, 0.01, 'decode tok/s');
  const cold = M.ollamaRun(M.parseOllamaStream(fx('ollama-generate-stream.ndjson')).final, 'x', '', null, []);
  near(cold.loadS, 53.73, 0.01, 'cold load');
});

test('a llama-server stream gives the text and the timings in seconds', () => {
  const s = M.parseLlamaStream(fx('llama-completion-stream.txt'));
  assert.equal(s.text, 'Watch the INR.'); assert.equal(s.chunks, 4);
  const r = M.llamaRun(s.final, 'm', s.text, 2.3, []);
  assert.equal(r.promptN, 36); assert.equal(r.evalN, 3); near(r.decodeS, 0.3319, 1e-6, 'decodeS'); assert.equal(r.loadS, null);
});

test('calibrating to the warm run makes the laptop decode at the measured speed', () => {
  const run = M.ollamaRun(M.parseOllamaStream(fx('ollama-generate-warm.ndjson')).final, 'q', '', null, []);
  const mc = M.MACHINES.thinkpad, m = M.MODELS.qwen36;
  const c = M.calibrateTo(mc, m, 'Q4_K_M', 'f16', run);
  assert.ok(c.bw > 0.3 && c.bw < 1, `bandwidth factor ${c.bw}`);
  const tps = M.decodeTokS({ ...mc, bwEff: mc.bwEff * c.bw }, m, 'Q4_K_M', 'f16', run.promptN + run.evalN / 2);
  near(tps, run.evalN / run.decodeS, 0.005, 'calibrated tok/s');
  assert.equal(c.fl, 1); assert.ok(c.notes.some(n => /too short/.test(n)), 'a 36-token prompt does not calibrate prefill');
});

test('a long prompt calibrates prefill by compute', () => {
  const mc = M.MACHINES.thinkpad, m = M.MODELS.qwen36, want = M.prefillSeconds(mc, m, 'Q4_K_M', 2000) * 1.5;
  const run = { kind: 'ollama', promptN: 2000, prefillS: want, evalN: 0, decodeS: 0, arrivalsMs: [] };
  const c = M.calibrateTo(mc, m, 'Q4_K_M', 'f16', run);
  near(M.prefillSeconds({ ...mc, tflops: mc.tflops * c.fl }, m, 'Q4_K_M', 2000), want, 0.01, 'calibrated prefill');
  assert.ok(c.fl < 1, 'slower than modelled means less effective compute');
});

test('quantization names map onto the presets', () => {
  assert.equal(M.quantKey('Q4_K_M'), 'Q4_K_M'); assert.equal(M.quantKey('Q5_K_M'), 'Q4_K_M'); assert.equal(M.quantKey('BF16'), 'F16'); assert.equal(M.quantKey('q8_0'), 'Q8_0'); assert.equal(M.quantKey('IQ2_XS'), 'Q2_K');
});
