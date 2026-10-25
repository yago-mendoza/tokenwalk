#!/usr/bin/env node
// The accuracy check as a picture: estimate against published measurement for every benchmark row that
// docs/accuracy.md uses, decode (tg) on the left and prefill (pp) on the right, coloured by vendor.
//
//   node tools/accuracy-plot.mjs [--out docs/accuracy-plot.svg]
//
// Same inputs and same estimate as tools/accuracy.mjs (tools/bench.mjs, data/calibration.json): each point is the
// estimate with the machine held out of its family's fit; families with fewer than three machines have no held-out
// estimate and are drawn hollow with the in-sample one. Writes a standalone SVG (dark, like the console).
import fs from 'node:fs';
import { benchContext, observations, predictFit, crossValidate, median } from './bench.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const CAL = JSON.parse(fs.readFileSync(new URL('../data/calibration.json', import.meta.url), 'utf8'));
const OUT = arg('out', new URL('../docs/accuracy-plot.svg', import.meta.url));

const ctx = await benchContext();
const { obs } = observations(ctx);
const points = [];
for (const fam of Object.keys(CAL.families)) {
  const f = CAL.families[fam], list = obs.filter(o => o.family === fam);
  if (!list.length) continue;
  const held = Object.fromEntries(crossValidate(ctx, list, f.basis, f).rows.map(r => [r.id, r.estimate]));
  for (const o of list) points.push({ fam, kind: o.kind, published: o.published, estimate: held[o.id] ?? predictFit(ctx, o, f), held: o.id in held });
}

// Vendors, in a fixed order; colours are the dark categorical slots 1-5 of the dataviz palette.
const VENDORS = [
  ['Apple', /^apple/, '#3987e5'],
  ['NVIDIA', /^nvidia/, '#d95926'],
  ['AMD', /^amd/, '#199e70'],
  ['Intel', /^intel/, '#c98500'],
  ['CPU only', /^cpu/, '#d55181'],
];
const vendorOf = fam => VENDORS.find(([, re]) => re.test(fam));
const C = { bg: '#121316', panel: '#17181c', grid: '#26282e', axis: '#3a3d45', ink: '#e8e7e3', ink2: '#a3a29c', ink3: '#6f6e6a' };
const W = 1440, H = 740, PAD = { l: 78, r: 24, t: 128, b: 74 }, GAP = 70, PW = (W - PAD.l - PAD.r - GAP - 40) / 2, PH = H - PAD.t - PAD.b;
const FONT = `font-family="JetBrains Mono, Consolas, Menlo, monospace"`;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmt = v => (v >= 1000 ? `${v / 1000}k` : String(v));

