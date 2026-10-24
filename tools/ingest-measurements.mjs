// Pulls the measurement issues a maintainer labelled "accepted", validates them again and writes data/measurements.json
// (one record per issue, sorted by issue number, the issue URL as provenance). Node built-ins only.
//   node tools/ingest-measurements.mjs                    GitHub REST API; token from GITHUB_TOKEN, else `gh auth token`
//   node tools/ingest-measurements.mjs --from issues.json  offline, from a saved list of issues (REST shape)
//   options: --repo owner/name (default yago-mendoza/tokenwalk)  --out data/measurements.json  --dry (print, do not write)
// Records already in the file whose issue is no longer accepted are dropped: the label is the source of truth.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { recordFromIssue, mergeRecords } from './measurement.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REPO = arg('--repo', 'yago-mendoza/tokenwalk'), OUT = arg('--out', 'data/measurements.json'), FROM = arg('--from', null), DRY = process.argv.includes('--dry');

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; }
}
async function fetchAccepted() {
  const tk = token(), out = [];
  for (let page = 1; page < 50; page++) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues?labels=measurement,accepted&state=all&per_page=100&page=${page}`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) } });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}: ${await r.text()}`);
    const list = await r.json(); out.push(...list); if (list.length < 100) break;
  }
  return out;
}

/** The new file contents from the accepted issues, and what was skipped and why. */
export function ingest(issues, old) {
  const accepted = issues.filter(i => !i.pull_request && (i.labels || []).some(l => (l.name || l) === 'accepted') && (i.labels || []).some(l => (l.name || l) === 'measurement'));
  const fresh = [], skipped = [];
  for (const i of accepted) { const { record, errors } = recordFromIssue(i); if (record) fresh.push(record); else skipped.push({ issue: i.number, errors }); }
  const keep = new Set(accepted.map(i => i.number));
  const measurements = mergeRecords((old && old.measurements || []).filter(r => keep.has(r.issue)), fresh);
  return { file: { schema: 'tokenwalk-measurements/1', note: (old && old.note) || 'Accepted measurements, written by tools/ingest-measurements.mjs from GitHub issues labelled accepted. Do not edit by hand.', measurements }, skipped };
}

async function main() {
  const issues = FROM ? JSON.parse(fs.readFileSync(FROM, 'utf8')) : await fetchAccepted();
  let old = null; try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  const { file, skipped } = ingest(issues, old);
  for (const s of skipped) console.warn(`skipped #${s.issue}: ${s.errors.join('; ')}`);
  const text = JSON.stringify(file, null, 2) + '\n';
  if (DRY) { process.stdout.write(text); return; }
  fs.writeFileSync(OUT, text);
  console.log(`${OUT}: ${file.measurements.length} measurements${skipped.length ? `, ${skipped.length} skipped` : ''}. Rebuild (npm run build) to embed them.`);
}
if ((process.argv[1] || '').endsWith('ingest-measurements.mjs')) await main();
