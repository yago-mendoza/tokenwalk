// ===== Drawing kit: one look per kind of thing, and hit regions for the inspector =====
// Contents keep fixed colours everywhere: weights violet, KV cache striped yellow, fixed state teal hatch,
// other apps grey dots, compute cyan, bytes in flight yellow dots. Hardware has its own code (HW below).
const C = { ink: '#e6e6ea', mid: '#9a9aa6', dim: '#63636f', faint: '#42424c', line: '#24242c', line2: '#34343f', grid: 'rgba(255,255,255,.035)',
  hot: '#ffd43b', cy: '#7fe3ff', li: '#8b6cf0', teal: '#3fd6c0', pink: '#b98ad0', ok: '#3ddc97', amber: '#ffb547', red: '#ff4d6d', bg: '#07070a', bg2: '#111116', panel: '#16161c', sys: '#3a3a44' };
const HW = { board: '#121218', boardEdge: '#2b2b36', trace: '#1e1e28', storage: '#d0894f', ram: '#4f8fd6', vram: '#d46fae', proc: '#b3b9c4', link: '#c08a4e', pkg: '#14141a' };
const TOKCOL = { sys: '#8d93a3', docs: '#5f7fae', q: '#d8d8de', ans: '#e7c22f' };
const tokKind = t => (t < S.sys ? 'sys' : t < S.sys + S.docs ? 'docs' : t < R.prompt ? 'q' : 'ans');
const FONT = 'ui-monospace, "SFMono-Regular", "Cascadia Mono", Consolas, monospace';
function tile(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return c; }
const TILES: Record<string, any> = {
  kv: tile(8, 8, x => { x.fillStyle = '#e7c22f'; x.fillRect(0, 0, 8, 8); x.strokeStyle = '#7d5f05'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke(); }),
  kvcached: tile(8, 8, x => { x.fillStyle = '#e7c22f'; x.fillRect(0, 0, 8, 8); x.strokeStyle = '#2a8fb0'; x.lineWidth = 2; x.beginPath(); x.moveTo(-2, -2); x.lineTo(10, 10); x.stroke(); }),
  state: tile(8, 8, x => { x.fillStyle = '#103430'; x.fillRect(0, 0, 8, 8); x.strokeStyle = '#3fd6c0'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, 0); x.lineTo(8, 8); x.moveTo(8, 0); x.lineTo(0, 8); x.stroke(); }),
  sys: tile(6, 6, x => { x.fillStyle = '#24242c'; x.fillRect(0, 0, 6, 6); x.fillStyle = '#5c5c68'; x.beginPath(); x.arc(3, 3, 1, 0, 7); x.fill(); }),
  free: tile(10, 10, x => { x.strokeStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.moveTo(0, 10); x.lineTo(10, 0); x.stroke(); }),
  spill: tile(8, 8, x => { x.fillStyle = '#8b6cf0'; x.fillRect(0, 0, 8, 8); x.strokeStyle = '#ff4d6d'; x.lineWidth = 2; x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.stroke(); }),
};
TILES.kvres = TILES.free; TILES.pending = TILES.free;
for (const [k, col] of Object.entries(TOKCOL)) TILES['kv_' + k] = tile(8, 8, x => { x.fillStyle = col; x.fillRect(0, 0, 8, 8); x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 2); x.lineTo(2, -2); x.moveTo(6, 10); x.lineTo(10, 6); x.stroke(); });
const patCache = new WeakMap();
function pat(x, name, k = 1) {
  let m = patCache.get(x); if (!m) { m = {}; patCache.set(x, m); }
  const key = name + k; if (m[key]) return m[key];
  const p = x.createPattern(TILES[name], 'repeat'); if (k !== 1 && p.setTransform) p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  return (m[key] = p);
}
function fillKind(x, kind, X, Y, w, h, alpha = 1, k = 1) {
  if (!(w > 0 && h > 0)) return;
  x.save(); x.globalAlpha *= alpha;
  if (kind === 'weights') x.fillStyle = '#34304a'; else if (kind === 'buf') x.fillStyle = '#4a4a55';
  else if (TILES[kind]) x.fillStyle = pat(x, kind, k);
  x.fillRect(X, Y, w, h);
  if (kind === 'weights') { x.fillStyle = C.li; if (w > 5 && h > 5) { x.strokeStyle = C.li; x.lineWidth = 1; x.strokeRect(X + .5, Y + .5, w - 1, h - 1); } else x.fillRect(X, Y, w, Math.min(h, 1.2)); }
  if (kind === 'free' || kind === 'kvres' || kind === 'pending') { x.strokeStyle = kind === 'kvres' ? 'rgba(255,212,59,.45)' : kind === 'pending' ? 'rgba(139,108,240,.55)' : 'rgba(255,255,255,.08)'; x.lineWidth = 1; if (kind !== 'free') x.setLineDash([3, 2]); x.strokeRect(X + .5, Y + .5, w - 1, h - 1); x.setLineDash([]); }
  x.restore();
}
const dots = (x, X, Y, h, n, color = C.cy, r = 1.8) => { x.fillStyle = color; for (let i = 0; i < n; i++) { x.beginPath(); x.arc(X, Y + (i + .5) * (h / n), r, 0, 7); x.fill(); } };
const chipSq = (x, X, Y, s, c) => { x.fillStyle = c; x.fillRect(X, Y, s, s); };
const chipRound = (x, X, Y, s, c) => { x.fillStyle = c; x.beginPath(); x.arc(X + s / 2, Y + s / 2, s / 2, 0, 7); x.fill(); };
const ring = (x, X, Y, s, c = C.cy) => { x.strokeStyle = c; x.lineWidth = 1.6; x.beginPath(); x.arc(X + s / 2, Y + s / 2, s / 2 + 2.5, 0, 7); x.stroke(); x.lineWidth = 1; };
function glowRect(x, X, Y, w, h, on, level = 1) { x.save(); if (on) { x.shadowColor = C.cy; x.shadowBlur = 8 * level; x.fillStyle = C.cy; x.globalAlpha = .45 + .55 * level; } else x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(X, Y, w, h); x.restore(); }
const LBL = {};
function fit(c, w, h) { LBL[c.id] = []; const dpr = Math.min(3, window.devicePixelRatio || 1); const W = Math.round(w * dpr), H = Math.round(h * dpr); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } c.style.width = w + 'px'; c.style.height = h + 'px'; const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h); x.lineJoin = 'round'; return x; }
function text(x, s, X, Y, color = C.mid, align = 'left', size = 10, weight = 400) { size = Math.max(9.5, size); x.fillStyle = color; x.font = `${weight} ${size}px ${FONT}`; x.textAlign = align; x.textBaseline = 'alphabetic'; x.fillText(s, X, Y); const L0 = LBL[x.canvas.id]; if (L0 && s) { const w = x.measureText(s).width, x0 = align === 'right' ? X - w : align === 'center' ? X - w / 2 : X; L0.push([x0, Y - size * .75, x0 + w, Y + size * .2, String(s).slice(0, 24)]); } }
// Sentences wrap onto up to two lines instead of being cut; returns the height used.
function textWrap(x, s, X, Y, maxW, color, size = 10, weight = 400, maxLines = 2) { size = Math.max(9.5, size); const ls = wrapLines(x, s, maxW, `${weight} ${size}px ${FONT}`), out = ls.slice(0, maxLines); if (ls.length > maxLines) out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; out.forEach((l, i) => text(x, l, X, Y + i * (size + 4), color, 'left', size, weight)); return out.length * (size + 4); }
function textFit(x, s, X, Y, maxW, color, align, size = 10, weight = 400) { size = Math.max(9.5, size); x.font = `${weight} ${size}px ${FONT}`; let t = s; while (t.length > 3 && x.measureText(t).width > maxW) t = t.slice(0, -2); if (t !== s) { t = t.slice(0, -1) + '…'; if (window.__TRUNC) window.__TRUNC.add(`${x.canvas.id} · ${s}`); } text(x, t, X, Y, color, align, size, weight); }
const widthOf = c => Math.max(160, Math.floor(c.parentElement.getBoundingClientRect().width - 24));
const FOOT = 0; // the stage's bottom row: caption on the left, the powers-of-ten ruler on the right
function stageSize() { const r = $('stage').getBoundingClientRect(); return [Math.max(220, Math.floor(r.width)), Math.max(160, Math.floor(r.height) - FOOT)]; }
function tag(x, s, X, Y, align = 'right') { x.font = `600 8.5px ${FONT}`; const w = x.measureText(s).width + 10, X0 = align === 'right' ? X - w : X; x.fillStyle = 'rgba(10,10,13,.85)'; x.fillRect(X0, Y, w, 15); x.strokeStyle = C.line2; x.strokeRect(X0 + .5, Y + .5, w - 1, 14); text(x, s, X0 + 5, Y + 10.5, C.mid, 'left', 8.5, 600); return X0; }

