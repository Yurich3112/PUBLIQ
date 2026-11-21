---
brief: Host Python executor, defensive task boundaries, optional PostgreSQL and Node queue bridge helpers, configuration and verification limits.
tags: [cookbook, python, worker, queue, postgresql, health, development]
---

# Python worker

For the planned local CPU model role and its boundary with direct Web-to-OpenAI
calls, see [Hybrid AI execution](0207-ai-execution-architecture.md). The contracts
described below remain the implemented diagnostic executor; they do not yet
provide a model inference API.

## Setup and operation

Use Python 3.12–3.14; local verification used Python 3.14 on Windows.
Run from the repository root:

```powershell
pnpm pyworker:setup
pnpm dev:pyworker
```

Setup creates `apps/pyworker/.venv`, installs exact wheel versions from
`requirements.lock` with SHA-256 verification and prepares ignored private env
files. No virtualenv activation is required. `dev:pyworker` also performs missing
setup. Use `PYWORKER_PYTHON` to select a supported Python executable explicitly.
Python dependencies are separate from the pnpm lockfile; pnpm owns their launcher.

Setup generates a shared random task API token and fills missing/template bridge
settings in an existing `apps/web/.env`. It preserves custom values and rejects
conflicting existing tokens. Restart the Node queue worker after changing its
private env. Tokens, virtualenvs and caches stay outside Git.

DEV uses a Node filesystem watcher over `src/**/*.py` with a 150 ms debounce.
It stops the previous Python process before starting the next one. Hidden paths,
`.venv`, `.cache` and `__pycache__` are excluded. Python runs as one Uvicorn
process; no Python multiprocessing reloader is required. A failed Python start
leaves the watcher available for the next source correction.
Changes to env or dependencies require an explicit restart/setup.

`pnpm start:pyworker` starts the prepared environment without watching or
installing packages. QA uses the [container workflow](0316-qa-containers.md); PROD supervision and
deployment remain separate work.
`pnpm dev` prepares and launches Web, Python and the queue worker through
the [shared DEV startup](0315-dev-startup.md). `dev:pythonworker` is an alias of
`dev:pyworker`. `pyworker:prepare` performs missing setup without forcing a new
dependency installation when the lock hash is unchanged.

## Structure and ownership

```text
apps/pyworker/
  .env.example             safe configuration template
  .env                     private local configuration (ignored)
  .venv/                   isolated interpreter and dependencies (ignored)
  .cache/                  pip and bytecode caches (ignored)
  package.json             pnpm workspace commands
  pyproject.toml           Python metadata and Ruff rules
  requirements.in          direct dependency pins
  requirements.lock        complete dependency pins and wheel hashes
  src/pyworker/
    __main__.py            single-process Uvicorn runner
    config.py              validated runtime settings
    contracts.py           bounded request/response models
    main.py                application factory, lifecycle and routes
    transport.py           authentication and bounded request bodies
    tasks/diagnostic.py    deterministic diagnostic handler
    connections/          opt-in PostgreSQL pool and Node queue bridge client
  tests/test_worker.py     lifecycle, auth, limits and recovery checks
  tests/test_connections.py  helper boundaries, transport and pool-failure checks
  tests/postgresql_integration.py  transaction probes for the disposable DB only
scripts/
  pyworker.mjs             virtualenv, setup, process ownership and DEV watcher
  lib/pyworker-client.mjs  authenticated Node-to-Python client
  lib/queue-bridge.mjs     optional Python-to-Node producer/status API
```

The current task flow is:

```text
Admin submission in Node, or optional Python QueueClient -> Node HTTP bridge
  -> PostgreSQL / pg-boss
  -> durable Node queue worker claims the attempt
  -> authenticated HTTP request to Python for a Python diagnostic
  -> validated result or bounded failure
  -> Node settles the job or pg-boss schedules a retry
```

Python has no database connection by default and does not modify pg-boss internals. Node
owns queue claiming, retries, configuration and monitoring. Repeating a diagnostic
preserves its selected executor. The initial Python handler computes a deterministic
checksum; STT, model loading and business side effects are not implemented.
Future handlers must tolerate duplicate delivery; a queue does not provide
exactly-once side effects.

## Health and task contract

Default address: `http://127.0.0.1:8010`.

