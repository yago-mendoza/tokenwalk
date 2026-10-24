// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== What fits: the current request on every machine preset, model and quantization =====
// Each row is the same cost model run (compute()) with only the machine, the model and the weight format swapped;
// the request, num_ctx, KV type, sampling and caches stay as they are in Setup.
const FITS = { sort: { k: 'fit', dir: 1 }, machine: 'all', only: false, rows: null, key: '' };
const FIT_RANK = { yes: 0, tight: 1, no: 2 };
const fitsKey = () => JSON.stringify([{ ...S, machine: 0, model: 0, quant: 0, ram: 0, tflops: 0, mts: 0, bus: 0, vram: 0, vbw: 0 }, isReal() && MODELS.live ? [MODELS.live.name, S.quant] : 0, CALIB, KEEP.unloaded]);
function fitsRow(mk, mo, q) {
  const old = S; let r;
  S = { ...S, machine: mk, ...machineFields(mk), model: mo, quant: q };
  try { r = compute(); } finally { S = old; }
  const mc = r.mc, m = r.m, uni = mc.kind === 'unified', sys = sysGB(mc), need = r.weights + r.kvRes + r.state + r.buf;
  const has = uni ? mc.ramGB - sys : mc.fastGB;
  // the same thresholds as the alerts: does not fit in RAM (critical), part on the CPU or spilling past VRAM (caution)
  const fit = uni ? (need + sys > mc.ramGB ? 'no' : mk !== 'thinkpadCpu' && need > mc.fastGB ? 'tight' : 'yes')
    : r.pl.fastShare < .999 ? (r.pl.ramFits ? 'tight' : 'no') : 'yes';
  const over = (mc.layerMs * m.layers) / 1000 / r.mid.seconds, inten = (2 * m.readParams) / (r.mid.bytesGB * 1e9), bal = (mc.tflops * 1e12) / (mc.bw * 1e9) / mc.bwEff;
  const bound = !uni && r.pl.fastShare < .999 ? 'spill' : over > .5 ? 'over' : inten < bal ? 'mem' : 'comp';
  return { mk, mo, q, mc, m, need, has, fit, ttft: r.ttft, tps: r.tps, bound, cal: mk === 'thinkpad' || !!CALIB[mk] };
}
function fitsRows() {
  const key = fitsKey(); if (FITS.rows && FITS.key === key) return FITS.rows;
  const rows = [], models = Object.keys(MODELS).filter(k => k !== 'live');
  for (const mk of Object.keys(MACHINES)) {
    if (isReal() && MODELS.live) rows.push(fitsRow(mk, 'live', S.quant));
    for (const mo of models) for (const q of Object.keys(QUANTS)) rows.push(fitsRow(mk, mo, q));
  }
  FITS.rows = rows; FITS.key = key; return rows;
}
const FIT_COLS = () => [
  ['machine', L('Machine', 'Máquina'), 1], ['model', L('Model · weights', 'Modelo · pesos'), 1], ['mem', L('Memory · need / has', 'Memoria · necesita / hay'), 1],
  ['fit', L('Fits', 'Cabe'), 1], ['ttft', L('First token', 'Primer token'), 1], ['tps', 'tok/s', -1], ['bound', L('Bottleneck', 'Cuello'), 1],
];
const FIT_TXT = () => ({ yes: L('yes', 'sí'), tight: L('tight', 'justo'), no: 'no' });
const BOUND_TXT = () => ({ mem: [L('Memory', 'Memoria'), L('Decode waits on memory bandwidth', 'El decode espera al ancho de banda de memoria')], comp: [L('Compute', 'Cómputo'), L('Decode waits on arithmetic', 'El decode espera a la aritmética')], spill: [L('RAM spill', 'Desborde a RAM'), L('Weights past the VRAM are read from system RAM', 'Los pesos que no caben en VRAM se leen de la RAM del sistema')], over: [L('Overhead', 'Sobrecarga'), L('Per-layer launch and sync cost more than the reads', 'El coste fijo por capa supera a las lecturas')] });
function fitsSorted(rows) {
  const { k, dir } = FITS.sort, nm = r => `${r.mc.short}`, mn = r => `${r.m.name} ${r.q}`;
  const val = { machine: r => nm(r), model: r => mn(r), mem: r => r.need, fit: r => FIT_RANK[r.fit], ttft: r => r.ttft, tps: r => r.tps, bound: r => r.bound }[k];
  return [...rows].sort((a, b) => { const va = val(a), vb = val(b); const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb; return c * dir || FIT_RANK[a.fit] - FIT_RANK[b.fit] || b.tps - a.tps; });
}
function renderFits() {
  const el = $('fitsIn'), all = fitsRows(), real = isReal(), lk = !real && locked();
  const rows = fitsSorted(all.filter(r => (FITS.machine === 'all' || r.mk === FITS.machine) && (!FITS.only || r.fit !== 'no')));
  const nFit = all.filter(r => r.fit !== 'no').length, ft = FIT_TXT(), bt = BOUND_TXT();
  const ctxN = Math.min(S.ctx, MODELS[S.model].ctxMax), req = `${num(S.sys + S.docs + S.q)} + ${num(S.ans)} tok · num_ctx ${num(ctxN)} · KV ${S.kv} · T ${dec(S.temp.toFixed(2))}${!S.spec && S.mtp ? ' · MTP' : ''}${S.spec ? ` · spec γ${S.gamma}` : ''}${S.cached ? L(' · prefix cached', ' · prefijo en caché') : ''}${S.cold ? L(' · cold', ' · en frío') : ''}`;
  const isCur = r => (real ? r.mk === S.machine && r.mo === S.model : r.mk === S.machine && r.mo === S.model && r.q === S.quant);
  const head = FIT_COLS().map(([k, l]) => `<th class="c-${k}${FITS.sort.k === k ? ' on' : ''}" data-fs="${k}" role="button" tabindex="0" aria-sort="${FITS.sort.k === k ? (FITS.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(l)}<i>${FITS.sort.k === k ? (FITS.sort.dir > 0 ? '▲' : '▼') : ''}</i></th>`).join('');
  const body = rows.map(r => `<tr class="${isCur(r) ? 'cur' : ''}" data-fr="${r.mk}|${r.mo}|${r.q}" tabindex="0" role="button">
    <td class="c-machine" title="${esc(r.mc.name)}"><span>${esc(r.mc.short)}</span><small class="${r.cal ? 'cal' : 'est'}">${esc(r.cal ? L('calibrated', 'calibrada') : L('estimate', 'estimada'))}</small></td>
    <td class="c-model">${esc(r.m.name)} <small>${esc(r.q)}</small></td>
    <td class="c-mem num"><span class="mb"><b class="${r.fit}" style="width:${Math.min(100, r.need / Math.max(1e-9, r.has) * 100).toFixed(0)}%"></b></span>${dec(r.need.toFixed(r.need >= 100 ? 0 : 1))} / ${dec(r.has.toFixed(0))} GB</td>
    <td class="c-fit"><span class="fp ${r.fit}">${esc(ft[r.fit])}</span></td>
    <td class="c-ttft num">${S_(r.ttft)}</td>
    <td class="c-tps num">${dec(r.tps.toFixed(r.tps < 10 ? 1 : 0))}</td>
    <td class="c-bound" title="${esc(bt[r.bound][1])}">${esc(bt[r.bound][0])}</td></tr>`).join('');
  const note = real ? `<div class="fw-note">${ICON('info', 's')}${esc(L('Real machine: a row sets only Estimate as; the server’s model stays.', 'Máquina real: una fila cambia solo Estimar como; el modelo del servidor no cambia.'))}</div>`
    : lk ? `<div class="fw-note">${ICON('lock', 's')}${esc(L('Locked while it runs: stop to load a row.', 'Bloqueado mientras corre: detén la ejecución para cargar una fila.'))}</div>` : '';
  el.innerHTML = `<div class="fw-bar"><span class="fw-req num" title="${esc(L('The request every row runs', 'La petición que corre cada fila'))}">${esc(req)}</span>
      <label class="fw-sel"><span>${esc(L('Machine', 'Máquina'))}</span><select id="fitsMach"><option value="all">${esc(L('All', 'Todas'))}</option>${Object.entries(MACHINES).map(([k, mc]) => `<option value="${k}" ${FITS.machine === k ? 'selected' : ''}>${esc(mc.short)}</option>`).join('')}</select></label>
      <label class="sw"><input type="checkbox" id="fitsOnly" ${FITS.only ? 'checked' : ''}><i></i><span>${esc(L('Only what fits', 'Solo lo que cabe'))}</span></label>
      <span class="fw-cnt num">${esc(L(`${num(rows.length)} rows · ${num(nFit)} of ${num(all.length)} fit`, `${num(rows.length)} filas · caben ${num(nFit)} de ${num(all.length)}`))}</span></div>
    <div class="fw-tbl${lk ? ' lk' : ''}"><table class="fits"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${note}`;
  $('fitsMach').addEventListener('change', e => { FITS.machine = e.target.value; renderFits(); });
  $('fitsOnly').addEventListener('change', e => { FITS.only = e.target.checked; renderFits(); });
  const sortBy = th => { const k = th.dataset.fs, def = FIT_COLS().find(c => c[0] === k)[2]; FITS.sort = FITS.sort.k === k ? { k, dir: -FITS.sort.dir } : { k, dir: def }; renderFits(); };
  el.querySelectorAll('th[data-fs]').forEach(th => { th.addEventListener('click', () => sortBy(th)); th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(th); } }); });
  el.querySelectorAll('tr[data-fr]').forEach(tr => { tr.addEventListener('click', () => fitsLoad(tr.dataset.fr)); tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fitsLoad(tr.dataset.fr); } }); });
}
function fitsLoad(id) {
  const [mk, mo, q] = id.split('|');
  if (isReal()) { S.machine = mk; Object.assign(S, machineFields(mk)); saveReal(); realCfgKey = ''; changed(); fitsOpen(false); return; }
  if (locked()) return;
  pushUndo(); S.machine = mk; Object.assign(S, machineFields(mk)); S.model = mo; S.quant = q; UI.layer = -1; KEEP.unloaded = false; KEEP.idle = 0; changed(); fitsOpen(false);
}
function fitsOpen(on) { $('fitsWin').hidden = !on; if (on) { renderFits(); const t = $('fitsIn').querySelector('.fw-tbl'); if (t) t.scrollTop = 0; } }
$('fitsOpen').addEventListener('click', () => fitsOpen(true));
$('fitsClose').addEventListener('click', () => fitsOpen(false)); $('fitsClose').innerHTML = ICON('close', 's'); $('fitsClose').title = L('Close (Esc)', 'Cerrar (Esc)');
$('fitsWin').querySelector('.scrim').addEventListener('click', () => fitsOpen(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('fitsWin').hidden) { e.stopPropagation(); fitsOpen(false); } }, true);
// The Setup row says how many combinations fit, recomputed a moment after the request settles.
let fitsValT = 0, fitsValKey = '';
setInterval(() => {
  const k = fitsKey() + lang; if (k === fitsValKey) return;
  clearTimeout(fitsValT); fitsValT = setTimeout(() => { fitsValKey = k; const rows = fitsRows(); $('vFits').textContent = L(`${num(rows.filter(r => r.fit !== 'no').length)} of ${num(rows.length)} fit`, `caben ${num(rows.filter(r => r.fit !== 'no').length)} de ${num(rows.length)}`); if (!$('fitsWin').hidden) renderFits(); }, 350);
}, 400);
$('fitsOpen').title = L('Every machine preset, model and weight format for this request', 'Cada preset de máquina, modelo y formato de pesos para esta petición');

