import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModel } from './load.mjs';

const M = await loadModel();
const laptop = M.MACHINES.thinkpad, qwen = M.MODELS.qwen36;

test('KV per token: Qwen3.6 at f16 keeps 2 x 10 layers x 2 heads x 256 x 2 bytes', () => {
  assert.equal(M.kvBytesPerToken(qwen, 'f16'), 20480);
});

test('decode on the laptop is calibrated at about 12 tokens a second', () => {
  const tps = M.decodeTokS(laptop, qwen, 'Q4_K_M', 'f16', 6500);
  assert.ok(tps > 11 && tps < 13.5, `got ${tps.toFixed(2)} tok/s`);
});

test('prefill of the 6,500-token history takes a little over a minute', () => {
  const s = M.prefillSeconds(laptop, qwen, 'Q4_K_M', 6500);
  assert.ok(s > 65 && s < 85, `got ${s.toFixed(1)} s`);
});

test('the bandwidth ceiling bounds decode: tok/s never beats bandwidth / bytes read', () => {
  const ceiling = laptop.bw / M.readGB(qwen, 'Q4_K_M');
  assert.ok(M.decodeTokS(laptop, qwen, 'Q4_K_M', 'f16', 6500) < ceiling);
});

test('a mixture of experts reads far less per token than it stores', () => {
  assert.ok(M.readGB(qwen, 'Q4_K_M') < M.fileGB(qwen, 'Q4_K_M') / 5);
});

test('quantization shrinks the file in proportion to bits per weight', () => {
  const r = M.fileGB(qwen, 'Q4_K_M') / M.fileGB(qwen, 'F16');
  assert.ok(Math.abs(r - M.QUANTS.Q4_K_M.bpw / 16) < 1e-9);
});