| Endpoint | Meaning |
| --- | --- |
| `GET /health/live` | Process is serving HTTP |
| `GET /health/ready` | Application startup completed; 503 otherwise |
| `GET /health` | Readiness alias |
| `POST /v1/tasks/check` | Authenticated deterministic diagnostic |
| `POST /v1/tasks/ocr` | Authenticated local 5-stage handwritten/scanned OCR (`application/octet-stream`, up to 20 MiB) |

Health responses contain `status`, `service`, `check` and sanitized `ocr` (`ready` or `degraded`), with no credentials.
They use `Cache-Control: no-store` and request IDs. Readiness does not leak Ollama hostnames, ports, or tokens. Setup points `MONITOR_PYWORKER_URL`
to `/health/ready`; the existing scheduler persists observations independently
of whether the administration page has automatic refresh enabled.

### Handwritten OCR task (`POST /v1/tasks/ocr`)

Accepts raw PDF, PNG, or JPEG bytes (`Content-Type: application/octet-stream`, validated by leading magic bytes, max `PYWORKER_OCR_MAX_BYTES`, default 20 MiB) with optional `X-File-Name` and `X-OCR-Options` JSON headers. For step-by-step GPU/CPU setup (RTX 3080 `gemma3:12b` or CPU `gemma3:4b`), see [Local OCR Verifier Setup](0319-ocr-local-setup.md). The pipeline runs 100% locally with zero cloud dependency:

1. **Stage 0 (`pyworker.ocr.ingest`):** Magic-byte check, page cap (`PYWORKER_OCR_MAX_PAGES`), native selectable-text PDF fast-path (`source_mode: "digital_text"`), or 200 DPI rasterization.
2. **Stage 1 (`pyworker.ocr.grid_eraser`):** Skew-aware (`-3°..+3°`) OpenCV periodic graph-paper grid suppression preserving handwritten ink strokes and Kancelaria stamps in the original coordinate space.
3. **Stage 2 (`pyworker.ocr.word_detector` + `line_grouper`):** Local ONNX `rapidocr` (`PP-OCRv6_det_small` + `PP-OCRv6_rec_small`) atomic sub-word chunk detector with bimodal gap splitting, column-aware Y-band line grouping, and `handwriting` / `stamp` / `printed` zone classification.
4. **Stage 3 (`pyworker.ocr.ollama_recognizer`):** High-confidence printed/stamp lines (`>= 0.88`) pass directly from local ONNX; low-confidence and handwritten rows are stacked into a numbered `[1]..[N]` full-row strip and sent to local Ollama `POST /api/chat` (`PYWORKER_OLLAMA_URL`, loopback-only by default, model `PYWORKER_OCR_VLM_MODEL`, default `gemma3:4b`, recommended `gemma3:12b` on GPU) for whole-sentence Polish reconstruction.
5. **Stage 4 (`pyworker.ocr.aligner` + `stamp_parser`):** Character-width and gap-aware DP block-merging (`exact` / `merged_box` / `split_box`, e.g., merging split `BYD` + `GOSZCZ` into `Bydgoszcz`), Kancelaria stamp parsing (`received_date`, `registry_number`), and document legibility verdict (`legible` / `illegible_review_required`).

On Windows, `__main__.py` polls `PYWORKER_PARENT_CONTROL=stdin` via `kernel32.PeekNamedPipe` so idle parent-control listening never deadlocks native `numpy`/OpenBLAS DLL loads.

OCR logs record only correlation metadata (`request_id`, `page_count`, `word_count`, `source_mode`, `duration_ms`) and never log raw document bytes, filenames, or transcribed text.

The task endpoint requires `Authorization: Bearer <PYWORKER_API_TOKEN>` and JSON:

```json
{"job_id":"019baf72-20b2-7000-8000-000000000001","attempt":0}
```

The response includes `status: ok`, `executor: pyworker`, matching job/attempt
and a SHA-256 checksum. Unknown fields, invalid UUIDs and out-of-range attempts
are rejected. Requests are limited to 8 KiB; admission is bounded by the configured
concurrency, with 503 on saturation. Handler timeout returns 504. Errors do not
echo request bodies, tokens or raw exceptions. Interactive API docs are disabled.
The Node client rejects redirects, bounds responses to 8 KiB and times out after
20 seconds, longer than the maximum Python handler timeout.

