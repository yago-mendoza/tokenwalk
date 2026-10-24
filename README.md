<p align="center"><a href="https://infraphysics.net/playgrounds/7148293/tokenwalk"><img src="docs/assets/tokenwalk-banner.svg" width="760" alt="tokenwalk"></a></p>

<p align="center">
  Watch one LLM request walk through a local machine.<br>
  Where every byte lives, what each layer reads, how the KV cache fills, and why the first word takes a minute.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-blue" alt="Code: MIT"></a>
  <img src="https://img.shields.io/badge/runtime%20deps-none-brightgreen" alt="No runtime dependencies">
  <img src="https://img.shields.io/badge/live-Ollama%20%C2%B7%20llama.cpp-red" alt="Live mode: Ollama and llama.cpp">
</p>

<p align="center">
  <a href="https://infraphysics.net/playgrounds/7148293/tokenwalk"><img src="https://img.shields.io/badge/%E2%96%B6%20Open%20tokenwalk-infraphysics.net-ffd43b?style=for-the-badge&labelColor=101016" alt="Open tokenwalk online" height="34"></a>
</p>

<p align="center">
  <b>A project of <a href="https://infraphysics.net">InfraPhysics</a>.</b>
  Try it live at <a href="https://infraphysics.net/playgrounds/7148293/tokenwalk"><b>infraphysics.net/playgrounds/7148293/tokenwalk</b></a><br>
  How it is built: <a href="https://infraphysics.net/lab/projects/llm-inference-console">the project page</a> ·
  the ideas, one at a time: <a href="https://infraphysics.net/blog/bits2bricks/transformers-and-local-inference-from-zero">the article</a>
</p>

---

