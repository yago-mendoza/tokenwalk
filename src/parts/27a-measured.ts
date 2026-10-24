// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Measured rows: accepted measurements (data/measurements.json, baked in at build) matched to What fits =====
// A record is { issue, url, submitted, m } where m is a tokenwalk-measurement/1 payload. It belongs to a row when its
// hardware preset, model and weight format are the row's. Numbers are only put next to an estimate when they answer
// the same question: decode speed from runs with the same MTP drafting on or off, time to first token from runs with
// a prompt within a factor of two of this request's and the same cold or warm start. Everything else stays in the
// detail, with its own request, server version and source issue.
let MEAS = typeof TW_MEASUREMENTS !== 'undefined' && Array.isArray(TW_MEASUREMENTS) ? TW_MEASUREMENTS : [];
function setMeasurements(list) { MEAS = Array.isArray(list) ? list : []; if (typeof FITS !== 'undefined') { FITS.rows = null; FITS.open = new Set(); } }
const measNorm = n => String(n || '').toLowerCase().replace(/:latest$/, '').trim();
function measFor(mk, mo, q) {
  const m = MODELS[mo]; if (!m || !MEAS.length) return [];
  const tag = measNorm(m.tag);
  return MEAS.filter(r => r && r.m && r.m.hardware && r.m.hardware.preset === mk && String(r.m.model.quant).toUpperCase() === q && measNorm(r.m.model.name) === tag);
}
function median(xs) { const a = [...xs].sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }
const measStat = xs => (xs.length ? { med: median(xs), min: Math.min(...xs), max: Math.max(...xs), n: xs.length } : null);
// The current request, as the matching needs it.
function measReq(mo) {
  const m = MODELS[mo] || {};
  return { prompt: S.sys + S.docs + S.q, cold: !!(S.cold || KEEP.unloaded), mtp: !!(S.mtp && !S.spec && m.mtp) };
}
function measSummary(list, req) {
  const mtpOn = r => !!(r.m.request.mtp && r.m.request.mtp.on);
  const dec = list.filter(r => mtpOn(r) === req.mtp), near = list.filter(r => { const p = r.m.request.promptTokens; return p >= req.prompt / 2 && p <= req.prompt * 2 && (r.m.request.start === 'cold') === req.cold; });
  return { n: list.length, dec: measStat(dec.map(r => r.m.derived.decodeTps)), ttft: measStat(near.map(r => r.m.derived.ttftS).filter(v => v > 0)), list };
}
// One line per run, for the detail under a row.
function measLine(r) {
  const m = r.m, rq = m.request, d = m.derived, e = m.estimate || {}, sv = m.server || {};
  const srv = `${sv.kind === 'llama' ? 'llama-server' : 'Ollama'} ${sv.version || '?'}`;
  const mtp = rq.mtp && rq.mtp.on ? `MTP ${rq.mtp.draft}` : L('no MTP', 'sin MTP');
  const est = e.decodeTps ? L(` (estimate ${dec(e.decodeTps.toFixed(1))})`, ` (estimación ${dec(e.decodeTps.toFixed(1))})`) : '';
  return `${esc(r.submitted || m.date)} · ${esc(srv)} · ${num(rq.promptTokens)} + ${num(rq.answerTokens)} tok · ${esc(rq.start === 'cold' ? L('cold', 'en frío') : L('warm', 'en caliente'))} · ${esc(mtp)} · T ${dec(String(rq.temperature ?? '?'))}`
    + ` · ${esc(L('first token', 'primer token'))} ${S_(d.ttftS)} · ${esc(L('decode', 'decode'))} ${dec(d.decodeTps.toFixed(1))} tok/s${esc(est)}`;
}
