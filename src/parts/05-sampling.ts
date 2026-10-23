// ===== Tokens, logits and sampling =====
// The answer the console writes: a fixed, illustrative clinical answer to the anticoagulant question, split
// into BPE-like pieces. At each step the scripted next piece gets most of the probability (a logit lead of
// 3.6 to 4.8 over plausible alternatives), so at the default temperature and top-p the sampler reproduces
// the script with any seed, and it diverges only when the temperature is raised.
const SCRIPT = {
  en: 'Yes, there is a clinically important interaction. Amiodarone inhibits CYP2C9 and CYP3A4, the liver enzymes that clear warfarin, so warfarin levels rise and its anticoagulant effect grows over one to three weeks. The record shows an INR of 2.4 four weeks ago, a stable warfarin dose of 5 mg a day and no bleeding events so far. Amiodarone was started three days ago for atrial fibrillation. The cited guideline recommends lowering the warfarin dose by about a third when amiodarone is started, checking the INR every week for the first six weeks, and asking the patient to report bruising, nosebleeds, dark stools or blood in the urine. If the INR rises above 3.5, hold one dose and recheck within three days. Because amiodarone has a very long half-life, the effect can persist for weeks after it is stopped. An alternative such as apixaban has fewer interactions with amiodarone, but it needs a dose check against kidney function, and any switch should be agreed with the prescribing cardiologist. The record has no creatinine value from the last three months, so a renal panel before any change would be prudent. Document the plan in the medication reconciliation note and book the first INR check for next week. Recheck the INR three to five days after any dose change, and again before the next refill. Avoid adding aspirin or anti-inflammatory drugs without review. Sources: history line 12, medication list, guideline section 3.2.',
  es: 'Sí, hay una interacción clínicamente relevante. La amiodarona inhibe CYP2C9 y CYP3A4, las enzimas del hígado que eliminan la warfarina, así que los niveles de warfarina suben y su efecto anticoagulante aumenta en una a tres semanas. La historia muestra un INR de 2,4 hace cuatro semanas, una dosis estable de warfarina de 5 mg al día y ningún sangrado hasta ahora. La amiodarona se empezó hace tres días por una fibrilación auricular. La guía citada recomienda bajar la dosis de warfarina alrededor de un tercio al empezar la amiodarona, controlar el INR cada semana durante las primeras seis semanas y pedir al paciente que avise de hematomas, sangrado nasal, heces oscuras o sangre en la orina. Si el INR supera 3,5, se omite una dosis y se repite el control en tres días. Como la amiodarona tiene una vida media muy larga, el efecto puede durar semanas después de suspenderla. Una alternativa como el apixabán tiene menos interacciones con la amiodarona, pero necesita ajustar la dosis según la función renal, y cualquier cambio debe acordarse con el cardiólogo que la prescribió. La historia no tiene un valor de creatinina de los últimos tres meses, así que conviene pedir un perfil renal antes de cambiar nada. Deja el plan en la nota de conciliación de la medicación y programa el primer control de INR para la semana que viene. Fuentes: historia línea 12, lista de medicación, guía sección 3.2.',
};
const POOL = {
  en: ['the', 'a', 'risk', 'dose', 'patient', 'and', 'may', 'level', 'it', 'week', 'drug', 'INR', 'should', 'when', 'of', 'to', 'with', 'blood', 'liver', 'effect', 'is', 'this', 'that', 'in'],
  es: ['el', 'la', 'riesgo', 'dosis', 'paciente', 'y', 'puede', 'nivel', 'se', 'semana', 'fármaco', 'INR', 'debe', 'cuando', 'de', 'que', 'con', 'sangre', 'hígado', 'efecto', 'es', 'este', 'en', 'un'],
};
const RARE = { en: ['Florence', 'quartz', 'nebula', 'violin', 'Tuesday'], es: ['Florencia', 'cuarzo', 'nebulosa', 'violín', 'martes'] };
// Long words split like a BPE vocabulary would: a common stem and a frequent ending.
function bpeSplit(w) {
  if (w.length <= 7 || /\d/.test(w)) return [w];
  const cut = w.length - (w.length > 11 ? 5 : 4), a = w.slice(0, cut), b = w.slice(cut);
  return a.length > 8 ? [a.slice(0, Math.ceil(a.length / 2)), a.slice(Math.ceil(a.length / 2)), b] : [a, b];
}
function scriptTokens(l) {
  const out = [];
  for (const w of SCRIPT[l].split(' ')) {
    const core = w.replace(/[.,:]$/, ''), punct = w.slice(core.length), parts = bpeSplit(core);
    parts.forEach((p, i) => out.push(i === 0 ? ' ' + p : p));
    if (punct) out.push(punct);
  }
  out[0] = out[0].trimStart();
  return out;
}
let SCRIPT_TOK = scriptTokens(lang);
function candidates(i) {
  const target = SCRIPT_TOK[i % SCRIPT_TOK.length], r = rngOf(777 + i * 31), pool = POOL[lang], alts = [];
  while (alts.length < 5) { const w = ' ' + pool[Math.floor(r() * pool.length)]; if (w !== target && !alts.includes(w)) alts.push(w); }
  const lead = 5.6 + r() * 1.4, list = [{ w: target, l: lead, script: true }];
  let l = lead - 3.6 - r() * 1.2; for (const w of alts) { list.push({ w, l, script: false }); l -= 0.3 + r() * 0.6; }
  return list.sort((a, b) => b.l - a.l);
}
// Temperature divides the logits, softmax turns them into probabilities, top-k and top-p cut the tail. The
// rest of the vocabulary (V minus 6 tokens) is lumped into one bar, each of its tokens with logit −8.
function distribution(i) {
  const c = candidates(i), V = R.m.vocab, T0 = Math.max(S.temp, 1e-3), restOne = -8 / T0;
  const ex = c.map(x => x.l / T0), mx = Math.max(...ex, restOne);
  const w = ex.map(e => Math.exp(e - mx)), restW = (V - c.length) * Math.exp(restOne - mx), Z = w.reduce((s, x) => s + x, 0) + restW;
  // the same logits at temperature 1, to show what the temperature did
  const m1 = Math.max(...c.map(x => x.l), -8), w1 = c.map(x => Math.exp(x.l - m1)), r1 = (V - c.length) * Math.exp(-8 - m1), Z1 = w1.reduce((s, x) => s + x, 0) + r1;
  const items = c.map((x, j) => ({ ...x, p: w[j] / Z, p1: w1[j] / Z1 }));
  const rest = { w: L(`${num(V - c.length)} other tokens`, `${num(V - c.length)} tokens más`), p: restW / Z, p1: r1 / Z1, rest: true };
  const ordered = [...items.slice(0, S.topk), ...(S.topk >= 6 ? [rest] : [])].sort((a, b) => b.p - a.p);
  const zk = ordered.reduce((s2, it) => s2 + it.p, 0); let acc = 0; const kept = []; for (const it of ordered) { kept.push(it); acc += it.p / zk; if (acc >= S.topp - 1e-12) break; }
  const z2 = kept.reduce((s, x) => s + x.p, 0);
  return { items, rest, kept, ordered, zk, finalP: new Map(kept.map(x => [x, x.p / z2])) };
}
let SAMPLED = [];
function sampleAll() {
  SAMPLED = [];
  for (let i = 0; i < S.ans; i++) {
    const d = distribution(i); let pick = d.kept[0];
    if (S.temp > 0.001) { const r = rngOf(55 + i * 977 + (S.seed || 1) * 7919)(); let acc = 0; pick = d.kept[d.kept.length - 1]; for (const it of d.kept) { acc += d.finalP.get(it); if (r <= acc) { pick = it; break; } } }
    SAMPLED.push({ word: pick.rest ? ' ' + RARE[lang][i % RARE[lang].length] : pick.w, script: !!pick.script, rest: !!pick.rest, p: d.finalP.get(pick) });
  }
}
