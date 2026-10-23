// ===== Run: clock, rate, phase track, counter, what is happening now =====
const RATES = [1e-5, 1e-4, 1e-3, 1e-2, .1, 1, 10, 100];
const rateLabel = v => `${v >= 1 ? v : dec(String(v))}×`;
function locked() { return P.on || (P.t > 1e-12 && P.t < R.total - 1e-12); }
function phaseOf(n) { if (P.t >= R.total - 1e-12 && R.total > 0) return 'done'; if (!n.seg) return 'idle'; return n.seg.k === 'restore' ? 'load' : n.seg.k === 'round' ? 'decode' : n.seg.k; }
function renderTrack(n) {
  const ph = phaseOf(n), has = { load: R.load + R.restore > 0, prefill: R.newTokens > 0 };
  const segs = [...(has.load ? ['load'] : []), ...(has.prefill ? ['prefill'] : []), 'decode', 'done'];
  const order = segs.indexOf(ph);
  const prog = k => { if (k === 'load') return (P.t) / Math.max(1e-12, R.load + R.restore); if (k === 'prefill') return (P.t - R.ttftStart) / Math.max(1e-12, R.ttft - R.ttftStart); if (k === 'decode') return (P.t - R.ttft) / Math.max(1e-12, R.total - R.ttft); return 1; };
  const names = { load: L('LOAD', 'CARGA'), prefill: 'PREFILL', decode: 'DECODE', done: L('DONE', 'FIN') }, icons = { load: 'storage', prefill: 'layers', decode: 'token', done: 'check' };
  const keepT = (INSTR.find(q => q.id === 'keep').val() || '').replace(/<[^>]+>/g, '').split(' · ')[0];
  const h = segs.map((k, i) => { const cur = i === order, past = order > i || (ph === 'done'); const f = cur ? Math.max(0, Math.min(1, prog(k))) : past ? 1 : 0; return `<div class="tk ${k}${cur ? ' cur' : ''}${past && !cur ? ' past' : ''}"${k === 'done' ? ` title="${esc(L('keep_alive: how long the model stays loaded after the answer', 'keep_alive: cuánto sigue cargado el modelo tras la respuesta'))}"` : ''}><i style="width:${(f * 100).toFixed(1)}%"></i>${ICON(icons[k], 's')}<span>${names[k]}</span>${k === 'prefill' && R.newTokens > 0 ? `<small class="ka">${Math.min(R.segs.filter(q => q.k === 'prefill' && q.a < P.t).length, R.segs.filter(q => q.k === 'prefill').length)}/${R.segs.filter(q => q.k === 'prefill').length}</small>` : k === 'decode' ? `<small class="ka">${num(generatedAt(P.t))}/${num(S.ans)}</small>` : ''}</div>`; }).join('');
  if ($('track').dataset.k !== h) { $('track').dataset.k = h; $('track').innerHTML = h; }
  const cnt = $('counter'); cnt.className = ph;
  let big = '', sm = '';
  if (ph === 'idle') { big = `0 <small>/ ${num(S.ans)} ${L('tokens', 'tokens')}</small>`; sm = L(`${num(R.newTokens)} prompt tokens to read first`, `${num(R.newTokens)} tokens de prompt que leer antes`); }
  else if (ph === 'load') { big = `${pct(n.f)} <small>${n.seg.k === 'load' ? L('loaded', 'cargado') : L('restored', 'restaurado')}</small>`; sm = n.seg.k === 'load' ? L(`${dec(fmtGB(R.weights * n.f))} of ${dec(fmtGB(R.weights))} from the SSD`, `${dec(fmtGB(R.weights * n.f))} de ${dec(fmtGB(R.weights))} desde el SSD`) : L('saved KV cache from disk', 'caché KV guardada desde disco'); }
  else if (ph === 'prefill') { big = `${L('chunk', 'bloque')} ${n.seg.i + 1} <small>/ ${n.seg.n}</small>`; sm = L(`prompt read ${num(n.seg.from)} of ${num(R.prompt)} · this chunk ${num(n.seg.to - n.seg.from)} tokens at once`, `prompt leído ${num(n.seg.from)} de ${num(R.prompt)} · este bloque ${num(n.seg.to - n.seg.from)} tokens a la vez`); }
  else if (ph === 'decode') { const g = n.seg.tok + (n.head ? (n.seg.n || 1) : 0); big = `${L('token', 'token')} ${num(n.seg.tok + 1)} <small>/ ${num(S.ans)}</small>`; sm = L(`${num(g)} written · prompt ${num(R.prompt)} already read`, `${num(g)} escritos · prompt de ${num(R.prompt)} ya leído`); }
  else { big = `${num(S.ans)} <small>/ ${num(S.ans)}</small>`; sm = L(`done in ${S_(R.total)} · first token at ${S_(R.ttft)}`, `hecho en ${S_(R.total)} · primer token a los ${S_(R.ttft)}`); }
  if ($('cntBig').dataset.k !== big) { $('cntBig').dataset.k = big; $('cntBig').innerHTML = big; } if ($('cntSm').textContent !== sm) $('cntSm').textContent = sm;
  const hb = { idle: 'decode', load: 'load', prefill: 'prefill', decode: 'decode', done: 'decode' }[ph], hs = { idle: 'prefill', load: 'load', prefill: 'prefill', decode: 'decode', done: 'decode' }[ph];
  $('cntBig').dataset.hl = hb || ''; $('cntSm').dataset.hl = hs || '';
  // the pill
  const pill = $('pill'), cls = { idle: 'idle', load: 'load', prefill: 'prefill', decode: 'decode', done: 'done' }[ph];
  pill.className = `pill ${cls}${P.on ? ' run' : ph !== 'idle' && ph !== 'done' ? ' paused' : ''}`;
  $('pillTxt').textContent = ph === 'idle' ? (KEEP.unloaded ? L('UNLOADED', 'DESCARGADO') : 'IDLE') : !P.on && ph !== 'done' ? `${names[ph]} · ${L('PAUSED', 'PAUSA')}` : names[ph];
}
function nowText(n) {
  const gate = fitGate(); if (gate) return [gate.reason, true];
  if (UI.stale && P.t === 0) return [L('Configuration changed: press play to run it again.', 'Configuración cambiada: pulsa reproducir para volver a ejecutar.'), true];
  const seg = n.seg, m = R.m;
  if (!seg) return [P.t >= R.total && R.total ? L(`Done: ${num(S.ans)} tokens in ${S_(R.total)}. The model stays loaded until keep_alive runs out.`, `Hecho: ${num(S.ans)} tokens en ${S_(R.total)}. El modelo sigue cargado hasta que se agote keep_alive.`) : KEEP.unloaded ? L('The model was unloaded by keep_alive: the next run loads it from disk first.', 'keep_alive descargó el modelo: la próxima ejecución lo carga antes del disco.') : L('Ready. Press play, or step one token at a time. Setup locks while it runs.', 'Listo. Pulsa reproducir, o avanza token a token. La configuración se bloquea mientras corre.'), false];
  if (seg.k === 'load') return [L(`Loading the model: ${dec(fmtGB(R.weights))} from the SSD into memory, once.`, `Cargando el modelo: ${dec(fmtGB(R.weights))} del SSD a la memoria, una vez.`), false];
  if (seg.k === 'restore') return [L('Restoring the prefix KV cache from disk instead of recomputing it.', 'Restaurando del disco la caché KV del prefijo en vez de recalcularla.'), false];
  const lname = n.head ? L('the output head', 'la cabeza de salida') : L(`layer ${n.layer + 1} of ${m.layers} (${R.kinds[n.layer] === 'attn' ? L('attention', 'atención') : 'DeltaNet'})`, `la capa ${n.layer + 1} de ${m.layers} (${R.kinds[n.layer] === 'attn' ? 'atención' : 'DeltaNet'})`);
  const opTxt = n.op && !n.head ? L(`, ${n.op.id} reading ${B(n.op.bytes)}`, `, ${n.op.id} leyendo ${B(n.op.bytes)}`) : '';
  if (seg.k === 'prefill') return [L(`Prefill: chunk ${seg.i + 1} of ${seg.n}, ${num(seg.to - seg.from)} prompt tokens together through ${lname}${opTxt}.`, `Prefill: bloque ${seg.i + 1} de ${seg.n}, ${num(seg.to - seg.from)} tokens del prompt juntos por ${lname}${opTxt}.`), false];
  return [L(`Decode: token ${num(seg.tok + 1)} is passing ${lname}${opTxt}.`, `Decode: el token ${num(seg.tok + 1)} pasa por ${lname}${opTxt}.`), false];
}
let runT = 0;
function renderRun(n) {
  if (isReal()) { renderRealRun(); return; }
  const nowT = performance.now(); if (nowT - runT < 90) return; runT = nowT;
  $('clock').textContent = dec(`${P.t.toFixed(6)} s`);
  const r = UI.speed === 'fit' ? speedNow(n) : Number(UI.speed);
  $('rateTxt').textContent = UI.speed === 'fit' ? L('auto', 'auto') : rateLabel(Number(UI.speed));
  { const f = r >= 1 ? r : 1 / r, fs = dec(f >= 100 ? num(Math.round(f)) : f.toFixed(f >= 10 ? 0 : 1)); $('rateOut').innerHTML = `${UI.speed === 'fit' ? L('auto · ', 'auto · ') : ''}${Math.abs(r - 1) < .05 ? L('real time', 'tiempo real') : `${fs}× <span style="color:var(--dim);font-weight:400">${r > 1 ? L('faster', 'más rápido') : L('slower', 'más lento')}</span>`}`; $('rateOut').title = L(`Simulated time runs at ${dec(r.toPrecision(3))} times real time`, `El tiempo simulado corre a ${dec(r.toPrecision(3))} veces el tiempo real`); }
  let sd = '';
  if (n.seg) {
    const segName = { load: L('load', 'carga'), restore: L('restore', 'restauración'), prefill: L('this chunk', 'este bloque'), decode: L('this token', 'este token'), round: L('this round', 'esta ronda') }[n.seg.k];
    sd = `${segName} <b>${TT(n.seg.d)}</b>`;
    if (n.layer >= 0 && !n.head) { const sp = layerSpan(n.seg, n.layer); sd += ` · ${L('this layer', 'esta capa')} <b>${TT(sp[1] - sp[0])}</b>`; }
  } else sd = L(`whole request <b>${TT(R.total)}</b> · first token at <b>${TT(R.ttft)}</b>`, `petición completa <b>${TT(R.total)}</b> · primer token a <b>${TT(R.ttft)}</b>`);
  if ($('stepDur').dataset.k !== sd) { $('stepDur').dataset.k = sd; $('stepDur').innerHTML = sd; }
  const [txt, stale] = nowText(n); if ($('nowTxt').dataset.k !== txt) { $('nowTxt').dataset.k = txt; $('nowTxt').innerHTML = linkify(esc(txt)); } $('nowLine').classList.toggle('stale', stale);
  renderTrack(n);
  const lk = locked();
  $('cfg').classList.toggle('locked', lk); $('reset').disabled = lk || isDefault();
  $('reset').title = lk ? L('Locked during the run', 'Bloqueado durante la ejecución') : L('Back to the calibrated ThinkPad with a Radeon 860M and the default request', 'Volver al ThinkPad calibrado con una Radeon 860M y la petición por defecto');
  document.querySelectorAll('.sc').forEach(b => { b.disabled = lk; });
}
function renderTransport() {
  if (isReal()) return;
  $('play').innerHTML = `${ICON(P.on ? 'pause' : atEnd() && R.total && P.t > 0 ? 'replay' : 'play', 'l')}`; renderJump();
  $('play').title = P.on ? L('Pause (space)', 'Pausa (espacio)') : P.t >= R.total && R.total ? L('Run again (space)', 'Ejecutar otra vez (espacio)') : L('Play (space)', 'Reproducir (espacio)');
  $('play').setAttribute('aria-label', $('play').title);
}
