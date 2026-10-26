// ===== Flow: the shapes one pass moves, and how long each piece lives =====
// A pure description of one pass through the model, from its configuration only (dimensions, heads, experts, the
// matrices a layer lists): every tensor with its shape as named dimensions, every operation with what it reads,
// what it writes and the cost-model operation it belongs to, and every tensor's life (made by, last used by, or kept
// across tokens). No DOM and no app state: the Flow lens (31-view-flow.ts) draws it, the tests check that every
// matrix product fits. Quantities the configuration does not give are derived and say how, or are left out.

// The named dimensions, in the order the legend lists them. A side of a tensor is a product of factors.
const FLOW_DIMS = ['n', 'd', 'H', 'Hkv', 'dh', 'F', 'E', 'V'] as const;
type FlowDim = typeof FLOW_DIMS[number] | 'c' | 'one' | 'k' | 'x';
type FlowFactor = [FlowDim, number];
interface FlowTensor {
  id: string; role: 'ids' | 'act' | 'weight' | 'kv' | 'state' | 'logits' | 'vec';
  r: FlowFactor[]; c: FlowFactor[]; mult?: number; multDim?: FlowDim;
  name: string; bytes: number; prec: string; bpw?: number;
  born: number; dies: number; life: 'op' | 'stream' | 'request' | 'fixed' | 'model';
  section: 'in' | 'attn' | 'delta' | 'ffn' | 'out'; w?: string;
}
interface FlowOp { id: string; kind: 'gather' | 'norm' | 'matmul' | 'attn' | 'softmax' | 'act' | 'add' | 'route' | 'state' | 'sum' | 'sample' | 'append'; a?: string; b?: string; out: string; cost: string | null; section: FlowTensor['section']; i: number; extra?: string[] }

const side = (f: FlowFactor[]) => f.reduce((s, x) => s * x[1], 1);
// Two operands of a matrix product fit when the columns of the first are the rows of the second, factor by factor
// in size (the dimension names may differ: a head's keys, transposed, have head_dim rows).
const flowFits = (A: { c: FlowFactor[] }, B: { r: FlowFactor[] }) => side(A.c) === side(B.r);

interface FlowOpts {
  kind: 'attn' | 'delta';
  /** tokens this pass carries (a prefill chunk, 1 for a decode token, k + 1 for a verification round) */
  nt: number;
  /** tokens in the KV cache at this layer once this pass has written its own */
  ctx: number;
  /** positions the output head scores in this pass (0 when a prefill chunk is not the last) */
  nOut: number;
  bpw: number; expertBpw?: number; quant: string; kvBytes: number; kv: string; tied?: boolean | null;
}

