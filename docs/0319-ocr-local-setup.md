---
brief: Step-by-step local setup guide for the air-gapped Handwritten & Scanned OCR Verifier (Windows GPU RTX 3080 and CPU-only), including Ollama model selection, TLS certificates, Keycloak login, and benchmark notes.
tags: [cookbook, ocr, ollama, gpu, gemma3, setup, development]
---

# Local OCR Verifier Setup (GPU & CPU)

This guide walks a developer from a fresh `main` checkout to a working browser session at `https://modulon.local/pl/ocr` using **100% local air-gapped OCR** (zero cloud API calls). The short path for a new clone is the [README](../README.md). This page is the model and OCR detail.

## 1. Prerequisites (Windows)

- **Git**, **Node.js 22.18+**, **pnpm 12.15.0** (the version in the root `package.json`)
- **Python 3.12–3.14** (`pnpm dev` creates an isolated `.venv`)
- **Docker Desktop** running (WSL2 backend). Docker hosts PostgreSQL, Keycloak, SeaweedFS and Nginx. It does not host Gemma.
- **`mkcert`** (`winget install FiloSottile.mkcert`)
- **Native [Ollama for Windows](https://ollama.com/download/windows)** (`winget install -e --id Ollama.Ollama`)

Use native Ollama on Windows. The `ollama/ollama` container cannot see an AMD integrated GPU, and on a 16 GB laptop it also competes with the application containers for RAM. Native Ollama uses Vulkan, offloads what fits, and runs the rest on CPU. NVIDIA laptops can stay on the same native install.

## 2. Install workspace dependencies

Run from a PowerShell terminal in the repository root (never from `C:\WINDOWS\system32`):

```powershell
pnpm install --frozen-lockfile
pnpm stack:init
```

`pnpm dev` later creates `apps/pyworker/.venv`, installs hash-verified wheels, and replaces the placeholder `PYWORKER_API_TOKEN` in both `apps/pyworker/.env` and `apps/web/.env` with one shared private token. `apps/web/.env` must already exist, which `stack:init` guarantees.

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

## 4. Pull Gemma 4

> **Why Ollama (not vLLM)?**
> BKS traffic is about 800 UDIP requests/year. Ollama runs on a Windows laptop, offloads layers to Vulkan (AMD) or CUDA (NVIDIA), and spills the rest to RAM. vLLM is Linux-only and pays off at high concurrency on large datacenter GPUs.

The application defaults are `gemma4:e4b` with fallback `gemma4:e2b`. Current Ollama library sizes:

| Tag | Download | Use |
| :--- | :--- | :--- |
| `gemma4:e4b` | ~6.6–9.5 GB | Default. OCR, JSON summaries, BKS drafts. |
| `gemma4:e2b` | ~4.6–7.5 GB | 16 GB RAM when E4B plus Docker starts swapping. |

```powershell
ollama pull gemma4:e4b
ollama pull gemma4:e2b
Invoke-RestMethod http://127.0.0.1:11434/api/tags | ConvertTo-Json -Depth 3
```

An AMD Radeon iGPU shares system RAM and usually reports well under 2 GB of dedicated VRAM. Ollama sees it through Vulkan, then **drops it unless `OLLAMA_IGPU_ENABLE=1`**. Set that user variable and restart Ollama:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_IGPU_ENABLE", "1", "User")
Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
```

The server log line `dropping integrated GPU` means the variable is missing. After a restart, `ollama ps` during a generation should show `Vulkan` for `AMD Radeon(TM) Graphics`. Layers that do not fit shared memory still run on CPU. Do not switch the Windows install to the Docker Ollama image to enable the GPU — that image cannot see the iGPU.

On a 16 GB machine that swaps, set `PYWORKER_OCR_VLM_MODEL=gemma4:e2b` and `PYWORKER_OCR_VLM_FALLBACK_MODEL=gemma4:e2b`, and uncomment `UDIP_PLLUM_MODEL=gemma4:e2b` plus `UDIP_LLM_FALLBACK_MODEL=gemma4:e2b` in `apps/web/.env`. Restart `pnpm dev` after env edits.

## 5. Configure Local Environment Files

Initialize stack secrets if you haven't yet (`pnpm stack:init`), then verify these values in your ignored local `.env` files:

### `apps/pyworker/.env`

```env
PYWORKER_OLLAMA_URL=http://127.0.0.1:11434
PYWORKER_OCR_VLM_MODEL=gemma4:e4b
PYWORKER_OCR_VLM_FALLBACK_MODEL=gemma4:e2b
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
