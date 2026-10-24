// The shared-measurement validator (tools/measurement.mjs), the issue check and the ingestion, with no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateMeasurement, extractJson, summarize, recordFromIssue, mergeRecords, SCHEMA } from '../../tools/measurement.mjs';
import { checkBody } from '../../tools/check-measurement-issue.mjs';
import { ingest } from '../../tools/ingest-measurements.mjs';

const base = () => JSON.parse(fs.readFileSync(new URL('../fixtures/measurement-ollama.json', import.meta.url), 'utf8'));
const llama = () => ({ ...base(), server: { kind: 'llama', version: 'b6000' }, request: { ...base().request, promptTokens: 36, answerTokens: 3, mtp: { on: false, draft: 0 } },
  timings: { llama: { cache_n: 0, prompt_n: 36, prompt_ms: 2091.2, predicted_n: 3, predicted_ms: 331.9, predicted_per_second: 9.04 } }, derived: { ttftS: 2.3, prefillTps: 17.21, decodeTps: 9.04 } });
const errs = m => validateMeasurement(m).errors.join(' | ');
const fence = '`'.repeat(3);
const body = m => `### Machine preset\n\nthinkpad\n\n### Measurement\n\n${fence}json\n${JSON.stringify(m, null, 2)}\n${fence}\n\n### Confirmation\n\n- [X] This was a real run`;

test('the recorded Ollama run is a valid measurement', () => {
  const v = validateMeasurement(base()); assert.equal(v.ok, true, v.errors.join('; ')); assert.equal(base().schema, SCHEMA);
});
test('a llama-server run is valid too', () => { const v = validateMeasurement(llama()); assert.equal(v.ok, true, v.errors.join('; ')); });

test('wrong schema, kind or quant is refused', () => {
  assert.match(errs({ ...base(), schema: 'x/2' }), /schema/);
  assert.match(errs({ ...base(), server: { kind: 'vllm', version: '1' } }), /server.kind/);
  assert.match(errs({ ...base(), model: { ...base().model, quant: 'banana' } }), /model.quant/);
  assert.equal(validateMeasurement(null).ok, false); assert.equal(validateMeasurement([]).ok, false);
});

test('speeds out of range are refused: decode 0.1–5000 tok/s', () => {
  for (const tps of [0.01, 6000, -3, NaN]) assert.match(errs({ ...base(), derived: { ...base().derived, decodeTps: tps } }), /decodeTps/, String(tps));
  assert.match(errs({ ...base(), derived: { ...base().derived, prefillTps: 2e5 } }), /prefillTps/);
});

test('derived speeds must agree with the server timings', () => {
  assert.match(errs({ ...base(), derived: { ...base().derived, decodeTps: 12 } }), /does not match the server timings/);
  assert.match(errs({ ...base(), derived: { ...base().derived, prefillTps: 30 } }), /prefillTps .* does not match/);
});

test('durations must be positive and add up', () => {
  const t = base(); t.timings.ollama.eval_duration = 0; assert.match(errs(t), /eval_duration must be positive/);
  const u = base(); u.timings.ollama.total_duration = 1e9; assert.match(errs(u), /total_duration is shorter/);
  const w = base(); w.derived.ttftS = 0.5; assert.match(errs(w), /ttftS is shorter than the server/);
});

test('counts must be consistent between the request and the server', () => {
  const t = base(); t.request.answerTokens = 81; assert.match(errs(t), /answer tokens disagree/);
  const u = base(); u.request.promptTokens = 0; assert.match(errs(u), /promptTokens/);
  const l = llama(); l.timings.llama.prompt_n = 10; l.timings.llama.cache_n = 26; l.derived.prefillTps = 10 / 2.0912; assert.equal(validateMeasurement(l).ok, true, errs(l));
});

