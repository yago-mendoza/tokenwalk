# tokenwalk

Watch one LLM request walk through a local machine. You pick a machine, a model and a prompt; tokenwalk plays the request pass by pass and shows where every byte lives, what each layer reads, how the KV cache fills, and why the first word takes a minute while the rest come at twelve a second.

![tokenwalk: the model as a grid of tokens across and layers up, mid-way through writing the answer](docs/screenshot.png)

It runs live at [infraphysics.net/playgrounds/7148293/simulator](https://infraphysics.net/playgrounds/7148293/simulator). The ideas behind it are explained slowly, one at a time, in [Transformers and local inference](https://infraphysics.net/blog/bits2bricks/transformers-and-local-inference-from-zero).

## Run it

```bash
npm i
npm run dev        # http://localhost:5173
npm run build      # dist/index.html and dist/tokenwalk.html, one self-contained file each
npm test           # unit tests of the cost model, then browser checks (needs Chrome; set CHROME if it is not in the default place)
```

There is no framework and nothing at runtime: one HTML page, a canvas, and about 3,200 lines of script. The source is split into ordered parts in `src/parts/` that share one scope, the way the original single file did; `vite.config.ts` joins them, strips the types and inlines everything into the page.

## What is real and what is a model

Nothing here runs a neural network. tokenwalk is a cost model, and it is honest about which of its numbers are which:

- **Calibrated.** The laptop preset (a ThinkPad with a Radeon 860M iGPU, 64 GB of shared LPDDR5X, Qwen3.6 35B-A3B at Q4_K_M under Ollama) is fitted to five measured runs: about 76 s to the first token for a 6,500-token prompt, then about 12 tokens a second.
- **Read from the files.** Layer counts, heads, experts and which layers keep KV come from the GGUF headers.
- **Estimated.** Every other machine is the same formulas with that machine's bandwidth and compute; the console marks them as estimates.
- **Illustrative.** The answer text, the logits and the values inside a row of weights are made up. Their sizes are not.

## The cost model in four lines

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
                      explainers, alerts, timeline, monitor, run, configure, loadout, glossary, wiring
src/globals.d.ts      types shared by the parts
tests/unit/           the cost model in node, no browser
tests/browser/        a small CDP client and the regression checks (overflow, zoom, fit, sampling, links)
tools/                split-legacy.mjs (the port from the original single file), single-file.mjs
```

The data, language, state, cost model, sampling, playback, history, drawing and entity parts are type-checked; the DOM-heavy UI parts still carry `@ts-nocheck` and are next to type.

## Live mode

Open **Live: a real server** in Configure, point it at a local server and press **Detect**. tokenwalk lists its models; **Draw this model in the console** reads the model's real header and draws it in every view; **Run live** sends one real request and streams the answer into Output, marked *live*.

Monitor then shows **Estimate vs measured** for that same request: load, time to first token, prefill and decode speed, total, and the ratio. **Calibrate this machine to the run** scales the machine preset's effective bandwidth (fitted to the measured decode) and compute (fitted to the measured prefill, only from a prompt of 256 tokens or more) so the simulator matches your hardware; the factors are kept per machine in the browser and can be reset. The measured time of every token is drawn as cyan dots over *Time / token* in Over the run.

On the article's laptop (Radeon 860M, 64 GB, Ollama 0.40.7, `qwen3.6:35b-a3b`, a 3,510-token prompt):

| | Estimate | Measured |
|---|---|---|
| Load | 54 s | 26–31 s |
| Prefill | 89 tok/s | 124–130 tok/s |
| Decode | 12 tok/s | 17.5–18 tok/s |

**Ollama** (`http://localhost:11434`): uses `/api/version`, `/api/tags`, `/api/show` and streamed `/api/generate`; timings come from the final message (`load_duration`, `prompt_eval_count`, `prompt_eval_duration`, `eval_count`, `eval_duration`, `total_duration`, in nanoseconds). Ollama accepts pages served from localhost out of the box. From any other origin (the copy on infraphysics.net, for example) the browser is refused until you allow it and restart Ollama:

```
# Windows (then quit Ollama from the tray and open it again)
setx OLLAMA_ORIGINS "https://infraphysics.net"
# macOS
launchctl setenv OLLAMA_ORIGINS "https://infraphysics.net"
# Linux (systemd): Environment="OLLAMA_ORIGINS=https://infraphysics.net" in the ollama service
```

tokenwalk tells a refused origin from a server that is not running and shows the exact fix. Your browser may also ask to let the page reach devices on your local network.

**llama.cpp** (`llama-server --host 127.0.0.1 --port 8080 -m model.gguf`, address `http://localhost:8080`): uses `/props`, `/v1/models` and streamed `/completion`; timings come from the last event (`prompt_n`, `prompt_ms`, `predicted_n`, `predicted_ms`). Its CORS default (`--cors-origins *`) lets any page in. It reports no load time, and its model header gives only totals, so the drawn model is an approximation (dense, every layer attention).

**What stays simulated:** everything inside a pass (which layer, which matrix, the KV cache filling, the logits and the sampling chain). A server reports totals, not what happens per layer; the live run gives the console real totals to be held against.

Tests: `npm test` runs the cost-model and live-parsing unit tests (on responses recorded from Ollama, in `tests/fixtures/`) and the browser checks, which include live mode against a mocked server. `npm run test:live` runs one real request against a local Ollama and skips when none answers.

## Roadmap

Typing the UI parts and turning the ordered parts into ES modules.

## License

MIT
