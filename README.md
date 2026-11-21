# Modulon PoC

A minimal reusable foundation for authenticated business applications. One
Next.js application contains the UI and backend; Nginx, PostgreSQL, Keycloak
and SeaweedFS supply the shared infrastructure.

**Status: working DEV/QA PoC with authenticated administration.**
Implemented: PL/EN Web, Prisma 7.10.1, Better Auth/Keycloak login, product/file/tag
administration, monitoring and durable Node/Python task execution. Terraform and
automatic business lifecycle processing remain pending.
DEV has four core infrastructure containers plus the S3 console, with setup inside
their owning containers; see the [Docker workflow](docs/0302-local-docker.md). DEV dependency containers are running in
the isolated `modulonpocdev` project; Web remains a separate host process.
The business backend remains in Next.js. Separate host Node and Python processes
now provide durable task execution without adding infrastructure containers.

## Selected PoC stack

| Layer | Selection |
| --- | --- |
| PROXY | Nginx Open Source |
| DB | PostgreSQL **18.6**, with separate `app_db`, `keycloak_db` and `queue_db` |
| WEB | Next.js UI and backend, React, Tailwind CSS, Bootstrap icons through `react-bootstrap-icons`, PL/EN i18n and Better Auth |
| Database package | **`packages/database`**, Prisma **7.10.1** for the application schema only |
| S3 | SeaweedFS open-source edition, one container including bootstrap |
| AUTH | Keycloak with custom login/account themes, an application realm and restricted API access from Next.js |
| Queue | pg-boss in a separate PostgreSQL database, consumed by a host Node.js worker |
| Python executor | FastAPI/Uvicorn, app-local virtualenv, authenticated diagnostics and health endpoints |

Better Auth owns application sessions in PostgreSQL; Keycloak owns credentials,
profiles and realm roles. The Next.js backend reads permitted identity data
through Keycloak's API and enforces the permissions behind visible UI elements.
Secrets and provider tokens remain server-side.

The queue supports retries and administrator lifecycle actions. Node owns queue
claiming, versioned scheduler configuration and service monitoring; Python handles
bounded authenticated diagnostic requests. Optional Python connection helpers
provide a Node-owned queue producer/status bridge and explicit PostgreSQL access;
both require private configuration and are disabled by default. Python does not
claim jobs or modify pg-boss tables. QA runs Web and both workers in release
containers; STT/model execution and PROD deployment remain separate work. See the [queue recipe](docs/0311-postgresql-queue.md)
and [Python worker structure](docs/0314-python-worker.md).

## DEV, QA and PROD

Retain the environment model from the sibling `modulon` repository:

| Environment | Runtime |
| --- | --- |
| DEV | Next.js on the developer host; infrastructure in local Docker Compose |
| QA | Complete local Compose stack, including a release Web/backend image |
| PROD | Verified release images in Compose on AWS Lightsail; Terraform provisions infrastructure |