| Setting | Default / constraint |
| --- | --- |
| `PYWORKER_HOST` | `127.0.0.1`; loopback by default (`::1` also supported) |
| `PYWORKER_ALLOW_NETWORK_BIND` | Default `false`; explicit `true` permits `0.0.0.0` inside the private QA container network |
| `PYWORKER_PORT` | `8010`; 1024–65535 |
| `PYWORKER_API_TOKEN` | Generated private token; 32–512 URL-safe characters, no template placeholder |
| `PYWORKER_MAX_CONCURRENCY` | `4`; 1–16 |
| `PYWORKER_TASK_TIMEOUT_SECONDS` | `5`; 1–15 |
| `PYWORKER_LOG_LEVEL` | `info`; debug/info/warning/error |

The Node queue worker reads `PYWORKER_URL` and `PYWORKER_API_TOKEN` from its private
Web configuration. Plain HTTP task targets must be loopback addresses. QA explicitly permits the
exact private `pyworker` service hostname with `PYWORKER_ALLOW_PRIVATE_NETWORK=true`;
its task token remains required. The
Python launcher passes only explicit OS/runtime variables and known `PYWORKER_*`
settings. Application database, Keycloak, S3, AWS and other unrelated credentials
are not inherited. Explicit `Settings(...)` construction enforces the same limits
as environment loading. Task logs correlate request ID, job ID and attempt;
failure logs include the exception type without raw exception text.

Only known worker setting names cross the launcher boundary; an arbitrary
`PYWORKER_*` name is not automatically inherited. PostgreSQL URLs, external
application credentials, request bodies and raw server exceptions stay out of
diagnostics. The deterministic diagnostic does not use either optional helper.

## Optional connection helpers

Importing `pyworker.connections` does not connect to any service. Both helpers
require explicit configuration, own their connection lifecycle and perform no
automatic application-operation retries.

### PostgreSQL

Set `PYWORKER_DATABASE_URL` in the private Python environment, using a dedicated
least-privilege account. There is no fallback to `DATABASE_URL` or
`QUEUE_DATABASE_URL`. Use a plain PostgreSQL URL without Prisma's `?schema=public`.
Remote targets require `sslmode=verify-full`; `sslrootcert` is supported.
Other URL query options are rejected so they cannot override connection limits.

```python
from pyworker.connections.postgresql import DatabaseSettings, PostgreSQL

async def lookup_product(product_uuid):
    async with PostgreSQL(DatabaseSettings.from_environment()) as database:
        async with database.transaction() as connection:
            cursor = await connection.execute(
                "SELECT code FROM product WHERE uuid = %s", (product_uuid,)
            )
            return await cursor.fetchone()
```

For repeated work, open one helper for the owning process/lifecycle and reuse it,
rather than creating one per task. Each helper instance supports one lifecycle;
create a new instance after it closes or fails to open. Defaults: two connections, two waiting callers,
five-second connection/acquisition deadline, five-second statement, lock and
idle-transaction timeouts. `DatabaseSettings` allows bounded overrides. Successful
transactions commit; failures/cancellation roll back and release the connection.
`DatabaseUnavailable` hides driver details. A lost commit acknowledgement can mean
the transaction committed; callers must not blindly retry writes.

