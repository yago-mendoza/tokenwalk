// ===== Event log at every scale =====
function segLine(s) {
  const { m } = R;
  if (s.k === 'load') return { k: 'load', t: s.a, txt: L(`Load: ${fmtGB(R.weights)} of weights from the SSD into ${R.mc.kind === 'unified' ? 'RAM' : 'VRAM'} at ${ssdGBs(S.machine)} GB/s, ${S_(s.d)}.`, `Carga: ${fmtGB(R.weights)} de pesos del SSD a ${R.mc.kind === 'unified' ? 'la RAM' : 'la VRAM'} a ${dec(ssdGBs(S.machine))} GB/s, ${S_(s.d)}.`) };
  if (s.k === 'restore') return { k: 'restore', t: s.a, txt: L(`KV restore: the cache of ${num(s.n)} prefix tokens (${B(kvBytesPerToken(m, S.kv) * s.n)}) read back from disk in ${S_(s.d)} instead of recomputed.`, `Restauración KV: la caché de ${num(s.n)} tokens del prefijo (${B(kvBytesPerToken(m, S.kv) * s.n)}) leída del disco en ${S_(s.d)} en vez de recalculada.`) };
  if (s.k === 'prefill') {
    const bound = s.matmul >= s.mem ? L('arithmetic sets the pace', 'manda la aritmética') : L('reading weights sets the pace', 'manda la lectura de pesos');
    return { k: 'prefill', t: s.a, txt: L(`Prefill chunk ${s.i + 1} of ${s.n}: tokens ${num(s.from + 1)} to ${num(s.to)} through all ${m.layers} layers together; weights read once for ${s.to - s.from} tokens (${B(s.bytes * 1e9)}), ${dec((2 * m.readParams * (s.to - s.from) / 1e12).toFixed(2))} TFLOP, ${bound}; ${B(kvBytesPerToken(m, S.kv) * (s.to - s.from))} of KV written. ${TT(s.d)}.`,
      `Bloque de prefill ${s.i + 1} de ${s.n}: tokens ${num(s.from + 1)} a ${num(s.to)} por las ${m.layers} capas a la vez; pesos leídos una vez para ${s.to - s.from} tokens (${B(s.bytes * 1e9)}), ${dec((2 * m.readParams * (s.to - s.from) / 1e12).toFixed(2))} TFLOP, ${bound}; ${B(kvBytesPerToken(m, S.kv) * (s.to - s.from))} de KV escritos. ${TT(s.d)}.`) };
  }
  const word = SAMPLED[s.tok] ? SAMPLED[s.tok].word.trim() : '';
  if (s.k === 'decode') return { k: s.tok === 0 ? 'first' : 'decode', t: s.a + s.d, txt: L(`Token ${num(s.tok + 1)} (${word}): one pass through ${m.layers} layers; ${B(readGB(m, S.quant) * 1e9)} of weights read${m.moe ? `, ${m.expertsUsed} + ${m.sharedExperts} of ${m.experts} experts per layer` : ''}; K and V of ${num(s.ctx)} tokens read at ${m.kvLayers} attention layers (${B(kvBytesPerToken(m, S.kv) * s.ctx)}); ${B(kvBytesPerToken(m, S.kv))} appended. ${TT(s.d)}.`,
    `Token ${num(s.tok + 1)} (${word}): una pasada por ${m.layers} capas; ${B(readGB(m, S.quant) * 1e9)} de pesos leídos${m.moe ? `, ${m.expertsUsed} + ${m.sharedExperts} de ${m.experts} expertos por capa` : ''}; K y V de ${num(s.ctx)} tokens leídos en ${m.kvLayers} capas de atención (${B(kvBytesPerToken(m, S.kv) * s.ctx)}); ${B(kvBytesPerToken(m, S.kv))} añadidos. ${TT(s.d)}.`) };
  return { k: s.tok === 0 ? 'first' : 'decode', t: s.a + s.d, txt: L(`Round at token ${num(s.tok + 1)}: the draft proposes ${S.gamma} tokens (${TT(S.gamma * s.draftT)}), one verification pass reads ${B(s.bytes * 1e9)} for ${S.gamma + 1} positions, ${s.acc} accepted, ${s.n} written. ${TT(s.d)}.`,
    `Ronda en el token ${num(s.tok + 1)}: el borrador propone ${S.gamma} tokens (${TT(S.gamma * s.draftT)}), una verificación lee ${B(s.bytes * 1e9)} para ${S.gamma + 1} posiciones, ${s.acc} aceptados, ${s.n} escritos. ${TT(s.d)}.`) };
}
function layerLine(seg, i) {
  const m = R.m;
  if (i >= m.layers) return { k: 'sub', txt: L(`Output head: the last column against all ${num(m.vocab)} rows of the vocabulary (${B(headBytes())} read), ${num(m.vocab)} logits out; the sampler picks one token.`, `Cabeza de salida: la última columna contra las ${num(m.vocab)} filas del vocabulario (${B(headBytes())} leídos), ${num(m.vocab)} logits; el sampler elige un token.`) };
  const li = layerInfo(i), sp = layerSpan(seg, i), ctxTok = seg.k === 'prefill' ? seg.to : seg.ctx;
  const kindTxt = li.kind === 'attn' ? L('attention', 'atención') : 'Gated DeltaNet';
  let what = li.kind === 'attn'
    ? L(`reads K and V of ${num(ctxTok)} tokens (${B(kvLayerBytes(ctxTok))}) and appends ${B(kvLayerBytes(seg.k === 'prefill' ? seg.to - seg.from : 1))}`, `lee K y V de ${num(ctxTok)} tokens (${B(kvLayerBytes(ctxTok))}) y añade ${B(kvLayerBytes(seg.k === 'prefill' ? seg.to - seg.from : 1))}`)
    : L(`reads and rewrites its fixed state (${B(R.sh.deltaState || 0)}), keeps no KV`, `lee y reescribe su estado fijo (${B(R.sh.deltaState || 0)}), no guarda KV`);
  if (m.moe && seg.k !== 'prefill') what += L(`; the router picks experts ${chosenExperts(seg.tok, i).join(', ')} and the shared one`, `; el router elige los expertos ${chosenExperts(seg.tok, i).join(', ')} y el compartido`);
  return { k: 'sub', txt: L(`Layer ${i + 1} (${kindTxt}): ${what}; ${B(li.read)} of weights read. ${TT(sp[1] - sp[0])}.`, `Capa ${i + 1} (${kindTxt}): ${what}; ${B(li.read)} de pesos leídos. ${TT(sp[1] - sp[0])}.`) };
}
function opLine(o, ld) {
  const d = TT((o.b - o.a) * ld);
  if (o.kind === 'mat') return L(`${o.id}: ${num(o.shape[1])} × ${num(o.shape[2])} weights (${B(o.bytes)}) read once; the activation column meets each of ${num(o.shape[2])} rows, ${num(o.shape[2])} numbers out. ${d}.`, `${o.id}: ${num(o.shape[1])} × ${num(o.shape[2])} pesos (${B(o.bytes)}) leídos una vez; la columna de activaciones se cruza con cada una de las ${num(o.shape[2])} filas, ${num(o.shape[2])} números de salida. ${d}.`);
  if (o.kind === 'kv') return L(`Attention: the query compared with the keys of ${num(o.ctxTok)} tokens, softmax, weighted sum of their values; ${B(o.bytes)} of KV read. ${d}.`, `Atención: la consulta comparada con las claves de ${num(o.ctxTok)} tokens, softmax, suma ponderada de sus valores; ${B(o.bytes)} de KV leídos. ${d}.`);
  if (o.kind === 'state') return L(`DeltaNet state: read, updated with this token and written back (${B(o.bytes)} moved), the same size at every position. ${d}.`, `Estado DeltaNet: se lee, se actualiza con este token y se vuelve a escribir (${B(o.bytes)} movidos), del mismo tamaño en cualquier posición. ${d}.`);
  if (o.kind === 'expert') return L(`${o.e < 0 ? 'Shared expert' : `Expert ${o.e}`}: three matrices, gate and up 2,048 × 512 and down 512 × 2,048 (${B(o.bytes)}). ${d}.`, `${o.e < 0 ? 'Experto compartido' : `Experto ${o.e}`}: tres matrices, gate y up 2.048 × 512 y down 512 × 2.048 (${B(o.bytes)}). ${d}.`);
  return L(`Experts touched by this chunk: ${B(o.bytes)}. ${d}.`, `Expertos tocados por este bloque: ${B(o.bytes)}. ${d}.`);
}
let logKey = '';
// The whole history, from the start of the run: phases are collapsible groups with their counts, decode tokens come in
// blocks of LOG_BLK (the block being written is open), and alerts and the first token always show at their place.
// What the reader opened or closed, and where they scrolled, survives every re-render.
const LOG_BLK = 50;
const LOGUI = { ph: {} as Record<string, boolean>, blk: new Map<number, boolean>(), stick: true, ver: 0, r: null as unknown };
function logToggle(kind: string, v: string) {
  if (kind === 'ph') LOGUI.ph[v] = LOGUI.ph[v] === false;
  else { const b = Number(v), cur = (LOGUI as any).cur, open = LOGUI.blk.has(b) ? LOGUI.blk.get(b) : b === cur; LOGUI.blk.set(b, !open); }
  LOGUI.ver++; logKey = '';
}
function renderLog(n) {
  const scale = UI.scale, idx = Math.min(segAt(P.t), R.segs.length);
  if (LOGUI.r !== R) { LOGUI.r = R; LOGUI.blk.clear(); }
  const key = `${scale}|${idx}|${n.layer}|${n.opIdx}|${scale === 'op' ? Math.floor(n.opP * 16) : ''}|${lang}|${LOGUI.ver}`;
  if (key === logKey) return; logKey = key;
  const lines = [];
  if (scale === 'request' || !n.seg || n.seg.k === 'load' || n.seg.k === 'restore') {
    const phaseOfK = k => (k === 'load' || k === 'restore' ? 'load' : k === 'prefill' ? 'prefill' : 'decode'), cnt = { load: 0, prefill: 0, decode: 0 };
    for (let i = 0; i < idx; i++) cnt[phaseOfK(R.segs[i].k)]++;
    const PH = { load: [L('Load', 'Carga'), 'storage'], prefill: [L('Prefill · reading the prompt', 'Prefill · leyendo el prompt'), 'layers'], decode: [L('Decode · writing the answer', 'Decode · escribiendo la respuesta'), 'token'] };
    const als = alerts().filter(a => a.lv === 'critical' || a.lv === 'caution').map(a => ({ t: a.id === 'ttft' ? R.ttft : 0, a }));
    const blkOf = sg => Math.floor((sg.tok || 0) / LOG_BLK), last = idx > 0 ? R.segs[idx - 1] : null;
    const cur = last && phaseOfK(last.k) === 'decode' ? blkOf(last) : -1; (LOGUI as any).cur = cur;
    const phOpen = ph => LOGUI.ph[ph] !== false, blkOpen = b => (LOGUI.blk.has(b) ? LOGUI.blk.get(b) : b === cur);
    const chev = open => `<i class="lc${open ? ' on' : ''}">${ICON('chev', 's')}</i>`;
    let lastPh = null, lastBlk = -1, ai = 0;
    const pushAl = upto => { while (ai < als.length && als[ai].t <= upto) { const q = als[ai++]; lines.push(`<li class="k-alert"><time>${S_(q.t)}</time><span>${ICON('warning', 's')}${esc(q.a.title)}</span></li>`); } };
    const pushFirst = () => lines.push(`<li class="k-first"><time>${S_(R.ttft)}</time><span>${ICON('eye', 's')}${esc(L('First token: everything before this was the wait.', 'Primer token: todo lo anterior era la espera.'))}</span></li>`);
    als.sort((p1, p2) => p1.t - p2.t);
    for (let i = 0; i < idx; i++) {
      const sg = R.segs[i], ph = phaseOfK(sg.k);
      pushAl(sg.a);
      if (ph !== lastPh) { lastPh = ph; lastBlk = -1; lines.push(`<li class="grp" data-lph="${ph}" role="button" tabindex="0" aria-expanded="${phOpen(ph)}"><time>${chev(phOpen(ph))}</time><span>${ICON(PH[ph][1], 's')}<b>${esc(PH[ph][0])}</b><em>${num(cnt[ph])}</em></span></li>`); }
      if (!phOpen(ph)) { if (i === R.firstDecode - 1) pushFirst(); continue; }
      if (ph === 'decode') {
        const b = blkOf(sg);
        if (b !== lastBlk) { lastBlk = b; const t0 = b * LOG_BLK + 1, t1 = b === cur ? Math.min((b + 1) * LOG_BLK, (last.tok || 0) + (last.n || 1)) : Math.min((b + 1) * LOG_BLK, S.ans);
          lines.push(`<li class="blk${b === cur ? ' cur' : ''}" data-lblk="${b}" role="button" tabindex="0" aria-expanded="${blkOpen(b)}"><time>${S_(sg.a)}</time><span>${chev(blkOpen(b))}${esc(L(`Tokens ${num(t0)}–${num(t1)}`, `Tokens ${num(t0)}–${num(t1)}`))}</span></li>`); }
        if (!blkOpen(b)) continue;
      }
      const l = segLine(sg);
      const short = sg.k === 'prefill' ? L(`Chunk ${sg.i + 1} of ${sg.n} · tokens ${num(sg.from + 1)}–${num(sg.to)} · ${S_(sg.d)}`, `Bloque ${sg.i + 1} de ${sg.n} · tokens ${num(sg.from + 1)}–${num(sg.to)} · ${S_(sg.d)}`)
        : sg.k === 'decode' || sg.k === 'round' ? L(`Token ${num(sg.tok + 1)}${SAMPLED[sg.tok] ? ` “${SAMPLED[sg.tok].word.trim()}”` : ''} · ${S_(sg.d)}`, `Token ${num(sg.tok + 1)}${SAMPLED[sg.tok] ? ` «${SAMPLED[sg.tok].word.trim()}»` : ''} · ${S_(sg.d)}`)
        : l.txt;
      lines.push(`<li class="k-${l.k}${ph === 'decode' ? ' inblk' : ''}" title="${esc(l.txt)}"><time>${S_(l.t)}</time><span>${ICON(PH[ph][1], 's')}${esc(short)}</span></li>`);
      if (i === R.firstDecode - 1) pushFirst();
    }
    pushAl(P.t);
    if (n.seg) lines.push(`<li class="now"><time>${esc(L('now', 'ahora'))}</time><span>${esc(segLine(n.seg).txt)}</span></li>`);
    else if (idx >= R.segs.length && R.segs.length) lines.push(`<li class="k-first"><time>${S_(R.total)}</time><span>${ICON('check', 's')}${esc(L(`Done: ${num(S.ans)} tokens in ${S_(R.total)}, first at ${S_(R.ttft)}.`, `Terminado: ${num(S.ans)} tokens en ${S_(R.total)}, el primero a los ${S_(R.ttft)}.`))}</span></li>`);
  } else if (scale === 'token') {
    const seg = n.seg, upto = n.head ? R.m.layers : n.layer;
    lines.push(`<li class="k-prefill">${esc(segLine(seg).txt)}</li>`);
    for (let i = 0; i <= upto; i++) { const l = layerLine(seg, i); lines.push(`<li class="${i === upto ? 'now' : 'k-sub'}">${esc(l.txt)}</li>`); }
  } else {
    const seg = n.seg, i = n.layer, sp = layerSpan(seg, i), ld = sp[1] - sp[0];
    lines.push(`<li class="k-prefill">${esc(layerLine(seg, i).txt)}</li>`);
    if (scale === 'layer') n.ops.forEach((o, j) => { if (j <= n.opIdx) lines.push(`<li class="${j === n.opIdx ? 'now' : 'k-sub'}">${esc(opLine(o, ld))}</li>`); });
    else {
      const o = n.op; lines.push(`<li class="k-sub">${esc(opLine(o, ld))}</li>`);
      const blocks = 16, done = Math.floor(n.opP * blocks);
      for (let b = 0; b <= done && b < blocks; b++) {
        const od = (o.b - o.a) * ld / blocks;
        if (o.kind === 'mat') { const rows = o.shape[2], r0 = Math.floor(b * rows / blocks), r1 = Math.floor((b + 1) * rows / blocks); lines.push(`<li class="${b === done ? 'now' : 'k-sub'}">${esc(L(`Rows ${num(r0 + 1)} to ${num(r1)}: ${num(r1 - r0)} dot products of ${num(o.shape[1])} numbers, ${B(o.bytes / blocks)} read. ${TT(od)}.`, `Filas ${num(r0 + 1)} a ${num(r1)}: ${num(r1 - r0)} productos escalares de ${num(o.shape[1])} números, ${B(o.bytes / blocks)} leídos. ${TT(od)}.`))}</li>`); }
        else lines.push(`<li class="${b === done ? 'now' : 'k-sub'}">${esc(L(`Block ${b + 1} of ${blocks}: ${B(o.bytes / blocks)} read. ${TT(od)}.`, `Bloque ${b + 1} de ${blocks}: ${B(o.bytes / blocks)} leídos. ${TT(od)}.`))}</li>`);
      }
    }
  }
  const ol = $('log'), stick = LOGUI.stick || ol.scrollHeight - ol.scrollTop - ol.clientHeight < 12, keep = ol.scrollTop; ol.innerHTML = lines.map(h => h.replace(/<span>([\s\S]*?)<\/span><\/li>$/, (m0, t) => `<span>${linkify(t)}</span></li>`)).map(h => /<time>/.test(h) ? h : h.replace(/^(<li[^>]*>)\[([^\]]+)\] ([\s\S]*)<\/li>$/, '$1<time>$2</time><span>$3</span></li>').replace(/^(<li[^>]*>)(?!<time>)([\s\S]*)<\/li>$/, '$1<time></time><span>$2</span></li>')).join(''); ol.scrollTop = stick ? ol.scrollHeight : keep; LOGUI.stick = false;
  $('logScale').textContent = L(`at the ${UI.scale} scale of the timeline`, `a la escala ${UI.scale} de la línea de tiempo`);
}
