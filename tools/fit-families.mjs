#!/usr/bin/env node
// Fit the cost model's effective factors per hardware family to published benchmarks, and write data/calibration.json.
//
//   node tools/fit-families.mjs [--benchmarks data/benchmarks.json] [--machines data/machines.json]
//        [--bench-hardware data/bench-hardware.json] [--ref-models data/ref-models.json] [--out data/calibration.json]
//
// For each family (src/parts/01c-catalogue.ts, FAMILIES) it finds, by least squares on log error over the rows the
// model can represent (tools/bench.mjs), the share of spec bandwidth a decode step reaches (bwEff), the share of the
// spec FP16 peak a prefill reaches (computeEff; per GPU core for Apple M5 and later), the fixed cost per layer per
// pass (layerMs), and where the family has both: the extra fixed cost of a mixture-of-experts layer (moeLayerMs),
// the share of dense prefill arithmetic a MoE reaches (moeComputeEff), and a build term for rows from builds before
// 2025 (oldBuild). The presets with no measured calibration take these at build time (01c-catalogue.ts); the
// reference ThinkPad is never fitted. Deterministic: the same inputs give the same file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { benchContext, observations, fitFamily, predictFit, median, OLD_BEFORE, PRIOR } from './bench.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const readAbs = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const opt = { benchmarks: arg('benchmarks'), machines: arg('machines'), benchHardware: arg('bench-hardware'), refModels: arg('ref-models') };
const OUT = arg('out', new URL('../data/calibration.json', import.meta.url));
const quiet = process.argv.includes('--quiet');

const sig = (v, n = 4) => (v == null ? v : Number(v.toPrecision(n)));
export async function fitAll(o = {}) {
  const ctx = await benchContext({ benchmarks: o.benchmarks && readAbs(o.benchmarks), machines: o.machines && readAbs(o.machines), benchHardware: o.benchHardware && readAbs(o.benchHardware), refModels: o.refModels && readAbs(o.refModels) });
  const { obs, out, superseded } = observations(ctx), FAM = ctx.M.FAMILIES, families = {};
  for (const fam of Object.keys(FAM)) {
    const list = obs.filter(x => x.family === fam); if (!list.length) continue;
    const t0 = Date.now(), { factors } = fitFamily(ctx, list, FAM[fam].basis);
    // rounded to four significant digits, the values the presets use; residuals are computed with them
    const f = { basis: factors.basis, bwEff: sig(factors.bwEff), computeEff: sig(factors.computeEff), layerMs: sig(factors.layerMs),
      ...(factors.moeLayerMs ? { moeLayerMs: sig(factors.moeLayerMs), moeComputeEff: sig(factors.moeComputeEff) } : {}),
      ...(factors.oldBuild ? { oldBuild: { pp: sig(factors.oldBuild.pp), tg: sig(factors.oldBuild.tg) } } : {}) };
    const used = list.map(x => { const est = predictFit(ctx, x, f); return { id: x.id, machine: x.machine, model: x.model, kind: x.kind, tokens: x.tokens, published: x.published, estimate: sig(est, 5), errorPct: sig((est / x.published - 1) * 100, 3), build: x.build, date: x.date, old: x.old, weight: x.weight, ...(x.mapNote ? { mapNote: x.mapNote } : {}) }; });
    const err = k => { const e = used.filter(u => u.kind === k).map(u => Math.abs(u.errorPct)); return e.length ? sig(median(e), 3) : null; };
    const rms = Math.sqrt(list.reduce((s, x, i) => s + x.weight * Math.log(used[i].estimate / x.published) ** 2, 0) / list.reduce((s, x) => s + x.weight, 0));
    const machines = [...new Set(list.map(x => x.machine))];
    families[fam] = { label: FAM[fam].label, ...f, rows: list.length, machines, thin: machines.length < 3 || list.length < 8,
      rmsLogError: sig(rms, 3), medianAbsErrorPct: { pp: err('pp'), tg: err('tg') }, used };
    if (!quiet) console.log(`${fam.padEnd(18)} ${String(list.length).padStart(3)} rows, ${String(machines.length).padStart(2)} machines  bwEff ${f.bwEff}  computeEff ${f.computeEff}  layerMs ${f.layerMs}${f.moeLayerMs ? `  moe +${f.moeLayerMs} ms ×${f.moeComputeEff}` : ''}${f.oldBuild ? `  old pp×${f.oldBuild.pp} tg×${f.oldBuild.tg}` : ''}   |err| pp ${err('pp')}% tg ${err('tg')}%  (${Date.now() - t0} ms)`);
  }
  // presets whose family has no rows keep assumed factors
  const presetsAssumed = ctx.catalogue.machines.filter(e => !families[e.family] && !['thinkpad', 'thinkpadCpu'].includes(e.id)).map(e => e.id);
  return {
    schema: 'tokenwalk-calibration/1',
    fitted: ctx.benchmarks.compiled,
    inputs: { benchmarks: ctx.benchmarks.compiled, machines: ctx.catalogue.compiled },
    method: 'Least squares on the log of estimate / published over each family\'s usable rows (tools/bench.mjs): llama-bench pp (a prompt from an empty context) and tg (generation from an empty context), plain decoding, f16 KV, the row\'s micro-batch. Nelder-Mead in log space from a grid of starts, with a weak pull (weight ' + PRIOR.weight + ') towards ' + JSON.stringify({ bwEff: PRIOR.bwEff, computeEff: PRIOR.computeEff, layerMs: PRIOR.layerMs, moeLayerMs: PRIOR.moeLayerMs, moeComputeEff: PRIOR.moeComputeEff }) + ' so a factor the rows cannot pin stays put. Of rows measuring the same thing only the newest build is kept (flash attention on, on a tie); builds before ' + OLD_BEFORE + ' get a fitted build term (oldBuild) where the family also has newer rows. The reference ThinkPad is never fitted.',
    families,
    presetsAssumed,
    excluded: out.map(x => ({ id: x.id, reason: x.reason })),
    superseded,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();
if (isMain) {
  const cal = await fitAll(opt);
  fs.writeFileSync(OUT, JSON.stringify(cal, null, 1) + '\n');
  if (!quiet) console.log(`wrote ${OUT instanceof URL ? 'data/calibration.json' : OUT}: ${Object.keys(cal.families).length} families, ${Object.values(cal.families).reduce((s, f) => s + f.rows, 0)} rows used, ${cal.excluded.length} left out, ${cal.superseded.length} superseded`);
}
