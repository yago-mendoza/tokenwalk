// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// ===== Wiring =====
function bind() {
  const guard = fn => e => { if (locked()) { syncControls(); return; } pushUndo(); fn(e); };
  $('machine').addEventListener('change', guard(e => { S.machine = e.target.value; Object.assign(S, machineFields(S.machine)); KEEP.unloaded = false; changed(); }));
  for (const id2 of ['model', 'quant', 'kv']) $(id2).addEventListener('change', guard(e => { S[id2] = e.target.value; if (id2 === 'model') UI.layer = -1; KEEP.unloaded = false; KEEP.idle = 0; changed(); }));
  for (const id2 of ['ram', 'tflops', 'mts', 'vram', 'vbw']) $(id2).addEventListener('change', guard(e => { const v = +e.target.value; if (Number.isFinite(v) && v > 0) { S[id2] = v; changed(); } else syncControls(); }));
  $('bus').addEventListener('change', guard(e => { S.bus = +e.target.value; changed(); }));
  $('ctx').addEventListener('change', guard(e => { const v = +e.target.value; S.ctx = v >= +$('ctx').max - .01 ? MODELS[S.model].ctxMax : Math.round(2 ** v / 256) * 256; changed(); }));
  $('ctx').addEventListener('input', e => { if (!locked()) $('ctxOut').textContent = num(Math.round(2 ** +e.target.value / 256) * 256); });
  let liveRaf = 0; const liveChange = () => { if (liveRaf) return; liveRaf = requestAnimationFrame(() => { liveRaf = 0; changed(true); }); };
  for (const id2 of ['sys', 'docs', 'q', 'ans', 'gamma', 'keepalive']) $(id2).addEventListener('input', e => { if (locked()) return; S[id2] = Math.round(+e.target.value); liveChange(); });
  for (const id2 of ['sys', 'docs', 'q', 'ans', 'gamma', 'keepalive']) { $(id2).addEventListener('change', guard(e => { S[id2] = Math.round(+e.target.value); changed(); })); $(id2).addEventListener('input', e => { const o = $(id2 + 'Out'); if (o && !locked()) o.textContent = num(Math.round(+e.target.value)); }); }
  $('alpha').addEventListener('change', guard(e => { S.alpha = +e.target.value; changed(); }));
  for (const id2 of ['cold', 'cached', 'disk', 'spec', 'mtp']) $(id2).addEventListener('change', guard(e => { S[id2] = e.target.checked; if (id2 === 'cold') { KEEP.unloaded = false; KEEP.idle = 0; } changed(); }));
  for (const id2 of ['temp', 'topp']) $(id2).addEventListener('input', e => { S[id2] = +e.target.value; resample(); });
  $('topk').addEventListener('input', e => { S.topk = Math.round(+e.target.value); resample(); });
  $('seed').addEventListener('change', e => { const v = Math.round(+e.target.value); if (v > 0) { S.seed = v; resample(); } else e.target.value = S.seed; });
  // Closing a section never pulls the list up under the cursor: the body keeps its height (empty space below) until the pointer leaves the panel.
  document.querySelectorAll('.acc:not(.lvrow) > button').forEach(b => b.addEventListener('click', () => { const acc = b.parentElement; const was = acc.classList.contains('open'); fillHintbars(); document.querySelectorAll('#cfgBody .acc.open').forEach(o => o.classList.remove('open')); if (!was) { acc.classList.add('open'); placeFlyout(acc); } }));
  // A click outside an open panel only closes it; it does not also act on what lies beneath.
  let swallow = 0;
  document.addEventListener('pointerdown', e => { const o = document.querySelector('#cfgBody .acc.open'); if (o && !o.contains(e.target) && !e.target.closest('#loadout, #lesson, #settings, #chainWin')) { o.classList.remove('open'); if (!e.target.closest('#cfgBody .acc > button')) swallow = performance.now(); } }, true);
  document.addEventListener('click', e => { if (performance.now() - swallow < 400) { e.stopPropagation(); e.preventDefault(); swallow = 0; } }, true);
  $('cfg').addEventListener('pointerleave', () => { $('cfgBody').style.minHeight = ''; });
  $('reset').addEventListener('click', () => { if (locked()) return; pushUndo(); S = defaults(); UI.layer = -1; KEEP.unloaded = false; KEEP.idle = 0; changed(); });
  $('undoBtn').addEventListener('click', undo);
  { const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'tbtn'; rb.id = 'redoBtn'; rb.innerHTML = ICON('restart', 's'); rb.querySelector('.ic').style.transform = 'scaleX(-1)'; $('undoBtn').after(rb); rb.addEventListener('click', redo); renderUndo(); }
 
  $('play').addEventListener('click', () => { if (fitGate()) return; UI.stale = false; setPlaying(!P.on); });
  $('jumpGo').addEventListener('click', () => doJump(UI.jump));
  // The lock card sits in the flow after the sections, so it never covers a row (Sampling and Live stay usable above it).
  $('cfgBody').appendChild($('lock')); renderMmode();
  { const mark = el => el.classList.toggle('more', el.scrollTop > 2); for (const id2 of ['log', 'stream', 'outStream']) { const el = $(id2); el.addEventListener('scroll', () => mark(el)); new MutationObserver(() => requestAnimationFrame(() => mark(el))).observe(el, { childList: true }); } }
  // Full screen: suggested once on entry when the window is not already full screen (F11 or the Fullscreen API).
  { const isFull = () => !!document.fullscreenElement || (innerHeight >= screen.height - 4 && innerWidth >= screen.width - 4);
    let never = false; try { never = localStorage.getItem('llmc.fsNever') === '1'; } catch (er) {}
    const hide = () => { $('fsTip').hidden = true; };
    $('fsGo').innerHTML = `${ICON('eye', 's')}<span>${esc(L('Go full screen', 'Pantalla completa'))}</span>`; $('fsLater').textContent = L('Not now', 'Ahora no'); $('fsNever').textContent = L('Don’t show again', 'No volver a mostrar');
    $('fsGo').addEventListener('click', () => { hide(); (document.documentElement.requestFullscreen ? document.documentElement.requestFullscreen() : Promise.reject()).catch(() => {}); });
    $('fsLater').addEventListener('click', hide); $('fsNever').addEventListener('click', () => { hide(); try { localStorage.setItem('llmc.fsNever', '1'); } catch (er) {} });
    addEventListener('resize', () => { if (isFull()) hide(); });
    if (!never && !isFull() && !matchMedia('(max-width: 760px)').matches) setTimeout(() => { if (!isFull()) $('fsTip').hidden = false; }, 900); }
  // every number field gets two quiet steppers; they step, then tell the field's listeners as typing would
  document.querySelectorAll('input[type=number]').forEach(inp => { if (inp.parentElement.classList.contains('numw')) return; const w = document.createElement('span'); w.className = 'numw'; inp.before(w); w.appendChild(inp);
    for (const [cls, t, d] of [['dn', '−', -1], ['up', '+', 1]]) { const b = document.createElement('button'); b.type = 'button'; b.className = `stp ${cls}`; b.textContent = t; b.tabIndex = -1; b.title = d > 0 ? L('Up', 'Subir') : L('Down', 'Bajar'); b.addEventListener('click', () => { if (inp.disabled) return; d > 0 ? inp.stepUp() : inp.stepDown(); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); }); w.appendChild(b); } });
  $('aboutBtn').addEventListener('click', () => { SEL_FROM = 'cap'; select({ k: 'lens', id: UI.lens }); });
  const scaleOpen = on => { $('scaleWin').hidden = !on; if (on) drawRuler(now()); };
  $('scaleBtn').addEventListener('click', () => scaleOpen(true)); $('scaleClose').addEventListener('click', () => scaleOpen(false)); $('scaleWin').querySelector('.scrim').addEventListener('click', () => scaleOpen(false)); $('scaleClose').innerHTML = ICON('close', 's');
  { let legOpen = false; try { legOpen = localStorage.getItem('llmc.legOpen') === '1'; } catch (er) {} const setLeg = on => { $('wfoot').classList.toggle('open', on); requestAnimationFrame(() => dispatchEvent(new Event('resize'))); $('legBtn').setAttribute('aria-expanded', on); try { localStorage.setItem('llmc.legOpen', on ? '1' : '0'); } catch (er) {} }; setLeg(legOpen); $('legBtn').addEventListener('click', () => setLeg(!$('wfoot').classList.contains('open'))); }
  $('legend').addEventListener('pointerover', e => { const it = e.target.closest('.lg'); brushEntity(it ? LEGEND_ENT[it.dataset.k] : null); }); $('legend').addEventListener('pointerleave', () => { UI.brush = null; });
  $('chainWin').querySelector('.scrim').addEventListener('click', () => { UI.logitsBig = false; }); $('chainClose').addEventListener('click', () => { UI.logitsBig = false; }); $('chainClose').innerHTML = ICON('close', 's');
  $('zUp').addEventListener('click', () => zoomTo(UI.lens, ZOOM[UI.lens].length - 1)); $('zJump').addEventListener('click', zJumpGo); $('zInfo').addEventListener('click', zInfoGo);
  $('track').addEventListener('click', e => { const t = e.target.closest('.tk'); if (!t || fitGate()) return; const k = ['load', 'prefill', 'decode', 'done'].find(q => t.classList.contains(q)); const to = { load: 0, prefill: R.ttftStart + 1e-9, decode: R.ttft + 1e-9, done: R.total }[k]; if (to !== undefined) { UI.tlPeek = null; stopAt(to); KEEP.idle = 0; } });
  const hlOn = e => { const t = e.target.closest('[data-hl], .tk'); const v = t ? (t.dataset.hl || ['load', 'prefill', 'decode'].find(k => t.classList.contains(k)) || null) : null; if (UI.tlHl !== v) UI.tlHl = v; };
  for (const id2 of ['counter', 'track']) { $(id2).addEventListener('pointerover', hlOn); $(id2).addEventListener('pointerleave', () => { UI.tlHl = null; }); }
  $('lesson').querySelector('.scrim').addEventListener('click', () => select(null)); $('lsClose').addEventListener('click', () => select(null));
  const logOpen = on => { $('logPop').hidden = !on; $('logBtn').setAttribute('aria-expanded', on); if (on) { logKey = ''; renderLog(now()); } };
  $('logBtn').addEventListener('click', () => logOpen($('logPop').hidden)); $('logClose').addEventListener('click', () => logOpen(false));
  $('jumpMenu').addEventListener('click', e => { e.stopPropagation(); jumpPop($('jumpPop').hidden); });
  $('jumpPop').addEventListener('click', e => { const b = e.target.closest('[data-j]'); if (!b || b.getAttribute('aria-disabled') === 'true') return; UI.jump = b.dataset.j; try { localStorage.setItem('llmc.jump', UI.jump); } catch (er) {} jumpPop(false); renderJump(); doJump(UI.jump); });
  $('jumpPop').addEventListener('keydown', e => { const bs = [...$('jumpPop').querySelectorAll('button')], i = bs.indexOf(document.activeElement); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus(); } else if (e.key === 'Escape') { e.stopPropagation(); jumpPop(false); $('jumpMenu').focus(); } });
  document.addEventListener('click', e => { if (!$('jumpPop').hidden && !e.target.closest('#jump')) jumpPop(false); });
  $('stop').addEventListener('click', () => stopEdit());
  $('stopEdit').addEventListener('click', () => stopEdit());
  const stepRate = d => { const cur = UI.speed === 'fit' ? speedNow(now()) : Number(UI.speed); let i = RATES.findIndex(r => r >= cur * .999); if (i < 0) i = RATES.length - 1; if (d < 0 && RATES[i] > cur * 1.001) i--; i = Math.max(0, Math.min(RATES.length - 1, i + (UI.speed === 'fit' ? (d > 0 ? 1 : 0) : d))); UI.speed = String(RATES[i]); writeUrl(); runT = 0; };
  $('slower').addEventListener('click', () => stepRate(-1)); $('faster').addEventListener('click', () => stepRate(1));
  $('rateTxt').addEventListener('click', () => { UI.speed = 'fit'; writeUrl(); runT = 0; });
  $('pauseTok').addEventListener('change', e => { UI.pauseTok = e.target.checked; writeUrl(); });
  $('pauseLayer').addEventListener('change', e => { UI.pauseLayer = e.target.checked; writeUrl(); });
  $('gear').addEventListener('click', e => { e.stopPropagation(); if (UI.sel) select(null); renderSettings(); $('settings').classList.toggle('on'); });
  document.addEventListener('click', e => { if (!$('settings').contains(e.target) && e.target !== $('gear')) $('settings').classList.remove('on'); });
  $('helpBtn').addEventListener('click', () => showHelp(0));
  $('hNext').addEventListener('click', () => showHelp(helpI + 1)); $('hBack').addEventListener('click', () => showHelp(helpI - 1));
  $('alertBtn').addEventListener('click', () => { openMon(); $('mbody').scrollTop = 0; });
  $('monBtn').addEventListener('click', () => document.body.classList.toggle('monOpen'));
  $('monClose').addEventListener('click', () => document.body.classList.remove('monOpen'));
  $('chip').addEventListener('click', () => openLoadout('machine'));
  document.querySelectorAll('#ztabs button').forEach(b => b.addEventListener('click', () => setZone(b.dataset.z)));
  for (const id2 of ['stream', 'outStream']) $(id2).addEventListener('click', e => { const lt = e.target.closest('[data-ltok]'); if (lt) { const i = +lt.dataset.ltok; UI.liveTok = UI.liveTok === i ? null : i; streamKey = ''; return; } const t = e.target.closest('[data-tok]'); if (!t) return; const i = +t.dataset.tok; UI.logitTok = UI.logitTok === i ? null : i; if (UI.lens !== 'tokens') setLens('tokens'); streamKey = ''; outKey = ''; });
  const tip = $('tip');
  for (const cid of ['cSystem', 'cModel', 'cMemory', 'cPrompt', 'cCand', 'cChainBig', 'cTime', 'ruler', 'cCtx']) {
    const c = $(cid);
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(), sel = hitAt(cid, e.clientX - r.left, e.clientY - r.top);
      c.style.cursor = sel ? 'pointer' : (cid === 'cTime' ? 'ew-resize' : '');
      UI.hover = sel; UI.hoverCanvas = sel ? cid : null; UI.hoverName = ''; UI.ptr = { cid, x: e.clientX - r.left, y: e.clientY - r.top };
      UI.hoverZoom = !!(sel && zoomable(cid, sel)); if (cid === 'cCtx') brushEntity(sel ? entityOf(sel) : null);
      if (sel && e.pointerType === 'mouse') { const zt = UI.hoverZoom ? zName(sel) : '', d = zt ? { title: zt, tag: [L('click to zoom in', 'clic para ampliar')] } : inspect(sel); if (d) { UI.hoverName = d.title; tip.textContent = `${d.title} · ${d.tag[0]}`; tip.classList.add('on'); const tw = tip.offsetWidth, th = tip.offsetHeight; let lx = e.clientX + 16, ly = e.clientY + 18; if (lx + tw > innerWidth - 8) lx = e.clientX - tw - 16; if (ly + th > innerHeight - 8) ly = e.clientY - th - 16; tip.style.left = `${lx}px`; tip.style.top = `${ly}px`; } } else tip.classList.remove('on');
    });
    c.addEventListener('pointerleave', () => { tip.classList.remove('on'); UI.hover = null; UI.hoverCanvas = null; UI.ptr = null; if (cid === 'cCtx') UI.brush = null; });
    c.addEventListener('click', e => { const r = c.getBoundingClientRect(), sel = hitAt(cid, e.clientX - r.left, e.clientY - r.top);
      // a click on empty ground lets go: the focused layer returns to following the pass
      if (!sel || cid === 'cTime') { if (!sel && cid === 'cModel' && UI.layer >= 0) { UI.layer = -1; writeUrl(); } return; }
      if (sel.k === 'zchain') { if (sel.kd === 'model') { UI.modelMode = 'grid'; renderMmode(); } zoomTo(sel.lens, sel.depth); return; }

      if (sel.k === 'gcol') { const ly = R.m.layers - 1 - Math.floor((e.clientY - r.top - 46) / ((stageSize()[1] - 86) / R.m.layers)); UI.layer = Math.max(0, Math.min(R.m.layers - 1, ly)); UI.modelMode = 'stack'; renderMmode(); return; }
      if (sel.k === 'followPass') { UI.layer = -1; writeUrl(); return; }
      if (sel.k === 'logitsBig') { UI.logitsBig = !UI.logitsBig; return; }
      if (sel.k === 'sampstage') { UI.logitsBig = false; openSampling(['temp', 'temp', 'topk', 'topp'][sel.j]); return; }
      if (zoomable(cid, sel)) { const f = frameOf(sel); if (f) { const hh = (HITS[cid] || []).find(q => selKey(q.sel) === selKey(sel)); zoomIn(cid === 'cModel' ? 'model' : 'memory', f, hh && Array.isArray(hh.shape) ? hh.shape : null); return; } } if (sel.k === 'layer' && cid === 'cModel') { UI.layer = sel.i; writeUrl(); } UI.follow = false; SEL_FROM = cid; select(sel); });
  }
  const tl = $('cTime'); let drag = false, moved = false;
  const at = e => { if (!timeGeo) return; const r = tl.getBoundingClientRect(), f = (e.clientX - r.left - timeGeo.lab) / timeGeo.w; stopAt(timeGeo.t0 + Math.max(0, Math.min(1, f)) * (timeGeo.t1 - timeGeo.t0)); };
  tl.addEventListener('pointerdown', e => { if (fitGate()) return; drag = true; moved = false; tl.setPointerCapture(e.pointerId); });
  tl.addEventListener('pointermove', e => { if (drag) { moved = true; at(e); } });
  // A click on a token or chunk opens it here, layer by layer, without moving the playhead; a drag still scrubs time.
  tl.addEventListener('pointerup', e => { if (drag && !moved) { const r = tl.getBoundingClientRect(), sel = hitAt('cTime', e.clientX - r.left, e.clientY - r.top); let pi = null;
      if (timeGeo && timeGeo.scale === 'request') { const yy = e.clientY - r.top, ln = [1, 2].find(k => yy >= timeGeo.laneY[k] - 2 && yy <= timeGeo.laneY[k] + timeGeo.laneH + 2); if (ln) { const tt = timeGeo.t0 + Math.max(0, Math.min(1, (e.clientX - r.left - timeGeo.lab) / timeGeo.w)) * (timeGeo.t1 - timeGeo.t0), i = Math.max(0, Math.min(R.segs.length - 1, segAt(tt))), sg = R.segs[i]; if (sg && (ln === 1 ? sg.k === 'prefill' : sg.k === 'decode' || sg.k === 'round')) pi = i; } }
      if (pi !== null) UI.tlPeek = pi; else if (sel && sel.k !== 'seg') select(sel); else at(e); } drag = false; });
  splitter('sp1', '--cfgW', 'x', 240, 440, 1); splitter('sp2', '--monW', 'x', 290, 520, -1); splitter('sp3', '--runH', 'y', 170, 380, -1);
  document.addEventListener('keydown', e => {
    const t = e.target, tagn = (t && t.tagName) || '';
    if ((tagn === 'INPUT' && !['checkbox', 'range'].includes(t.type)) || tagn === 'SELECT' || tagn === 'TEXTAREA') return;
    if (e.key === ' ' && tagn !== 'BUTTON') { e.preventDefault(); if (!fitGate()) { UI.stale = false; setPlaying(!P.on); } }
    else if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); if (!fitGate()) stepLayer(); }
    else if (e.key === 'ArrowRight' && tagn !== 'INPUT') { e.preventDefault(); if (!fitGate()) stepToken(); }
    else if (e.key === 'End' && tagn !== 'INPUT') { e.preventDefault(); doJump('end'); }
    else if (e.key === 'Home' && tagn !== 'INPUT') { e.preventDefault(); doJump('start'); }
    else if (e.key === 'ArrowLeft' && e.shiftKey && tagn !== 'INPUT') { e.preventDefault(); doJump('player'); }
    else if (e.key === 'ArrowLeft' && tagn !== 'INPUT') { e.preventDefault(); doJump('ptok'); }
    else if (e.key === '?') showHelp(0);
    else if (e.key === 'Escape' && !$('scaleWin').hidden) $('scaleWin').hidden = true;
    else if (e.key === 'Escape' && UI.tlPeek != null && !UI.sel) UI.tlPeek = null;
    else if (e.key === 'Escape' && UI.logitsBig && !UI.sel) UI.logitsBig = false;
    else if (e.key === 'Escape' && !UI.sel && zTop(UI.lens) && !$('settings').classList.contains('on') && !$('loadout').classList.contains('on')) zoomTo(UI.lens, ZOOM[UI.lens].length - 1);
    else if (e.key === 'Escape' && document.querySelector('#cfgBody .acc.open') && !UI.sel) document.querySelector('#cfgBody .acc.open').classList.remove('open');
    else if (e.key === 'Escape') { showHelp(-1); $('settings').classList.remove('on'); $('loadout').classList.remove('on'); document.body.classList.remove('monOpen'); if (UI.sel) select(null); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });
  addEventListener('resize', () => { if (helpI >= 0) showHelp(helpI); });
}

