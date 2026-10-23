import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModel } from './load.mjs';

// Measured on the laptop (qwen3.6:35b-a3b, Ollama 0.40.7, draft_num_predict 2, 96-token answers, 3,505-token prompt):
// drafting off 13.2 tok/s; on at temperature 0, 15.6 (x1.18); on at temperature 0.7, 11.5 and 10.6 (x0.87, x0.80).
const M = await loadModel();
const lap = M.MACHINES.thinkpad, q = M.MODELS.qwen36, ctx = 3505;
const plain = M.decodeTokS(lap, q, 'Q4_K_M', 'f16', ctx);
const ratio = T => M.mtpTokS(lap, q, 'Q4_K_M', 'f16', ctx, M.mtpAlpha(T)) / plain;

test('both Qwen presets carry one MTP block, the others none', () => {
  assert.equal(q.mtp, 1); assert.equal(M.MODELS.qwen38.mtp, 1);
  assert.ok(!M.MODELS.llama8b.mtp && !M.MODELS.gpt3.mtp);
});
test('a draft step reads one block plus the output head, a small fraction of a full pass', () => {
  const f = M.mtpDraftGB(q, 'Q4_K_M') / M.readGB(q, 'Q4_K_M');
  assert.ok(f > 0.12 && f < 0.3, `draft/full = ${f.toFixed(3)}`);
});
test('with every guess rejected MTP is slower than plain decoding, with every guess kept it is faster', () => {
  assert.ok(M.mtpTokS(lap, q, 'Q4_K_M', 'f16', ctx, 0) < plain);
  assert.ok(M.mtpTokS(lap, q, 'Q4_K_M', 'f16', ctx, 0.95) > plain * 1.5);
});
test('acceptance falls with temperature', () => {
  assert.ok(M.mtpAlpha(0) > M.mtpAlpha(0.7)); assert.ok(M.mtpAlpha(0.7) > M.mtpAlpha(1.5)); assert.ok(M.mtpAlpha(2) >= 0.05);
});
test('the fit reproduces the measured speed-ups within 10%', () => {
  assert.ok(Math.abs(ratio(0) - 1.18) < 0.1, `T=0: x${ratio(0).toFixed(2)}`);
  assert.ok(Math.abs(ratio(0.7) - 0.835) < 0.1, `T=0.7: x${ratio(0.7).toFixed(2)}`);
});
