// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
// The play button, inline in a sentence: it looks like the transport's button and starts the run.
const PLAY_GLYPH = () => `<button type="button" class="playg" title="${esc(L('Play', 'Reproducir'))}" onclick="if (!fitGate()) setPlaying(true)">${ICON('play', 's')}<span>${esc(L('play', 'reproducir'))}</span></button>`;
// ===== Tokens lens: prompt, stream, and logits only when they exist =====
let streamKey = '';
function logitState(n) {
  const seg = n.seg, last = R.m.layers - 1;
  if (!seg || seg.k === 'load' || seg.k === 'restore') return { on: false, why: P.t >= R.total && R.total ? L('No pass running. The last logits were used and discarded.', 'Ninguna pasada en marcha. Los últimos logits se usaron y se descartaron.') : L('No pass running. Logits appear when a pass reaches the output head.', 'Ninguna pasada en marcha. Los logits aparecen cuando una pasada llega a la cabeza de salida.') };
  if (seg.k === 'prefill') {
    const lastChunk = seg.to >= R.prompt;
    if (lastChunk && n.layer === last && n.lp > .85) return { on: true, step: 0 };
    return { on: false, why: L(`Prefill computes logits only for the last prompt position, at the end of the last chunk (now chunk ${seg.i + 1} of ${seg.n}, layer ${n.layer + 1} of ${R.m.layers}).`, `El prefill calcula logits solo para la última posición del prompt, al final del último bloque (ahora bloque ${seg.i + 1} de ${seg.n}, capa ${n.layer + 1} de ${R.m.layers}).`) };
  }
  if (n.head) return { on: true, step: seg.tok };
  return { on: false, why: L(`Not computed yet: token ${num(seg.tok + 1)} is at layer ${n.layer + 1} of ${R.m.layers}. Logits exist only after the last layer.`, `Aún sin calcular: el token ${num(seg.tok + 1)} va por la capa ${n.layer + 1} de ${R.m.layers}. Los logits solo existen tras la última capa.`) };
}
function drawTokens(n) {
  const gen = generatedAt(P.t), inCache = tokensInCache(P.t), ls = logitState(n);
  const id = 'cPrompt', c = $(id), W = Math.max(200, Math.floor($('tokLens').getBoundingClientRect().width - 24)), x = fit(c, W, 54); hitReset(id);
  const totalP = Math.max(1, R.prompt), chips = Math.min(140, Math.floor(W / 8)), per = totalP / chips, step = W / chips, cs = Math.min(6, step - 1.5);
  for (let i = 0; i < chips; i++) {
    const t0 = i * per, read = inCache > t0, cached = t0 < R.startAt;
    x.globalAlpha = read || cached ? 1 : .28; chipSq(x, i * step, 18, cs, TOKCOL[tokKind(t0)]); x.globalAlpha = 1; if (cached) { x.fillStyle = C.cy; x.fillRect(i * step, 18 + cs + 1, cs, 1.5); }
    if (n.seg && n.seg.k === 'prefill' && t0 >= n.seg.from && t0 < n.seg.to) { x.strokeStyle = C.cy; x.strokeRect(i * step - 1.5, 16.5, cs + 3, cs + 3); }
    hit(id, [i * step, 14, step, 14], { k: 'pchip', i, per });
  }
  let acc = 0;
  for (const [lbl, v] of [[L('system', 'sistema'), S.sys], [L('history and documents', 'historia y documentos'), S.docs], [L('question', 'pregunta'), S.q]]) {
    if (v > 0) { const X = (acc / totalP) * W; if (X < W - 30) textFit(x, lbl, X + 2, 11, Math.max(30, (v / totalP) * W - 6), C.mid, 'left', 9); x.strokeStyle = C.line2; x.beginPath(); x.moveTo(Math.round(X) + .5, 3); x.lineTo(Math.round(X) + .5, 26); x.stroke(); }
    acc += v;
  }
  // The scale, drawn: a real square of the strip, then how many tokens it stands for.
  { x.font = `400 10px ${FONT}`; const a = L(`${num(R.prompt)} prompt tokens · `, `${num(R.prompt)} tokens de prompt · `), aw = x.measureText(a).width; text(x, a, 0, 44, C.dim, 'left', 10);
    chipSq(x, aw + 1, 36, cs, TOKCOL.docs); text(x, L(` = ${num(Math.round(per))} tokens${R.startAt ? ` · underlined: ${num(R.startAt)} cached, no prefill` : ''}`, ` = ${num(Math.round(per))} tokens${R.startAt ? ` · subrayados: ${num(R.startAt)} en caché, sin prefill` : ''}`), aw + cs + 3, 44, C.dim, 'left', 10); }
  { const wt = L(`${num(gen)} / ${num(S.ans)} written`, `${num(gen)} / ${num(S.ans)} escritos`); if ($('tokHint').textContent !== wt) $('tokHint').textContent = wt; }
  drawHover(id, x);
  const shown = gen + (ls.on && n.seg && n.seg.k !== 'prefill' ? 1 : 0);
  const key = `${shown}|${lang}|${S.temp}|${S.topk}|${S.topp}|${S.seed}|${P.t > 0 && P.t < R.ttft}|${UI.logitTok}`;
  if (key !== streamKey) {
    streamKey = key;
    const from = Math.max(0, shown - 220);
    let h = from ? '… ' : '';
    for (let i = from; i < shown && i < SAMPLED.length; i++) { const s = SAMPLED[i]; h += `<span class="g${s.script ? '' : ' alt'}${i === shown - 1 && ls.on ? ' now' : ''}${UI.logitTok === i ? ' sel' : ''}" data-tok="${i}" title="${esc(L(`token ${i + 1}: “${s.word}”`, `token ${i + 1}: “${s.word}”`))}">${esc(i === from ? s.word.trimStart() : s.word)}</span>`; }
    if (!shown) h = `<span class="ph">${P.t > 0 && P.t < R.ttft ? L('Waiting for the first token: the prompt is being read.', 'Esperando el primer token: se está leyendo el prompt.') : L(`Press ${PLAY_GLYPH()} and the answer appears here, one token per pass.`, `Pulsa ${PLAY_GLYPH()} y aquí aparece la respuesta, un token por pasada.`)}</span>`;
    $('stream').innerHTML = h; $('stream').scrollTop = $('stream').scrollHeight;
    const fl = UI.flash; if (fl && fl.canvas === 'cPrompt' && fl.tok !== undefined && !fl.done) { fl.done = true; const els = fl.tok === 'all' ? [...$('stream').querySelectorAll('.g')] : [...$('stream').querySelectorAll(`[data-tok="${fl.tok}"]`)]; els.forEach(el => el.classList.add('flash')); if (els[0] && fl.tok !== 'all') els[0].scrollIntoView({ block: 'nearest' }); }
  }
  // Docked under the answer: every row always visible. Expand opens the same chain in a window above everything.
  const lensH = $('tokLens').clientHeight, fixedH = 54 + $('tokHint').offsetHeight + 20 + 10 + 24, avail = Math.max(240, lensH - fixedH);
  drawChain('cCand', W, Math.round(Math.max(150, Math.min(320, avail * .52, avail - 64))), ls, gen, false);
  $('chainWin').hidden = !UI.logitsBig;
  if (UI.logitsBig) drawChain('cChainBig', Math.min(960, innerWidth - 64), Math.min(520, innerHeight - 140), ls, gen, true);
}
function drawChain(id2, W, H2, ls, gen, big) {
  const selTok = UI.logitTok !== null && UI.logitTok !== undefined && UI.logitTok < S.ans ? UI.logitTok : null;
  const stepI = Math.max(0, Math.min(S.ans - 1, selTok !== null ? selTok : ls.on ? ls.step : Math.max(0, gen - 1))), d = distribution(stepI), pick = SAMPLED[stepI];
  const live = ls.on && selTok === null, word = pick ? `“${pick.word.trim()}”` : '';
  const head = live ? L(`Live · token ${num(stepI + 1)}`, `En directo · token ${num(stepI + 1)}`) : selTok !== null ? L(`Token ${num(stepI + 1)} ${word}`, `Token ${num(stepI + 1)} ${word}`) : gen ? L(`Last token · ${num(stepI + 1)} ${word}`, `Último token · ${num(stepI + 1)} ${word}`) : L('Preview · first token', 'Vista previa · primer token');
  // Rows: the six likeliest, the drawn token when it came from the tail, and the rest of the vocabulary as one row.
  const nItems = d.items.length, tailN = R.m.vocab - nItems, rows = [...d.items].sort((p1, p2) => p2.p1 - p1.p1);
  if (big) H2 = Math.min(H2, 64 + (nItems + 2) * 40 + 10);
  const c2 = $(id2), x2 = fit(c2, W, H2); hitReset(id2);
  // header: what is shown, a help mark that opens the explainer, and the window toggle
  const exT = big ? L('Close', 'Cerrar') : L('Expand ⤢', 'Ampliar ⤢'); x2.font = `600 10.5px ${FONT}`; const exW = x2.measureText(exT).width + 16;
  x2.strokeStyle = C.line2; x2.strokeRect(W - exW + .5, .5, exW - 1, 18); text(x2, exT, W - exW / 2, 13, C.mid, 'center', 10.5, 600); hit(id2, [W - exW, 0, exW, 19], { k: 'logitsBig' });
  x2.beginPath(); x2.arc(W - exW - 16, 9.5, 8, 0, 7); x2.stroke(); text(x2, '?', W - exW - 16, 13.5, C.mid, 'center', 10.5, 700); hit(id2, [W - exW - 26, 0, 20, 19], { k: 'cand', i: stepI, j: 0 });
  textFit(x2, head, 0, 13, W - exW - 40, live ? C.cy : C.ink, 'left', big ? 12 : 10.5, 650);
  const rare = pick && pick.rest ? { w: pick.word, rare: true, p1: d.rest.p1 / tailN, p: d.rest.p / tailN, fin: (d.finalP.get(d.rest) || 0) / tailN, inK: d.ordered.includes(d.rest) } : null;
  if (rare) rows.push(rare); rows.push(d.rest);
  const topk = new Set(d.ordered), kOn = S.topk < 6, pOn = S.topp < 1;
  const lw = Math.min(190, Math.max(124, W * .2)), gapC = 18, cw = (W - lw - gapC * 3) / 4, top = big ? 70 : 58, rh = Math.max(12, Math.min(big ? 44 : 30, (H2 - top - 8) / rows.length));
  const val = (it, j) => it.rare ? [it.p1, it.p, it.inK ? it.p / d.zk : 0, it.fin][j] : [it.p1, it.p, topk.has(it) ? it.p / d.zk : 0, d.finalP.get(it) || 0][j];
  const stages = [
    ['0 · Softmax', '', true],
    [`1 · Temp ${dec(S.temp.toFixed(2))}`, '', true],
    [`2 · Top-k ${kOn ? S.topk : 'off'}`, '', kOn],
    [`3 · Top-p ${pOn ? dec(S.topp.toFixed(2)) : 'off'}`, '', pOn],
  ];
  stages.forEach(([h, sub, on], j) => {
    const X = lw + j * (cw + gapC);
    textFit(x2, h, X, top - 12, cw, on ? C.ink : C.dim, 'left', big ? 12 : 10.5, 650);
    if (j) { x2.fillStyle = C.faint; x2.beginPath(); x2.moveTo(X - gapC + 5, top - 24); x2.lineTo(X - 6, top - 20); x2.lineTo(X - gapC + 5, top - 16); x2.fill(); }
    hit(id2, [X, top - 32, cw, 30], { k: 'sampstage', j });
  });
  const pctS = v => (v > 0 && v < .001 ? '<0.1%' : pct(v));
  rows.forEach((it, r) => {
    const Y = top + r * rh, chosen = pick && (it.rare || (!it.rest && !pick.rest && pick.word === it.w));
    if (chosen) { x2.fillStyle = 'rgba(255,212,59,.07)'; x2.fillRect(0, Y, W, rh - 2); chipRound(x2, 2, Y + rh / 2 - 4, 8, C.hot); }
    const label = it.rest ? L(`+${num(tailN - (rare ? 1 : 0))} more`, `+${num(tailN - (rare ? 1 : 0))} más`) : it.rare ? `${it.w.trim()} ${L('(rare)', '(rara)')}` : it.w.trim();
    textFit(x2, label, 16, Y + rh / 2 + 4, it.rest || it.rare ? lw - 22 : lw - 64, chosen ? C.hot : it.rest ? C.mid : C.ink, 'left', big ? 12 : 10.5, chosen ? 700 : 500);
    if (!it.rest && !it.rare) text(x2, dec(it.l.toFixed(1)), lw - 12, Y + rh / 2 + 4, C.dim, 'right', 9.5);
    for (let j = 0; j < 4; j++) {
      const X = lw + j * (cw + gapC), v = val(it, j), bw = cw - 50, bh = Math.max(4, Math.min(16, rh - 10));
      x2.fillStyle = 'rgba(255,255,255,.035)'; x2.fillRect(X, Y + (rh - bh) / 2 - 1, bw, bh);
      if (v > 0) { x2.fillStyle = j === 3 ? C.hot : j === 0 ? 'rgba(214,208,232,.55)' : C.cy; x2.fillRect(X, Y + (rh - bh) / 2 - 1, Math.max(1.5, bw * v), bh); text(x2, pctS(v), X + bw + 6, Y + rh / 2 + 4, j === 3 ? C.hot : C.mid, 'left', 9.5, j === 3 ? 700 : 400); }
      else { x2.strokeStyle = 'rgba(255,90,110,.6)'; x2.beginPath(); x2.moveTo(X + 2, Y + rh / 2 - 1); x2.lineTo(X + bw * .25, Y + rh / 2 - 1); x2.stroke(); text(x2, L('cut', 'fuera'), X + bw * .25 + 6, Y + rh / 2 + 3, 'rgba(255,90,110,.75)', 'left', 9.5); }
    }
    hit(id2, [0, Y, lw, rh], { k: 'cand', i: stepI, j: Math.max(0, d.items.indexOf(it)) });
  });
  // The cut, live: a dashed line under the last survivor of top-k and of top-p, gliding to its place as the sliders move.
  UI.cutY = UI.cutY || {};
  for (const j of [2, 3]) {
    if (!stages[j][2]) { delete UI.cutY[id2 + j]; continue; }
    let last = -1; rows.forEach((it, r) => { if (val(it, j) > 0) last = r; });
    if (last < 0 || last >= rows.length - 1) { delete UI.cutY[id2 + j]; continue; }
    const target = top + (last + 1) * rh - 1, key = id2 + j, cur = UI.cutY[key] ?? target, yy = cur + (target - cur) * .35; UI.cutY[key] = Math.abs(target - yy) < .3 ? target : yy;
    const X = lw + j * (cw + gapC), bw = cw - 8;
    x2.save(); x2.strokeStyle = 'rgba(255,90,110,.9)'; x2.lineWidth = 1.5; x2.setLineDash([4, 3]); x2.beginPath(); x2.moveTo(X - 4, yy); x2.lineTo(X + bw, yy); x2.stroke(); x2.restore();
  }
  drawHover(id2, x2);
}