test('no prompt, answer or address can travel in a measurement', () => {
  assert.match(errs({ ...base(), prompt: 'secret' }), /not allowed/);
  assert.match(errs({ ...base(), server: { ...base().server, address: 'http://10.0.0.2:11434' } }), /not allowed/);
  const t = base(); t.hardware.device = 'x'.repeat(300); assert.match(errs(t), /longer than 200/);
});

test('hardware must be named: a preset, or other with at least one field', () => {
  const t = base(); t.hardware = { preset: '' }; assert.match(errs(t), /hardware.preset/);
  const u = base(); u.hardware = { preset: 'other', device: ' ', cpu: '', gpu: '' }; assert.match(errs(u), /other/);
  const w = base(); w.hardware = { preset: 'other', gpu: 'RX 7900 XTX', memoryGB: 24 }; assert.equal(validateMeasurement(w).ok, true);
  const z = base(); z.hardware.memoryGB = 99999; assert.match(errs(z), /memoryGB/);
});

test('dates: well formed and not in the future', () => {
  assert.match(errs({ ...base(), date: '23/10/2026' }), /date/);
  assert.match(errs({ ...base(), date: '2099-01-01' }), /future/);
});

test('warnings do not reject: no server version, prompt past num_ctx', () => {
  const t = base(); t.server.version = ''; t.request.numCtx = 64; const v = validateMeasurement(t);
  assert.equal(v.ok, true); assert.ok(v.warnings.some(w => /server.version/.test(w)) && v.warnings.some(w => /num_ctx/.test(w)));
});

test('the JSON is found in an issue-form body, and a broken one is reported', () => {
  assert.deepEqual(extractJson(body(base())).json, base());
  assert.match(extractJson(`### Measurement\n\n${fence}json\n{ nope\n${fence}`).error, /does not parse/);
  assert.match(extractJson('nothing here').error, /no JSON/);
});

test('the issue comment says valid or invalid, with the reasons', () => {
  const ok = checkBody(body(base())); assert.equal(ok.ok, true); assert.match(ok.comment, /Valid measurement/); assert.match(ok.comment, /decode 9\.0 tok\/s/);
  const bad = checkBody(body({ ...base(), derived: { ...base().derived, decodeTps: 9000 } })); assert.equal(bad.ok, false); assert.match(bad.comment, /Invalid measurement[\s\S]*decodeTps/);
  assert.match(summarize(base()), /thinkpad · ollama 0\.40\.7 · qwen3\.6:35b-a3b Q4_K_M · 36 \+ 80 tok, warm/);
});

test('ingestion keeps accepted, valid issues only, one per issue, sorted, with the URL', () => {
  const issue = (n, labels, m = base()) => ({ number: n, html_url: `https://github.com/yago-mendoza/tokenwalk/issues/${n}`, created_at: '2026-10-24T10:00:00Z', labels: labels.map(name => ({ name })), body: body(m) });
  const issues = [issue(7, ['measurement', 'accepted']), issue(3, ['measurement', 'accepted', 'valid']), issue(5, ['measurement', 'valid']), issue(9, ['measurement', 'accepted'], { ...base(), schema: 'nope' }), { ...issue(11, ['measurement', 'accepted']), pull_request: {} }];
  const old = { measurements: [{ issue: 3, url: 'old', m: {} }, { issue: 2, url: 'gone', m: {} }] };
  const { file, skipped } = ingest(issues, old);
  assert.deepEqual(file.measurements.map(r => r.issue), [3, 7]);
  assert.equal(file.measurements[0].url, 'https://github.com/yago-mendoza/tokenwalk/issues/3', 'the newer record wins');
  assert.equal(file.measurements[1].submitted, '2026-10-24');
  assert.deepEqual(skipped.map(s => s.issue), [9]);
  assert.deepEqual(mergeRecords([{ issue: 2 }, { issue: 1 }], [{ issue: 2, x: 1 }]), [{ issue: 1 }, { issue: 2, x: 1 }]);
  assert.equal(recordFromIssue({ number: 1, body: '' }).record, null);
});

