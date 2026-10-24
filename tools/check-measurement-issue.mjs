// Run by .github/workflows/measurement.yml when an issue labelled "measurement" is opened or edited: validates the
// JSON in it, comments a short summary, and labels it "valid" or "invalid". Node built-ins only (fetch).
// Locally, without GitHub: node tools/check-measurement-issue.mjs --body file.md   (prints the comment, changes nothing)
import fs from 'node:fs';
import { readSubmission, validateMeasurement, summarize } from './measurement.mjs';

const MARK = '<!-- tokenwalk-measurement-check -->';

export function checkBody(body, date) {
  const { m: json, from, error } = readSubmission(body, date);
  if (!json) return { ok: false, comment: `${MARK}\n**Invalid measurement.** ${error}.\n\nPaste the JSON from tokenwalk's *Share this measurement* window into the Measurement field.` };
  const v = validateMeasurement(json);
  const lines = [MARK, v.ok ? '**Valid measurement.** A maintainer will review it; once labelled `accepted` it is added to `data/measurements.json` and shows in *What fits*.' : '**Invalid measurement.** Fix the points below by editing the issue; it is checked again on every edit.', ''];
  if (v.ok) lines.push(`> ${summarize(json)}`, ...(from === 'ollama' || from === 'llama' ? ['', `Read from a raw ${from === 'ollama' ? 'Ollama' : 'llama-server'} response; only its timings and counts are kept.`] : []), '');
  if (v.errors.length) lines.push('Problems:', ...v.errors.map(e => `- ${e}`), '');
  if (v.warnings.length) lines.push('Worth a look:', ...v.warnings.map(w => `- ${w}`), '');
  return { ok: v.ok, comment: lines.join('\n').trim() };
}

async function gh(method, path, body) {
  const r = await fetch(`https://api.github.com${path}`, { method, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok && r.status !== 404) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 || r.status === 404 ? null : r.json();
}

async function main() {
  const i = process.argv.indexOf('--body');
  if (i > 0) { const res = checkBody(fs.readFileSync(process.argv[i + 1], 'utf8')); console.log(res.comment); process.exit(res.ok ? 0 : 1); }
  const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), issue = ev.issue, repo = ev.repository.full_name;
  if (!issue.labels.some(l => l.name === 'measurement')) return;
  const res = checkBody(issue.body, String(issue.created_at || '').slice(0, 10) || undefined), base = `/repos/${repo}/issues/${issue.number}`;
  // An edit by the submitter after acceptance needs a fresh review: the accepted label goes until a maintainer adds it again.
  let note = '';
  if (ev.action === 'edited' && issue.labels.some(l => l.name === 'accepted') && ev.sender && ev.sender.login === issue.user.login) {
    await gh('DELETE', `${base}/labels/accepted`); note = '\n\n_Edited after it was accepted: the `accepted` label was removed until a maintainer reviews it again._';
  }
  // one bot comment per issue, updated on every edit
  const comments = await gh('GET', `${base}/comments?per_page=100`) || [];
  const mine = comments.find(c => c.body && c.body.startsWith(MARK));
  if (mine) await gh('PATCH', `/repos/${repo}/issues/comments/${mine.id}`, { body: res.comment + note });
  else await gh('POST', `${base}/comments`, { body: res.comment + note });
  await gh('DELETE', `${base}/labels/${res.ok ? 'invalid' : 'valid'}`);
  await gh('POST', `${base}/labels`, { labels: [res.ok ? 'valid' : 'invalid'] });
  console.log(`#${issue.number}: ${res.ok ? 'valid' : 'invalid'}`);
}
if ((process.argv[1] || '').endsWith('check-measurement-issue.mjs')) await main();
