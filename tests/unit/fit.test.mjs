import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { benchContext, observations, predict, fitMachine } from '../../tools/bench.mjs';
import { loadModel, PURE_PARTS } from './load.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ctx = await benchContext();

// A tiny benchmark set made from known factors: four GeForce cards on the Llama 2 7B anchor, plus rows the fit must
// leave out (an Ollama run, an H100 of unknown variant) and an older build of one measurement.
const TRUE = { basis: 'tflopsSpec', bwEff: 0.7, computeEff: 0.5, layerMs: 0.03 };
function fixture() {
  const row = (id, hardware, mk, extra = {}) => {
    const base = { id, hardware, hardwareFamily: 'NVIDIA', backend: 'CUDA', engine: 'llama.cpp', engineVersion: 'commit test', model: 'Llama 2 7B', params: '6.74B', quant: 'Q4_0', fileGB: 3.56, fileUnit: 'GiB',
      batch: 1, ubatch: null, flashAttention: 1, threads: null, date: '2026-01-01', sourceUrl: 'https://example.invalid/fixture', notes: 'synthetic', ...extra };
    if (!mk) return { ...base, pp: { tokens: 512, tps: 1000 }, tg: { tokens: 128, tps: 100 } };
    const o = { machine: mk, entry: ctx.entries[mk], model: 'llama2-7b', bpw: (3.56 * 1.073741824 * 8e9) / ctx.data.models['llama2-7b'].total, ub: 512 };
    return { ...base, pp: { tokens: 512, tps: predict(ctx, { ...o, kind: 'pp', tokens: 512 }, TRUE) }, tg: { tokens: 128, tps: predict(ctx, { ...o, kind: 'tg', tokens: 128 }, TRUE) } };
  };
  return { schema: 'tokenwalk-benchmarks/1', compiled: '2026-01-01', rows: [
    row('t01', 'NVIDIA RTX 3060', 'rtx3060'), row('t02', 'NVIDIA RTX 3090', 'rtx3090'), row('t03', 'NVIDIA RTX 4090', 'rtx4090'), row('t04', 'NVIDIA RTX 5090', 'rtx5090'),
    { ...row('t05', 'NVIDIA RTX 4090', 'rtx4090', { date: '2025-06-01' }), pp: { tokens: 512, tps: 1 }, tg: { tokens: 128, tps: 1 } },
    row('t06', 'NVIDIA RTX 4090', null, { engine: 'Ollama' }), row('t07', 'NVIDIA H100 80GB', null),
  ] };
}

test('the fit script recovers the factors a tiny fixture was made from, and says what it left out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-fit-')), bench = path.join(dir, 'benchmarks.json'), out = path.join(dir, 'calibration.json');
  fs.writeFileSync(bench, JSON.stringify(fixture()));
  const r = spawnSync(process.execPath, ['tools/fit-families.mjs', '--benchmarks', bench, '--out', out, '--quiet'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const cal = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(cal.schema, 'tokenwalk-calibration/1');
  assert.deepEqual(Object.keys(cal.families), ['nvidia-cuda']);
  const f = cal.families['nvidia-cuda'];
  // within 3%: the weak pull towards the prior (tools/bench.mjs, PRIOR) trades a little bwEff for layerMs, which four
  // cards' bandwidths separate only loosely; the estimates themselves come back within 1%
  for (const k of ['bwEff', 'computeEff', 'layerMs']) assert.ok(Math.abs(f[k] / TRUE[k] - 1) < 0.03, `${k}: ${f[k]} vs ${TRUE[k]}`);
  assert.ok(f.rmsLogError < 0.01, `residual ${f.rmsLogError}`);
  assert.equal(f.rows, 8); assert.deepEqual(f.machines.sort(), ['rtx3060', 'rtx3090', 'rtx4090', 'rtx5090']);
  assert.ok(cal.excluded.some(x => x.id === 't06:tg' && /Ollama/.test(x.reason)), 'the Ollama row');
  assert.ok(cal.excluded.some(x => x.id === 't07:pp' && /SXM or PCIe/.test(x.reason)), 'the H100 row');
  assert.ok(cal.superseded.some(x => x.id === 't05:tg' && x.by === 't03:tg'), 'the older build');
  // deterministic: a second run writes the same file
  const out2 = path.join(dir, 'again.json');
  spawnSync(process.execPath, ['tools/fit-families.mjs', '--benchmarks', bench, '--out', out2, '--quiet'], { cwd: ROOT });
  assert.equal(fs.readFileSync(out2, 'utf8'), fs.readFileSync(out, 'utf8'));
});