You pick a machine, a model and a prompt; tokenwalk plays the request pass by pass. Connect it to your own Ollama or llama.cpp and it runs the same request for real, next to its estimate (see [Connecting a real server](#connecting-a-real-server)).

[![tokenwalk: the model as a grid of tokens across and layers up, mid-way through writing the answer](docs/screenshot.png)](https://infraphysics.net/playgrounds/7148293/tokenwalk)

<p align="center"><a href="https://infraphysics.net/playgrounds/7148293/tokenwalk"><b>Open it in the browser</b></a>: nothing to install, it runs in the page.</p>

## A tour

One screen, four zones that never scroll: **Setup** on the left, the **Observatory** in the middle, **Monitor** on the right and **Playback** along the bottom. The numbers on the zone headers are the order to read them in the first time. The full walkthrough is on the [project page](https://infraphysics.net/lab/projects/llm-inference-console).

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/system-prefill.webp" width="900" alt="The whole console during prefill"><br><sub>During prefill. The setup is locked while a run plays; only sampling stays live.</sub></p>

### Setup

The machine, the model and its quantization, the request in tokens, the engine (`num_ctx`, KV type, `keep_alive`), sampling, and caches and speculation; above them, the context window and how it is shared. Scenarios set everything in one click (the default machine, a dense 27B, an RTX 5090, a model that does not fit, a 128k context, a cold start). A setup that cannot run says so before you press play, and offers fixes that do fit.

**What fits** runs the current request (prompt, answer length, `num_ctx`, KV type, sampling, MTP) on every machine preset, model and quantization in one table: memory needed against what the machine has, whether it fits (yes, tight, no), time to the first token, tokens a second and the bottleneck, fitting rows first. Sort by any column, filter by machine or to what fits; a row loads that machine, model and quantization into Setup (Undo takes it back). In Real machine a row sets only *Estimate as*. The header's ↺ restores the defaults (the reference machine and the default request) after asking; in Real machine it restores only the request and sampling.

The address always holds the current setup, and the link button in the top bar copies it: machine (or its edited fields), model, quantization, the request, engine, sampling, caches and MTP, the view, and optionally the current moment. Short keys, only what differs from the defaults; older links still open, and a shared link always opens in Simulated.

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/loadout-problem.webp" width="900" alt="A setup that does not fit, with fixes"><br><sub>A setup that cannot run says so before you press play, with one-click fixes.</sub></p>

### Observatory: four views of the same instant

- **System**: the board to scale: memory chips and their cells, the SSD, the CPU, NPU and the GPU's compute units, and the bytes moving over the bus.
- **Model**: a grid with tokens across and layers up, where attention rows keep their keys and values and DeltaNet rows fold everything into one fixed state; or one layer's matrices to scale, with its operations in order and the experts this token woke.
- **Memory**: the whole RAM with every part named, then the KV cache as a grid, then a magnifier on single tokens.
- **Tokens**: the prompt as it is read, the answer as it is written, and for any word, how it was chosen.

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/model-grid.webp" width="900" alt="The Model view as a grid during decode"><br><sub>The grid during decode: the KV cache is the left side of every attention row.</sub></p>

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/model-matrices.webp" width="900" alt="The matrices of one layer to scale"><br><sub>One layer: what it reads, in what order, and which experts this token woke.</sub></p>

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/memory.webp" width="900" alt="The Memory view"><br><sub>From 64 GB down to one token, in three steps on one screen.</sub></p>

### Monitor

Time to the first token, writing speed, memory against what the machine has, and the bottleneck right now; alerts with a severity column, worst first; and trends over the whole run.

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/monitor.webp" width="900" alt="Monitor during decode"><br><sub>Monitor during decode.</sub></p>

### Down to one number

Every size on screen is a count times the size below it. Click a matrix and it opens to scale; click a row and it becomes a dot product; click a weight and you see its bits. Each close-up ends with the chain: one weight, one row, the matrix, the layer, the model.

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/zoom-bits.webp" width="900" alt="One weight and its bits"><br><sub>One weight, and the chain of multiplications that builds every size from it.</sub></p>

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/zoom-row.webp" width="900" alt="The dot product of one row"><br><sub>One row of one matrix: what every weight costs, and why decode waits on memory.</sub></p>

### Everything opens an explainer

Hover names a thing; a click explains it: what it is, why it matters, what changes it, its live values, where to see it in another view, where to change it, and the wiki notes behind it. A written token opens its sampling chain: softmax, temperature, top-k, top-p.

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/explainer.webp" width="900" alt="The KV cache explainer"><br><sub>The KV cache explainer: live values, the idea, and the links out.</sub></p>

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/tokens-chain.webp" width="900" alt="The sampling chain of one token"><br><sub>How one word was chosen, stage by stage.</sub></p>

### A real run next to the estimate

Switch to **Real machine** and the same request goes to your Ollama or llama.cpp; the views follow it as the tokens arrive, and the measured numbers sit beside the estimate, with a button that calibrates one to the other. Setup is below, in [Connecting a real server](#connecting-a-real-server).

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/live-connected.webp" width="900" alt="Connected to a local Ollama"><br><sub>Connected to a local Ollama.</sub></p>

<p align="center"><img src="https://cdn.infraphysics.net/articles/6290417/figures/live-measured.webp" width="900" alt="Estimate against measurement after a real run"><br><sub>After a real run: the estimate, the measurement, and the button that calibrates one to the other.</sub></p>


## Running it

To just use it, open **[infraphysics.net/playgrounds/7148293/tokenwalk](https://infraphysics.net/playgrounds/7148293/tokenwalk)**. To work on it locally:

```bash
npm i
npm run dev        # http://localhost:5173
npm run build      # dist/index.html and dist/tokenwalk.html, one self-contained file each
npm test           # unit tests of the cost model, then browser checks (needs Chrome; set CHROME if it is not in the default place)
```

There is no framework and nothing at runtime: one HTML page, a canvas, and about 3,200 lines of script. The source is split into ordered parts in `src/parts/` that share one scope, the way the original single file did; `vite.config.ts` joins them, strips the types and inlines everything into the page.

## Measured, estimated, made up

Nothing here runs a neural network. tokenwalk is a cost model, and it is honest about which of its numbers are which:

- **Calibrated.** The default machine, *ThinkPad · Radeon 860M* (a ThinkPad with a Radeon 860M iGPU, 64 GB of shared LPDDR5X, Qwen3.6 35B-A3B at Q4_K_M under Ollama) is fitted to measured runs: about 76 s to the first token for a 6,500-token prompt, then about 12 tokens a second without MTP drafting (see [Connecting a real server](#connecting-a-real-server) for what drafting changes).
- **Read from the files.** Layer counts, heads, experts and which layers keep KV come from the GGUF headers.
- **Estimated.** Every other machine is the same formulas with that machine's bandwidth and compute; the console marks them as estimates.
- **Illustrative.** The answer text, the logits and the values inside a row of weights are made up. Their sizes are not.

## The cost model

```
KV per token      = 2 × attention layers × KV heads × head size × bytes per number          (20,480 B for Qwen3.6 at f16)
decode, s/token   = (weights read per token + KV so far) / effective bandwidth + per-layer overhead
prefill, s/chunk  = max(weights read for the chunk / bandwidth, 2 × active params × 512 / FLOPS) + attention + overhead
experts woken     = E × (1 − (1 − k/E)^n)     for n tokens in a pass, each picking k of E experts
```

Writing is bound by memory: every token re-reads all its active weights for about two operations per byte. Reading the prompt is bound by arithmetic: one read of the weights serves a whole chunk of 512 tokens. Almost everything else in the console is those two facts seen from different angles.

## Layout

```
index.html            the markup
src/styles.css        the look
src/parts/00-*.ts …   the script, in order: data and formulas, language, state, the request computed,
                      sampling, playback, history, drawing kit, entities, the four views, zoom,
                      explainers, alerts, timeline, monitor, run, configure, loadout, glossary, wiring,
                      the real-server connection and the Simulated / Real machine mode
src/globals.d.ts      types shared by the parts
tests/unit/           the cost model in node, no browser
tests/browser/        a small CDP client and the regression checks (overflow, zoom, fit, sampling, links)
tools/                split-legacy.mjs (the port from the original single file), single-file.mjs
```

The data, language, state, cost model, sampling, playback, history, drawing and entity parts are type-checked; the DOM-heavy UI parts still carry `@ts-nocheck` and are next to type.

## Connecting a real server

tokenwalk can send a request to a real server on your machine and put the measured numbers next to its estimate. It is optional: without a server everything is simulated.

### 1. Start the server

A browser page can only talk to a local server that allows the page's **origin** (the scheme, host and port it was loaded from). What you need depends on how you opened tokenwalk:

| How you opened tokenwalk | Its origin | Ollama, out of the box | What to do |
|---|---|---|---|
| `npm run dev` | `http://localhost:5173` | allowed | nothing |
| `npm run preview` | `http://localhost:4173` | allowed | nothing |
| `dist/tokenwalk.html` opened from disk | `null` | refused | serve it (`npm run preview`), or allow every origin (below) |
| [infraphysics.net/…/tokenwalk](https://infraphysics.net/playgrounds/7148293/tokenwalk) | `https://infraphysics.net` | refused | allow it (below) |

(Checked against Ollama 0.40.7: any `localhost` or `127.0.0.1` port is accepted; `null` and other sites get 403.)

**Ollama.** Set `OLLAMA_ORIGINS` to the origin and restart Ollama. Several origins can be comma-separated; `*` allows any page, which also lets any website you visit talk to your Ollama, so prefer the exact origin.

Windows (PowerShell or cmd), then quit Ollama from the tray icon and open it again:

```bat
setx OLLAMA_ORIGINS "https://infraphysics.net"
```

macOS (the app), then quit and reopen Ollama:

```bash
launchctl setenv OLLAMA_ORIGINS "https://infraphysics.net"
```

Linux (systemd service):

```bash
sudo systemctl edit ollama.service
# add under [Service]:
#   Environment="OLLAMA_ORIGINS=https://infraphysics.net"
sudo systemctl restart ollama
```

Or for one session in a terminal: `OLLAMA_ORIGINS=https://infraphysics.net ollama serve`.

**llama.cpp.** `llama-server` allows every origin by default (`--cors-origins *`). Give it the port tokenwalk expects, since recent builds default to 9931:

```bash
llama-server -m model.gguf --host 127.0.0.1 --port 8080
# to restrict it: --cors-origins https://infraphysics.net   (or: --cors-origins localhost)
```

### 2. Check the origin

```bash
# 204 means the origin is allowed; 403 means it is not (set OLLAMA_ORIGINS and restart)
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS http://localhost:11434/api/tags -H "Origin: https://infraphysics.net" -H "Access-Control-Request-Method: GET"
curl http://localhost:11434/api/version        # Ollama answers {"version": ...}
curl http://localhost:8080/props               # llama-server answers with its settings
```

### 3. Send a request

Open [tokenwalk online](https://infraphysics.net/playgrounds/7148293/tokenwalk) (or your local `npm run dev`) and switch to **Real machine** at the top.

The top bar has a switch, left of the setup line: **Simulated | Real machine**. The console is in one mode at a time.

- **Simulated** (yellow): every number comes from the cost model, and the request plays at any speed, pauses, steps and jumps.
- **Real machine** (cyan, a laptop icon with a soft glow; its tooltip names the server, the address and the model): the console is a window on the server. The setup line reads *this machine (real) / server model and quantization / prompt + max tokens / num_ctx*, which is exactly what is sent.

Switching to Real machine with no server connected opens the connect window, with the address (`http://localhost:11434` for Ollama, `http://localhost:8080` for llama-server), **Connect**, and the setup steps with copy buttons. It names every state: not connected, connecting, blocked by CORS (with the fix), nothing answered. When the server answers the console enters Real; if it fails, or you close the window, the simulation stays as it was. Once connected the window says **Connected**, with the model picker, **Change server** and **Disconnect**; none of them can be used while a request runs, and they say why.

In Real machine:

- **Setup** shows only what applies to the server. *Request to the server*: the model (the server's list), the prompt (short question, a long history or your own text), max tokens, and MTP drafts when it is Ollama. *Engine*: num_ctx and keep_alive. *Sampling*: temperature, top-k, top-p, seed. *This machine* shows the server version and address, and **Estimate as**, the machine preset the estimate is drawn on. The simulation-only sections (request token sliders, KV type, KV to disk, cold start, a separate draft model, scenarios) are hidden.
- **Request** (the Playback zone) has **Send** and **Stop**. Speed, jumps, steps, pause-after and the timeline scale are greyed: a real server cannot be slowed, paused or stepped. The timeline draws the run as it arrives (load, prefill, decode with a tick for each token) on a real-time axis and keeps it as the record of that run; the clock shows its wall time.
- **Observatory:** Tokens shows the real answer with each token's arrival time; click one to see what the server chose it from (Ollama `logprobs`, llama-server `n_probs`), when the server sends that. System, Model and Memory draw the cost model's estimate for the server's model on the Estimate as machine, tagged **estimate**.
- **Monitor:** *Estimate vs measured* comes first: load, time to first token, prefill and decode speed, total, with the ratio. **Calibrate the estimate to this machine** fits the preset's effective bandwidth (from decode, with MTP drafting taken out first) and compute (from prefill, if the prompt has 256 tokens or more); kept per machine in your browser, with Reset.

Switching back to Simulated restores the simulation exactly; the two keep separate settings and both are saved. If a real request is running, it asks first (*Keep running* is the default). While in Real the page checks the server every 10 s; if it is gone a banner says **Lost the server at …** with **Retry** and **Back to simulation**. On the next visit the console resumes Real only when the server answers within about 1.5 s; otherwise it starts in the simulation, with no connected look.

What is sent: num_ctx, temperature, top_p, top_k, seed, keep_alive and MTP drafting (`draft_num_predict`) for Ollama; the sampling settings and `cache_prompt` for llama-server. The connect window lists the exact options of each request, and the settings that are sent are marked *sent* in Setup.

### MTP drafting

Both Qwen models carry one extra *next-n* block (`nextn_predict_layers: 1` in the GGUF) trained to guess the tokens after the next one, and Ollama uses it by default as a built-in draft (`draft_num_predict 2`): the block guesses two tokens, one pass of the full model checks them, and the ones that match are kept. Measured on the default machine (qwen3.6:35b-a3b, Ollama 0.40.7, 96-token answers):

| | tok/s | vs. no drafting |
|---|---|---|
| Drafting off (`draft_num_predict 0`) | 13.2 | |
| Drafting on, temperature 0, long prompt | 15.6 | ×1.18 |
| Drafting on, temperature 0.7 | 11.5 and 10.6 | ×0.87, ×0.80 |

A guess costs a read of one block plus the output head (0.35 GB, about a fifth of a full pass), so drafting pays only when most guesses survive: it helps greedy, predictable text and costs time when sampling freely. tokenwalk models it as speculative rounds with an acceptance rate fitted to these runs (0.55 at temperature 0, 0.25 at 0.7): for the default request, 12.1 tok/s without drafting, 10.2 with it at temperature 0.7, 14.4 at 0. Switch it under *Caches and speculation*. A side effect worth knowing: with drafting on, Ollama 0.40.7 returns `logprobs` for only a few tokens (2 of 16 in a test, 16 of 16 with drafting off).

### Troubleshooting

- **"Blocked by CORS"**: the server is running but refuses this page's origin. Set `OLLAMA_ORIGINS` as above and restart Ollama completely (the tray app, not just a terminal).
- **"Nothing answered"**: nothing answers at that address. Start Ollama (`ollama serve`) or llama-server, and check the port.
- **The browser asks about local network access**: allow it; a public page reaching `localhost` needs that permission in recent Chrome.
- **The first run is slow**: the server loads the model from disk first (Load in the table); the next run is warm until keep_alive runs out.

### Limits

Everything inside a pass: which layer, which matrix, the KV cache filling, the sampling chain of a simulated token. A server reports totals and the tokens it sent, not what happens per layer; the real run gives the console real totals to hold the estimate against.

Tests: `npm test` runs the cost-model, MTP and live-parsing unit tests (on responses recorded from Ollama, in `tests/fixtures/`) and the browser checks, which include live mode against a mocked server. `npm run test:live` runs one real request against a local Ollama and skips when none answers.

## License

[MIT](LICENSE), © 2026 Yago Mendoza. Use it, change it, ship it, commercially or not; keep the copyright notice and the license text with any copy or substantial part of it. It comes with no warranty.

- **Code**: everything in this repository, including the single-file build in `dist/`.
- **Logo and banner** (`docs/assets/`): under the same license; please do not use them to suggest that a fork or another product is the original tokenwalk.
- **Measurements**: the timings, acceptance rates and recorded server responses in `tests/fixtures/` were measured on the default machine and are shared as they are; cite tokenwalk or the [InfraPhysics article](https://infraphysics.net/blog/bits2bricks/transformers-and-local-inference-from-zero) if you reuse them.
- **Third-party names**: Qwen, Ollama, llama.cpp, AMD Radeon, ThinkPad and the other product and model names belong to their owners and appear only to describe what the console models; tokenwalk is not affiliated with or endorsed by any of them. No model weights are included or downloaded by this repository.
- **No runtime dependencies**: the build bundles no third-party code, so there are no other licenses to carry.
