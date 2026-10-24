// A shared measurement (schema tokenwalk-measurement/1): validation, and reading it out of a GitHub issue body.
// Node built-ins only, so the GitHub Action runs it without npm install. Used by tools/check-measurement-issue.mjs
// (the Action), tools/ingest-measurements.mjs (the maintainer) and tests/unit/measurement.test.mjs.

export const SCHEMA = 'tokenwalk-measurement/1';
export const KINDS = ['ollama', 'llama'];
export const QUANT_RE = /^(F16|F32|BF16|Q\d(_[A-Z0-9]+)*|IQ\d(_[A-Z0-9]+)*|MXFP4)$/i;
export const KV_TYPES = ['f16', 'q8_0', 'q4_0'];
// Sane ranges. Decode is bounded at 5,000 tok/s; prefill reads a whole chunk per pass, so a large card on a small
// model can pass 5,000 tok/s honestly, and its bound is higher.
export const RANGES = { decodeTps: [0.1, 5000], prefillTps: [0.1, 100000], seconds: [0, 24 * 3600], tokens: [1, 2_000_000], memoryGB: [1, 4096] };
const OLLAMA_KEYS = ['load_duration', 'prompt_eval_count', 'prompt_eval_duration', 'eval_count', 'eval_duration', 'total_duration'];
const LLAMA_KEYS = ['prompt_n', 'prompt_ms', 'predicted_n', 'predicted_ms'];
// Never part of a measurement: the request and the answer text, and where the server lives.
const FORBIDDEN = /^(prompt|text|answer|response|context|content|messages|system|endpoint|ep|address|host|url)$/i;
const MAX_STR = 200;

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isInt = v => Number.isInteger(v);
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-9);