// hit regions: rectangles or polygons per canvas, with what they select
const HITS = {};
const hitReset = id => (HITS[id] = []);
const hit = (id, shape, sel) => HITS[id].push({ shape, sel });
const selKey = s => (s ? JSON.stringify(s) : '');
const isSel = s => UI.sel && selKey(UI.sel) === selKey(s);
const isHov = s => UI.hover && selKey(UI.hover) === selKey(s);
function inside(sh, px, py) {
  if (Array.isArray(sh)) return px >= sh[0] && px <= sh[0] + sh[2] && py >= sh[1] && py <= sh[1] + sh[3];
  const p = sh.poly; let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > py) !== (p[j][1] > py) && px < ((p[j][0] - p[i][0]) * (py - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}
function hitAt(id, px, py) { const list = HITS[id] || []; for (let i = list.length - 1; i >= 0; i--) if (inside(list[i].shape, px, py)) return list[i].sel; return null; }
function outlineSel(x, sel, X, Y, w, h) { if (isSel(sel)) { x.save(); x.strokeStyle = '#ffffff'; x.lineWidth = 2; x.shadowColor = 'rgba(255,255,255,.8)'; x.shadowBlur = 6; x.strokeRect(X - 1, Y - 1, w + 2, h + 2); x.restore(); } }
// Hover: the outline of every hit region that selects the hovered thing (the union of a part's cells).
function drawHover(id, x) {
  drawFlash(id, x);
  if (UI.brush && UI.brush.canvas === id) { x.save(); x.strokeStyle = 'rgba(255,255,255,.75)'; x.fillStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1.5; x.setLineDash([4, 3]); outlineMatches(id, x, UI.brush.match, 1, true); x.restore(); }
  if (!UI.hover || UI.hoverCanvas !== id) return;
  const k = selKey(UI.hover); x.save(); x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1;
  for (const h of HITS[id] || []) if (Array.isArray(h.shape) && selKey(h.sel) === k) x.strokeRect(h.shape[0] - .5, h.shape[1] - .5, h.shape[2] + 1, h.shape[3] + 1);
  x.restore();
}