// The pass, as a list of operations in order (input, one layer of the given kind, output) and the tensors between them.
function flowSpec(m: ModelSpec, sh: LayerShapes, o: FlowOpts) {
  const d = m.hidden, H = m.qHeads, Hkv = m.kvHeads, dh = m.headDim, nt = Math.max(1, o.nt), V = m.vocab;
  const ops: FlowOp[] = [], T: Record<string, FlowTensor> = {}, notes: string[] = [];
  const find = (list: any[] | undefined, nm: string) => (list || []).find(s => s[0] === nm);
  const N: FlowFactor = ['n', nt];
  const act = (id: string, name: string, c: FlowFactor[], section: FlowTensor['section'], extra: Partial<FlowTensor> = {}): FlowTensor =>
    (T[id] = { id, role: 'act', r: [N], c, name, bytes: nt * side(c) * 4, prec: 'f32', born: -1, dies: -1, life: 'op', section, ...extra });
  const wt = (id: string, s: [string, number, number], rd: FlowFactor[], cd: FlowFactor[], section: FlowTensor['section'], bpw = o.bpw, prec = o.quant): FlowTensor =>
    (T[id] = { id, role: 'weight', r: side(rd) === s[1] ? rd : [['x', s[1]]], c: side(cd) === s[2] ? cd : [['x', s[2]]], name: s[0], bytes: (s[1] * s[2] * bpw) / 8, prec, bpw, born: -1, dies: -1, life: 'model', section, w: s[0] });
  const op = (id: string, kind: FlowOp['kind'], a: string | undefined, b: string | undefined, out: string, cost: string | null, section: FlowTensor['section'], extra?: string[]) => {
    const p: FlowOp = { id, kind, a, b, out, cost, section, i: ops.length, extra }; ops.push(p);
    for (const t of [a, b, ...(extra || [])]) if (t && T[t] && T[t].life === 'op') T[t].dies = p.i;
    if (T[out] && T[out].born < 0) T[out].born = p.i;
    return p;
  };

  // ---- input: the token ids pick rows of the embedding table ----
  T.ids = { id: 'ids', role: 'ids', r: [N], c: [['one', 1]], name: 'token ids', bytes: nt * 4, prec: 'i32', born: 0, dies: 0, life: 'op', section: 'in' };
  wt('W_emb', ['token_embd', V, d], [['V', V]], [['d', d]], 'in');
  act('x', 'residual stream', [['d', d]], 'in', { life: 'stream' });
  op('embed', 'gather', 'ids', 'W_emb', 'x', null, 'in');
  // ---- one layer ----
  act('xn', 'normed', [['d', d]], o.kind === 'attn' ? 'attn' : 'delta');
  op('norm1', 'norm', 'x', undefined, 'xn', null, o.kind === 'attn' ? 'attn' : 'delta');
  if (o.kind === 'attn') {
    const sq = find(sh.attn, 'attn_q'), sk = find(sh.attn, 'attn_k'), sv = find(sh.attn, 'attn_v'), so = find(sh.attn, 'attn_output');
    const hw = H * dh, gate = sq && sq[2] === 2 * hw; // Qwen3.6/3.8 attention projects a query and an output gate together
    if (sq && sq[2] !== hw && !gate) notes.push('qwidth');
    const qc: FlowFactor[] = gate ? [['k', 2], ['H', H], ['dh', dh]] : [['H', H], ['dh', dh]];
    wt('Wq', sq, [['d', d]], qc, 'attn'); wt('Wk', sk, [['d', d]], [['Hkv', Hkv], ['dh', dh]], 'attn'); wt('Wv', sv, [['d', d]], [['Hkv', Hkv], ['dh', dh]], 'attn');
    act('q', gate ? 'query + gate' : 'query', qc, 'attn'); act('k', 'key', [['Hkv', Hkv], ['dh', dh]], 'attn'); act('v', 'value', [['Hkv', Hkv], ['dh', dh]], 'attn');
    op('q', 'matmul', 'xn', 'Wq', 'q', 'attn_q', 'attn'); op('k', 'matmul', 'xn', 'Wk', 'k', 'attn_k', 'attn'); op('v', 'matmul', 'xn', 'Wv', 'v', 'attn_v', 'attn');
    const C: FlowFactor = ['c', Math.max(1, o.ctx)], kvh = Math.max(1, o.ctx) * Hkv * dh * o.kvBytes;
    T.Kc = { id: 'Kc', role: 'kv', r: [C], c: [['Hkv', Hkv], ['dh', dh]], name: 'K cache', bytes: kvh, prec: o.kv, born: -1, dies: -1, life: 'request', section: 'attn' };
    T.Vc = { id: 'Vc', role: 'kv', r: [C], c: [['Hkv', Hkv], ['dh', dh]], name: 'V cache', bytes: kvh, prec: o.kv, born: -1, dies: -1, life: 'request', section: 'attn' };
    const ap = op('append', 'append', 'k', 'v', 'Kc', 'attention', 'attn', ['Vc']);
    // One head: its query against its group's keys (transposed: head_dim rows, one column per cached token).
    T.qh = { id: 'qh', role: 'act', r: [N], c: [['dh', dh]], mult: H, multDim: 'H', name: 'query, one head', bytes: nt * dh * 4, prec: 'f32', born: -1, dies: -1, life: 'op', section: 'attn' };
    T.KT = { id: 'KT', role: 'kv', r: [['dh', dh]], c: [C], mult: Hkv, multDim: 'Hkv', name: 'keys, one KV head', bytes: kvh / Hkv, prec: o.kv, born: -1, dies: -1, life: 'request', section: 'attn' };
    T.Vh = { id: 'Vh', role: 'kv', r: [C], c: [['dh', dh]], mult: Hkv, multDim: 'Hkv', name: 'values, one KV head', bytes: kvh / Hkv, prec: o.kv, born: -1, dies: -1, life: 'request', section: 'attn' };
    T.s = { id: 's', role: 'act', r: [N], c: [C], mult: H, multDim: 'H', name: 'scores', bytes: nt * o.ctx * 4 * H, prec: 'f32', born: -1, dies: -1, life: 'op', section: 'attn' };
    T.p = { ...T.s, id: 'p', name: 'attention weights' };
    T.oh = { id: 'oh', role: 'act', r: [N], c: [['dh', dh]], mult: H, multDim: 'H', name: 'output, one head', bytes: nt * dh * 4, prec: 'f32', born: -1, dies: -1, life: 'op', section: 'attn' };
    T.Vc.born = T.KT.born = T.Vh.born = ap.i; // views of the cache this pass has just written into
    op('split', 'act', 'q', undefined, 'qh', 'attention', 'attn');
    op('scores', 'attn', 'qh', 'KT', 's', 'attention', 'attn');
    op('softmax', 'softmax', 's', undefined, 'p', 'attention', 'attn');
    op('mix', 'attn', 'p', 'Vh', 'oh', 'attention', 'attn');
    act('o', 'heads, side by side', [['H', H], ['dh', dh]], 'attn');
    op('concat', 'act', 'oh', undefined, 'o', 'attention', 'attn');
    wt('Wo', so, [['H', H], ['dh', dh]], [['d', d]], 'attn');
    act('a', 'attention out', [['d', d]], 'attn');
    op('o', 'matmul', 'o', 'Wo', 'a', 'attn_output', 'attn');
    op('add1', 'add', 'x', 'a', 'x', null, 'attn');
  } else {
    // Gated DeltaNet: one matrix gives queries, keys and values, another the output gate; a fixed state per head
    // replaces the KV cache. Heads of the state: its bytes (f32) over head_dim² with head_dim 128, as the file has it.
    const sq = find(sh.delta, 'attn_qkv'), sg = find(sh.delta, 'attn_gate'), so = find(sh.delta, 'ssm_out');
    const hs = Math.max(1, Math.round((sh.deltaState || 0) / (128 * 128 * 4)));
    wt('Wqkv', sq, [['d', d]], [['x', sq[2]]], 'delta'); wt('Wg', sg, [['d', d]], [['x', sg[2]]], 'delta');
    act('qkv', 'q, k, v', [['x', sq[2]]], 'delta'); act('g', 'gate', [['x', sg[2]]], 'delta');
    op('qkv', 'matmul', 'xn', 'Wqkv', 'qkv', 'attn_qkv', 'delta'); op('gate', 'matmul', 'xn', 'Wg', 'g', 'attn_gate', 'delta');
    // Per head: the state (head_dim × head_dim) is updated with the token's key and value, then read with its query.
    const dk = 128, hw = hs * dk;
    if (so[1] !== hw) notes.push('deltawidth');
    T.S = { id: 'S', role: 'state', r: [['dh', dk]], c: [['dh', dk]], mult: hs, multDim: 'x', name: 'DeltaNet state', bytes: sh.deltaState || 0, prec: 'f32', born: -1, dies: -1, life: 'fixed', section: 'delta' };
    T.dq = { id: 'dq', role: 'act', r: [N], c: [['dh', dk]], mult: hs, multDim: 'x', name: 'query, one head', bytes: nt * dk * 4, prec: 'f32', born: -1, dies: -1, life: 'op', section: 'delta' };
    T.dy = { id: 'dy', role: 'act', r: [N], c: [['dh', dk]], mult: hs, multDim: 'x', name: 'readout, one head', bytes: nt * dk * 4, prec: 'f32', born: -1, dies: -1, life: 'op', section: 'delta' };
    op('dsplit', 'act', 'qkv', undefined, 'dq', 'state', 'delta');
    op('state', 'state', 'dq', 'S', 'dy', 'state', 'delta', ['qkv']);
    act('y', 'readout', [['x', so[1]]], 'delta');
    op('dconcat', 'act', 'dy', undefined, 'y', 'state', 'delta');
    act('yg', 'gated readout', [['x', so[1]]], 'delta');
    op('dgate', 'act', 'y', 'g', 'yg', 'state', 'delta');
    wt('Wso', so, [['x', so[1]]], [['d', d]], 'delta');
    act('a', 'mixer out', [['d', d]], 'delta');
    op('out', 'matmul', 'yg', 'Wso', 'a', 'ssm_out', 'delta');
    op('add1', 'add', 'x', 'a', 'x', null, 'delta');
  }
  act('xn2', 'normed', [['d', d]], 'ffn');
  op('norm2', 'norm', 'x', undefined, 'xn2', null, 'ffn');
  if (sh.expert && m.experts) {
    const E = m.experts, kk = m.expertsUsed, eg = find(sh.expert, 'ffn_gate'), eu = find(sh.expert, 'ffn_up'), ed = find(sh.expert, 'ffn_down'), Fe = (eu || eg)[2], eb = o.expertBpw || o.bpw;
    wt('Wr', sh.router, [['d', d]], [['E', E]], 'ffn');
    act('r', 'router scores', [['E', E]], 'ffn');
    op('route', 'route', 'xn2', 'Wr', 'r', 'router', 'ffn');
    act('sel', 'chosen experts', [['k', kk]], 'ffn');
    op('topk', 'route', 'r', undefined, 'sel', 'router', 'ffn');
    const ep = o.expertBpw && o.expertBpw !== o.bpw ? (o.expertBpw === 4.25 ? 'MXFP4' : `${o.expertBpw} bits`) : o.quant;
    if (eg) wt('Weg', eg, [['d', d]], [['F', Fe]], 'ffn', eb, ep); wt('Weu', eu, [['d', d]], [['F', Fe]], 'ffn', eb, ep); wt('Wed', ed, [['F', Fe]], [['d', d]], 'ffn', eb, ep);
    if (eg) { act('eg', 'gate', [['F', Fe]], 'ffn'); op('egate', 'matmul', 'xn2', 'Weg', 'eg', 'expert', 'ffn'); }
    act('eu', eg ? 'up' : 'widened', [['F', Fe]], 'ffn'); op('eup', 'matmul', 'xn2', 'Weu', 'eu', 'expert', 'ffn');
    act('eh', 'activated', [['F', Fe]], 'ffn'); op('eact', 'act', eg ? 'eg' : 'eu', eg ? 'eu' : undefined, 'eh', 'expert', 'ffn');
    act('ef', 'one expert out', [['d', d]], 'ffn'); op('edown', 'matmul', 'eh', 'Wed', 'ef', 'expert', 'ffn');
    act('f', 'experts, weighted sum', [['d', d]], 'ffn'); op('esum', 'sum', 'ef', 'sel', 'f', 'expert', 'ffn');
  } else {
    const sg = find(sh.mlp, 'ffn_gate'), su = find(sh.mlp, 'ffn_up'), sd = find(sh.mlp, 'ffn_down'), F = su[2];
    if (sg) wt('Wg2', sg, [['d', d]], [['F', F]], 'ffn'); wt('Wu', su, [['d', d]], [['F', F]], 'ffn'); wt('Wd', sd, [['F', F]], [['d', d]], 'ffn');
    if (sg) { act('fg', 'gate', [['F', F]], 'ffn'); op('fgate', 'matmul', 'xn2', 'Wg2', 'fg', 'ffn_gate', 'ffn'); }
    act('fu', sg ? 'up' : 'widened', [['F', F]], 'ffn'); op('fup', 'matmul', 'xn2', 'Wu', 'fu', 'ffn_up', 'ffn');
    act('fh', 'activated', [['F', F]], 'ffn'); op('fact', 'act', sg ? 'fg' : 'fu', sg ? 'fu' : undefined, 'fh', 'ffn_down', 'ffn');
    act('f', 'feed-forward out', [['d', d]], 'ffn'); op('fdown', 'matmul', 'fh', 'Wd', 'f', 'ffn_down', 'ffn');
  }
  op('add2', 'add', 'x', 'f', 'x', null, 'ffn');
  // ---- output: the last layer's stream, scored against the vocabulary ----
  const no = Math.max(0, o.nOut), NO: FlowFactor = ['n', Math.max(1, no)];
  T.xf = { id: 'xf', role: 'act', r: [NO], c: [['d', d]], name: 'final norm', bytes: Math.max(1, no) * d * 4, prec: 'f32', born: -1, dies: -1, life: 'op', section: 'out' };
  op('normf', 'norm', 'x', undefined, 'xf', null, 'out');
  T.x.dies = ops.length - 1;
  wt('Wout', ['output', d, V], [['d', d]], [['V', V]], 'out');
  if (o.tied) T.Wout.name = 'token_embd, transposed';
  T.lg = { id: 'lg', role: 'logits', r: [NO], c: [['V', V]], name: 'logits', bytes: Math.max(1, no) * V * 4, prec: 'f32', born: -1, dies: -1, life: 'op', section: 'out' };
  op('head', 'matmul', 'xf', 'Wout', 'lg', 'head', 'out');
  T.tok = { id: 'tok', role: 'ids', r: [['n', 1]], c: [['one', 1]], name: 'next token', bytes: 4, prec: 'i32', born: -1, dies: -1, life: 'op', section: 'out' };
  op('sample', 'sample', 'lg', undefined, 'tok', null, 'out');
  T.tok.dies = ops.length - 1;
  for (const t of Object.values(T)) if (t.life === 'op' && t.dies < t.born) t.dies = t.born;
  const dims = { n: nt, d, H, Hkv, dh, V, E: m.experts || 0, k: m.expertsUsed || 0, shared: m.sharedExperts || 0, F: T.Wu ? side(T.Wu.c) : T.Weu ? side(T.Weu.c) : 0, group: Hkv ? H / Hkv : 0, ctx: o.ctx, nOut: no };
  return { ops, T, dims, notes };
}
