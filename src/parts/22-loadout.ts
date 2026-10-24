// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Loadout: machines and models as cards =====
let LOAD = { tab: 'machine', compare: false, sort: { machine: 'speed', model: 'speed' } };
const flagBtn = () => ''; const flagBtnOld = (tab, k) => { const on = LOAD.flags[tab].includes(k); return `<button type="button" class="flagb" data-flag="${k}" aria-pressed="${on}" title="${esc(on ? L('Remove from the comparison', 'Quitar de la comparación') : L('Flag to compare', 'Marcar para comparar'))}">${ICON('flag', 's')}</button>`; };
function machineCard(k, mc) {
  const sel = S.machine === k, lk = locked();
  const bars = [[L('memory', 'memoria'), mc.kind === 'unified' ? mc.ramGB : mc.fastGB, 256, 'GB'], [L('bandwidth', 'ancho de banda'), mc.bw, 3400, 'GB/s'], [L('compute', 'cómputo'), mc.tflops, 400, 'TFLOPS']];
  const tps = decodeTokS(mc, MODELS[S.model], S.quant, S.kv, R.prompt), fits = placement(mc, MODELS[S.model], S.quant).fits;
  return `<div class="card${sel ? ' on' : ''}"><header>${ICON(mc.kind === 'unified' ? 'memory' : 'bolt')}<b>${esc(mc.name)}</b><span class="tagp ${mc.est ? 'est' : 'cal'}">${mc.est ? L('estimated', 'estimado') : L('calibrated', 'calibrado')}</span>${flagBtn('machine', k)}</header>
    <div class="desc">${esc(mc.kind === 'unified' ? L('One board: CPU, GPU and NPU share the soldered memory; the GPU has none of its own.', 'Una placa: CPU, GPU y NPU comparten la memoria soldada; la GPU no tiene propia.') : L('Two boards: system RAM on the motherboard, the GPU and its own VRAM on a separate card over PCIe.', 'Dos placas: la RAM en la placa base, la GPU y su propia VRAM en una tarjeta aparte por PCIe.'))}</div>
    ${bars.map(([l, v, mx, u]) => `<div class="mbar"><span>${esc(l)}</span><i><b style="width:${Math.max(2, Math.min(100, Math.log10(1 + v) / Math.log10(1 + mx) * 100)).toFixed(0)}%"></b></i><em class="num">${dec(v >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 0 : 2))} ${u}</em></div>`).join('')}
    <div class="desc num">${esc(L(`${mc.units} ${mc.unitName} · ${mc.cores} CPU cores`, `${mc.units} ${mc.unitName} · ${mc.cores} núcleos CPU`))}</div>
    <div class="desc">${esc(L(`With ${MODELS[S.model].name}: about ${dec(tps.toFixed(1))} tok/s${fits ? '' : ', does not fit'}`, `Con ${MODELS[S.model].name}: unos ${dec(tps.toFixed(1))} tok/s${fits ? '' : ', no cabe'}`))}</div>
    <button type="button" class="btnp choose" data-m="${k}" ${sel || lk ? 'disabled' : ''} title="${lk ? esc(L('Locked during the run', 'Bloqueado durante la ejecución')) : ''}">${sel ? esc(L('Selected', 'Elegida')) : esc(L('Choose', 'Elegir'))}</button></div>`;
}
function stackSvg(m) {
  const kinds = layerKinds(m), w = 120, h = 54, lh = h / m.layers;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">${kinds.map((k, i) => `<rect x="0" y="${(h - (i + 1) * lh).toFixed(2)}" width="${k === 'attn' ? w : w * .8}" height="${Math.max(.5, lh - (lh > 2 ? .6 : 0)).toFixed(2)}" fill="${k === 'attn' ? '#e7c22f' : '#3fd6c0'}" opacity="${k === 'attn' ? .9 : .55}"/>`).join('')}</svg>`;
}
function modelCard(k, m) {
  const sel = S.model === k, lk = locked(), mc = R.mc, uni = mc.kind === 'unified';
  const cap = uni ? mc.ramGB - sysGB(mc) : mc.fastGB, capL = uni ? L('free RAM', 'RAM libre') : 'VRAM';
  const qs = Object.keys(QUANTS), top = Math.max(cap, ...qs.map(q => fileGB(m, q))) * 1.04;
  const fitOf = q => { const w = fileGB(m, q); return w <= cap ? 'ok' : !uni && placement(mc, m, q).ramFits ? 'spill' : 'no'; };
  const readPct = Math.max(1.5, (m.readParams / m.total) * 100);
  const spec = [
    [L('Layers', 'Capas'), `${m.layers}`, m.kvLayers < m.layers ? L(`${m.kvLayers} attention, ${m.layers - m.kvLayers} DeltaNet`, `${m.kvLayers} atención, ${m.layers - m.kvLayers} DeltaNet`) : L('all attention', 'todas atención')],
    [L('Heads', 'Cabezas'), `${m.qHeads} / ${m.kvHeads}`, L(`query / KV, ${m.headDim} wide`, `consulta / KV, de ${m.headDim}`)],
    [L('Experts', 'Expertos'), m.moe ? `${m.expertsUsed + m.sharedExperts} / ${m.experts}` : '1', m.moe ? L('active / total', 'activos / total') : L('dense', 'denso')],
    [L('KV per token', 'KV por token'), B(kvBytesPerToken(m, 'f16')), 'f16'],
    [L('Context max', 'Contexto máx.'), num(m.ctxMax), 'tokens'],
  ];
  const src = m.measured ? L('Numbers read from the GGUF header on disk', 'Números leídos de la cabecera GGUF en disco') : L('Numbers from the published configuration', 'Números de la configuración publicada');
  return `<div class="card mcard${sel ? ' on' : ''}"><header>${ICON('layers')}<b title="${esc(src)}">${esc(m.name)}</b><span class="kind ${m.moe ? 'moe' : ''}">${m.moe ? 'MoE' : L('dense', 'denso')}</span>${flagBtn('model', k)}</header>
    <div class="pr"><div class="prh"><span class="num"><b>${dec((m.total / 1e9).toFixed(1))}B</b> ${esc(L('parameters', 'parámetros'))}</span><span class="num hot"><b>${dec((m.readParams / 1e9).toFixed(1))}B</b> ${esc(L('read per token', 'leídos por token'))}</span></div><div class="prb"><i style="width:${readPct.toFixed(1)}%"></i></div></div>
    <div class="arch">${stackSvg(m)}<dl class="spec">${spec.map(([l, v, sub]) => `<dt>${esc(l)}</dt><dd class="num">${esc(v)}<small>${linkify(esc(sub))}</small></dd>`).join('')}</dl></div>
    <div class="qz"><div class="qzh"><span class="lbl">${esc(L('File by quantization', 'Archivo por cuantización'))}</span><span class="cap num">${esc(capL)} ${dec(cap.toFixed(0))} GB</span></div>
      ${qs.map(q => { const w = fileGB(m, q), f = fitOf(q); return `<div class="qr ${f}${S.quant === q && sel ? ' cur' : ''}" role="button" tabindex="0" data-qm="${k}" data-q="${q}" title="${esc(L(`Use ${m.name} at ${q}`, `Usar ${m.name} en ${q}`))}"><span class="num">${q}</span><i><b style="width:${(w / top * 100).toFixed(1)}%"></b><u style="left:${(cap / top * 100).toFixed(1)}%"></u></i><em class="num">${dec(fmtGB(w))}</em></div>`; }).join('')}
    </div>
    <button type="button" class="btnp choose" data-model="${k}" ${sel || lk ? 'disabled' : ''}>${sel ? esc(L('Selected', 'Elegido')) : esc(L('Choose', 'Elegir'))}</button></div>`;
}
// Sorting: by what decides the choice. Speed and fit are for the current request on the current setup.
const SORTS = () => ({
  machine: [['speed', L('Fastest here', 'Más rápida aquí')], ['bw', L('Bandwidth', 'Ancho de banda')], ['mem', L('Memory', 'Memoria')], ['name', L('Name', 'Nombre')]],
  model: [['speed', L('Fastest here', 'Más rápido aquí')], ['fit', L('Fits first', 'Los que caben primero')], ['read', L('Least read per token', 'Menos leído por token')], ['size', L('Size', 'Tamaño')], ['name', L('Name', 'Nombre')]],
});
function sortedKeys(tab) {
  const all = tab === 'machine' ? MACHINES : MODELS, by = LOAD.sort[tab], ks = Object.keys(all);
  const tpsM = k => decodeTokS(MACHINES[k], MODELS[S.model], S.quant, S.kv, R.prompt), tpsD = k => decodeTokS(R.mc, MODELS[k], S.quant, S.kv, R.prompt), fitD = k => placement(R.mc, MODELS[k], S.quant).fits ? 1 : 0;
  const f = tab === 'machine' ? { speed: k => -tpsM(k), bw: k => -all[k].bw, mem: k => -(all[k].kind === 'unified' ? all[k].ramGB : all[k].fastGB), name: null }[by] : { speed: k => -tpsD(k), fit: k => -fitD(k) * 1e6 - tpsD(k), read: k => all[k].readParams, size: k => -all[k].total, name: null }[by];
  return f ? ks.sort((a, b) => f(a) - f(b)) : ks.sort((a, b) => (all[a].name).localeCompare(all[b].name));
}
// The setup strip: the four things that decide everything, each a door to change it, and a problem band when it does not fit.
function setupStrip() {
  const g = fitGate(), chip = (k, ic, lbl, val) => `<button type="button" class="sch" data-go="${k}">${ICON(ic, 's')}<span>${esc(lbl)}</span><b>${esc(val)}</b></button>`;
  const h = `<div class="setup">${chip('machine', 'memory', L('Machine', 'Máquina'), R.mc.short)}${chip('model', 'layers', L('Model', 'Modelo'), `${R.m.name} · ${S.quant}`)}${chip('engine', 'tune', 'KV', S.kv)}${chip('engine', 'tune', 'num_ctx', num(S.ctx))}${chip('request', 'notes', L('Request', 'Petición'), `${num(R.prompt)} + ${num(S.ans)}`)}<span class="sp"></span>${g ? `<span class="fitc no">${ICON('error', 's')}${esc(L('Does not fit', 'No cabe'))}</span>` : `<span class="fitc ok">${ICON('check', 's')}${esc(L('Fits', 'Cabe'))}</span>`}</div>`;
  return h + (g ? `<div class="problem">${ICON('error', 's')}<span><b>${esc(L('Problem', 'Problema'))}</b> ${esc(g.reason)}</span>${g.fixes.map(([l], i) => `<button type="button" class="fixb" data-lfix="${i}">${ICON('tune', 's')}${esc(l)}</button>`).join('')}</div>` : '');
}
// Compare: the flagged cards (or all, when none is flagged) side by side. Each row is drawn as bars on its own scale; the best value is marked.
function compareTable() {
  const tab = LOAD.tab, all = tab === 'machine' ? MACHINES : MODELS, keys = sortedKeys(tab), cur = tab === 'machine' ? S.machine : S.model;
  const q = S.quant, ans = S.ans;
  const run = (mc, m) => { const pl = placement(mc, m, q), uni = mc.kind === 'unified', fits = uni ? pl.weightsGB + kvGB(m, S.kv, S.ctx) <= mc.ramGB - sysGB(mc) : pl.fits, tps = decodeTokS(mc, m, q, S.kv, R.prompt), ttft = prefillSeconds(mc, m, q, R.prompt); return { fits, spill: !uni && !pl.fits && pl.ramFits, tps, ttft, total: ttft + ans / tps }; };
  const fitTxt = r => r.fits ? ['ok', L('fits', 'cabe')] : r.spill ? ['spill', L('spills to RAM', 'desborda a RAM')] : ['no', L('does not fit', 'no cabe')];
  const rows = tab === 'machine' ? [
    [L('Hardware', 'Hardware')],
    [L('memory the model can use', 'memoria que puede usar el modelo'), mc => mc.kind === 'unified' ? mc.ramGB - sysGB(mc) : mc.fastGB, v => `${dec(v.toFixed(0))} GB`, 'high'],
    [L('bandwidth', 'ancho de banda'), mc => mc.bw, v => `${dec(v.toFixed(0))} GB/s`, 'high'],
    [L('compute', 'cómputo'), mc => mc.tflops, v => `${dec(v < 10 ? v.toFixed(2) : v.toFixed(0))} TFLOPS`, 'high'],
    [L('layout', 'disposición'), mc => null, (v, mc) => mc.kind === 'unified' ? L('one board, shared memory', 'una placa, memoria compartida') : L('card with its own VRAM', 'tarjeta con VRAM propia')],
    [L(`This request: ${MODELS[S.model].name}, ${q}, ${num(R.prompt)} + ${num(ans)} tokens`, `Esta petición: ${MODELS[S.model].name}, ${q}, ${num(R.prompt)} + ${num(ans)} tokens`)],
    [L('fits', 'cabe'), mc => null, (v, mc) => fitTxt(run(mc, MODELS[S.model]))],
    [L('writing speed', 'velocidad de escritura'), mc => run(mc, MODELS[S.model]).tps, v => `${dec(v.toFixed(1))} tok/s`, 'high'],
    [L('time to first token', 'hasta el primer token'), mc => run(mc, MODELS[S.model]).ttft, v => S_(v), 'low'],
    [L('whole request', 'petición completa'), mc => run(mc, MODELS[S.model]).total, v => S_(v), 'low'],
  ] : [
    [L('The model', 'El modelo')],
    [L('parameters', 'parámetros'), m => m.total / 1e9, v => `${dec(v.toFixed(1))}B`, null],
    [L('read per token', 'leídos por token'), m => m.readParams / 1e9, v => `${dec(v.toFixed(1))}B`, 'low'],
    [L('layers, with KV', 'capas, con KV'), m => m.kvLayers, (v, m) => `${m.layers}, ${m.kvLayers}`, 'low'],
    [L('KV per token, f16', 'KV por token, f16'), m => kvBytesPerToken(m, 'f16'), v => B(v), 'low'],
    [L('context max', 'contexto máx.'), m => m.ctxMax, v => num(v), 'high'],
    [L('On the setup above', 'Con la configuración de arriba')],
    [L('file', 'archivo'), m => fileGB(m, q), v => `${dec(fmtGB(v))}`, 'low'],
    [L('KV reserved', 'KV reservada'), m => kvGB(m, S.kv, S.ctx), v => `${dec(fmtGB(v))}`, 'low'],
    [L('fits', 'cabe'), m => null, (v, m) => fitTxt(run(R.mc, m))],
    [L('writing speed', 'velocidad de escritura'), m => run(R.mc, m).tps, v => `${dec(v.toFixed(1))} tok/s`, 'high'],
    [L('time to first token', 'hasta el primer token'), m => run(R.mc, m).ttft, v => S_(v), 'low'],
    [L('whole request', 'petición completa'), m => run(R.mc, m).total, v => S_(v), 'low'],
  ];
  const head = `<tr><th></th>${keys.map(k => `<th class="${k === cur ? 'cur' : ''}"><span>${esc(tab === 'machine' ? all[k].short : all[k].name)}</span>${k === cur ? `<small>${esc(L('current', 'actual'))}</small>` : ''}</th>`).join('')}</tr>`;
  const body = rows.map(r => {
    if (r.length === 1) return `<tr class="grp"><td colspan="${keys.length + 1}">${esc(r[0])}</td></tr>`;
    const [label, get, fmt, better] = r, vals = keys.map(k => get(all[k]));
    const nums = vals.filter(v => typeof v === 'number' && v > 0), mx = Math.max(...nums), mn = Math.min(...nums), logS = mx / mn > 30;
    const best = better && nums.length > 1 && mx !== mn ? (better === 'high' ? mx : mn) : null;
    const w = v => logS ? Math.log10(1 + v / mn * 9) / Math.log10(1 + mx / mn * 9) : v / mx;
    return `<tr><td>${esc(label)}</td>${keys.map((k, i) => { const v = vals[i], out = fmt(v, all[k]);
      if (Array.isArray(out)) return `<td class="${k === cur ? 'cur' : ''}"><span class="fit ${out[0]}">${esc(out[1])}</span></td>`;
      if (typeof v !== 'number') return `<td class="${k === cur ? 'cur' : ''} txt">${esc(out)}</td>`;
      return `<td class="${k === cur ? 'cur' : ''}${v === best ? ' best' : ''}"><div class="cv num">${esc(out)}</div><i class="cb"><b style="width:${Math.max(2, w(v) * 100).toFixed(1)}%"></b></i></td>`; }).join('')}</tr>`;
  }).join('');
  const lk = locked(), foot = `<tr class="act"><td></td>${keys.map(k => `<td class="${k === cur ? 'cur' : ''}">${k === cur ? `<span class="fit ok">${esc(L('selected', 'elegido'))}</span>` : `<button type="button" class="btnp choose" ${tab === 'machine' ? 'data-m' : 'data-model'}="${k}" ${lk ? 'disabled' : ''}>${esc(L('Choose', 'Elegir'))}</button>`}</td>`).join('')}</tr>`;
  return `<div class="cmpwrap"><table class="cmp">${head}${body}${foot}</table></div><div class="cmpnote dim">${esc(L('Bars are per row; a long spread uses a log scale. Green marks the best value. Other machines are estimated from the laptop calibration.', 'Las barras son por fila; si la diferencia es enorme la escala es logarítmica. El verde marca el mejor valor. Las demás máquinas son estimaciones a partir de la calibración del portátil.'))}</div>`;
}
function renderLoadout() {
  const el = $('loadout');
  el.innerHTML = `<div class="lh"><span class="zt">${esc(L('Loadout', 'Equipamiento'))}</span><span class="seg"><button type="button" data-lt="machine" aria-pressed="${LOAD.tab === 'machine'}">${ICON('memory', 's')}${esc(L('Machines', 'Máquinas'))}</button><button type="button" data-lt="model" aria-pressed="${LOAD.tab === 'model'}">${ICON('layers', 's')}${esc(L('Models', 'Modelos'))}</button></span>
    <label class="sw"><input type="checkbox" id="cmpT" ${LOAD.compare ? 'checked' : ''}><i></i><span>${esc(L('Compare side by side', 'Comparar lado a lado'))}</span></label><button type="button" class="tbtn" id="loadClose" style="margin-left:auto">${ICON('close', 's')}${esc(L('Back to the console', 'Volver a la consola'))}</button></div>
    <div class="lb">${setupStrip()}<div class="sortrow"><label class="sortl">${esc(L('Sort by', 'Ordenar por'))}<select id="sortSel">${SORTS()[LOAD.tab].map(([k, l]) => `<option value="${k}" ${LOAD.sort[LOAD.tab] === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>${LOAD.compare ? compareTable() : `<div class="cards">${sortedKeys(LOAD.tab).map(k => LOAD.tab === 'machine' ? machineCard(k, MACHINES[k]) : modelCard(k, MODELS[k])).join('')}</div>`}</div>`;
  el.querySelectorAll('[data-lt]').forEach(b => b.addEventListener('click', () => { LOAD.tab = b.dataset.lt; renderLoadout(); }));
  $('cmpT').addEventListener('change', e => { LOAD.compare = e.target.checked; renderLoadout(); });
  $('loadClose').addEventListener('click', () => el.classList.remove('on'));
  $('sortSel').addEventListener('change', e => { LOAD.sort[LOAD.tab] = e.target.value; renderLoadout(); });
  el.querySelectorAll('.sch').forEach(b => b.addEventListener('click', () => { const g = b.dataset.go; if (g === 'machine' || g === 'model') { LOAD.tab = g; renderLoadout(); } else { el.classList.remove('on'); const acc = document.querySelector(`[data-acc="${g}"]`); if (acc && !acc.classList.contains('open')) acc.querySelector('button').click(); } }));
  el.querySelectorAll('[data-lfix]').forEach(b => b.addEventListener('click', () => { const f = fitGate(); if (!f || locked()) return; pushUndo(); Object.assign(S, f.fixes[+b.dataset.lfix][1]); KEEP.unloaded = false; changed(); renderLoadout(); }));
  el.querySelectorAll('[data-qm]').forEach(r => { const go = () => { if (locked()) return; pushUndo(); S.model = r.dataset.qm; S.quant = r.dataset.q; UI.layer = -1; KEEP.unloaded = false; changed(); renderLoadout(); }; r.addEventListener('click', go); r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
  el.querySelectorAll('.choose').forEach(b => b.addEventListener('click', () => { if (locked()) return; pushUndo(); if (b.dataset.m) { S.machine = b.dataset.m; Object.assign(S, machineFields(S.machine)); } if (b.dataset.model) { S.model = b.dataset.model; UI.layer = -1; } KEEP.unloaded = false; changed(); el.classList.remove('on'); }));
}
function openLoadout(tab) { LOAD.tab = tab || LOAD.tab; renderLoadout(); $('loadout').classList.add('on'); }
// The panel drops down from the header just pressed, which never moves; it may run past the column's foot
// over the Playback zone, so it never has to rise or scroll.
function placeFlyout(acc) {
  const r = acc.querySelector('button').getBoundingClientRect(), col = $('cfg').getBoundingClientRect(), st = document.documentElement.style;
  const old = acc.querySelector('.in > .flyhead'); if (old) old.remove();
  st.setProperty('--flyLeft', `${col.left + 6}px`); st.setProperty('--flyW', `${col.width - 12}px`); st.setProperty('--flyTop', `${r.bottom}px`); st.setProperty('--flyMax', `${innerHeight - r.bottom - 8}px`);
}
function fillHintbars() {
  document.querySelectorAll('#cfgBody .acc .in').forEach(inn => {
    const hs = [...inn.querySelectorAll('.hint')].filter(h => h.textContent.trim()); if (!hs.length) return;
    let bar = inn.querySelector(':scope > .hintbar'); if (!bar) { bar = document.createElement('div'); bar.className = 'hintbar'; inn.appendChild(bar);
      const show = el => { const h = el && el.closest('.fld') && el.closest('.fld').querySelector('.hint'); if (h && h.textContent.trim()) bar.textContent = h.textContent; };
      inn.addEventListener('pointerover', e => show(e.target)); inn.addEventListener('focusin', e => show(e.target)); }
    if (!hs.some(h => h.textContent === bar.textContent)) bar.textContent = hs[0].textContent;
  });
}
function renderChoice() {
  const row = (id, ic, name, tab, lbl) => { const h = `<button type="button" class="chb" data-open="${tab}">${ICON(ic, 's')}<span>${esc(name)}</span><em>${esc(lbl)}</em></button>`; if ($(id).dataset.k !== h) { $(id).dataset.k = h; $(id).innerHTML = h; $(id).querySelector('button').addEventListener('click', () => openLoadout(tab)); } };
  fillHintbars();
  row('chMachine', 'memory', R.mc.name, 'machine', L('Browse and compare', 'Ver y comparar'));
  row('chModel', 'layers', `${R.m.name} · ${S.quant}`, 'model', L('Browse and compare', 'Ver y comparar'));
  const on = document.querySelector('.sc.on b'); if ($('vScen')) $('vScen').textContent = on ? on.textContent : L('custom', 'a medida');
}

// ===== Safety: the fit gate, one-click fixes, undo, confirmations =====
function fitGate() {
  const mc = R.mc, need = R.weights + R.kvRes + R.state + R.buf;
  const over = mc.kind === 'unified' ? need + sysGB() > mc.ramGB : need * R.pl.fastShare > mc.fastGB + 0.01 && false;
  if (!over) return null;
  const fixes = [], m = R.m, try1 = st => { const old = S; S = { ...S, ...st }; const r2 = compute(); S = old; const n2 = r2.weights + r2.kvRes + r2.state + r2.buf; return n2 + sysGB(r2.mc) <= r2.mc.ramGB; };
  if (R.kvRes > 1 && S.ctx > 32768 && try1({ ctx: 32768 })) fixes.push([L('Lower num_ctx to 32k', 'Bajar num_ctx a 32k'), { ctx: 32768 }]);
  for (const q of ['Q8_0', 'Q4_K_M']) if (QUANTS[q].bpw < QUANTS[S.quant].bpw && try1({ quant: q })) { fixes.push([L(`Use ${q}`, `Usar ${q}`), { quant: q }]); break; }
  if (fixes.length < 2) for (const k of Object.keys(MODELS).sort((a, b) => MODELS[b].total - MODELS[a].total)) { if (k === S.model) continue; if (try1({ model: k, quant: 'Q4_K_M' })) { fixes.push([L(`Use ${MODELS[k].name} Q4_K_M`, `Usar ${MODELS[k].name} Q4_K_M`), { model: k, quant: 'Q4_K_M' }]); break; } }
  return { reason: L(`Does not fit: model, KV and buffers need ${dec(fmtGB(need))} on top of ${sysGB()} GB of apps, in ${dec(fmtGB(mc.ramGB))}. Play is blocked: the system would page to disk.`, `No cabe: modelo, KV y buffers necesitan ${dec(fmtGB(need))} además de ${sysGB()} GB de apps, en ${dec(fmtGB(mc.ramGB))}. Reproducir está bloqueado: el sistema paginaría a disco.`), fixes };
}
function renderGate() {
  if (isReal()) { $('nowFix').dataset.k = ''; return null; }
  const g = fitGate(), el = $('nowFix');
  $('play').disabled = !!g; $('jumpGo').disabled = !!g; $('jumpMenu').disabled = !!g;
  const h = g ? g.fixes.map(([l], i) => `<button type="button" class="fixb" data-fix="${i}">${ICON('tune', 's')}${esc(l)}</button>`).join('') : '';
  if (el.dataset.k !== h) { el.dataset.k = h; el.innerHTML = h; el.querySelectorAll('[data-fix]').forEach(b => b.addEventListener('click', () => { const f = fitGate(); if (!f) return; pushUndo(); Object.assign(S, f.fixes[+b.dataset.fix][1]); changed(); })); }
  return g;
}
const UNDO = [], REDO = [];
function pushUndo() { UNDO.push(JSON.stringify(S)); if (UNDO.length > 40) UNDO.shift(); REDO.length = 0; renderUndo(); }
const REAL_UNDO = []; // Real mode: the request and sampling before a Restore defaults
function undo() { if (isReal()) { if (REAL_UNDO.length && !LIVE.running) realUndo(); return; } if (!UNDO.length || locked()) return; REDO.push(JSON.stringify(S)); S = JSON.parse(UNDO.pop()); KEEP.unloaded = false; changed(); renderUndo(); }
function redo() { if (!REDO.length || locked() || isReal()) return; UNDO.push(JSON.stringify(S)); S = JSON.parse(REDO.pop()); KEEP.unloaded = false; changed(); renderUndo(); }
let tlScaleKey = '';
function renderTlScale() {
  const shown = UI.tlPeek != null ? 'token' : UI.scale, items = [['request', L('Request', 'Petición')], ['token', L('Pass', 'Pasada')], ['layer', L('Layer', 'Capa')], ['op', L('Op', 'Op')]], h = items.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${shown === k}" title="${esc(L('Timeline zoom', 'Zoom de la línea de tiempo'))}">${esc(l)}</button>`).join('');
  if (h !== tlScaleKey) { tlScaleKey = h; $('tlScale').innerHTML = h; $('tlScale').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { UI.tlPeek = null; UI.scale = b.dataset.k; UI.speed = 'fit'; ZSCALE0 = null; logKey = ''; writeUrl(); renderSettings(); renderTlScale(); })); }
}
function renderUndo() { renderTlScale(); const r = $('redoBtn'); if (r) { r.disabled = !REDO.length || locked(); r.title = REDO.length ? L('Redo (Ctrl+Shift+Z)', 'Rehacer (Ctrl+Mayús+Z)') : L('Nothing to redo', 'Nada que rehacer'); } const b = $('undoBtn'), n = isReal() ? REAL_UNDO.length : UNDO.length; if (r && isReal()) r.disabled = true; b.disabled = !n || locked() || (isReal() && LIVE.running); b.title = n ? L('Undo the last configuration change', 'Deshacer el último cambio de configuración') : L('Nothing to undo', 'Nada que deshacer'); }
let stopArm = 0;
function stopEdit() {
  if (P.t > 0 && P.t < R.total && performance.now() - stopArm > 3000) { stopArm = performance.now(); $('stopEdit').innerHTML = `${ICON('warning', 's')}<span>${esc(L('Discard run', 'Descartar'))}</span>`; $('lock').classList.add('armed'); $('lock').querySelector('small').textContent = L('Click again to discard this run and edit.', 'Pulsa otra vez para descartar la ejecución y editar.'); setTimeout(() => { if (performance.now() - stopArm >= 2900) { $('lock').classList.remove('armed'); applyText(); } }, 3100); return; }
  $('lock').classList.remove('armed');
  stopArm = 0; P.on = false; P.anim = null; stopAt(0); UI.stale = false; applyText();
}
const HINTS = {
  ctx: () => L('2k to the model max · reserves KV memory at load; does not make anything faster', '2k al máximo del modelo · reserva memoria KV al cargar; no acelera nada'),
  kv: () => L('f16, q8_0 (half), q4_0 (a third) · rounds the stored context, not the weights', 'f16, q8_0 (la mitad), q4_0 (un tercio) · redondea el contexto guardado, no los pesos'),
  keepalive: () => L('0 to 60 min · after this idle time the model is unloaded and the next run loads it again', '0 a 60 min · tras este tiempo inactivo se descarga y la próxima ejecución lo vuelve a cargar'),
  quant: () => L('fewer bits: smaller file and faster writing, some quality lost below 4 bits', 'menos bits: archivo menor y escritura más rápida, algo de calidad perdida por debajo de 4 bits'),
  docs: () => L('0 to 130k · every document token is paid in prefill before the first word', '0 a 130k · cada token de documento se paga en el prefill antes de la primera palabra'),
  ans: () => L('10 to 2,000 · each answer token is one full pass through the model', '10 a 2.000 · cada token de respuesta es una pasada entera por el modelo'),
  mts: () => L('4,800 to 9,600 typical · bandwidth = transfers × bus width', '4.800 a 9.600 típicas · ancho de banda = transferencias × ancho del bus'),
  spec: () => L('a 0.6B draft guesses, the model checks several tokens in one read; the text does not change', 'un borrador de 0,6B adivina y el modelo comprueba varios tokens en una lectura; el texto no cambia'),
};
function renderHints() { for (const [k, f] of Object.entries(HINTS)) { const el = document.querySelector(`[data-hint="${k}"]`); if (el) el.textContent = f(); } }
