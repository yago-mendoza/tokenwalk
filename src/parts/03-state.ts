// ===== State and url =====
function machineFields(key) { const p = MACHINES[key], b = BUS[key] || [8000, 128]; return { ram: p.ramGB, tflops: p.tflops, mts: b[0], bus: b[1], vram: p.fastGB, vbw: p.bw }; }
function defaults() {
  return {
    machine: DEFAULTS.machine, model: DEFAULTS.model, quant: DEFAULTS.quant, kv: DEFAULTS.kv, ctx: DEFAULTS.ctx,
    sys: 800, docs: DEFAULTS.prompt - 800 - 50, q: 50, ans: DEFAULTS.output,
    temp: 0.7, topk: 6, topp: 0.95, seed: 1, cached: false, cold: false, disk: false, spec: false, gamma: 4, alpha: 0.7, keepalive: 5,
    ...machineFields(DEFAULTS.machine),
  };
}
let S = defaults();
const UI: UIState = { modelMode: (() => { try { return localStorage.getItem('llmc.modelMode') || 'grid'; } catch (e) { return 'grid'; } })(), lens: 'system', layer: -1, pauseTok: false, pauseLayer: false, scale: 'request', speed: 'fit', sel: null, hover: null, hoverCanvas: null, hoverName: '', follow: false, stale: false, jump: (() => { try { return localStorage.getItem('llmc.jump') || 'tok'; } catch (e) { return 'tok'; } })(), autoLens: (() => { try { return localStorage.getItem('llmc.autoLens') !== '0'; } catch (e) { return true; } })() };
const PARAMS = [
  ['machine', 'machine', 's'], ['model', 'model', 's'], ['quant', 'quant', 's'], ['kv', 'kv', 's'], ['ctx', 'ctx', 'n'],
  ['system', 'sys', 'n'], ['history', 'docs', 'n'], ['question', 'q', 'n'], ['answer', 'ans', 'n'],
  ['temp', 'temp', 'n'], ['topp', 'topp', 'n'], ['topk', 'topk', 'n'], ['cache', 'cached', 'b'], ['cold', 'cold', 'b'], ['disk', 'disk', 'b'],
  ['spec', 'spec', 'b'], ['gamma', 'gamma', 'n'], ['alpha', 'alpha', 'n'], ['keepalive', 'keepalive', 'n'], ['seed', 'seed', 'n'],
  ['ram', 'ram', 'n'], ['tflops', 'tflops', 'n'], ['mts', 'mts', 'n'], ['bus', 'bus', 'n'], ['vram', 'vram', 'n'], ['vbw', 'vbw', 'n'],
];
const LENSES = ['system', 'model', 'memory', 'tokens'];
const SCALES = ['request', 'token', 'layer', 'op'];
function readUrl() {
  const qp = new URLSearchParams(location.search);
  if (MACHINES[qp.get('machine')]) { S.machine = qp.get('machine'); Object.assign(S, machineFields(S.machine)); }
  for (const [u, k, kind] of PARAMS) {
    if (u === 'machine' || !qp.has(u)) continue;
    const v = qp.get(u);
    if (kind === 's') { if ((k === 'model' && MODELS[v]) || (k === 'quant' && QUANTS[v]) || (k === 'kv' && KV_TYPES[v])) S[k] = v; }
    else if (kind === 'b') S[k] = v === '1' || v === 'true';
    else { const n = Number(v); if (Number.isFinite(n)) S[k] = n; }
  }
  const v = qp.get('view'); const lv = ({ machine: 'system', all: 'system', timeline: 'system', log: 'system' })[v] || v; if (LENSES.includes(lv)) UI.lens = lv;
  if (qp.has('layer')) { const n = parseInt(qp.get('layer'), 10); if (Number.isFinite(n) && n > 0) UI.layer = n - 1; }
  const st = qp.get('step'); UI.pauseTok = st === '1' || st === '2'; UI.pauseLayer = st === '2';
  if (SCALES.includes(qp.get('scale'))) UI.scale = qp.get('scale');
  if (qp.has('speed')) UI.speed = qp.get('speed');
}
function writeUrl() {
  const d = defaults(), u = new URL(location.href), qp = new URLSearchParams();
  if (lang === 'es') qp.set('lang', 'es');
  for (const [name, k, kind] of PARAMS) { if (S[k] === d[k]) continue; qp.set(name, kind === 'b' ? (S[k] ? '1' : '0') : String(S[k])); }
  if (UI.lens !== 'system') qp.set('view', UI.lens);
  if (UI.layer >= 0) qp.set('layer', String(UI.layer + 1));
  if (UI.pauseTok || UI.pauseLayer) qp.set('step', UI.pauseLayer ? '2' : '1');
  if (UI.scale !== 'request') qp.set('scale', UI.scale);
  if (UI.speed !== 'fit') qp.set('speed', UI.speed);
  u.search = qp.toString();
  try { history.replaceState(null, '', u); } catch (e) {}
}
const isDefault = () => JSON.stringify(S) === JSON.stringify(defaults());
function machine() {
  const p = MACHINES[S.machine], mc = { ...p, ramGB: S.ram, tflops: S.tflops };
  if (p.kind === 'unified') { mc.bw = (S.mts * S.bus) / 8 / 1000; mc.hostBw = mc.bw; mc.fastGB = S.ram * (p.fastGB / p.ramGB); }
  else { mc.bw = S.vbw; mc.fastGB = S.vram; }
  // A live run can calibrate this machine: its effective bandwidth and compute are scaled to match it.
  const cal = CALIB[S.machine]; if (cal) { mc.bwEff *= cal.bw; mc.tflops *= cal.fl; mc.calibrated = true; }
  return mc;
}