// ===== Frame loop =====
window.__errs = [];
let last = performance.now(), slowT = 0;
function frame(t0) {
  const dt = Math.min(.1, (t0 - last) / 1000); last = t0;
  try {
    advance(dt, now());
    const n = now();
    if (UI.follow && n.layer >= 0 && n.seg && UI.layer !== n.layer) UI.layer = n.layer; // follow moves Model's focus, never the selection (which would open an explainer every frame)
    if (UI.lens === 'system') drawSystem(n, dt); else if (UI.lens === 'model') drawModel(n); else if (UI.lens === 'memory') drawMemory(n); else drawTokens(n);
    drawTimeline(n); drawCtx(n); renderOutput(n);
    renderRun(n); renderKpis(n);
    if (t0 - slowT > 250) { slowT = t0; drawRuler(n); renderAlerts(); renderGate(); renderChoice(); renderUndo(); renderJump(); renderDetails(); renderTrends(); renderLive(); if (!$('logPop').hidden) renderLog(n); }
    renderInspector(); renderThumbs(n); renderCap();
    const tl = UI.lens === 'tokens'; $('lensCap').style.display = tl ? 'none' : ''; $('stage').classList.toggle('tok', tl);
    if (P.anim && performance.now() - P.anim.start > P.anim.dur + 300) P.anim = null;
  } catch (e) { if (window.__errs.length < 20) { window.__errs.push(String(e && e.stack || e)); console.error(e); } }
  requestAnimationFrame(frame);
}

// ===== Start =====
const Q0 = new URLSearchParams(location.search);
loadLayout();
readUrl();
fillSelects();
R = compute();
applyText();
bind();
changed();
setLens(UI.lens);
renderHints();
if (matchMedia('(max-width: 760px)').matches) setZone(Q0.get('zone') || 'watch');
{ const at = Number(Q0.get('at')); if (Number.isFinite(at) && at > 0) P.t = Math.min(R.total, at); if (Q0.get('autoplay') === '1' && !fitGate()) setPlaying(true); if (Q0.get('inspect')) { const [k, v] = Q0.get('inspect').split(':'); select(k === 'layer' ? { k, i: +v - 1 } : k === 'inst' ? { k, id: v } : { k: 'part', id: v }); } }
{ let seen = '1'; try { seen = localStorage.getItem('llmc.help') || ''; } catch (e) {} if (!seen && !Q0.has('nohelp')) setTimeout(() => showHelp(0), 400); }
requestAnimationFrame(frame);