Environments have independent credentials, data, cookies and configuration.
DEV and QA use standard ports and run alternately by default, as in `modulon`.
They share browser URLs (`https://modulon.local` and the same auth/S3 aliases);
QA runs built release containers while DEV runs app processes on the host.
Switch with `pnpm dev:stop && pnpm qa:up`; return with `pnpm qa:stop && pnpm dev`.
To remove QA containers while retaining data, use `pnpm stack:down --mode qa && pnpm dev`;
see [switching environments](docs/0316-qa-containers.md#return-from-qa-to-dev).
Concurrent stacks require explicit port/hostname overrides. No sibling data,
credentials or partially implemented auth code is imported by this decision.

DEV configuration belongs to `apps/web/.env`, `apps/pyworker/.env`, `packages/database/.env` and
`infra/local/.env.dev`. QA uses `infra/local/.env.qa`; PROD receives controlled
deployment configuration and secrets. Commit safe examples only. Preserve the
same verified release image from QA to PROD through runtime configuration.

## Root workspace commands

```powershell
pnpm dev
pnpm check
pnpm build
pnpm start
```

Configure the private env files and TLS first. Install Docker Engine and Python
3.12–3.14. Startup reuses the virtualenv's base Python or probes installed supported
interpreters; `PYWORKER_PYTHON` overrides that selection. Startup installs the versions in the lockfiles; it never upgrades
dependencies or generates a replacement auth secret.

| Command | Effect |
| --- | --- |
| `pnpm dev` | Check tools/Engine/config/TLS, synchronize frozen dependencies, prepare Python, build/start Compose with cache, wait for health, then prepare Prisma/queue and start all host services |
| `pnpm dev:start:cold` / `pnpm dev:start:warm` | Compatibility aliases of `pnpm dev`; one automatic workflow handles both fresh and prepared dependencies/images |
| `pnpm dev:stop` | Stop the supervised host process tree, then take down DEV Compose without deleting volumes |
| `pnpm dev:restart` | Stop supervised services and repeat automatic startup, restarting DEV containers while preserving dependencies, virtualenv, outputs and data |
| `pnpm dev:clean` | Same generated files/dependencies as `pnpm clean`, with an added stopped-service guard; preserve the Python virtualenv |
| `pnpm dev:doctor` | Read-only diagnosis of env/auth, TLS, Docker, service health, database schemas and ports; suggests repairs without executing them |
| `pnpm dev:rebuild` | Stop supervised services, validate auth, take down DEV containers, clean dependencies/outputs and recreate Python, then perform a complete cold start |

Preparation checks env/auth/TLS, Docker health and host ports, builds shared
packages, prepares pg-boss in the existing local queue database, applies committed Prisma migrations to the verified local target and
seeds only missing defaults. Web, Python and queue then run concurrently with
path-prefixed logs. Prisma Studio stays separate: `pnpm db:studio` (5555).
Ctrl+C stops the supervised host processes and keeps Docker running.

### Rebuild one component

Stop host services first (`pnpm dev:stop`, or Ctrl+C in their original terminals).
These commands prepare one component and return; they do not start host services
or apply migrations. Other component outputs are preserved, except that Web also
builds the shared packages it needs. JS component rebuilds synchronize the shared
pnpm installation first; Python and Docker rebuilds operate independently.

| Command | Effect |
| --- | --- |
| `pnpm dev:rebuild:web` | Clear Web outputs/cache, rebuild shared packages and check Web types/lint; production build remains `pnpm build:web` |
| `pnpm dev:rebuild:pyworker` | Recreate `.venv` and Python caches from the hash-locked requirements; retain the previous base interpreter unless overridden |
| `pnpm dev:rebuild:prisma` | Clear database package outputs, regenerate Prisma Client and compile the package; preserve schema, migrations and database contents |
| `pnpm dev:rebuild:queue` | Clear queue outputs and recompile the Node queue package |
| `pnpm dev:rebuild:monitoring` | Clear monitoring outputs, build Prisma and recompile monitoring |
| `pnpm dev:rebuild:docker` | Take down and rebuild/start DEV Compose, waiting for container health; preserve data volumes |

Dotted aliases are also available: `pnpm dev.rebuild.web`,
`pnpm dev.rebuild.pyworker`, `pnpm dev.rebuild.prisma`, `pnpm dev.rebuild.queue`,
`pnpm dev.rebuild.monitoring` and `pnpm dev.rebuild.docker`.
Then run `pnpm dev` for everything, or `pnpm dev:prepare` followed by individual
service commands below. The global rebuild covers all host components and Docker.

Cleanup never removes `.env`, lockfiles, certificates, database/storage data or
Docker volumes. The explicit destructive infrastructure commands below are the exception.
Lifecycle commands stop only descendants of their own supervised
DEV session. Services launched separately or by an older `pnpm dev` must be stopped
in their original terminals; occupied ports block cleanup/startup.
`pnpm check:dev-auth` reports invalid auth fields without their values; for example,
`AUTH_SECRET` must contain at least 32 characters. Changes remain manual.

Every preparation phase is also available separately; see [DEV startup](docs/0315-dev-startup.md).
For certificate generation and CA import on Windows, Linux and macOS, see
[Local HTTPS and CA trust](docs/0318-local-tls.md).
Docker can be operated independently with `pnpm dev:infra:up`,
`pnpm dev:infra:up --no-build`, `pnpm dev:infra:down`, `pnpm dev:infra:status`
and `pnpm dev:infra:logs`. `down` preserves data. Existing DEV `stack:*` lifecycle
commands delegate to this same implementation.
Start, stop and delete stream Docker Compose output directly to the terminal.
During longer operations, a message every 15 seconds shows the elapsed time;
startup waits up to 240 seconds for container health.

The project stays `modulonpocdev`; containers are `dev-proxy-0`, `dev-db-0`,
`dev-auth-0`, `dev-s3-0` and `dev-s3console-0`. QA uses `qa-*`, including Web
and workers; DEV applications still run on the host. Images retain technology
and version names. Scripts address Compose roles, not constructed container names.
`INSTANCE_INDEX` changes only container names, which must be unique on the host.
`DB_VOLUME_NAME`, `S3_VOLUME_NAME` and `S3CONSOLE_VOLUME_NAME` independently preserve
the original data volumes, including their legacy PostgreSQL/SeaweedFS suffixes.

### Reset DEV infrastructure and permanently delete its data

```powershell
pnpm dev:infra:delete
pnpm dev:infra:up
```

`dev:infra:delate` remains a compatibility alias of `dev:infra:delete`.
**Deletion permanently removes DEV containers and all three owned data volumes:**
PostgreSQL (application, Keycloak and queue databases), SeaweedFS files and S3
console state. It verifies Compose project/volume ownership and refuses volumes
used by other projects. QA/PROD, env files, certificates and host processes are
preserved. No global Docker prune is used.

`dev:infra:up` builds/starts all five DEV infrastructure containers, including
the S3 console, and waits for health. Fresh volumes bootstrap using the current
private infrastructure env. It does not delete existing volumes, rotate secrets,
start Web/workers or run Prisma migrations/seeds. After a reset, prepare the
application and queue schemas with `pnpm dev:prepare`, or start the complete DEV flow with
`pnpm dev` after resolving any invalid/mismatched Web configuration.
QA uses `pnpm qa:build`, `pnpm qa:deploy`, `pnpm qa:start` as separate stages;
`pnpm qa:up` initializes/checks configuration and runs them in order.
Build targets also have individual `qa:build:<service>` aliases and run concurrently
under `qa:build`. Occupied ports block startup without stopping DEV.
QA configuration uses one `infra/local/.env.qa.example` template and one private
`.env.qa`, with explicit per-service variables and multi-stage Web/Python images.
See [QA containers](docs/0316-qa-containers.md).
The S3 operator UI starts with `pnpm dev`; it can also be managed separately with
`pnpm s3console:up`. Open
`https://s3console.modulon.local/login`. Login settings are in `STORAGE / CONSOLE`. Use `--mode qa` for QA; see
[S3 console](docs/0317-s3-console.md) for permissions and lifecycle commands.
The DEV project is isolated as `modulonpocdev`; preserve its own credentials and
volumes. For initial queue/Python setup:

```powershell
pnpm queue:setup
pnpm pyworker:setup
```

For individually started services after `pnpm dev:prepare`, use separate terminals:

```powershell
pnpm dev:web
pnpm dev:pyworker
```

```powershell
pnpm dev:queue
pnpm db:studio
```

Python DEV reloads only source `.py` changes, excluding caches and its virtualenv.
Its readiness endpoint is `http://127.0.0.1:8010/health/ready` (`/health` is an alias).
`pnpm check` includes Python unit tests and Ruff; those checks require the prepared
virtualenv and never install dependencies or update private environment files.
See [all workspace commands](docs/0205-workspace-commands.md).

## Local PLLuM model

The 2.49 GB PLLuM 4B Instruct model (Q4_K_M GGUF) is available in two parts
in the [GitHub release for `pllum-4b-instruct-2512-q4-k-m`](https://github.com/Yurich3112/asystent_hacknation2026_FFF/releases/tag/pllum-4b-instruct-2512-q4-k-m).
The release keeps the large weights outside the Git checkout and includes
instructions to reassemble the GGUF and verify its SHA-256 checksum.

Once downloaded and reassembled, the model runs offline with `llama-server`.
Local inference was verified at `http://127.0.0.1:8080/v1/chat/completions`.
UDIP uses its own local client. In `apps/web/.env`, set
`UDIP_PLLUM_URL=http://127.0.0.1:8080`, `UDIP_PLLUM_MODEL=pllum` and optionally
`UDIP_PLLUM_TIMEOUT_MS=75000`. Run the model in a separate terminal:

```powershell
llama-server --model 'C:\path\to\pllum.gguf' --alias pllum --host 127.0.0.1 --port 8080 --ctx-size 16384
```

The application chat uses its existing OpenAI configuration.

## Local UDIP PII and OCR

Use Python 3.12 for the optional inference environment. From the repository root:

```powershell
pnpm pyworker:setup
.\apps\pyworker\.venv\Scripts\python.exe -m pip install -r apps/pyworker/requirements-udip.txt
```

In `apps/pyworker/.env`, set `UDIP_PII_MODEL_DIR` to the absolute path of the
[pinned PII-Tracer checkout](docs/UDIP_COMPLETE_IDEA.md#download-pii-tracer-for-local-development).
For Polish OCR, extract the official
[PP-OCRv5_server_det and latin_PP-OCRv5_mobile_rec inference models](https://www.paddleocr.ai/v3.4.1/en/version3.x/pipeline_usage/OCR.html)
and set `UDIP_OCR_DET_MODEL_DIR` and `UDIP_OCR_REC_MODEL_DIR` to those local directories.
Then run `pnpm dev:pyworker` and exercise the API in order using the
[Stage 5 contracts](openspec/changes/establish-udip-backend-contract/design.md#stage-5-local-models).
For cold model starts behind the local proxy, use the timeout settings in the
[OCR setup guide](docs/0319-ocr-local-setup.md).
An authorized clerk can open `/pl/udip/cases/{caseId}` to review the case
documents and the sources for each saved draft point. Open a document to compare
the original PDF with its transcription, retry OCR after an error, or save a
manual correction as a new revision.

## Current acceptance scope

Keycloak login, localized profile/role display and the administrator product/file
catalog are implemented. File reads require administrator authorization; avatars
remain identity-owned. Queue diagnostics/monitoring, catalog history and offline
local recovery tooling are covered in the
[reliability verification](docs/0404-reliability-verification.md) and
[recovery runbook](docs/0403-data-recovery.md). Business trash retention and
archiving remain [backlog](docs/9999-backlog.md) work; PROD deployment is separate.

## Documentation

| Document | Scope |
| --- | --- |
| [Documentation overview](docs/0000-overview.md) | Chapter navigation and status |
| [Keycloak login](docs/0304-keycloak-login.md) | Server-side login, session storage, DEV setup and verification |
| [Application database](docs/0303-prisma-database.md) | Prisma package, UUIDv7 identity references and CLI migrations |
| [Development cookbook](docs/0300-cookbook.md) | Practical setup, UI and translation recipes |
| [Python worker](docs/0314-python-worker.md) | Structure, virtualenv, pnpm commands, source reload, health and authenticated queue integration |
| [Local Docker: DEV and QA](docs/0302-local-docker.md) | Prepare and start local stacks, switch modes and diagnose current limitations |
| [Runbooks](docs/0400-runbooks.md) | Startup, verification and troubleshooting |
| [Architecture](docs/0200-architecture.md) | Selected minimal PoC |
| [System architecture](docs/0201-system-architecture.md) | Service map, three databases, queue boundary and DEV/QA/PROD |
| [Environment configuration](docs/0202-environment-configuration.md) | Planned layout, `packages/database`, env ownership and release configuration |
| [Web foundation](docs/0204-web-foundation.md) | Implemented UI, PL/EN routing, dependencies, commands and checks |
| [Web structure and API](docs/0206-web-structure.md) | Source layout, API/locale separation and health contracts |
| [Identity and access](docs/0203-identity-and-access.md) | Custom Keycloak themes/realm, Better Auth and restricted directory API |
| [Licensing](docs/0100-licensing.md) | Proprietary terms, contribution assignments and third-party register |

## License and ownership

Owner-controlled materials are subject to the
[Proprietary Repository License](LICENSE.md), version 2.1. Access, contributions
and commercial use require applicable authorization. Third-party components
retain their licenses and notices.

**Owner:** Kacper Boś, conducting business as Kacper Boś IT.
Contact: [kacper.bos.it@gmail.com](mailto:kacper.bos.it@gmail.com).
