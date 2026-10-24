// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Share a measurement: one finished real run, as a prefilled GitHub issue =====
// No backend: the window builds a tokenwalk-measurement/1 payload from the last real run, shows exactly that, and opens
// the repository's issue form with it filled in (template measurement.yml, fields by id). The issue is checked by an
// Action (tools/check-measurement-issue.mjs); a maintainer labels it accepted; tools/ingest-measurements.mjs writes
// data/measurements.json, which the build bakes in for What fits. Never sent: the prompt, the answer, the address.
const SHARE_SCHEMA = 'tokenwalk-measurement/1';
const SHARE_REPO = 'https://github.com/yago-mendoza/tokenwalk';
const SHARE_MAX_URL = 7500;
const SHARE_KEY = 'tw.shareHw';
const SHARE = (() => {
  const d = { hw: '', device: '', cpu: '', gpu: '', memGB: '', memType: '', os: '', kv: 'f16', det: null };
  try { return { ...d, ...(JSON.parse(localStorage.getItem(SHARE_KEY) || 'null') || {}), det: null }; } catch (e) { return d; }
})();
const shareSave = () => { try { const { det, ...keep } = SHARE; localStorage.setItem(SHARE_KEY, JSON.stringify(keep)); } catch (e) {} };

// What the browser can tell, honestly: the thread count, the platform and, through WebGPU, the GPU's vendor and
// architecture (often generic, sometimes empty). Asked once, when the window first opens.
async function shareDetect() {
  const det = { threads: navigator.hardwareConcurrency || null, platform: (navigator.userAgentData && navigator.userAgentData.platform) || null, gpu: null };
  try {
    if (navigator.gpu) {
      const ad = await Promise.race([navigator.gpu.requestAdapter(), new Promise(r => setTimeout(() => r(null), 1500))]);
      let info = ad && ad.info; if (!info && ad && ad.requestAdapterInfo) info = await ad.requestAdapterInfo();
      if (info) { const g = [info.vendor, info.architecture, info.description || info.device].map(s => String(s || '').trim()).filter(Boolean).join(' · '); det.gpu = g.slice(0, 120) || null; }
    }
  } catch (e) {}
  return det;
}

// The console's estimate for the same request on a preset, as shipped (calibration taken out), so the gap is visible.
function shareEstimate(run, mk) {
  const keepS = S, keepC = CALIB;
  try { CALIB = {}; S = { ...S, machine: mk, ...machineFields(mk) }; return liveEstimate(run); } finally { S = keepS; CALIB = keepC; }
}
const r2 = (v, d) => (v === null || v === undefined || !Number.isFinite(+v) ? null : +(+v).toFixed(d));
const shareStr = (v, n = 120) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

