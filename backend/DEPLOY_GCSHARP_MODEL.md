# Configuring GCSharp AI Providers

GC Sharp uses **Gemini first** and **OpenRouter as a bounded fallback** for
tutor answers, feed answers, worked solutions, question generation, and
text/PDF-to-video scripts. AI-backed tutor responses use Google Custom Search
when configured and include citations from the evidence actually retrieved.
DuckDuckGo remains a keyless search fallback. The local GCSharp model options
below are retained for a future self-hosted runtime; they are not required for
current generation.

## 1. Configure runtime generation and search

Set at least one generation provider in the backend service environment:

```text
GEMINI_API_KEY=<your Gemini API key>
GEMINI_MODEL=gemini-2.5-flash
OPENROUTER_API_KEY=<your OpenRouter API key>
OPENROUTER_MODEL=<your preferred OpenRouter model id>
OPENROUTER_MODEL_FALLBACKS=<optional,comma-separated model ids>
```

Gemini is tried first, then at most three configured OpenRouter model IDs.
Provide Google Programmable Search credentials to prefer Google evidence:

```text
GOOGLE_SEARCH_API_KEY=<your Google Custom Search API key>
GOOGLE_SEARCH_CX=<your Programmable Search Engine id>
```

When Google returns usable results, no fallback search request is made. If
Google credentials are absent or return no usable results, the service uses
the existing keyless DuckDuckGo fallback. Keep all keys in the deployment
provider's secret environment settings; do not commit them to `.env.example`.

## 2. Optional future self-hosted inference backend

The adapter (`backend/gc_model.py`) supports two inference backends and a
convenience workflow for downloading GGUF weights. These settings are not
needed by the current runtime. If you are preparing a future migration, configure either
`GC_MODEL_URL`, `GC_MODEL_PATH`, or both `GC_MODEL_REPO_ID` and
`GC_MODEL_FILE` in `backend/.env`:

### Option A — OpenAI-compatible server (`GC_MODEL_URL`) — recommended

Run any OpenAI-compatible server and point GC Sharp at it:

```bash
# Ollama (easiest)
ollama pull qwen2.5:7b-instruct       # or your own fine-tuned model
ollama serve                          # listens on http://localhost:11434

# then in backend/.env
GC_MODEL_URL=http://localhost:11434/v1
GC_MODEL_NAME=qwen2.5:7b-instruct
```

```bash
# llama.cpp server
./server -m /models/gcsharp.gguf --port 8080
# GC_MODEL_URL=http://localhost:8080/v1

# vLLM
vllm serve /models/gcsharp --port 8000
# GC_MODEL_URL=http://localhost:8000/v1
```

### Option B — In-process GGUF (`GC_MODEL_PATH`)

Runs the weights inside the FastAPI process via `llama-cpp-python`:

```bash
pip install -r requirements-llm.txt
# backend/.env
GC_MODEL_PATH=/absolute/path/to/gcsharp.gguf
GC_MODEL_CTX=4096
GC_MODEL_N_THREADS=4
```

Note: in-process GGUF loads weights on first use and blocks a worker thread
during generation; the HTTP server option keeps the API more responsive.

### Option C — Download a small GGUF into the backend service

For a no-extra-inference-service trial, the backend can download a public GGUF
file on its first AI request and run it locally. This downloads model weights,
not an inference API: student prompts stay on the GCSharp backend. The model
file is cached under `GC_MODEL_CACHE_DIR` (default: the system temporary
directory), so an ephemeral Render instance may need to download it again after
restarts or replacement.

The following Qwen2.5 0.5B Instruct Q2_K file is about 415 MB and is licensed
under Apache-2.0. It is intentionally tiny for a resource-constrained trial;
its answer quality and speed are not comparable to a larger teacher model.

In the Render service settings:

1. Add `backend/requirements-llm.txt` to the build install command. If the
   service root directory is `backend`, use
   `pip install -r requirements.txt -r requirements-llm.txt`. If the root is
   the repository root, use
   `pip install -r backend/requirements.txt -r backend/requirements-llm.txt`.
2. Set these environment variables:

   ```text
   GC_MODEL_REPO_ID=Qwen/Qwen2.5-0.5B-Instruct-GGUF
   GC_MODEL_FILE=qwen2.5-0.5b-instruct-q2_k.gguf
   GC_MODEL_REVISION=9217f5db79a29953eb74d5343926648285ec7e67
   GC_MODEL_SHA256=9ee36184e616dfc76df4f5dd66f908dbde6979524ae36e6cefb67f532f798cb8
   GC_MODEL_CACHE_DIR=/tmp/gcsharp-models
   GC_MODEL_DOWNLOAD_TIMEOUT=600
   GC_MODEL_CTX=1024
   GC_MODEL_N_THREADS=1
   GC_MODEL_MAX_TOKENS=512
   ```
3. Redeploy, then call `/api/ai/model/status?probe=1`. The first probe downloads
   and loads the model, so it may take several minutes. If Render terminates
   the process for memory use, or the request times out, this instance cannot
   host this model; use a smaller compatible GGUF or a machine with more
   resources. Do not raise Render resources or enable paid services without
   reviewing their cost first.

The model loader verifies `GC_MODEL_SHA256` before loading and writes an
incomplete download to a temporary file so it is not mistaken for a valid
model. `GC_MODEL_PATH`, when set, takes precedence over the download settings.