// The fallback for people who do not use the web app: a raw server response pasted into the form.
const rawBody = (json, fields) => Object.entries(fields).map(([k, v]) => `### ${k}\n\n${v}\n\n`).join('') + `### Measurement\n\n${fence}json\n${json}\n${fence}\n`;
const fxt = f => fs.readFileSync(new URL('../fixtures/' + f, import.meta.url), 'utf8');

test('a raw Ollama /api/generate response is read: timings kept, the answer and the context dropped', async () => {
  const { readSubmission } = await import('../../tools/measurement.mjs');
  const body = rawBody(fxt('ollama-generate-nostream.json'), { 'Machine preset': 'other', 'Device or laptop model': 'Framework 13', GPU: 'Radeon 780M', Memory: '64 GB DDR5', 'Operating system': 'Fedora 41', 'Server version': '0.40.7', 'Weight format': 'Q4_K_M', Notes: '_No response_' });
  const { m, from } = readSubmission(body, '2026-10-24');
  assert.equal(from, 'ollama');
  const v = validateMeasurement(m); assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(m.request.promptTokens, 36); assert.equal(m.request.answerTokens, 80); assert.equal(m.derived.decodeTps, 9.04);
  assert.deepEqual([m.hardware.preset, m.hardware.device, m.hardware.memoryGB, m.hardware.memoryType, m.server.version, m.model.quant], ['other', 'Framework 13', 64, 'DDR5', '0.40.7', 'Q4_K_M']);
  const s = JSON.stringify(m); assert.ok(!s.includes('"response"') && !s.includes('"context"') && !s.includes('warfarin'), 'the answer or the context travelled');
  assert.ok(v.warnings.some(w => /raw ollama/.test(w)));
  assert.equal(checkBody(body, '2026-10-24').ok, true); assert.match(checkBody(body).comment, /raw Ollama response/);
});

test('a raw Ollama response without the weight format or the hardware says what to fill in', async () => {
  const c = checkBody(rawBody(fxt('ollama-generate-nostream.json'), { 'Machine preset': '_No response_' }));
  assert.equal(c.ok, false); assert.match(c.comment, /Weight format/); assert.match(c.comment, /hardware.preset/);
  const named = checkBody(rawBody(fxt('ollama-generate-nostream.json').replace('"qwen3.6:35b-a3b"', '"qwen3.6:35b-a3b-q8_0"'), { 'Machine preset': 'rtx4090' }));
  assert.equal(named.ok, true, named.comment);
});

test('a raw llama-server /completion response is read, the prompt left out', async () => {
  const { readSubmission } = await import('../../tools/measurement.mjs');
  const { m, from } = readSubmission(rawBody(fxt('llama-completion-nostream.json'), { 'Machine preset': 'm4max', 'Server version': 'b6000' }), '2026-10-24');
  assert.equal(from, 'llama'); const v = validateMeasurement(m); assert.equal(v.ok, true, v.errors.join('; '));
  assert.deepEqual([m.model.name, m.model.quant, m.request.numCtx, m.request.temperature, m.request.promptTokens], ['Qwen3-8B-Q4_K_M', 'Q4_K_M', 8192, 0, 36]);
  assert.ok(!JSON.stringify(m).includes('warfarin') && !JSON.stringify(m).includes('INR'));
});

test('submitted text is capped and only parsed, never run', () => {
  assert.match(extractJson('```json\n{"a":"' + 'x'.repeat(70000) + '"}\n```').error, /longer than 64 KB/);
  globalThis.__pwned = false;
  const r = extractJson('```json\n{"schema":"tokenwalk-measurement/1","x":"${globalThis.__pwned = true}","constructor":{"prototype":{"bad":1}},"__proto__":{"polluted":1}}\n```');
  assert.equal(globalThis.__pwned, false); assert.equal(({}).polluted, undefined); assert.equal(({}).bad, undefined);
  assert.equal(validateMeasurement(r.json).ok, false);
});