// ===== Restore defaults: the Setup header's ↺ =====
// Simulated: the reference machine and the default request, one undoable step. Real: only the request and sampling;
// the connection, the server and its model stay.
const realReqNow = () => ({ promptMode: LIVE.promptMode, own: LIVE.own, maxTok: LIVE.maxTok, temp: S.temp, topk: S.topk, topp: S.topp, seed: S.seed, mtp: S.mtp });
const realReqDef = () => { const d = defaults(); return { promptMode: 'short', own: LIVE.own, maxTok: 64, temp: d.temp, topk: d.topk, topp: d.topp, seed: d.seed, mtp: liveHasMtp() ? d.mtp : S.mtp }; };
function realReqSet(v) { LIVE.promptMode = v.promptMode; LIVE.own = v.own; LIVE.maxTok = v.maxTok; Object.assign(S, { temp: v.temp, topk: v.topk, topp: v.topp, seed: v.seed, mtp: v.mtp }); realSizeRequest(); saveReal(); realCfgKey = ''; changed(); }
function realUndo() { const v = REAL_UNDO.pop(); if (v) realReqSet(v); renderUndo(); }
const hasChanges = () => (isReal() ? JSON.stringify(realReqNow()) !== JSON.stringify(realReqDef()) : !isDefault());
function restoreDefaults() {
  rstAsk(false);
  if (isReal()) { if (LIVE.running) return; REAL_UNDO.push(realReqNow()); if (REAL_UNDO.length > 40) REAL_UNDO.shift(); realReqSet(realReqDef()); renderUndo(); return; }
  if (locked()) return;
  pushUndo(); S = defaults(); UI.layer = -1; KEEP.unloaded = false; KEEP.idle = 0; changed();
}
function rstAsk(on) {
  const a = $('rstAsk'); a.hidden = !on; if (!on) return;
  a.innerHTML = `<p>${esc(isReal() ? L('Restore the default request and sampling?', '¿Restaurar la petición y el muestreo por defecto?') : L('Restore the defaults?', '¿Restaurar los valores por defecto?'))}</p><div><button type="button" class="btnp" id="rstGo">${ICON('restart', 's')}${esc(L('Restore', 'Restaurar'))}</button><button type="button" class="tbtn" id="rstNo">${esc(L('Cancel', 'Cancelar'))}</button></div>`;
  const r = $('rstBtn').getBoundingClientRect(); a.style.top = `${r.bottom + 6}px`; a.style.left = `${Math.max(8, r.right - a.offsetWidth)}px`;
  $('rstGo').addEventListener('click', restoreDefaults); $('rstNo').addEventListener('click', () => rstAsk(false)); $('rstNo').focus();
}
{ const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn'; b.id = 'rstBtn'; b.innerHTML = ICON('restart', 's'); $('redoBtn').after(b);
  b.addEventListener('click', e => { e.stopPropagation(); if (b.disabled) return; if (hasChanges()) rstAsk($('rstAsk').hidden); }); }
