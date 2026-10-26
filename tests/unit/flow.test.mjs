import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModel } from './load.mjs';

// The Flow lens's description of a pass (src/parts/01f-flow.ts): shapes from the configuration, products that fit,
// and lives that make sense.
const M = await loadModel(['01-data.ts', '01c-catalogue.ts', '01e-estimate.ts', '01f-flow.ts']);
const spec = (key, o = {}) => M.flowSpec(M.MODELS[key], M.shapesOf(key), { kind: 'attn', nt: 1, ctx: 6801, nOut: 1, bpw: 4.9, quant: 'Q4_K_M', kvBytes: 2, kv: 'f16', ...o });
const side = f => f.reduce((s, x) => s * x[1], 1);
const kinds = key => [...new Set(M.layerKinds(M.MODELS[key]))];

test('every matrix product fits, in every model, every layer kind, prefill and decode', () => {
  for (const key of Object.keys(M.MODELS)) for (const kind of kinds(key)) for (const nt of [1, 512]) {
    const { ops, T } = spec(key, { kind, nt });
    for (const o of ops.filter(o => o.kind === 'matmul' || o.kind === 'attn' || o.kind === 'state' || (o.kind === 'route' && o.b))) {
      const A = T[o.a], B = T[o.b], C = T[o.out];
      assert.ok(M.flowFits(A, B), `${key} ${kind} ${o.id}: [${side(A.r)}×${side(A.c)}]·[${side(B.r)}×${side(B.c)}]`);
      assert.equal(side(C.r), side(A.r), `${key} ${o.id}: rows carry through`);
      assert.equal(side(C.c), side(B.c), `${key} ${o.id}: columns come from the second operand`);
    }
  }
});
test('dimensions come from the configuration', () => {
  const q = spec('qwen36'), l = spec('llama8b');
  assert.equal(q.dims.d, 2048); assert.equal(q.dims.H, 16); assert.equal(q.dims.Hkv, 2); assert.equal(q.dims.group, 8); assert.equal(q.dims.V, 248320);
  assert.equal(q.dims.E, 256); assert.equal(q.dims.k, 8); assert.equal(q.dims.F, 512);
  assert.equal(l.dims.F, 14336); assert.equal(l.dims.E, 0); assert.ok(!l.T.Wr, 'a dense model has no router');
  // Qwen3.6's attn_q is twice the heads' width: a query and an output gate, projected together
  assert.equal(q.T.q.c.map(f => f[0]).join(), 'k,H,dh'); assert.equal(l.T.q.c.map(f => f[0]).join(), 'H,dh');
});
test('the tokens in flight set the height: a prefill chunk is tall, a decode step one row', () => {
  assert.equal(side(spec('qwen36', { nt: 512 }).T.xn.r), 512); assert.equal(side(spec('qwen36').T.xn.r), 1);
  assert.equal(side(spec('qwen36', { nt: 3 }).T.q.r), 3);
});
test('lives: intermediates are born and die inside the pass, the cache and the state outlive it', () => {
  const { T, ops } = spec('qwen36');
  for (const t of Object.values(T)) if (t.life === 'op') { assert.ok(t.born >= 0 && t.dies >= t.born, `${t.id} born ${t.born} dies ${t.dies}`); assert.ok(t.dies < ops.length); }
  assert.equal(T.Kc.life, 'request'); assert.equal(T.x.life, 'stream'); assert.equal(T.x.born, 0);
  assert.equal(ops[T.x.dies].id, 'normf'); assert.equal(ops[T.q.born].id, 'q'); assert.equal(ops[T.s.dies].id, 'softmax');
  const dn = spec('qwen36', { kind: 'delta' }).T;
  assert.equal(dn.S.life, 'fixed'); assert.ok(!dn.Kc, 'a DeltaNet layer keeps no KV cache');
});
test('the KV cache grows with the context, the DeltaNet state does not', () => {
  const a = spec('qwen36', { ctx: 100 }).T, b = spec('qwen36', { ctx: 10000 }).T;
  assert.equal(b.Kc.bytes / a.Kc.bytes, 100); assert.equal(a.Kc.bytes, 100 * 2 * 256 * 2);
  assert.equal(spec('qwen36', { kind: 'delta', ctx: 100 }).T.S.bytes, spec('qwen36', { kind: 'delta', ctx: 10000 }).T.S.bytes);
  assert.equal(spec('qwen36', { kind: 'delta' }).T.S.mult, 32);
});
test('precision: weights by their format, routed experts at their own width when the file says so', () => {
  const g = M.flowSpec(M.MODELS['gpt-oss-20b'], M.shapesOf('gpt-oss-20b'), { kind: 'attn', nt: 1, ctx: 10, nOut: 1, bpw: 4.9, expertBpw: 4.25, quant: 'Q4_K_M', kvBytes: 2, kv: 'f16' });
  assert.equal(g.T.Weu.prec, 'MXFP4'); assert.equal(g.T.Wq.prec, 'Q4_K_M');
  assert.equal(g.T.Wq.bytes, (2880 * 4096 * 4.9) / 8);
});