/** Every problem with one measurement: errors make it invalid, warnings are worth a look but not a rejection. */
export function validateMeasurement(m) {
  const errors = [], warnings = [];
  const err = s => errors.push(s), warn = s => warnings.push(s);
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: ['not a JSON object'], warnings };
  if (m.schema !== SCHEMA) { err(m.schema === undefined ? 'not a tokenwalk measurement, nor a raw Ollama (/api/generate) or llama-server (/completion) response' : `schema must be "${SCHEMA}" (got ${JSON.stringify(m.schema)})`); return { ok: false, errors, warnings }; }

  // privacy and size: no text fields beyond short labels, no forbidden keys at any depth
  (function walk(o, path) {
    if (Array.isArray(o)) { o.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) { if (FORBIDDEN.test(k)) err(`${path}${k}: not allowed in a measurement (no prompt, answer or server address)`); walk(v, `${path}${k}.`); } return; }
    if (typeof o === 'string' && o.length > MAX_STR) err(`${path.replace(/\.$/, '')}: text longer than ${MAX_STR} characters`);
  })(m, '');

  const tw = m.tokenwalk || {};
  if (typeof tw.version !== 'string' || !tw.version) err('tokenwalk.version is missing');
  if (typeof m.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.date) || isNaN(Date.parse(m.date))) err('date must be YYYY-MM-DD');
  else if (Date.parse(m.date) > Date.now() + 2 * 864e5) err('date is in the future');

  const sv = m.server || {};
  if (!KINDS.includes(sv.kind)) err(`server.kind must be one of ${KINDS.join(', ')}`);
  if (typeof sv.version !== 'string' || !sv.version) warn('server.version is missing: runs from different server versions are hard to compare');

  const mo = m.model || {};
  if (typeof mo.name !== 'string' || !mo.name.trim()) err('model.name is missing');
  if (typeof mo.quant !== 'string' || !QUANT_RE.test(mo.quant)) err(`model.quant is not a weight format (got ${JSON.stringify(mo.quant)}): fill in Weight format, for example Q4_K_M`);
  if (mo.digest != null && !(typeof mo.digest === 'string' && /^(sha256:)?[0-9a-f]{12,64}$/i.test(mo.digest))) err('model.digest is not a hex digest');
  if (mo.params != null && !(isNum(mo.params) && mo.params >= 1e6 && mo.params <= 1e13)) err('model.params out of range');
  if (mo.fileBytes != null && !(isNum(mo.fileBytes) && mo.fileBytes >= 1e6 && mo.fileBytes <= 2e13)) err('model.fileBytes out of range');

  const rq = m.request || {};
  const tok = (v, k) => { if (!isInt(v) || v < RANGES.tokens[0] || v > RANGES.tokens[1]) { err(`request.${k} must be a whole number of tokens ≥ 1`); return false; } return true; };
  const pOk = tok(rq.promptTokens, 'promptTokens'), aOk = tok(rq.answerTokens, 'answerTokens');
  if (rq.numCtx != null && !(isInt(rq.numCtx) && rq.numCtx >= 1)) err('request.numCtx must be a whole number');
  else if (rq.numCtx && pOk && aOk && rq.promptTokens + rq.answerTokens > rq.numCtx + 1) warn('prompt + answer exceed num_ctx: the server may have truncated the prompt');
  if (m.source && !m.estimate) warn(`from a raw ${m.source} response: time to the first token is the server's load + prefill, and sampling and num_ctx are unknown`);
  if (rq.kvType != null && !KV_TYPES.includes(rq.kvType)) err(`request.kvType must be one of ${KV_TYPES.join(', ')}`);
  if (!['cold', 'warm'].includes(rq.start)) err('request.start must be "cold" or "warm"');
  if (rq.mtp != null) { if (typeof rq.mtp.on !== 'boolean') err('request.mtp.on must be true or false'); if (rq.mtp.on && !(isInt(rq.mtp.draft) && rq.mtp.draft >= 1 && rq.mtp.draft <= 16)) err('request.mtp.draft must be 1–16 when drafting is on'); }
  if (rq.temperature != null && !(isNum(rq.temperature) && rq.temperature >= 0 && rq.temperature <= 5)) err('request.temperature out of range');
  if (rq.topP != null && !(isNum(rq.topP) && rq.topP > 0 && rq.topP <= 1)) err('request.topP out of range');
  if (rq.topK != null && !(isInt(rq.topK) && rq.topK >= 1)) err('request.topK must be a whole number ≥ 1');

  // the server's own timings, consistent with the counts and with each other
  const tm = m.timings || {};
  let prefillS = null, decodeS = null;
  if (sv.kind === 'ollama') {
    const o = tm.ollama;
    if (!o || typeof o !== 'object') err('timings.ollama is missing');
    else {
      for (const k of OLLAMA_KEYS) if (!isNum(o[k]) || o[k] < 0) err(`timings.ollama.${k} must be a number ≥ 0`);
      for (const k of ['prompt_eval_duration', 'eval_duration', 'total_duration']) if (isNum(o[k]) && o[k] <= 0) err(`timings.ollama.${k} must be positive`);
      if (pOk && isNum(o.prompt_eval_count) && o.prompt_eval_count !== rq.promptTokens) err(`prompt tokens disagree: request ${rq.promptTokens}, server ${o.prompt_eval_count}`);
      if (aOk && isNum(o.eval_count) && o.eval_count !== rq.answerTokens) err(`answer tokens disagree: request ${rq.answerTokens}, server ${o.eval_count}`);
      if (OLLAMA_KEYS.every(k => isNum(o[k])) && o.total_duration * 1.01 < o.load_duration + o.prompt_eval_duration + o.eval_duration) err('total_duration is shorter than load + prefill + decode');
      if (isNum(o.load_duration) && isNum(o.total_duration) && rq.start === 'cold' && o.load_duration < 1e9) warn('marked cold but the model loaded in under a second');
      prefillS = o.prompt_eval_duration / 1e9; decodeS = o.eval_duration / 1e9;
    }
  } else if (sv.kind === 'llama') {
    const t = tm.llama;
    if (!t || typeof t !== 'object') err('timings.llama is missing');
    else {
      for (const k of LLAMA_KEYS) if (!isNum(t[k]) || t[k] <= 0) err(`timings.llama.${k} must be a positive number`);
      if (pOk && isNum(t.prompt_n) && t.prompt_n !== rq.promptTokens && !(isNum(t.cache_n) && t.prompt_n + t.cache_n === rq.promptTokens)) err(`prompt tokens disagree: request ${rq.promptTokens}, server ${t.prompt_n}`);
      if (aOk && isNum(t.predicted_n) && t.predicted_n !== rq.answerTokens) err(`answer tokens disagree: request ${rq.answerTokens}, server ${t.predicted_n}`);
      prefillS = t.prompt_ms / 1000; decodeS = t.predicted_ms / 1000;
    }
  }

  const d = m.derived || {};
  const inRange = (v, [lo, hi], k) => { if (!isNum(v) || v < lo || v > hi) { err(`derived.${k} must be between ${lo} and ${hi} (got ${v})`); return false; } return true; };
  if (inRange(d.decodeTps, RANGES.decodeTps, 'decodeTps') && isNum(decodeS) && decodeS > 0 && aOk) {
    const n = sv.kind === 'llama' ? tm.llama.predicted_n : tm.ollama.eval_count;
    if (!near(d.decodeTps, n / decodeS, 0.02)) err(`derived.decodeTps ${d.decodeTps} does not match the server timings (${(n / decodeS).toFixed(2)})`);
  }
  if (inRange(d.prefillTps, RANGES.prefillTps, 'prefillTps') && isNum(prefillS) && prefillS > 0 && pOk) {
    const n = sv.kind === 'llama' ? tm.llama.prompt_n : tm.ollama.prompt_eval_count;
    if (!near(d.prefillTps, n / prefillS, 0.02)) err(`derived.prefillTps ${d.prefillTps} does not match the server timings (${(n / prefillS).toFixed(2)})`);
  }
  if (d.ttftS != null) {
    if (!isNum(d.ttftS) || d.ttftS <= 0 || d.ttftS > RANGES.seconds[1]) err('derived.ttftS must be a positive number of seconds');
    else if (isNum(prefillS) && d.ttftS < prefillS * 0.9) err('derived.ttftS is shorter than the server’s own prefill');
  } else warn('derived.ttftS is missing');

  const e = m.estimate;
  if (e != null) {
    if (typeof e.machine !== 'string' || !e.machine) err('estimate.machine is missing');
    for (const k of ['ttftS', 'decodeTps', 'prefillTps']) if (e[k] != null && !(isNum(e[k]) && e[k] > 0)) err(`estimate.${k} must be positive`);
  } else if (!m.source) warn('no estimate to compare with');

  const hw = m.hardware || {};
  if (typeof hw.preset !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(hw.preset)) err('hardware.preset must name a machine preset, or "other"');
  else if (hw.preset === 'other' && !['device', 'cpu', 'gpu'].some(k => typeof hw[k] === 'string' && hw[k].trim())) err('hardware: "other" needs at least the device, the CPU or the GPU');
  if (hw.memoryGB != null && !(isNum(hw.memoryGB) && hw.memoryGB >= RANGES.memoryGB[0] && hw.memoryGB <= RANGES.memoryGB[1])) err('hardware.memoryGB out of range');
  return { ok: errors.length === 0, errors, warnings };
}

