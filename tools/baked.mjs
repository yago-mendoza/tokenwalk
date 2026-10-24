// The data files baked into the page and into the node sandbox the tests and tools load the parts in:
// the machine catalogue (data/machines.json), the per-family calibration (data/calibration.json, if fitted) and the
// model catalogue (data/ref-models.json).
import fs from 'node:fs';
import path from 'node:path';

const read = (root, f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) { return fallback; } };
export function bakedData(root = process.cwd(), { calibration } = {}) {
  const cat = read(root, 'data/machines.json', { machines: [] }), mod = read(root, 'data/ref-models.json', { models: {} });
  const cal = calibration !== undefined ? calibration : read(root, 'data/calibration.json', null);
  // the page needs the spec values and sources; the long notes stay in the file
  const machines = cat.machines.map(({ uncertain, ...e }) => e);
  return `const TW_CATALOGUE = ${JSON.stringify({ compiled: cat.compiled, machines })};
const TW_MODELS = ${JSON.stringify({ compiled: mod.compiled, models: mod.models })};
const TW_CALIBRATION = ${JSON.stringify(cal && { fitted: cal.fitted, families: Object.fromEntries(Object.entries(cal.families || {}).map(([k, f]) => [k, { label: f.label, bwEff: f.bwEff, computeEff: f.computeEff, basis: f.basis, layerMs: f.layerMs, ...(f.moeLayerMs ? { moeLayerMs: f.moeLayerMs } : {}), ...(f.moeComputeEff ? { moeComputeEff: f.moeComputeEff } : {}), rows: f.rows, machines: f.machines }])) })};
`;
}
