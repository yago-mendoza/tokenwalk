Recorded server responses for the live-mode unit tests.

- `ollama-*.json`, `ollama-generate-*.ndjson`: captured on 2026-10-23 from Ollama 0.40.7 on the ThinkPad (Radeon 860M, 64 GB), models `qwen3.6:35b-a3b` and `qwen3.8:27b`. `ollama-generate-stream.ndjson` is a cold run (model loaded by the request), `ollama-generate-warm.ndjson` the same model already loaded. `ollama-generate-arrivals-ms.json` holds the client-side arrival time of each streamed line of the cold run.
- `llama-completion-stream.txt`: llama-server was not installed when these were recorded, so this is a hand-written stream in the documented shape (server-sent events, the last event with `stop: true` and `timings`, field names from llama.cpp's tools/server README), with the numbers of the warm Ollama run.
