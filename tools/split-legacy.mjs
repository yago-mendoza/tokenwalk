// One-time port (re-runnable): splits the single-file console from infraphysics into this repo.
// node tools/split-legacy.mjs <path to simulator.html>
// Writes index.html (the markup), src/styles.css and src/parts/NN-name.ts, one file per group of sections.
// The parts are classic scripts sharing one scope, in order; vite.config.ts joins them into one inline script.
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/split-legacy.mjs <simulator.html>'); process.exit(1); }
const html = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');

const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>')).replace(/^\n/, '');
const bodyOpen = html.indexOf('<body');
const scriptOpen = html.lastIndexOf('<script>');
const markup = html.slice(bodyOpen, scriptOpen).replace(/\s+$/, '\n');
const head = html.slice(0, html.indexOf('<style>'));
let js = html.slice(scriptOpen + 8, html.lastIndexOf('</script>')).replace(/^\n/, '');

// The console lives outside infraphysics now: site-relative links become absolute.
js = js.replace(/href="\/wiki\//g, 'href="https://infraphysics.net/wiki/');
js = js.replace('// ===== Presets and formulas: copied from src/figures/_llm/data.js, which is the source. The two must match. =====', '// ===== Presets and formulas (mirrored in infraphysics src/figures/_llm/data.js, which the article figures use) =====');

// Groups: [file, title of the section that starts it]. Every section until the next group's start belongs to it.
const GROUPS = [
  ['00-icons', 'Icons'],
  ['01-data', 'Presets and formulas'],
  ['02-i18n', 'Language'],
  ['03-state', 'State and url'],
  ['04-cost-model', 'One request, computed'],
  ['05-sampling', 'Tokens, logits and sampling'],
  ['06-playback', 'Playback'],
  ['07-history', 'Event log at every scale'],
  ['08-draw', 'Drawing kit'],
  ['09-entities', 'Where each thing lives'],
  ['10-view-system', 'System lens'],
  ['11-zoom', 'Zoom by levels'],
  ['12-view-model-grid', 'Model as a grid'],
  ['13-view-memory', 'Memory view'],
  ['14-inspector', 'Inspector: what a thing is'],
  ['15-alerts', 'Alerts'],
  ['16-view-tokens', 'Tokens lens'],
  ['17-timeline', 'Timeline at the chosen scale'],
  ['18-monitor', 'Monitor: KPIs'],
  ['19-run', 'Run: clock'],
  ['20-configure', 'Configure: scenarios'],
  ['21-context-output', 'Input on the left'],
  ['22-loadout', 'Loadout: machines'],
  ['23-glossary', 'Inspector extras'],
  ['24-wiring', 'Wiring'],
];
// Type annotations the original JavaScript cannot carry, applied on every split so the port stays re-runnable.
const TYPE_PATCHES = [
  ['02-i18n', 'const $ = id => document.getElementById(id);', 'const $ = (id: string): any => document.getElementById(id);'],
  ['03-state', 'const UI = {', 'const UI: UIState = {'],
  ['06-playback', 'const P = { t: 0, on: false, anim: null };', 'const P: { t: number; on: boolean; anim: any } = { t: 0, on: false, anim: null };'],
  ['06-playback', 'const JUMPS = [', 'const JUMPS: any[] = ['],
  ['04-cost-model', 'set = new Set();', 'set = new Set<number>();'],
  ['05-sampling', 'list.push({ w, l });', 'list.push({ w, l, script: false });'],
  ['08-draw', 'const TILES = {', 'const TILES: Record<string, any> = {'],
  ['09-entities', 'const bt = (k, label, ic, here) =>', 'const bt = (k: string, label: string, ic: string, here?: boolean) =>'],
  ['09-entities', 'const WIKI_NAME = {', 'const WIKI_NAME: Record<string, [string, string]> = {'],
  ['14-inspector', 'function select(sel, inline) {', 'function select(sel, inline?) {'],
  ['20-configure', 'function changed(keepTime) {', 'function changed(keepTime?) {'],
];
// Parts not yet checked by tsc (DOM-heavy UI drawing and wiring); every other part is type-checked.
const UNCHECKED = ['10-view-system', '11-zoom', '14-inspector', '12-view-model-grid', '13-view-memory', '15-alerts', '16-view-tokens', '17-timeline', '18-monitor', '20-configure', '22-loadout', '23-glossary', '24-wiring'];
const lines = js.split('\n');
const starts = GROUPS.map(([file, title]) => {
  const i = lines.findIndex(l => l.startsWith('// ===== ' + title));
  if (i < 0) throw new Error('section not found: ' + title);
  return [file, i];
});
const preamble = lines.slice(0, starts[0][1]).join('\n').trim();
const partsDir = path.join(root, 'src', 'parts');
fs.rmSync(partsDir, { recursive: true, force: true });
fs.mkdirSync(partsDir, { recursive: true });
starts.forEach(([file, i], k) => {
  const end = k + 1 < starts.length ? starts[k + 1][1] : lines.length;
  let body = lines.slice(i, end).join('\n').replace(/\s+$/, '') + '\n';
  if (k === 0 && preamble) body = preamble + '\n' + body;
  for (const [f, from, to] of TYPE_PATCHES) if (f === file) {
    if (!body.includes(from)) throw new Error(`type patch no longer applies in ${file}: ${from.slice(0, 60)}`);
    body = body.replace(from, to);
  }
  if (UNCHECKED.includes(file)) body = '// @ts-nocheck: DOM-heavy UI, to be typed in a later pass\n' + body;
  fs.writeFileSync(path.join(partsDir, file + '.ts'), body);
});
fs.writeFileSync(path.join(root, 'src', 'styles.css'), css);
const title = (head.match(/<title>([^<]*)<\/title>/) || [])[1] || 'tokenwalk';
const desc = (head.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
fs.writeFileSync(path.join(root, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<!-- tokenwalk:style -->
</head>
${markup}<!-- tokenwalk:script -->
</body>
</html>
`);
console.log(`split ${lines.length} script lines into ${starts.length} parts, ${css.split('\n').length} css lines`);