function panel(kind, title, x0) {
  const pts = points.filter(p => p.kind === kind);
  const vals = pts.flatMap(p => [p.published, p.estimate]);
  // bounds snapped to the 1-2-5 steps just outside the data
  const steps = [...Array(8)].flatMap((_, e) => [1, 2, 5].map(m => m * 10 ** (e - 1)));
  const lo = steps.filter(v => v <= Math.min(...vals) / 1.15).pop(), hi = steps.find(v => v >= Math.max(...vals) * 1.15);
  const sx = v => x0 + ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * PW;
  const sy = v => PAD.t + PH - ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * PH;
  const S = [];
  S.push(`<rect x="${x0}" y="${PAD.t}" width="${PW}" height="${PH}" fill="${C.panel}"/>`);
  for (const v of steps.filter(v => v >= lo && v <= hi)) {
    const major = Math.abs(Math.log10(v) % 1) < 1e-9;
    S.push(`<line x1="${sx(v)}" y1="${PAD.t}" x2="${sx(v)}" y2="${PAD.t + PH}" stroke="${C.grid}" stroke-width="${major ? 1.2 : 0.6}"/>`);
    S.push(`<line x1="${x0}" y1="${sy(v)}" x2="${x0 + PW}" y2="${sy(v)}" stroke="${C.grid}" stroke-width="${major ? 1.2 : 0.6}"/>`);
    S.push(`<text x="${sx(v)}" y="${PAD.t + PH + 22}" fill="${C.ink3}" font-size="14" text-anchor="middle" ${FONT}>${fmt(v)}</text>`);
    S.push(`<text x="${x0 - 10}" y="${sy(v) + 5}" fill="${C.ink3}" font-size="14" text-anchor="end" ${FONT}>${fmt(v)}</text>`);
  }
  // perfect agreement and a band of plus or minus 20%
  S.push(`<line x1="${sx(lo)}" y1="${sy(lo)}" x2="${sx(hi)}" y2="${sy(hi)}" stroke="${C.ink2}" stroke-width="1.5"/>`);
  for (const k of [1.2, 1 / 1.2]) {
    const [a, b] = k > 1 ? [lo, hi / k] : [lo / k, hi];
    S.push(`<line x1="${sx(a)}" y1="${sy(a * k)}" x2="${sx(b)}" y2="${sy(b * k)}" stroke="${C.ink3}" stroke-width="1" stroke-dasharray="5 5"/>`);
  }
  for (const p of pts) {
    const [, , col] = vendorOf(p.fam);
    S.push(p.held
      ? `<circle cx="${sx(p.published).toFixed(1)}" cy="${sy(p.estimate).toFixed(1)}" r="5.5" fill="${col}" stroke="${C.panel}" stroke-width="2" fill-opacity="0.9"/>`
      : `<circle cx="${sx(p.published).toFixed(1)}" cy="${sy(p.estimate).toFixed(1)}" r="5" fill="none" stroke="${col}" stroke-width="2"/>`);
  }
  const med = median(pts.filter(p => p.held).map(p => Math.abs(p.estimate / p.published - 1) * 100));
  S.push(`<text x="${x0}" y="${PAD.t - 16}" fill="${C.ink}" font-size="19" font-weight="700" ${FONT}>${esc(title)}</text>`);
  S.push(`<text x="${x0 + PW}" y="${PAD.t - 16}" fill="${C.ink2}" font-size="15" text-anchor="end" ${FONT}>${pts.length} rows · median miss ${med.toFixed(med < 10 ? 1 : 0)}% held out</text>`);
  S.push(`<text x="${x0 + PW / 2}" y="${PAD.t + PH + 52}" fill="${C.ink2}" font-size="15" text-anchor="middle" ${FONT}>published, tok/s</text>`);
  return S.join('\n');
}

const S = [];
S.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
S.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
S.push(`<text x="${PAD.l}" y="40" fill="${C.ink}" font-size="22" font-weight="700" ${FONT}>Estimate against published llama.cpp benchmarks</text>`);
let lx = PAD.l;
for (const [name, , col] of VENDORS) {
  S.push(`<circle cx="${lx + 6}" cy="72" r="6" fill="${col}"/><text x="${lx + 20}" y="77" fill="${C.ink2}" font-size="15" ${FONT}>${name}</text>`);
  lx += 34 + name.length * 9.5;
}
S.push(`<circle cx="${lx + 6}" cy="72" r="5" fill="none" stroke="${C.ink2}" stroke-width="2"/><text x="${lx + 20}" y="77" fill="${C.ink2}" font-size="15" ${FONT}>in-sample only (AMD Instinct, two machines)</text>`);
S.push(`<text x="22" y="${PAD.t + PH / 2}" fill="${C.ink2}" font-size="15" text-anchor="middle" transform="rotate(-90 22 ${PAD.t + PH / 2})" ${FONT}>estimated, tok/s</text>`);
S.push(panel('tg', 'Decode (generation)', PAD.l));
S.push(panel('pp', 'Prefill (prompt processing)', PAD.l + PW + GAP + 40));
S.push('</svg>');
fs.writeFileSync(OUT, S.join('\n'));
console.log(`wrote ${OUT instanceof URL ? OUT.pathname : OUT}: ${points.filter(p => p.kind === 'tg').length} tg, ${points.filter(p => p.kind === 'pp').length} pp points`);