test('no published row is ever mapped onto the reference ThinkPad', () => {
  const { obs } = observations(ctx);
  assert.ok(obs.length > 100);
  assert.ok(obs.every(o => o.machine !== 'thinkpad' && o.machine !== 'thinkpadCpu'));
});

test('the presets use exactly the factors the accuracy report estimates with', async () => {
  const cal = JSON.parse(fs.readFileSync(new URL('../../data/calibration.json', import.meta.url), 'utf8'));
  const M = await loadModel(PURE_PARTS);
  const cat = JSON.parse(fs.readFileSync(new URL('../../data/machines.json', import.meta.url), 'utf8'));
  let n = 0;
  for (const e of cat.machines) {
    const p = M.MACHINES[e.id], f = cal.families[e.family];
    if (!p.est || !f) continue;
    const m = fitMachine(e, f);
    assert.equal(p.bwEff, m.bwEff, e.id); assert.equal(p.layerMs, m.layerMs, e.id);
    assert.ok(Math.abs(p.tflops - m.tflops) <= 0.0005 * Math.max(1, m.tflops), `${e.id}: tflops ${p.tflops} vs ${m.tflops}`);
    assert.equal(p.moeLayerMs, f.moeLayerMs, e.id); assert.equal(p.estimate, 'family-fit', e.id);
    n++;
  }
  assert.ok(n >= 60, `only ${n} presets checked`);
});

test('a mixture of experts can store its experts at another width: file and per-token reads add up', async () => {
  const M = await loadModel(PURE_PARTS), m = M.modelFromConfig('gpt-oss-20b', JSON.parse(fs.readFileSync(new URL('../../data/ref-models.json', import.meta.url), 'utf8')).models['gpt-oss-20b']).model;
  const routedAll = m.experts * m.expertParams * m.layers, routedUsed = m.expertsUsed * m.expertParams * m.layers;
  const q = { bpw: 8, expertBpw: 4.25 };
  assert.ok(Math.abs(M.fileGB(m, q) - ((m.total - routedAll) * 8 + routedAll * 4.25) / 8e9) < 1e-9);
  assert.ok(Math.abs(M.readGB(m, q) - ((m.readParams - routedUsed) * 8 + routedUsed * 4.25) / 8e9) < 1e-9);
  // equal widths give exactly the single-width numbers
  assert.equal(M.fileGB(m, { bpw: 6, expertBpw: 6 }), M.fileGB(m, 6));
  assert.equal(M.readGB(m, { bpw: 6, expertBpw: 6 }), M.readGB(m, 6));
  // a prefill pass touching every expert reads the whole file's worth of experts
  assert.ok(Math.abs(M.passReadGB(m, q, 1e6) - M.fileGB(m, q) + (m.total - m.readParams - routedAll + routedUsed) * 8 / 8e9) < 0.05);
});

test('reference models match their published parameter counts', async () => {
  const M = await loadModel(PURE_PARTS), ref = JSON.parse(fs.readFileSync(new URL('../../data/ref-models.json', import.meta.url), 'utf8')).models;
  for (const [k, c] of Object.entries(ref)) {
    const { model } = M.modelFromConfig(k, c);
    assert.ok(Math.abs(model.total / c.publishedParams - 1) < 0.01, `${k}: ${model.total} vs ${c.publishedParams}`);
    assert.ok(c.source && c.source.startsWith('https://'), `${k}: no source`);
    if (c.publishedActive) assert.ok(model.readParams < c.publishedActive * 1.1, `${k}: reads ${model.readParams}`);
  }
});