## 3. Environment variables

| Variable | Meaning | Default |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API key (preferred generation provider) | unset |
| `GEMINI_MODEL` | Gemini model id | `gemini-2.5-flash` |
| `OPENROUTER_API_KEY` | OpenRouter API key (fallback provider) | unset |
| `OPENROUTER_MODEL` | Preferred OpenRouter model id | unset |
| `OPENROUTER_MODEL_FALLBACKS` | Comma-separated fallback model ids | unset |
| `GOOGLE_SEARCH_API_KEY` | Google Custom Search API key | unset |
| `GOOGLE_SEARCH_CX` | Google Programmable Search Engine id | unset |
| `GC_MODEL_URL` | OpenAI-compatible base URL | unset |
| `GC_MODEL_PATH` | Local GGUF weights path | unset |
| `GC_MODEL_REPO_ID` | Hugging Face repository for a public GGUF download | unset |
| `GC_MODEL_FILE` | GGUF filename in that repository | unset |
| `GC_MODEL_REVISION` | Repository branch or pinned revision | `main` |
| `GC_MODEL_SHA256` | Optional SHA-256 for verifying downloaded weights | unset |
| `GC_MODEL_CACHE_DIR` | Download cache directory | system temp directory |
| `GC_MODEL_DOWNLOAD_TIMEOUT` | Download socket timeout (s) | `600` |
| `GC_MODEL_NAME` | Model id sent to the HTTP server | `gcsharp` |
| `GC_MODEL_API_KEY` | Optional bearer for the server | unset |
| `GC_MODEL_TIMEOUT` | Per-request timeout (s) | `120` |
| `GC_MODEL_MAX_TOKENS` | Max new tokens | `2048` |
| `GC_MODEL_TEMPERATURE` | Sampling temperature | `0.2` |
| `GC_MODEL_CTX` | GGUF context size | `4096` |
| `GC_MODEL_N_THREADS` | GGUF CPU threads | `4` |
| `KG_INTERVAL_HOURS` | Knowledge-growth schedule | `6` |
| `TR_BACKEND` | `prepare_only` or `hf`/`custom` | `prepare_only` |
| `GC_TRAIN_CMD` | External fine-tune command (Phase 4) | unset |

## 4. Verify provider configuration

```bash
curl https://<backend-host>/api/ai/model/status          # configured providers
curl https://<backend-host>/api/ai/model/status?probe=1  # small live generation probe
```

The response reports which providers and search service are configured. The
probe identifies the provider that answered. If neither generation provider
is configured or available, AI endpoints return HTTP 503 so the app can offer
a retry rather than showing a fabricated answer.

## 5. Background jobs

| Job | Schedule | Purpose |
|---|---|---|
| Knowledge growth | every `KG_INTERVAL_HOURS` | mines student questions / syllabus topics, searches trustworthy sources (`google_search`, `score_source`), asks Gemini/OpenRouter for an explanation grounded in vetted evidence, and stores it in `ai_knowledge` with full provenance (subject, topic, level, source URL/title, retrieved_at, evidence, verification_status, quality_score, content_version, dedupe_hash). New knowledge is retrievable **immediately** — no retraining. |
| Daily reminders | hourly | existing streak/study reminders |

Manual triggers (teachers/admins):

```bash
POST /api/ai/knowledge/growth/run    # one bounded research+ingest pass
GET  /api/ai/knowledge/growth/status # totals + last runs
POST /api/ai/training/run            # controlled training run (Phase 4)
GET  /api/ai/training/status         # honest capability report
```

## 6. Training vs. knowledge (important separation)

* **Knowledge ingestion** (Phase 3) writes verified content to MongoDB; the
  retriever picks it up instantly. This is how GC AI gets smarter daily.
* **Evaluation** uses the configured Gemini/OpenRouter production providers.
* **Weight training** (Phase 4) remains a *separate, manual* pipeline. With the
  default `TR_BACKEND=prepare_only`, it prepares a curated dataset (verified
  knowledge + reviewed teacher feedback only — never unreviewed student posts
  or unverified search results), validates it, evaluates teaching quality, and
  **reports honestly that no weights were updated**. To actually fine-tune, set
  `TR_BACKEND=hf` and `GC_TRAIN_CMD` to your trainer; the run appends the
  JSONL dataset path and records checkpoints under `training_runs/`.

## 7. What runs where

```
student request ──► FastAPI (server_sqlite_full_corrected.py)
                      │  /api/ai/*, /api/feed/*, /api/papers/*
                      ▼
               Gemini ──► OpenRouter fallback
                      │
             Google Custom Search (or DuckDuckGo fallback)
                      │ source-grounded answers + citations
                      ▼
              MongoDB ai_knowledge (retrieval + provenance)
                      ▲
APScheduler ──► gc_knowledge_growth.run_once (search → vet → provider → store)
```

## 8. Future self-hosting and training

The controlled training pipeline remains separate from serving. Knowledge
growth adds verified, cited material to MongoDB for immediate retrieval;
fine-tuning does not run on each question or knowledge-ingestion cycle.
When GCSharp-hosted weights and an inference service are ready, the adapter
and runtime provider selection can be deliberately changed and tested before
moving production traffic.
