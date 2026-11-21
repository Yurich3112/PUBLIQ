---
brief: Step-by-step local setup guide for the air-gapped Handwritten & Scanned OCR Verifier (Windows GPU RTX 3080 and CPU-only), including Ollama model selection, TLS certificates, Keycloak login, and benchmark notes.
tags: [cookbook, ocr, ollama, gpu, gemma3, setup, development]
---

# Local OCR Verifier Setup (GPU & CPU)

This guide walks a developer from a fresh checkout of `feat/handwritten-ocr-verifier` to a fully working local browser session at `https://modulon.local/pl/ocr` using **100% local air-gapped OCR** (zero cloud API calls).

## 1. Prerequisites (Windows)

- **Git**, **Node.js 22+**, **pnpm 10+**
- **Python 3.12–3.14** (verified on Python 3.14; `pnpm pyworker:setup` creates an isolated `.venv`)
- **Docker Desktop** (WSL2 backend; enable GPU support if using Docker for Ollama)
- **`mkcert`** (`winget install FiloSottile.mkcert` or `choco install mkcert`)
- **Ollama** (either [native Ollama for Windows](https://ollama.com/download/windows) — easiest on an NVIDIA RTX 3080 laptop — or Docker `ollama/ollama`)

## 2. Clone Branch & Install Workspace Dependencies

Run from a PowerShell terminal in the repository root (note: **never** run `mkcert` or `pnpm` from `C:\WINDOWS\system32`):

```powershell
git fetch origin
git checkout feat/handwritten-ocr-verifier
pnpm install
pnpm pyworker:setup
```

`pnpm pyworker:setup` creates `apps/pyworker/.venv`, installs hash-verified binary wheels (`opencv-python-headless`, `pypdfium2`, `pillow`, `onnxruntime`, `rapidocr`, `fastapi`, `uvicorn`), and generates the shared private `PYWORKER_API_TOKEN` across `apps/pyworker/.env` and `apps/web/.env`.

## 3. Hosts File & Local HTTPS Certificates

### 3.1 Add local domains to `C:\Windows\System32\drivers\etc\hosts` (Admin PowerShell)

```text
127.0.0.1 modulon.local web.modulon.local auth.modulon.local authconsole.modulon.local s3.modulon.local s3console.modulon.local
```

### 3.2 Generate and validate local TLS certificates (from the repository root!)

```powershell
New-Item -ItemType Directory -Force -Path .\infra\local\certs | Out-Null
mkcert -install
mkcert -cert-file .\infra\local\certs\localhost.pem `
       -key-file .\infra\local\certs\localhost-key.pem `
       localhost 127.0.0.1 ::1 modulon.local '*.modulon.local'
Copy-Item -LiteralPath (Join-Path (mkcert -CAROOT) 'rootCA.pem') `
          -Destination .\infra\local\certs\rootCA.pem
pnpm validate:certs --host localhost --host modulon.local --host web.modulon.local `
  --host auth.modulon.local --host authconsole.modulon.local `
  --host s3.modulon.local --host s3console.modulon.local `
  --ip 127.0.0.1 --ip ::1
```

## 4. Start Local Ollama & Pull Gemma 3

> **Why Ollama (not vLLM)?**
> On Windows laptops (especially 8 GB vs 16 GB RTX 3080 variants) and UM Bydgoszcz BKS traffic (~800 UDIP requests/year ≈ 3/day), Ollama runs natively or in Docker, handles GPU+RAM layer offloading automatically without CUDA OOM crashes, and swaps models on demand. vLLM is Linux-only and only pays off at high multi-user concurrency on 24–80 GB datacenter GPUs.

### Option A — NVIDIA RTX 3080 Laptop / Dedicated GPU (Recommended: `gemma3:12b`)

- **Using native Ollama for Windows (recommended on GPU laptops — auto-detects CUDA):**
  1. Install and launch Ollama for Windows (listens on `http://127.0.0.1:11434`).
  2. Pull the 12B multimodal model (~8.1 GB; fits 100% in 16 GB VRAM for **~3–6 s/scan**, or ~85% in 8 GB VRAM with automatic RAM spill for **~10–15 s/scan**):
     ```powershell
     ollama pull gemma3:12b
     ```
     *(Optional alternative: `ollama pull gemma3:12b-it-qat` — Google's quantization-aware 4-bit build, same ~8.1 GB footprint.)*

- **Or using Docker with NVIDIA GPU passthrough:**
  ```powershell
  docker run -d --name modulon-ollama --gpus all --restart unless-stopped `
    -p 127.0.0.1:11434:11434 -v modulon_ollama:/root/.ollama ollama/ollama
  docker exec modulon-ollama ollama pull gemma3:12b
  ```

### Option B — CPU-Only Laptop (16 GB RAM, no NVIDIA GPU: `gemma3:4b`)

```powershell
docker run -d --name modulon-ollama --restart unless-stopped `
  -p 127.0.0.1:11434:11434 -v modulon_ollama:/root/.ollama ollama/ollama
docker exec modulon-ollama ollama pull gemma3:4b
```

Verify Ollama is reachable from the host before starting the stack:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags | ConvertTo-Json -Depth 3
```

## 5. Configure Local Environment Files

Initialize stack secrets if you haven't yet (`pnpm stack:init`), then verify these values in your ignored local `.env` files:

### `apps/pyworker/.env`

```env
PYWORKER_OLLAMA_URL=http://127.0.0.1:11434
# Use gemma3:12b on RTX 3080 GPU, or gemma3:4b on CPU-only laptops:
PYWORKER_OCR_VLM_MODEL=gemma3:12b
PYWORKER_OCR_TIMEOUT_SECONDS=240
PYWORKER_OCR_MAX_BYTES=20971520
PYWORKER_OCR_MAX_PAGES=10
PYWORKER_OCR_LOW_CONFIDENCE_THRESHOLD=0.80
PYWORKER_OCR_LEGIBILITY_MIN_AVG=0.60
```

### `infra/local/.env.dev` (Nginx reverse-proxy timeouts for large CPU/GPU scans)

Ensure `PROXY_READ_TIMEOUT` and `PROXY_SEND_TIMEOUT` are at least `260s` so long handwritten OCR scans never hit a premature Nginx `504`:

```env
PROXY_READ_TIMEOUT=260s
PROXY_SEND_TIMEOUT=260s
```

*(If you change `infra/local/.env.dev` after containers are already running, recreate the proxy container once: `pnpm stack:up` or `docker compose --env-file infra/local/.env.dev -f infra/local/compose.yaml -f infra/local/compose.dev.yaml up -d proxy`.)*

## 6. Start the Full Local Stack

```powershell
pnpm dev:preflight
pnpm dev
```

> **Important:** `scripts/pyworker.mjs dev` auto-reloads when `.py` files change, **not** when `.env` changes. Whenever you change `PYWORKER_OCR_VLM_MODEL` or other `.env` values, restart `pnpm dev` (`Ctrl+C` → `pnpm dev`).

Verify worker OCR readiness (should show `"ocr":"ready"`):

```powershell
Invoke-RestMethod http://127.0.0.1:8010/health/ready
```

## 7. Create a Local Clerk Account & Test `/pl/ocr`

1. Open `https://authconsole.modulon.local` (Keycloak Admin Console; credentials are in `infra/local/.env.dev` under `AUTH_ADMIN_USERNAME` / `AUTH_ADMIN_PASSWORD`).
2. Switch to the **`modulon`** realm (top-left dropdown) → **Users** → **Add user** (fill username/email, check **Email verified**).
3. Open the new user → **Credentials** → **Set password** (uncheck **Temporary**).
4. Open `https://modulon.local/pl/ocr`, sign in with your new clerk account, and upload the sample UDIP PDFs:
   - **Digital PDF (`Odpowiedź - BKS.IV.1431.16.2026.anonymised.pdf`):** instant fast-path (~0.5 s, 95 words, green boxes).
   - **2-page Printed Scan (`Wniosek - BKS.IV.1431.543.2026.pdf`, 10.6 MiB):** local `PP-OCRv6` + stamp date extraction (`2026-08-19`), ~99% Polish accuracy across both pages.
   - **Handwritten Graph-Paper Scan (`Wniosek - BKS.IV.1431.16.2026.pdf`, 13.6 MiB):** skew-aware OpenCV grid removal (`Usunięto kratkę`), Kancelaria stamp extraction (`09.01.2026` / `3468/2026`), 1:1 DP-merged individual word boxes (`BYDGOSZCZ`, `TRYBIE`, `ADMINISTRACYJNYM`), `Alt+N` uncertain-word review, and 1-click 7-day clarification draft (*Wezwanie do uzupełnienia*).

## 8. Model Benchmark Notes (CPU 16 GB Laptop Reference)

Tested on `Wniosek - BKS.IV.1431.16.2026.pdf` (13.6 MiB handwritten graph paper) inside 7.4 GiB Docker CPU RAM:

| Local Model | Size | CPU Time | Observed Polish Handwriting Quality |
| :--- | :---: | :---: | :--- |
| `gemma3:4b` (default CPU) | 3.4 GB | ~46–64 s | Best 3–4B CPU model: reconstructs real Polish words & merges split words (`TRY+bIE → trybie`, `BYD+GOSZCZ → Bydgoszcz`) in one pass |
| `gemma3:12b` (RTX 3080 GPU) | 8.1 GB | ~3–15 s (GPU) | Recommended GPU upgrade (1-line `.env` swap, zero code changes) |
| `hf.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF` | 1.8 GB | ~62 s | Strongest raw stroke OCR (`SPRZEDAŻY`, `09.01.2026`), but 0.3B decoder lacks Polish spelling correction |
| `glm-ocr` | 2.7 GB | ~91 s | Good visual strokes, no Polish grammar |
| `qwen2.5vl:3b` | 3.2 GB | ~72 s | Weak Polish handwriting accuracy |
| `qwen3-vl:4b` | 3.3 GB | >180 s | Thinking tokens exhaust CPU timeout budget |

## 9. Verification Commands

```powershell
pnpm lint:pyworker
pnpm test:pyworker
pnpm test:scripts
pnpm --filter ./apps/web run typecheck
pnpm --filter ./apps/web run lint
pnpm --filter ./apps/web run test
```

[Back to Python worker](0314-python-worker.md) | [Back to cookbook](0300-cookbook.md)