// Submitted text is data: it is only ever read with JSON.parse and plain string matching, never evaluated, and it is
// capped (an issue body holds at most 65,536 characters; a raw Ollama response with its context array is ~30 KB).
export const MAX_JSON = 64 * 1024;

/** The measurement JSON in an issue body: the ```json block the issue form renders, or the first {...} object. */
export function extractJson(body) {
  const s = String(body || '').slice(0, 2 * MAX_JSON);
  const fence = s.match(/```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```/);
  const raw = fence ? fence[1] : (s.match(/\{[\s\S]*\}/) || [])[0];
  if (!raw) return { json: null, error: 'no JSON found in the issue' };
  if (raw.length > MAX_JSON) return { json: null, error: `the JSON is longer than ${MAX_JSON / 1024} KB` };
  try { return { json: JSON.parse(raw), error: null }; } catch (e) { return { json: null, error: `the JSON does not parse: ${e.message}` }; }
}

// The issue form's other fields, by their labels as GitHub renders them ("### Label", a blank line, the value).
const FORM_FIELDS = { 'Machine preset': 'preset', 'Device or laptop model': 'device', CPU: 'cpu', GPU: 'gpu', Memory: 'memory', 'Operating system': 'os', 'Server version': 'serverVersion', 'Weight format': 'quant' };
export function parseForm(body) {
  const out = {}, parts = String(body || '').slice(0, 2 * MAX_JSON).split(/^###[ \t]+/m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf('\n'), label = (nl < 0 ? p : p.slice(0, nl)).trim(), key = FORM_FIELDS[label];
    if (!key) continue;
    const v = (nl < 0 ? '' : p.slice(nl + 1)).trim();
    out[key] = v === '_No response_' ? '' : v.replace(/\s+/g, ' ').slice(0, 200);
  }
  return out;
}