document.addEventListener('pointerdown', e => { if (!$('rstAsk').hidden && !e.target.closest('#rstAsk, #rstBtn')) rstAsk(false); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('rstAsk').hidden) { e.stopPropagation(); rstAsk(false); } }, true);
function renderRestore() {
  const b = $('rstBtn'), real = isReal(), lk = real ? LIVE.running : locked(), ch = hasChanges();
  b.disabled = lk || !ch;
  b.title = lk ? (real ? L('A real request is running', 'Hay una petición real en marcha') : L('Locked during the run', 'Bloqueado durante la ejecución'))
    : real ? L('Back to the default request and sampling; the connection stays', 'Volver a la petición y el muestreo por defecto; la conexión se mantiene')
    : L('Back to the reference machine (ThinkPad · Radeon 860M, calibrated) and the default request', 'Volver a la máquina de referencia (ThinkPad · Radeon 860M, calibrada) y a la petición por defecto');
  b.setAttribute('aria-label', L('Restore defaults', 'Restaurar valores por defecto'));
}
setInterval(renderRestore, 250);

// ===== Copy link: the current setup as an address =====
// The same query the address bar keeps (03-state.ts, setupQuery), never in Real: in Real the link carries the
// saved simulation. "Include the current moment" adds the playhead.
let LINK_AT = (() => { try { return localStorage.getItem('tw.linkAt') === '1'; } catch (e) { return false; } })(), toastT = 0;
function linkNow() {
  const st = isReal() && MODE.simS ? MODE.simS : S, t = isReal() ? MODE.simT || 0 : P.t;
  const q = setupQuery(st, LINK_AT ? t : null), base = location.href.split(/[?#]/)[0];
  return q ? `${base}?${q}` : base;
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
  try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;left:-9999px'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
async function copyLink() {
  const url = linkNow(); window.__link = url;
  const ok = await copyText(url);
  const tt = $('toast'), atOk = (isReal() ? MODE.simT || 0 : P.t) > 0;
  tt.innerHTML = `${ICON(ok ? 'check' : 'warning', 's')}<b>${esc(ok ? L('Link copied', 'Enlace copiado') : L('Copy failed: select the address', 'No se pudo copiar: selecciona la dirección'))}</b><label class="sw"><input type="checkbox" id="linkAt" ${LINK_AT ? 'checked' : ''} ${atOk ? '' : 'disabled'}><i></i><span>${esc(L('Include the current moment', 'Incluir el momento actual'))}</span></label>`;
  tt.hidden = false; tt.classList.toggle('bad', !ok);
  $('linkAt').addEventListener('change', e => { LINK_AT = e.target.checked; try { localStorage.setItem('tw.linkAt', LINK_AT ? '1' : '0'); } catch (er) {} copyLink(); });
  clearTimeout(toastT); toastT = setTimeout(hideToast, 4000);
}
function hideToast() { if ($('toast').matches(':hover')) { toastT = setTimeout(hideToast, 1500); return; } $('toast').hidden = true; }
$('linkBtn').innerHTML = ICON('link'); $('linkBtn').addEventListener('click', copyLink);
const linkText = () => { $('linkBtn').title = L('Copy a link to this setup', 'Copiar un enlace a esta configuración'); $('linkBtn').setAttribute('aria-label', $('linkBtn').title); };
linkText(); setInterval(linkText, 1000);
