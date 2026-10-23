// ===== Input on the left: the context window as it is assembled =====
// Token kinds keep one colour wherever they appear: system grey, documents steel, question white, answer yellow.
const KIND = { sys: '#8d93a3', docs: '#5f7fae', q: '#e6e6ea', ans: '#ffd43b' };
function drawCtx(n) {
  const id = 'cCtx', c = $(id), pe = c.parentElement, pcs = getComputedStyle(pe), W = Math.max(150, Math.floor(pe.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight)));
  const ctx = R.ctx, inCache = tokensInCache(P.t), gen = generatedAt(P.t), minW = 3, y = 22, h = 12, rowH = 19, rows0 = y + h + 12;
  const segs = [['sys', S.sys, L('System prompt', 'Prompt de sistema')], ['docs', S.docs, L('Documents', 'Documentos')], ['q', S.q, L('Question', 'Pregunta')], ['ans', Math.min(S.ans, Math.max(0, ctx - R.prompt)), L('Answer', 'Respuesta')]];
  const free = Math.max(0, ctx - R.prompt - S.ans), H = rows0 + (segs.length + 1) * rowH + 2, x = fit(c, W, H); hitReset(id);
  // header: reserved on the left, used on the right
  text(x, L(`num_ctx ${num(ctx)}`, `num_ctx ${num(ctx)}`), 0, 12, C.ink, 'left', 11, 650);
  text(x, L(`${num(R.prompt + S.ans)} used · ${pct((R.prompt + S.ans) / ctx)}`, `${num(R.prompt + S.ans)} usados · ${pct((R.prompt + S.ans) / ctx)}`), W, 12, C.mid, 'right', 11);
  // the composition bar
  const raw = segs.map(s2 => Math.max(0, s2[1]) / ctx * W), small = raw.reduce((a2, v, i) => a2 + (segs[i][1] > 0 && v < minW ? minW - v : 0), 0), sc = (W - small) / W;
  let cx = 0, tok = 0; const reads = {};
  segs.forEach(([k, v], i) => {
    if (v <= 0) return;
    const w = raw[i] < minW ? minW : raw[i] * sc, read = k === 'ans' ? gen : Math.max(0, Math.min(v, inCache - tok)), fr = read / v; reads[k] = read;
    x.fillStyle = TOKCOL[k]; x.globalAlpha = .25; x.fillRect(cx, y, w - 1, h); x.globalAlpha = 1; x.fillRect(cx, y, Math.max(0, (w - 1) * fr), h);
    if (k !== 'ans' && tok < R.startAt) { x.fillStyle = C.cy; x.fillRect(cx, y + h - 2, Math.min(w - 1, (Math.min(v, R.startAt - tok) / v) * w), 2); }
    hit(id, [cx, y - 2, Math.max(6, w), h + 4], { k: 'ctxseg', id: k });
    cx += w; tok += k === 'ans' ? 0 : v;
  });
  if (cx < W - 1) { fillKind(x, 'kvres', cx, y, W - cx, h); hit(id, [cx, y - 2, W - cx, h + 4], { k: 'ctxseg', id: 'free' }); }
  if (R.truncated) { x.fillStyle = C.red; x.fillRect(W - 3, y - 3, 3, h + 6); }
  // one row per part, readable: swatch, name, how much is read so far, count
  [...segs, ['free', free, L('Free', 'Libre')]].forEach(([k, v, name], i) => {
    const Y = rows0 + i * rowH, mid = Y + rowH / 2;
    if (k === 'free') fillKind(x, 'kvres', 0, mid - 5, 10, 10); else { x.fillStyle = TOKCOL[k]; x.fillRect(0, mid - 5, 10, 10); }
    text(x, name, 18, mid + 4, k === 'free' ? C.mid : C.ink, 'left', 11.5, 500);
    const r2 = reads[k], partial = k !== 'free' && v > 0 && r2 !== undefined && r2 > 0 && r2 < v;
    text(x, partial ? `${num(Math.floor(r2))} / ${num(v)}` : num(v), W, mid + 4, k === 'free' ? C.dim : C.ink, 'right', 11.5, 600);
    hit(id, [0, Y, W, rowH], { k: 'ctxseg', id: k });
  });
  if (R.truncated) text(x, L(`cut ${num(R.promptFull + S.ans - ctx)}`, `recorte ${num(R.promptFull + S.ans - ctx)}`), W * .55, rows0 + 4 * rowH + rowH / 2 + 4, C.red, 'right', 11, 700);
  drawHover(id, x);
}

// ===== Output on the right: the answer, growing in place =====
let outKey = '';
function renderOutput(n) {
  if (liveOutput()) return;
  const gen = generatedAt(P.t), ls = logitState(n), shown = gen + (ls.on && n.seg && n.seg.k !== 'prefill' ? 1 : 0);
  const key = `${shown}|${lang}|${S.seed}|${S.temp}|${S.topp}|${S.topk}`;
  if (key !== outKey) {
    outKey = key; let h = '';
    for (let i = Math.max(0, shown - 60); i < shown && i < SAMPLED.length; i++) h += `<span class="g${SAMPLED[i].script ? '' : ' alt'}${i === shown - 1 && ls.on ? ' now' : ''}" data-tok="${i}">${esc(i === Math.max(0, shown - 60) ? SAMPLED[i].word.trimStart() : SAMPLED[i].word)}</span>`;
    $('outStream').innerHTML = h || `<span class="ph">${esc(L('The answer grows here, one token per pass. The text is illustrative.', 'La respuesta crece aquí, un token por pasada. El texto es ilustrativo.'))}</span>`;
    $('outStream').scrollTop = $('outStream').scrollHeight;
  }
  let lt;
  if (ls.on) { const i = ls.step, s = SAMPLED[Math.min(S.ans - 1, i)]; lt = L(`Logits ready: ${num(R.m.vocab)} scores; sampled ${s ? s.word.trim() : ''} at ${pct(s ? s.p || 0 : 0)}`, `Logits listos: ${num(R.m.vocab)} puntuaciones; sorteado ${s ? s.word.trim() : ''} con ${pct(s ? s.p || 0 : 0)}`); }
  else lt = ls.why;
  if ($('outLogit').textContent !== lt) $('outLogit').textContent = lt;
  $('outLogit').classList.toggle('on', ls.on);
  $('outCnt').textContent = `${num(gen)} / ${num(S.ans)}`;
}