const QUANT_IN_NAME = /(?:^|[-_:.])((?:i?q\d(?:_[a-z0-9]+)*)|bf16|f16|f32|mxfp4)(?:$|[-_.])/i;
const memParts = s => { const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*(?:GB|GiB|G)?\s*(.*)/i); return m ? { gb: +m[1], type: m[2].trim().slice(0, 40) } : { gb: null, type: String(s || '').slice(0, 40) }; };
function hardwareFromForm(f) {
  const mem = memParts(f.memory), preset = String(f.preset || '').trim();
  return { preset: /^other$/i.test(preset) ? 'other' : preset, device: f.device || '', cpu: f.cpu || '', gpu: f.gpu || '', memoryGB: mem.gb, memoryType: mem.type, os: f.os || '', detected: null };
}

/**
 * A submission as a tokenwalk-measurement/1 payload. tokenwalk's own JSON passes through untouched; a raw response
 * from Ollama (/api/generate, stream false) or llama-server (/completion, stream false) is turned into one, taking
 * only the timings and counts (never the response text or the context) and the hardware from the form's fields.
 * What a raw response cannot tell is left null: time to the first token is the server's load + prefill.
 */
export function normalizeSubmission(json, form = {}, date = new Date().toISOString().slice(0, 10)) {
  if (!json || typeof json !== 'object' || Array.isArray(json) || json.schema) return { m: json, from: 'tokenwalk' };
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null), r2 = (v, d) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(d));
  const base = (kind, name) => ({
    schema: SCHEMA, tokenwalk: { version: 'none', commit: '' }, source: kind === 'ollama' ? 'ollama /api/generate' : 'llama-server /completion', date: String(date).slice(0, 10),
    server: { kind, version: String(form.serverVersion || '').slice(0, 64) },
    model: { name: String(name || '').slice(0, 120), quant: String(form.quant || (String(name || '').match(QUANT_IN_NAME) || [])[1] || '').toUpperCase(), digest: null, params: null, fileBytes: null },
  });
  if (num(json.eval_count) != null && num(json.eval_duration) != null && typeof json.model === 'string') {
    const t = Object.fromEntries(['load_duration', 'prompt_eval_count', 'prompt_eval_duration', 'eval_count', 'eval_duration', 'total_duration'].map(k => [k, num(json[k])]));
    const m = base('ollama', json.model);
    m.request = { numCtx: null, kvType: null, mtp: { on: false, draft: 0 }, temperature: null, topK: null, topP: null, promptTokens: t.prompt_eval_count, answerTokens: t.eval_count, start: (t.load_duration || 0) > 1e9 ? 'cold' : 'warm' };
    m.timings = { ollama: t };
    m.derived = { ttftS: r2(((t.load_duration || 0) + (t.prompt_eval_duration || 0)) / 1e9, 3), ttftFrom: 'server', prefillTps: t.prompt_eval_duration > 0 ? r2(t.prompt_eval_count / (t.prompt_eval_duration / 1e9), 2) : null, decodeTps: t.eval_duration > 0 ? r2(t.eval_count / (t.eval_duration / 1e9), 2) : null, loadS: r2((t.load_duration || 0) / 1e9, 3), totalS: r2((t.total_duration || 0) / 1e9, 3) };
    m.hardware = hardwareFromForm(form);
    return { m, from: 'ollama' };
  }
  if (json.timings && typeof json.timings === 'object' && (json.tokens_predicted != null || json.generation_settings)) {
    const t = Object.fromEntries(Object.entries(json.timings).filter(([, v]) => num(v) != null)), gs = json.generation_settings || {};
    const name = String(json.model || gs.model || '').split(/[\\/]/).pop().replace(/\.gguf$/i, '');
    const m = base('llama', name);
    m.request = { numCtx: num(gs.n_ctx), kvType: null, mtp: { on: false, draft: 0 }, temperature: num(gs.temperature), topK: num(gs.top_k), topP: num(gs.top_p), promptTokens: (t.prompt_n || 0) + (t.cache_n || 0), answerTokens: t.predicted_n, start: 'warm' };
    m.timings = { llama: t };
    m.derived = { ttftS: r2((t.prompt_ms || 0) / 1000, 3), ttftFrom: 'server', prefillTps: t.prompt_ms > 0 ? r2(t.prompt_n / (t.prompt_ms / 1000), 2) : null, decodeTps: t.predicted_ms > 0 ? r2(t.predicted_n / (t.predicted_ms / 1000), 2) : null, loadS: null, totalS: r2(((t.prompt_ms || 0) + (t.predicted_ms || 0)) / 1000, 3) };
    m.hardware = hardwareFromForm(form);
    return { m, from: 'llama' };
  }
  return { m: json, from: 'unknown' };
}

