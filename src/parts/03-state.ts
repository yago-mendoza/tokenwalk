// ===== State and url =====
function defaults() {
  return {
    machine: DEFAULTS.machine, model: DEFAULTS.model, quant: DEFAULTS.quant, kv: DEFAULTS.kv, ctx: DEFAULTS.ctx,
    sys: 800, docs: DEFAULTS.prompt - 800 - 50, q: 50, ans: DEFAULTS.output,
    temp: 0.7, topk: 6, topp: 0.95, seed: 1, cached: false, cold: false, disk: false, spec: false, mtp: true, gamma: 4, alpha: 0.7, keepalive: 5,
    ...machineFields(DEFAULTS.machine),
  };
}
let S = defaults();
const UI: UIState = { modelMode: (() => { try { return localStorage.getItem('llmc.modelMode') || 'grid'; } catch (e) { return 'grid'; } })(), lens: 'system', layer: -1, pauseTok: false, pauseLayer: false, scale: 'request', speed: 'fit', sel: null, hover: null, hoverCanvas: null, hoverName: '', follow: false, stale: false, jump: (() => { try { return localStorage.getItem('llmc.jump') || 'tok'; } catch (e) { return 'tok'; } })(), autoLens: (() => { try { return localStorage.getItem('llmc.autoLens') !== '0'; } catch (e) { return true; } })() };
// The address carries the simulated setup, short keys and only what differs from the defaults (the machine fields
// only when they differ from the chosen preset's). [key, state field, kind, older names still read].
const PARAMS: [string, string, string, ...string[]][] = [
  ['m', 'machine', 's', 'machine'], ['mo', 'model', 's', 'model'], ['qt', 'quant', 's', 'quant'], ['kv', 'kv', 's'], ['ctx', 'ctx', 'n'],
  ['sy', 'sys', 'n', 'system'], ['doc', 'docs', 'n', 'history'], ['qn', 'q', 'n', 'question'], ['ans', 'ans', 'n', 'answer'],
  ['temp', 'temp', 'n'], ['topp', 'topp', 'n'], ['topk', 'topk', 'n'], ['pc', 'cached', 'b', 'cache'], ['cold', 'cold', 'b'], ['disk', 'disk', 'b'],
  ['spec', 'spec', 'b'], ['mtp', 'mtp', 'b'], ['g', 'gamma', 'n', 'gamma'], ['a', 'alpha', 'n', 'alpha'], ['ka', 'keepalive', 'n', 'keepalive'], ['seed', 'seed', 'n'],
  ['ram', 'ram', 'n'], ['tf', 'tflops', 'n', 'tflops'], ['mts', 'mts', 'n'], ['bus', 'bus', 'n'], ['vr', 'vram', 'n', 'vram'], ['vb', 'vbw', 'n', 'vbw'],
];
const MACHINE_FIELDS = ['ram', 'tflops', 'mts', 'bus', 'vram', 'vbw'];
const LENSES = ['system', 'model', 'memory', 'tokens'];
const SCALES = ['request', 'token', 'layer', 'op'];
// Ranges a value from the address must fall in; anything else is ignored.
const RANGE: Record<string, [number, number]> = {
  ctx: [256, 1048576], sys: [0, 4000], docs: [0, 130000], q: [0, 1000], ans: [1, 2000], temp: [0, 2], topp: [0.01, 1], topk: [1, 6],
  gamma: [1, 8], alpha: [0.3, 0.95], keepalive: [0, 60], seed: [1, 99999], ram: [4, 1024], tflops: [0.05, 2000], mts: [1000, 20000], bus: [64, 1024], vram: [4, 256], vbw: [50, 10000],
};
const qpGet = (qp: URLSearchParams, names: string[]) => { for (const n of names) if (qp.has(n)) return qp.get(n); return null; };
// True when the address sets any part of the setup: such a link opens in the simulation, exactly as written.
const urlHasSetup = () => { const qp = new URLSearchParams(location.search); return PARAMS.some(([u, , , ...old]) => [u, ...old].some(n => qp.has(n))); };
function readUrl() {
  const qp = new URLSearchParams(location.search);
  const mk = qpGet(qp, ['m', 'machine']);
  if (mk && MACHINES[mk] && mk !== 'live') { S.machine = mk; Object.assign(S, machineFields(S.machine)); }
  for (const [u, k, kind, ...old] of PARAMS) {
    if (k === 'machine') continue;
    const v = qpGet(qp, [u, ...old]); if (v === null) continue;
    if (kind === 's') { if ((k === 'model' && MODELS[v] && v !== 'live') || (k === 'quant' && QUANTS[v]) || (k === 'kv' && KV_TYPES[v])) S[k] = v; }
    else if (kind === 'b') { if (v === '1' || v === 'true') S[k] = true; else if (v === '0' || v === 'false') S[k] = false; }
    else { const n = Number(v), r = RANGE[k]; if (v.trim() !== '' && Number.isFinite(n) && (!r || (n >= r[0] && n <= r[1]))) S[k] = n; }
  }
  const v = qpGet(qp, ['v', 'view']); const lv = ({ machine: 'system', all: 'system', timeline: 'system', log: 'system' })[v] || v; if (LENSES.includes(lv)) UI.lens = lv;
  const mm = qp.get('mm'); if (mm === 'grid' || mm === 'stack') UI.modelMode = mm; else if (urlHasSetup()) UI.modelMode = 'grid';
  { const ly = qpGet(qp, ['ly', 'layer']); if (ly !== null) { const n = parseInt(ly, 10); if (Number.isFinite(n) && n > 0) UI.layer = n - 1; } }
  const st = qpGet(qp, ['st', 'step']); UI.pauseTok = st === '1' || st === '2'; UI.pauseLayer = st === '2';
  { const sc = qpGet(qp, ['sc', 'scale']); if (SCALES.includes(sc)) UI.scale = sc; }
  { const sp = qpGet(qp, ['spd', 'speed']); if (sp !== null && (sp === 'fit' || (Number.isFinite(Number(sp)) && Number(sp) > 0))) UI.speed = sp; }
}
// The query for a setup (the simulated one by default); `at` adds the moment on the timeline.
function setupQuery(st = S, at: number | null = null) {
  const d = defaults(), qp = new URLSearchParams(), mf = MACHINES[st.machine] ? machineFields(st.machine) : {};
  if (lang === 'es') qp.set('lang', 'es');
  for (const [name, k, kind] of PARAMS) {
    const base = MACHINE_FIELDS.includes(k) ? mf[k] : d[k];
    if (st[k] === base) continue;
    qp.set(name, kind === 'b' ? (st[k] ? '1' : '0') : String(st[k]));
  }
  if (UI.lens !== 'system') qp.set('v', UI.lens);
  if ((UI.modelMode || 'grid') !== 'grid') qp.set('mm', UI.modelMode);
  if (UI.layer >= 0) qp.set('ly', String(UI.layer + 1));
  if (UI.pauseTok || UI.pauseLayer) qp.set('st', UI.pauseLayer ? '2' : '1');
  if (UI.scale !== 'request') qp.set('sc', UI.scale);
  if (UI.speed !== 'fit') qp.set('spd', UI.speed);
  if (at !== null && at > 0) qp.set('at', String(Math.round(at * 1e6) / 1e6));
  return qp.toString();
}
function writeUrl() {
  if (isReal()) return; // the address keeps the simulation; the real settings live in tw.realS
  const u = new URL(location.href); u.search = setupQuery();
  try { history.replaceState(null, '', u); } catch (e) {}
}
const isDefault = () => JSON.stringify(S) === JSON.stringify(defaults());
// The machine the request runs on: the preset with the Setup's overrides and any live calibration (resolveMachine, 01e).
function machine() { return resolveMachine(MACHINES[S.machine], S, CALIB[S.machine]); }
