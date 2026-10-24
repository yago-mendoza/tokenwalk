import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadModel, PURE_PARTS } from './load.mjs';

// The machine catalogue (data/machines.json) and the presets built from it (01c-catalogue.ts).
const CAT = JSON.parse(fs.readFileSync(new URL('../../data/machines.json', import.meta.url), 'utf8'));
const M = await loadModel(PURE_PARTS);
const isUrlish = s => typeof s === 'string' && s.trim().length > 0;

test('the catalogue: every machine has sources, a date, spec values and a known family', () => {
  const ids = new Set();
  for (const e of CAT.machines) {
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`); ids.add(e.id);
    assert.ok(e.sources && Object.keys(e.sources).length > 0 && Object.values(e.sources).every(isUrlish), `${e.id}: no sources`);
    assert.match(e.asOf, /^\d{4}-\d{2}-\d{2}$/, `${e.id}: asOf`);
    assert.ok(e.bwSpec > 0 && e.fastGB > 0 && e.ramGB > 0 && e.units > 0, `${e.id}: spec values`);
    assert.ok(e.tflopsSpec === null || e.tflopsSpec > 0, `${e.id}: tflopsSpec`);
    assert.ok(['unified', 'discrete'].includes(e.kind), `${e.id}: kind ${e.kind}`);
    assert.ok(M.FAMILIES[e.family], `${e.id}: family ${e.family}`);
    assert.equal(M.FAMILIES[e.family].vendor, e.family === 'cpu' ? 'CPU' : e.vendor, `${e.id}: vendor ${e.vendor} vs family ${e.family}`);
    const p = e.priceUSD; assert.ok(p && 'msrp' in p && 'street' in p && 'date' in p && 'source' in p, `${e.id}: priceUSD shape`);
    if (p.msrp != null || p.street != null) assert.ok(isUrlish(p.source), `${e.id}: a price without a source`);
    if (e.kind === 'unified') { assert.ok(Array.isArray(e.bus), `${e.id}: no bus`); assert.ok(Math.abs((e.bus[0] * e.bus[1]) / 8000 - e.bwSpec) / e.bwSpec < 0.005, `${e.id}: bus ${e.bus} is not ${e.bwSpec} GB/s`); }
  }
});

test('every preset has sources, asOf and an estimate provenance; the measured ones are marked calibrated', () => {
  for (const [k, p] of Object.entries(M.MACHINES)) {
    assert.ok(p.sources && Object.keys(p.sources).length, `${k}: no sources`);
    assert.match(p.asOf || '', /^\d{4}-\d{2}-\d{2}$/, `${k}: asOf`);
    assert.ok(['calibrated', 'family-fit', 'assumed'].includes(p.estimate), `${k}: estimate ${p.estimate}`);
    assert.equal(p.estimate === 'calibrated', !p.est, `${k}: est and estimate disagree`);
    assert.ok(p.bwEff > 0 && p.bwEff <= 1 && p.tflops > 0 && p.layerMs >= 0, `${k}: effective values`);
    assert.ok(p.bwSpec === p.bw, `${k}: bw ${p.bw} is not the spec ${p.bwSpec}`);
  }
  assert.deepEqual(Object.keys(M.MACHINES).filter(k => M.MACHINES[k].estimate === 'calibrated'), ['thinkpad', 'thinkpadCpu']);
});

test('the presets that existed keep their ids, and the research rows they map onto are not duplicated', () => {
  for (const k of ['thinkpad', 'thinkpadCpu', 'strixHalo', 'm4max', 'rtx4090', 'rtx5090', 'h100']) assert.ok(M.MACHINES[k], `${k} is gone`);
  for (const dup of ['ai350', 'strixHalo128']) assert.ok(!M.MACHINES[dup], `${dup} duplicates a preset`);
  assert.equal(Object.keys(M.MACHINES).length, CAT.machines.length);
});

test('the reference ThinkPad stays exactly as measured', () => {
  const t = M.MACHINES.thinkpad;
  assert.deepEqual([t.bw, t.bwEff, t.tflops, t.layerMs, t.fastGB, t.ramGB, t.diskGBs], [128, 0.33, 0.75, 0.9, 47.6, 64, 0.4]);
  const c = M.MACHINES.thinkpadCpu;
  assert.deepEqual([c.bw, c.bwEff, c.tflops, c.layerMs, c.fastGB], [128, 0.33, 0.42, 0.9, 60]);
});

test('a unified preset gets its memory bus, so the Setup computes its bandwidth', () => {
  for (const [k, p] of Object.entries(M.MACHINES)) if (p.kind === 'unified') {
    const f = M.machineFields(k), bw = (f.mts * f.bus) / 8 / 1000;
    assert.ok(Math.abs(bw - p.bw) / p.bw < 0.005, `${k}: ${f.mts} x ${f.bus} = ${bw} GB/s, preset ${p.bw}`);
  }
});