/** The measurement in an issue body, normalized: { m, from, error }. */
export function readSubmission(body, date) {
  const { json, error } = extractJson(body);
  if (!json) return { m: null, from: null, error };
  return { ...normalizeSubmission(json, parseForm(body), date), error: null };
}

/** One line a reviewer can read: who measured what, and how fast. */
export function summarize(m) {
  const f = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');
  const hw = m.hardware || {}, rq = m.request || {}, d = m.derived || {}, e = m.estimate || {};
  const who = hw.preset === 'other' ? [hw.device, hw.gpu || hw.cpu].filter(Boolean).join(' · ') : hw.preset;
  return `${who} · ${(m.server || {}).kind} ${(m.server || {}).version || '?'} · ${(m.model || {}).name} ${(m.model || {}).quant} · ${rq.promptTokens} + ${rq.answerTokens} tok, ${rq.start}`
    + ` · TTFT ${f(d.ttftS, 2)} s · prefill ${f(d.prefillTps)} tok/s · decode ${f(d.decodeTps)} tok/s`
    + (e.decodeTps ? ` (estimate ${f(e.decodeTps)} tok/s on ${e.machine})` : '');
}

/** An issue (REST shape) turned into a record for data/measurements.json, or the reason it cannot be. */
export function recordFromIssue(issue) {
  const submitted = String(issue.created_at || '').slice(0, 10), { m, error } = readSubmission(issue.body, submitted || undefined);
  if (!m) return { record: null, errors: [error] };
  const v = validateMeasurement(m);
  if (!v.ok) return { record: null, errors: v.errors };
  return { record: { issue: issue.number, url: issue.html_url, submitted, m }, errors: [] };
}

/** Existing records merged with new ones: one per issue (the newer wins), sorted by issue number. */
export function mergeRecords(old, fresh) {
  const by = new Map();
  for (const r of [...(old || []), ...(fresh || [])]) if (r && Number.isInteger(r.issue)) by.set(r.issue, r);
  return [...by.values()].sort((a, b) => a.issue - b.issue);
}
