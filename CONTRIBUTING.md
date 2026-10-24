# Contributing

Thank you for helping. There are two ways in, and they do not mix.

## Measurements: the issue form only

Numbers from your hardware come in through the [measurement issue form](https://github.com/yago-mendoza/tokenwalk/issues/new?template=measurement.yml), never as a pull request. No fork, no clone, nothing to install: open tokenwalk, switch to **Real machine**, send a request, press **Share this measurement**. Without the web app, run the command in the README ([Share without the web app](README.md#share-without-the-web-app)) and paste its response into the form.

How a measurement is reviewed:

1. A workflow checks the JSON on every new or edited measurement issue (schema, counts against the server's own, durations positive and adding up, speeds in range, no prompt or address), comments a summary and labels it `valid` or `invalid`.
2. A maintainer reads the `valid` ones: plausible hardware, an explanation for a large gap to the estimate. Then it gets `accepted`, or is closed with a note. Nothing is accepted automatically.
3. Accepted issues are ingested into `data/measurements.json` (`node tools/ingest-measurements.mjs`, or the *Ingest measurements* workflow) and show in *What fits* from the next build. An edit by the submitter after acceptance removes `accepted` until it is reviewed again.

A pull request that edits `data/measurements.json` by hand is closed.

## Code: pull requests

- **One topic per pull request.** A fix, a feature, a refactor: separately.
- **Open an issue first** for anything larger than a fix, so the approach can be agreed before the work.
- **Run the checks:** `npm run typecheck` and `npm test` (unit tests, then browser checks in Chrome; set `CHROME` if it is not in the default place). CI runs the same on every pull request.
- **Keep the shape of the project:** no framework and no runtime dependencies; the parts in `src/parts/` share one scope, and UI parts keep `// @ts-nocheck` on line 1; every label in both languages, `L('en', 'es')`; nothing cut or overflowing at 1280x720 (the overflow checks catch most of it).
- **Numbers say where they come from:** measured, estimated or illustrative, as the rest of the console does.
- **A good pull request** is small, says what and why, shows a screenshot for anything visible, and adds a test for what it fixes.

Workflows never run on `pull_request_target`; a first-time contributor's workflow runs wait for a maintainer's approval.

## Security

Report vulnerabilities privately through [GitHub's security advisories](https://github.com/yago-mendoza/tokenwalk/security/advisories/new), not as an issue.
