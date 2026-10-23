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

## Roadmap

Stage 2 is a live mode: point tokenwalk at a running Ollama or llama.cpp server, send the same request for real, and lay the measured load, prefill and per-token times over the model's predictions.

## License

MIT