The pool uses the documented [Psycopg async lifecycle and transaction context](https://www.psycopg.org/psycopg3/docs/advanced/pool.html).
On Windows use `asyncio.SelectorEventLoop`; the bundled Uvicorn runner selects it.
Standalone scripts can use `asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)`.
Connection URLs and pool-driver diagnostics are excluded from helper logs.

### Queue bridge

Node remains the queue owner. Enable its optional loopback-only producer/status
bridge in private `apps/web/.env` by setting `PYWORKER_QUEUE_BRIDGE_PORT=8011` and
a separate random `PYWORKER_QUEUE_TOKEN` (32–512 URL-safe characters). Both empty
disables the bridge; incomplete configuration fails startup. Restart the Node
queue worker after configuring it.

In private `apps/pyworker/.env`, set `PYWORKER_QUEUE_URL=http://127.0.0.1:8011`
and the same queue token. It is separate from the Node-to-Python task API token.
The launcher never copies PostgreSQL credentials or generates this optional bridge
configuration automatically.

| Private file | Setting | Required when enabled |
| --- | --- | --- |
| `apps/web/.env` | `PYWORKER_QUEUE_BRIDGE_PORT` | `8011` or another free port from 1024–65535; binds to `127.0.0.1` |
| Both Web and Python env | `PYWORKER_QUEUE_TOKEN` | Same separate random token; no template placeholders |
| `apps/pyworker/.env` | `PYWORKER_QUEUE_URL` | Node bridge origin, normally `http://127.0.0.1:8011` |
| `apps/pyworker/.env` | `PYWORKER_DATABASE_URL` | Only for direct task data access; independent from the HTTP queue bridge |

An empty database URL leaves direct data access unconfigured. An empty queue
token leaves the Python queue client unconfigured even when its template URL is
present. These settings do not affect ordinary Node-to-Python diagnostics.

```python
from pyworker.connections.queue import QueueClient, QueueSettings

async def submit_check():
    async with QueueClient(QueueSettings.from_environment()) as queue:
        job_uuid = await queue.enqueue_diagnostic(executor="python", failures=0)
        return await queue.get_job(job_uuid)
```

The Node bridge exposes authenticated `POST /v1/queue/diagnostics`,
`GET /v1/queue/jobs/{uuid}` and `GET /health/ready`. Submission uses the server's
seeded SYSTEM actor; callers cannot supply an audit identity. The bridge exposes
only the existing diagnostic task, not arbitrary queues, SQL or admin actions.
Node limits bodies to 1 KiB, admits at most eight authenticated operations and
bounds open connections to 32. Body reads have a three-second total deadline.
Python limits
responses to 8 KiB, uses a two-connection HTTP pool and a 15-second total deadline.
Redirects and inherited proxy configuration are disabled. Plain HTTP is allowed
only for loopback targets. Response models check job identity and fields.
`QueueUnavailable` hides response bodies. Submissions are sent once: after a lost
response a job may already exist. This helper does not promise exactly-once delivery.

## Verification

```powershell
pnpm lint:pyworker
pnpm test:pyworker
pnpm test:pyworker:bridge
pnpm test:pyworker:reload
pnpm test:pyworker:integration
```

`pnpm check` includes Python tests and Ruff. Run `pnpm pyworker:setup` explicitly
before checking a new environment or after changing the lockfile. Test/lint commands
never install packages or update private `.env` files.

The bridge test exercises the real Python HTTP client against the real Node bridge
with a queue backend fixture; it does not establish PostgreSQL acceptance.
The reload test checks real process restart after source edits and absence of
restarts after cache edits. The integration test requires local PostgreSQL and
uses a disposable queue database and Python process to check successful retry,
executor-preserving repeat, rejected authentication and PostgreSQL helper commit,
rollback, parameter binding, statement timeout and recovery. It does not process
existing DEV jobs. Unit tests cover readiness, validation, bounded input,
concurrency, timeout and recovery after a handler failure.

### Defensive programming and helper verification

| Check | Observed result and scope |
| --- | --- |
| `pnpm test:pyworker` | 17 tests passed: task boundaries, configuration invariants, safe/correlated failures, helper contracts, resource release and bounded failure of a real pool against a reserved non-listening port |
| `pnpm test:scripts` | 23 tests passed, including environment allowlisting, locked dependency declarations, queue bridge authentication, SYSTEM ownership, narrow responses and rejected input |
| `pnpm test:pyworker:bridge` | Passed with the real Python HTTP client and Node bridge; the queue backend was a fixture |
| `pnpm test:pyworker:reload` | Source/cache behavior passed; Windows sandbox process cleanup required targeted termination of the verified test process tree; temporary source files were removed |
| `pnpm lint:pyworker`, `pip check` | Ruff lint/formatting and installed dependency compatibility passed |
| Private env immutability during lint/test | File hashes confirmed that those commands did not update either private env |
| Full live PostgreSQL helper integration | Not run for this change: the configured local PostgreSQL endpoint was unavailable and Docker was inaccessible; commit/rollback/statement-timeout acceptance remains pending |

The disposable integration script includes the pending PostgreSQL helper probes;
their existence and the mocked transaction tests are not evidence of a successful
live database transaction. Run `pnpm test:pyworker:integration` after local
PostgreSQL/Docker are available. It creates/removes a test database and does not
process existing DEV jobs. No production build or full Web typecheck was run for
the helper extension.

Earlier verification of the original executor passed six Python unit tests,
source/cache reload and a disposable queue-to-Python integration, with supporting
Web/script checks, TypeScript and ESLint. Those earlier results do not validate
the new PostgreSQL helper. PROD deployment, load endurance, distributed
side-effect idempotency and STT/model acceptance remain outside these checks.

[Back to cookbook](0300-cookbook.md) | [Queue](0311-postgresql-queue.md)
