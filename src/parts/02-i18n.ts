// ===== Language =====
const STR = {
  title: ['One request, end to end', 'Una petición, de principio a fin'],
  zCfg: ['Configure', 'Configurar'], zRun: ['Run', 'Ejecutar'], zWatch: ['Watch', 'Observar'], zMon: ['Monitor', 'Monitorizar'],
  secAlerts: ['Alerts', 'Alertas'], secInst: ['Trends', 'Tendencias'], secInstSub: ['solid to now · faint ahead', 'sólido hasta ahora · tenue por delante'], logT: ['Event history', 'Historial de eventos'], lsBand: ['Explainer', 'Explicación'], chainT: ['Sampling chain', 'Cadena de muestreo'], fsT: ['Use full screen', 'Usa pantalla completa'], fsS: ['The console is built for the whole screen. In a smaller window some panels get cramped and parts may not display well. Press F11 (Fn+F11 on many laptops), or go full screen here.', 'La consola está hecha para la pantalla entera. En una ventana más pequeña algunos paneles quedan apretados y hay partes que pueden verse mal. Pulsa F11 (Fn+F11 en muchos portátiles), o ponla a pantalla completa aquí.'], tlScaleL: ['Timeline', 'Línea de tiempo'], scaleT: ['Size ladder', 'Escalera de tamaños'],
  scenarios: ['Scenarios', 'Escenarios'], aMachine: ['Machine', 'Máquina'], aModel: ['Model and weights', 'Modelo y pesos'],
  aRequest: ['Request, in tokens', 'Petición, en tokens'], aSamp: ['Sampling', 'Muestreo'], aLive: ['Live: a real server', 'En vivo: un servidor real'], secLive: ['Estimate vs measured', 'Estimación frente a medida'], secLiveSub: ['one real request', 'una petición real'],
  sampLive: ['In this order, to every token. Live during the run: only unwritten tokens change.', 'En este orden, a cada token. En vivo durante la ejecución: solo cambian los tokens sin escribir.'],
  tempHint: ['Divides the logits: below 1 sharpens toward the favourite, above 1 flattens toward the rest.', 'Divide los logits: por debajo de 1 afila hacia el favorito, por encima de 1 aplana hacia el resto.'],
  topkHint: ['Keeps only the k likeliest tokens and renormalizes.', 'Se queda solo con los k tokens más probables y renormaliza.'],
  toppHint: ['Keeps the smallest set whose probability adds up to p, then draws.', 'Se queda con el conjunto más pequeño cuya probabilidad suma p, y sortea.'],
  seedL: ['Seed (same seed, same text)', 'Semilla (misma semilla, mismo texto)'], aEngine: ['Engine', 'Motor'], aAdv: ['Caches and speculation', 'Cachés y especulación'],
  preset: ['Preset', 'Preset'], ram: ['System RAM, GB', 'RAM del sistema, GB'], tflops: ['Compute, TFLOPS', 'Cómputo, TFLOPS'],
  mts: ['Transfers, MT/s', 'Transferencias, MT/s'], bus: ['Bus, bits', 'Bus, bits'], vbw: ['VRAM, GB/s', 'VRAM, GB/s'],
  model: ['Model', 'Modelo'], weights: ['Weight format', 'Formato de pesos'], kvType: ['KV cache type', 'Tipo de caché KV'],
  ctx: ['Context reserved, num_ctx', 'Contexto reservado, num_ctx'],
  keepAlive: ['Keep loaded, keep_alive', 'Mantener cargado, keep_alive'],
  sys: ['System prompt', 'Prompt de sistema'], docs: ['Patient history and documents', 'Historia clínica y documentos'], q: ['Question', 'Pregunta'], ans: ['Answer length', 'Longitud de la respuesta'],
  cold: ['Cold start, model not loaded', 'Arranque en frío, modelo sin cargar'],
  cached: ['Prefix already cached in memory', 'Prefijo ya en caché en memoria'], disk: ['Restore the prefix KV from disk', 'Restaurar la KV del prefijo desde disco'],
  spec: ['Speculative decoding, 0.6B draft', 'Speculative decoding, borrador de 0,6B'],
  liveT: ['Live: a real server', 'En vivo: un servidor real'],
  mtp: ['MTP, the model drafts its own next tokens (k = 2)', 'MTP, el modelo propone sus propios siguientes tokens (k = 2)'],
  gamma: ['Draft tokens per round', 'Tokens del borrador por ronda'], alpha: ['Acceptance rate', 'Tasa de aceptación'],
  temp: ['Temperature', 'Temperatura'], inspL: ['Inspector', 'Inspector'],
  pauseTok: ['Pause after each token', 'Pausa tras cada token'], pauseLayer: ['Pause after each layer', 'Pausa tras cada capa'],
  undo: ['Undo', 'Deshacer'], ctxWin: ['Context window', 'Ventana de contexto'], output: ['Output', 'Salida'], illus: ['illustrative text', 'texto ilustrativo'], follow: ['follow', 'seguir'],
  locked: ['Configuration locked during the run', 'Configuración bloqueada durante la ejecución'],
  lockedSub: ['A run uses one fixed configuration. Sampling, above, stays live.', 'Una ejecución usa una configuración fija. El muestreo, arriba, sigue activo.'],
};
const qLang = new URLSearchParams(location.search).get('lang');
let fromEs = false; try { fromEs = new URL(document.referrer).pathname.startsWith('/es/'); } catch (e) {}
let lang = qLang === 'es' || (qLang !== 'en' && fromEs) ? 'es' : 'en';
const T = k => (STR[k] ? STR[k][lang === 'es' ? 1 : 0] : k);
const L = (en, es) => (lang === 'es' ? es : en);
const num = (x, d = 0) => Number(x).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const dec = s => (lang === 'es' ? String(s).replace(/(\d)\.(\d)/g, '$1,$2') : String(s));
const B = b => dec(b >= 1e9 ? fmtGB(b / 1e9) : b >= 1e6 ? `${(b / 1e6).toFixed(b >= 1e7 ? 0 : 1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(b >= 1e4 ? 0 : 1)} KB` : `${b.toFixed(b < 10 ? 2 : 0)} B`);
const S_ = s => dec(fmtS(s));
const TT = s => dec(`${Math.max(0, s).toFixed(6)} s`);
const pct = x => dec(`${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
const GiB = gb => dec(`${(gb / 1.073741824).toFixed(gb >= 10 ? 1 : 2)} GiB`);
const $ = (id: string): any => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