function sharePayload() {
  const run = LIVE.run; if (!run) return null;
  const mm = LIVE.models.find(x => x.name === run.model) || {}, sent = Object.fromEntries(run.sent || []), draft = +sent.draft_num_predict || 0;
  const mk = SHARE.hw && SHARE.hw !== 'other' ? SHARE.hw : S.machine, est = shareEstimate(run, mk), live = MODELS.live;
  const ctx = run.kind === 'ollama' ? sent.num_ctx : ((LIVE.llamaInfo && LIVE.llamaInfo.props && LIVE.llamaInfo.props.default_generation_settings && LIVE.llamaInfo.props.default_generation_settings.n_ctx) || null);
  const other = SHARE.hw === 'other';
  return {
    schema: SHARE_SCHEMA,
    tokenwalk: { version: typeof TW_BUILD !== 'undefined' ? TW_BUILD.version : 'dev', commit: typeof TW_BUILD !== 'undefined' ? TW_BUILD.commit : '' },
    date: String(run.at || new Date().toISOString()).slice(0, 10),
    server: { kind: run.kind, version: shareStr(run.version || LIVE.version, 64) },
    model: { name: shareStr(run.model), quant: String(mm.quant || S.quant).toUpperCase(), digest: mm.digest || null, params: live && live.tag === run.model && live.total ? live.total : null, fileBytes: mm.size || null },
    request: { numCtx: ctx ? +ctx : null, kvType: SHARE.kv, mtp: { on: draft > 0, draft }, temperature: sent.temperature ?? null, topK: sent.top_k ?? null, topP: sent.top_p ?? null,
      promptTokens: run.promptN, answerTokens: run.evalN, start: (run.loadS || 0) > 1 ? 'cold' : 'warm' },
    timings: run.kind === 'ollama' ? { ollama: run.raw || {} } : { llama: run.raw || {} },
    derived: { ttftS: r2(run.ttftS, 3), prefillTps: run.prefillS > 0 ? r2(run.promptN / run.prefillS, 2) : null, decodeTps: run.decodeS > 0 ? r2(run.evalN / run.decodeS, 2) : null, loadS: r2(run.loadS, 3), totalS: r2(run.totalS, 3) },
    estimate: { machine: mk, calibrated: false, ttftS: r2(est.ttftS, 3), prefillTps: r2(est.prefillTps, 2), decodeTps: r2(est.decodeTps, 2), totalS: r2(est.totalS, 3) },
    hardware: { preset: SHARE.hw || '', device: other ? shareStr(SHARE.device) : '', cpu: other ? shareStr(SHARE.cpu) : '', gpu: other ? shareStr(SHARE.gpu) : '',
      memoryGB: other && +SHARE.memGB > 0 ? +SHARE.memGB : null, memoryType: other ? shareStr(SHARE.memType, 40) : '', os: shareStr(SHARE.os, 60), detected: SHARE.det },
  };
}
// Why the issue cannot be opened yet, or '' when it can.
function shareBlock(p) {
  if (!p) return L('No finished real run to share.', 'No hay ninguna ejecución real terminada que compartir.');
  if (!p.derived.decodeTps || !p.derived.prefillTps) return L('This run has no server timings for prefill or decode.', 'Esta ejecución no tiene tiempos del servidor de prefill o decode.');
  if (!SHARE.hw) return L('Name your hardware first.', 'Indica primero tu hardware.');
  if (SHARE.hw === 'other' && !(p.hardware.device || p.hardware.cpu || p.hardware.gpu)) return L('Other: fill in at least the device, the CPU or the GPU.', 'Otro: rellena al menos el dispositivo, la CPU o la GPU.');
  return '';
}
const hwName = p => (p.hardware.preset === 'other' ? [p.hardware.device, p.hardware.gpu || p.hardware.cpu].filter(Boolean).join(' · ') || L('Other', 'Otro') : (MACHINES[p.hardware.preset] || {}).name || p.hardware.preset);

