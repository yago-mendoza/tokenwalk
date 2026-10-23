// @ts-nocheck: DOM-heavy UI, to be typed in a later pass
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
  text(x, L(`${num(R.prompt)} prompt tokens · 1 square = ${num(Math.round(per))}${R.startAt ? ` · hatched: ${num(R.startAt)} cached, no prefill` : ''}`, `${num(R.prompt)} tokens de prompt · 1 cuadrado = ${num(Math.round(per))}${R.startAt ? ` · rayados: ${num(R.startAt)} en caché, sin prefill` : ''}`), 0, 44, C.dim, 'left', 9);
  text(x, L(`${num(gen)} of ${num(S.ans)} written`, `${num(gen)} de ${num(S.ans)} escritos`), W, 44, C.hot, 'right', 9);
  drawHover(id, x);
  const shown = gen + (ls.on && n.seg && n.seg.k !== 'prefill' ? 1 : 0);
  const key = `${shown}|${lang}|${S.temp}|${S.topk}|${S.topp}|${S.seed}|${P.t > 0 && P.t < R.ttft}|${UI.logitTok}`;
  if (key !== streamKey) {
    streamKey = key;
    const from = Math.max(0, shown - 220);
    let h = from ? '… ' : '';
    for (let i = from; i < shown && i < SAMPLED.length; i++) { const s = SAMPLED[i]; h += `<span class="g${s.script ? '' : ' alt'}${i === shown - 1 && ls.on ? ' now' : ''}${UI.logitTok === i ? ' sel' : ''}" data-tok="${i}" title="${esc(L(`token ${i + 1}: “${s.word}”`, `token ${i + 1}: “${s.word}”`))}">${esc(i === from ? s.word.trimStart() : s.word)}</span>`; }
    if (!shown) h = `<span class="ph">${P.t > 0 && P.t < R.ttft ? L('Waiting for the first token: the prompt is being read.', 'Esperando el primer token: se está leyendo el prompt.') : L('Press play: the answer appears here, one token per pass.', 'Pulsa reproducir: aquí aparece la respuesta, un token por pasada.')}</span>`;
    $('stream').innerHTML = h; $('stream').scrollTop = $('stream').scrollHeight;
    const fl = UI.flash; if (fl && fl.canvas === 'cPrompt' && fl.tok !== undefined && !fl.done) { fl.done = true; const els = fl.tok === 'all' ? [...$('stream').querySelectorAll('.g')] : [...$('stream').querySelectorAll(`[data-tok="${fl.tok}"]`)]; els.forEach(el => el.classList.add('flash')); if (els[0] && fl.tok !== 'all') els[0].scrollIntoView({ block: 'nearest' }); }
    $('tokHint').innerHTML = L('Each tint is one token, the unit the model reads and writes: a whole word, a piece of one (<i>token</i><i>izer</i>) or a space and a word together. One token per pass; click one to see the logits it came from.', 'Cada tono es un token, la unidad que el modelo lee y escribe: una palabra entera, un trozo de una (<i>tokeni</i><i>zador</i>) o un espacio con una palabra. Un token por pasada; pulsa uno para ver los logits de los que salió.') + (SAMPLED.slice(0, shown).some(t => !t.script) ? L(' Dotted red underline: a less likely token the sampler drew.', ' Subrayado rojo de puntos: un token menos probable que salió en el sorteo.') : '');
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
  const lw = Math.min(190, Math.max(124, W * .2)), gapC = 18, cw = (W - lw - gapC * 3) / 4, top = big ? 64 : H2 < 230 ? 46 : 52, rh = Math.max(12, Math.min(big ? 44 : 30, (H2 - top - 8) / rows.length));
  const val = (it, j) => it.rare ? [it.p1, it.p, it.inK ? it.p / d.zk : 0, it.fin][j] : [it.p1, it.p, topk.has(it) ? it.p / d.zk : 0, d.finalP.get(it) || 0][j];
  const stages = [
    [L('0 · Softmax', '0 · Softmax'), L('raw logits, T = 1', 'logits en bruto, T = 1'), true],
    [L(`1 · Temp. ${dec(S.temp.toFixed(2))}`, `1 · Temp. ${dec(S.temp.toFixed(2))}`), S.temp < 1 ? L('sharper', 'más afilada') : S.temp > 1 ? L('flatter', 'más plana') : L('unchanged', 'sin cambio'), true],
    [L(`2 · Top-k ${kOn ? S.topk : L('off', 'apagado')}`, `2 · Top-k ${kOn ? S.topk : L('off', 'apagado')}`), kOn ? L(`keeps the ${S.topk} likeliest`, `se queda los ${S.topk} más probables`) : L('passes everything', 'deja pasar todo'), kOn],
    [L(`3 · Top-p ${dec(S.topp.toFixed(2))}`, `3 · Top-p ${dec(S.topp.toFixed(2))}`), pOn ? L(`keeps ${pct(S.topp)}`, `guarda ${pct(S.topp)}`) : L('passes everything', 'deja pasar todo'), pOn],
  ];
  stages.forEach(([h, sub, on], j) => {
    const X = lw + j * (cw + gapC);
    textFit(x2, h, X, top - 20, cw, on ? C.ink : C.dim, 'left', big ? 11.5 : 10, 650); textFit(x2, sub, X, top - 7, cw, C.dim, 'left', 9.5);
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
  drawHover(id2, x2);
}