// The issue address: every field filled when it fits under the limit, then without the optional ones (the hardware
// inputs repeat what the JSON holds), then the JSON alone; past that, null (copy the JSON and open the empty form).
function shareUrl(p) {
  const enc = encodeURIComponent, hw = p.hardware, title = `Measurement: ${hwName(p)} · ${p.model.name} ${p.model.quant}`.slice(0, 180);
  const q = o => `${SHARE_REPO}/issues/new?${Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${enc(v)}`).join('&')}`;
  const mem = [hw.memoryGB ? `${hw.memoryGB} GB` : '', hw.memoryType].filter(Boolean).join(' ');
  const tries = [
    { template: 'measurement.yml', title, preset: hw.preset, device: hw.device, cpu: hw.cpu, gpu: hw.gpu, memory: mem, os: hw.os, measurement: JSON.stringify(p, null, 2) },
    { template: 'measurement.yml', title, preset: hw.preset, device: hw.device, cpu: hw.cpu, gpu: hw.gpu, memory: mem, os: hw.os, measurement: JSON.stringify(p) },
    { template: 'measurement.yml', title, preset: hw.preset, measurement: JSON.stringify(p) },
    { template: 'measurement.yml', title, measurement: JSON.stringify(p) },
  ];
  for (let i = 0; i < tries.length; i++) { const u = q(tries[i]); if (u.length <= SHARE_MAX_URL) return { url: u, level: i, len: u.length }; }
  return { url: null, level: -1, len: q(tries[3]).length, form: `${SHARE_REPO}/issues/new?template=measurement.yml` };
}

// What will be sent, readable: one row per part of the payload.
function shareTable(p) {
  const f1 = v => (v == null ? '—' : dec(v.toFixed(v < 10 ? 1 : 0))), sv = p.server.kind === 'llama' ? 'llama-server' : 'Ollama', rq = p.request, d = p.derived, e = p.estimate;
  const t = p.timings.ollama || p.timings.llama || {}, ns = v => (v == null ? '—' : S_(v / 1e9)), ms = v => (v == null ? '—' : S_(v / 1000));
  const tim = p.server.kind === 'ollama' ? `load_duration ${ns(t.load_duration)} · prompt_eval ${num(t.prompt_eval_count || 0)} tok, ${ns(t.prompt_eval_duration)} · eval ${num(t.eval_count || 0)} tok, ${ns(t.eval_duration)} · total ${ns(t.total_duration)}`
    : `prompt ${num(t.prompt_n || 0)} tok, ${ms(t.prompt_ms)} · predicted ${num(t.predicted_n || 0)} tok, ${ms(t.predicted_ms)}${t.cache_n ? ` · cache ${num(t.cache_n)}` : ''}`;
  // measured over estimate, amber when the estimate is off by more than half (as in Estimate vs measured)
  const ratio = (m, x) => (m && x ? ` <i class="${m / x > 1.5 || m / x < 0.67 ? 'off' : ''}" title="${esc(L('measured / estimate', 'medido / estimación'))}">×${dec((m / x).toFixed(2))}</i>` : '');
  const hw = p.hardware, hwv = hw.preset ? `${esc(hw.preset === 'other' ? L('Other', 'Otro') : (MACHINES[hw.preset] || {}).name || hw.preset)}${[hw.device, hw.cpu, hw.gpu, hw.memoryGB ? `${hw.memoryGB} GB ${hw.memoryType}`.trim() : hw.memoryType].filter(Boolean).map(s => ` · ${esc(s)}`).join('')}${hw.os ? ` · ${esc(hw.os)}` : ''}` : `<i>${esc(L('not named yet', 'sin indicar'))}</i>`;
  const det = hw.detected ? [hw.detected.threads ? L(`${hw.detected.threads} threads`, `${hw.detected.threads} hilos`) : '', hw.detected.platform, hw.detected.gpu].filter(Boolean).join(' · ') : '';
  const rows = [
    [L('Server', 'Servidor'), `${esc(sv)} ${esc(p.server.version || '?')}`],
    [L('Model', 'Modelo'), `${esc(p.model.name)} · ${esc(p.model.quant)}${p.model.params ? ` · ${fmtN(p.model.params)} ${esc(L('params', 'parámetros'))}` : ''}${p.model.fileBytes ? ` · ${B(p.model.fileBytes)}` : ''}${p.model.digest ? ` · ${esc(p.model.digest.slice(0, 12))}…` : ''}`],
    [L('Request', 'Petición'), `${num(rq.promptTokens)} + ${num(rq.answerTokens)} tok · ${esc(rq.start === 'cold' ? L('cold', 'en frío') : L('warm', 'en caliente'))} · num_ctx ${rq.numCtx ? num(rq.numCtx) : '—'} · KV ${esc(rq.kvType)} · ${rq.mtp.on ? `MTP ${rq.mtp.draft}` : esc(L('no MTP', 'sin MTP'))} · T ${dec(String(rq.temperature ?? '—'))} · top-p ${dec(String(rq.topP ?? '—'))} · top-k ${rq.topK ?? esc(L('server default', 'el del servidor'))}`],
    [L('Server timings', 'Tiempos del servidor'), esc(tim)],
    [L('Measured', 'Medido'), `${esc(L('first token', 'primer token'))} ${d.ttftS != null ? S_(d.ttftS) : '—'} · prefill ${f1(d.prefillTps)} tok/s · decode ${f1(d.decodeTps)} tok/s`],
    [L(`Estimate · ${(MACHINES[e.machine] || {}).short || e.machine}`, `Estimación · ${(MACHINES[e.machine] || {}).short || e.machine}`), `${esc(L('first token', 'primer token'))} ${S_(e.ttftS)}${ratio(d.ttftS, e.ttftS)} · prefill ${f1(e.prefillTps)} tok/s${ratio(d.prefillTps, e.prefillTps)} · decode ${f1(e.decodeTps)} tok/s${ratio(d.decodeTps, e.decodeTps)}`],
    [L('Hardware', 'Hardware'), hwv + (det ? `<br>${esc(L('detected by the browser:', 'detectado por el navegador:'))} ${esc(det)}` : '')],
    ['tokenwalk', `${esc(p.tokenwalk.version)}${p.tokenwalk.commit ? ` · ${esc(p.tokenwalk.commit)}` : ''} · ${esc(p.date)}`],
  ];
  return `<table class="sh-t">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;
}

function shareFormHtml() {
  const opt = (v, l) => `<option value="${esc(v)}" ${SHARE.hw === v ? 'selected' : ''}>${esc(l)}</option>`;
  const inp = (id, k, l, ph = '', cls = '', type = 'text') => `<label class="fld ${cls}"><span class="lab">${esc(l)}</span><input type="${type}" id="${id}" data-sk="${k}" value="${esc(SHARE[k])}" placeholder="${esc(ph)}" spellcheck="false" autocomplete="off"></label>`;
  const d = SHARE.det, other = SHARE.hw === 'other';
  const det = d && (d.threads || d.platform || d.gpu) ? `<p class="sh-det"><b>${esc(L('Detected by the browser, may be generic:', 'Detectado por el navegador, puede ser genérico:'))}</b> ${esc([d.threads ? L(`${d.threads} threads`, `${d.threads} hilos`) : '', d.platform, d.gpu].filter(Boolean).join(' · '))}</p>` : '';
  return `<p class="sh-lead">${esc(L('One real run, sent to the tokenwalk repository as a GitHub issue: the server’s timings, the model and settings, and the hardware you name. A check runs on it and a maintainer reviews it before it shows in What fits.', 'Una ejecución real, enviada al repositorio de tokenwalk como issue de GitHub: los tiempos del servidor, el modelo y los ajustes, y el hardware que indiques. Se comprueba automáticamente y alguien del proyecto la revisa antes de que aparezca en Qué cabe.'))}</p>
    <div><h5 class="sh-h">${esc(L('Your hardware', 'Tu hardware'))}</h5><div class="sh-grid">
      <label class="fld wide"><span class="lab">${esc(L('Machine', 'Máquina'))}</span><select id="shHw">${opt('', L('Choose…', 'Elige…'))}${Object.entries(MACHINES).map(([k, mc]) => opt(k, mc.name)).join('')}${opt('other', L('Other (describe it)', 'Otra (descríbela)'))}</select></label>
      ${inp('shOs', 'os', L('Operating system', 'Sistema operativo'), 'Windows 11')}
      ${other ? inp('shDev', 'device', L('Device or laptop model', 'Dispositivo o modelo de portátil'), 'ThinkPad T14s Gen 6', 'wide') + inp('shCpu', 'cpu', 'CPU', d && d.threads ? L(`${d.threads} threads`, `${d.threads} hilos`) : '')
        + inp('shGpu', 'gpu', 'GPU', 'Radeon 860M', 'wide') + `<div class="sh-grid" style="grid-template-columns:1fr 1fr;gap:10px">${inp('shMem', 'memGB', L('Memory, GB', 'Memoria, GB'), '64', '', 'number')}${inp('shMemT', 'memType', L('Type', 'Tipo'), 'LPDDR5X')}</div>` : ''}
      <label class="fld"><span class="lab">${esc(L('KV cache type on the server', 'Tipo de caché KV en el servidor'))}</span><select id="shKv">${Object.keys(KV_TYPES).map(k => `<option value="${k}" ${SHARE.kv === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <p class="sh-det wide" style="align-self:end">${esc(LIVE.kind === 'llama' ? L('The page cannot see it: f16 unless llama-server was started with -ctk.', 'La página no lo ve: f16 salvo que llama-server se arrancara con -ctk.') : L('The page cannot see it: f16 unless OLLAMA_KV_CACHE_TYPE is set.', 'La página no lo ve: f16 salvo que OLLAMA_KV_CACHE_TYPE esté definido.'))}</p>
    </div>${det}</div>
    <p class="sh-priv">${ICON('lock', 's')}<span>${esc(L('Never sent: the prompt, the answer, the server address, or anything not shown below.', 'Nunca se envía: el prompt, la respuesta, la dirección del servidor ni nada que no aparezca abajo.'))}</span></p>
    <div id="shPrev"></div>`;
}
function sharePreviewHtml() {
  const p = sharePayload(); if (!p) return `<p class="sh-note">${esc(shareBlock(null))}</p>`;
  const why = shareBlock(p), u = why ? null : shareUrl(p), json = JSON.stringify(p, null, 2);
  window.__share = { payload: p, url: u, block: why, json };
  const open = u && u.url ? `<a class="btnp" id="shOpen" href="${esc(u.url)}" target="_blank" rel="noopener">${ICON('share', 's')}<span>${esc(L('Open as a GitHub issue', 'Abrir como issue de GitHub'))}</span></a>`
    : `<button type="button" class="btnp" id="shOpen" disabled title="${esc(why || L('Too long for a link', 'Demasiado largo para un enlace'))}">${ICON('share', 's')}<span>${esc(L('Open as a GitHub issue', 'Abrir como issue de GitHub'))}</span></button>`;
  const fallback = u && !u.url ? `<a class="tbtn" href="${esc(u.form)}" target="_blank" rel="noopener">${esc(L('Open the empty form', 'Abrir el formulario vacío'))}</a>` : '';
  const note = why ? `<p class="sh-note warn">${esc(why)}</p>`
    : u.url ? `<p class="sh-note">${esc(L('Opens github.com with this filled in; you check it there and press Create (a GitHub account is needed).', 'Abre github.com con esto ya relleno; lo revisas allí y pulsas Create (hace falta una cuenta de GitHub).'))}${u.level >= 2 ? ' ' + esc(L('The hardware fields are left for the form; the JSON already holds them.', 'Los campos de hardware se dejan para el formulario; el JSON ya los incluye.')) : ''}</p>`
    : `<p class="sh-note warn">${esc(L('Too long to fill in through a link: copy the JSON, open the empty form and paste it into Measurement.', 'Demasiado largo para rellenarlo con un enlace: copia el JSON, abre el formulario vacío y pégalo en Measurement.'))}</p>`;
  return `<h5 class="sh-h">${esc(L('What will be sent', 'Lo que se enviará'))}</h5>${shareTable(p)}
    <details class="sh-raw"><summary>${esc(L('Raw JSON', 'JSON tal cual'))} · ${esc(SHARE_SCHEMA)}</summary><pre id="shJson">${esc(json)}</pre></details>
    <div class="sh-act">${open}<button type="button" class="tbtn" id="shDown">${ICON('download', 's')}<span>${esc(L('Download JSON', 'Descargar JSON'))}</span></button><button type="button" class="tbtn" id="shCopy">${ICON('notes', 's')}<span>${esc(L('Copy JSON', 'Copiar JSON'))}</span></button>${fallback}</div>${note}`;
}
function shareRenderPrev() {
  const el = $('shPrev'); if (!el) return; const raw = el.querySelector('.sh-raw'), wasOpen = raw && raw.open;
  el.innerHTML = sharePreviewHtml(); if (wasOpen) el.querySelector('.sh-raw').open = true;
  const j = () => window.__share.json;
  if ($('shDown')) $('shDown').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([j() + '\n'], { type: 'application/json' })); a.download = `tokenwalk-measurement-${window.__share.payload.date}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0); });
  if ($('shCopy')) $('shCopy').addEventListener('click', () => copyText(j()).then(ok => liveToast(ok, ok ? L('JSON copied', 'JSON copiado') : L('Copy failed', 'No se pudo copiar'))));
}
function shareRender() {
  $('shareIn').innerHTML = shareFormHtml();
  $('shHw').addEventListener('change', e => { SHARE.hw = e.target.value; if (SHARE.hw === 'other' && !SHARE.gpu && SHARE.det && SHARE.det.gpu) SHARE.gpu = SHARE.det.gpu; shareSave(); shareRender(); });
  $('shKv').addEventListener('change', e => { SHARE.kv = e.target.value; shareSave(); shareRenderPrev(); });
  $('shareIn').querySelectorAll('input[data-sk]').forEach(i => i.addEventListener('input', () => { SHARE[i.dataset.sk] = i.value; shareSave(); shareRenderPrev(); }));
  shareRenderPrev();
}
let shareDetected = false;
async function shareOpen(on) {
  $('shareWin').hidden = !on; if (!on) return;
  if (!shareDetected) { shareDetected = true; SHARE.det = await shareDetect(); if (!SHARE.os && SHARE.det.platform) SHARE.os = SHARE.det.platform; }
  shareRender(); const s = $('shHw'); if (s && !SHARE.hw) s.focus();
}
$('shareClose').innerHTML = ICON('close', 's'); $('shareClose').title = L('Close (Esc)', 'Cerrar (Esc)');
$('shareClose').addEventListener('click', () => shareOpen(false));
$('shareWin').querySelector('.scrim').addEventListener('click', () => shareOpen(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('shareWin').hidden) { e.stopPropagation(); shareOpen(false); } }, true);
