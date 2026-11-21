---
brief: Operate automatic DEV startup, diagnose bootstrap/login/TLS failures and preserve persistent data.
tags: [runbook, operations, docker, nextjs, troubleshooting]
---

# Local operations runbook

## Operating boundary

The DEV project is `modulonpocdev` with core roles `db`, `auth`, `proxy`, `s3`
and the `s3console` operator UI. Web, queue and Python run on the host.
QA is a separate `modulonpocqa` project with implemented release build,
migration and startup stages; see [QA containers](0316-qa-containers.md). PROD is a
separate future deployment. Inspect the selected env/project before mutation.
No global Docker cleanup is part of ordinary startup or incident recovery.

DEV and QA share the public `https://modulon.local` origin and auth/S3 hostnames,
so run them alternately. Switch to QA with `pnpm dev:stop && pnpm qa:up`;
return with `pnpm qa:stop && pnpm dev`. To remove QA containers while keeping data,
use `pnpm stack:down --mode qa && pnpm dev`. Stop a separately enabled QA console
first with `pnpm s3console:stop --mode qa`.
See [QA switching and shutdown](0316-qa-containers.md#return-from-qa-to-dev).

## Start and inspect

```powershell
pnpm dev
```

Use the same command for first and subsequent starts after configuring private
env files and [TLS](0318-local-tls.md). Inspect independently in another terminal:

```powershell
pnpm dev:doctor
pnpm dev:infra:status
pnpm dev:infra:logs
```

Compose waits for bootstrap-aware health checks. No extra init containers are
expected, even in `docker ps -a`. A failed database/realm/bucket initialization
fails the owning container instead of marking partially configured service ready.
`pnpm stack:up` removes obsolete containers only from its own project and preserves
volumes. `pnpm stack:down` also preserves volumes.

## Start host DEV services and verify Web

```powershell
pnpm dev
```

The [DEV startup pipeline](0315-dev-startup.md) reports eight stages without
clearing their history. It checks tools and Docker Engine before installation,
validates env/TLS/ports, synchronizes locked pnpm packages, validates auth,
prepares Python, builds/starts Compose with cache and waits for healthy services.
It then builds shared packages/Prisma, prepares pg-boss, deploys committed
migrations and inserts missing seed defaults before launching Web and both
workers. Prisma Studio stays separate as `pnpm db:studio` (5555).
Every phase has its own pnpm alias.

Open `https://modulon.local/pl` and `/en`. For process/config checks:

```powershell
$webBase = 'http://localhost:3000'
Invoke-RestMethod -Uri "$webBase/api/v1"
Invoke-RestMethod -Uri "$webBase/api/v1/health/live"
Invoke-RestMethod -Uri "$webBase/api/v1/health/ready"
```

Readiness validates Web configuration; it does not attest to login, database,
S3 or queue availability. Follow the [login recipe](0304-keycloak-login.md) for
session/OIDC checks. Login failures use an unavailable popup on the application
page. The navbar uses a green outline button that fills green on hover.

## Troubleshooting

For Python and queue startup/health, use the procedure below.

| Symptom | Check | Action |
| --- | --- | --- |
| Unexpected DEV service roles beyond db, auth, s3, proxy and s3console | `pnpm dev:infra:status` | Verify the project, then use `pnpm dev:infra:up` with orphan removal; preserve volumes |
| `ERROR DOCKER ENGINE IS NOT WORKING` | `pnpm check:docker` in the normal user terminal | Start/fix the Docker Engine or its CLI permissions/context before retrying |
| Automatic DEV stops at stage 1 | Tool versions, Docker Engine/Compose and Python 3.12–3.14 | Start Docker or install/configure the reported missing tool, then rerun `pnpm dev`; no package installation has run yet |
| DEV is already running or another lifecycle command is active | Original supervisor terminal | Use that session or stop it there; `pnpm dev:restart` explicitly restarts an owned session. Do not kill unrelated listeners |
| Package synchronization fails at stage 3 | Lockfile agreement, registry access and pnpm version | Fix the reported cause and rerun `pnpm dev`; Compose changes and migrations have not run |
| `ERROR DOCKER CONTAINERS ARE NOT READY` | `pnpm check:containers` | Inspect the named DEV services and use `pnpm stack:up` explicitly; migration/service startup is blocked |
| PostgreSQL unhealthy | `postgres/start.sh` / DB bootstrap logs | Verify DB role/database names, existing ownership and credentials; do not reset persistent data or elevate application roles |
| PostgreSQL repeatedly exits after `cannot open /bootstrap/init-queue.sh` | Compare the container's actual mounts with current Compose | Recreate the owning PostgreSQL container with the same verified data volume; restart alone cannot add a missing bind mount |
| Keycloak unhealthy | Server health plus realm bootstrap | Verify application/auth DB separation, operator credentials and Web/directory client configuration; existing passwords are not rotated |
| SeaweedFS unhealthy | Private config generation, S3 credentials and bucket initialization | Keep operator/application identities distinct; check bucket access without dumping secrets |
| Web gets 502 | Host Web process, `WEB_UPSTREAM` | Start `pnpm dev`; Nginx remains healthy and serves its local fallback assets |
| Login unavailable popup | Web `AUTH_*`, app migrations, clients, CA trust | Use canonical HTTPS and restart through `pnpm dev`; consult the login recipe |
| Products cannot load | `pnpm db:status`, generated Prisma client and actual application DB target | Verify product migration/client generation; restart Web if HMR retained an old client. The DEV client guard specifically replaces clients lacking `product`; it does not detect all schema changes. Preserve volumes |
| Admin access differs from expected roles | Verified effective realm names, managed level attributes and application role mapping | Reconcile with `pnpm stack:auth:sync`; preserve users/assignments and verify the next protected action against the server threshold |
| QA cannot build/start Web | Missing Dockerfile/runtime env | Implement the QA Web delivery slice before attempting release acceptance |
| Frozen-lock mismatch | Workspace manifests and lockfile | Use `pnpm install --frozen-lockfile`; investigate the manifest change |

## Operate the host workers

### PostgreSQL recovery after bootstrap mount changes

The observed restart loop came from a stale PostgreSQL container: the host
`start.sh` had gained a queue-bootstrap call, while the existing container still
had only the earlier mounts. PostgreSQL itself reached readiness, then the
missing script caused its wrapper to shut down; Keycloak subsequently lost its
database connection.

The repaired container uses the same named PostgreSQL data volume with all three
read-only bootstrap mounts. Compose rejects missing host files instead of
creating directories, and the wrapper checks both initialization scripts before
starting the server. To recover this condition in another local checkout, verify
the DEV project and volume identity, recreate PostgreSQL from the current Compose
configuration and wait for health, then recover Keycloak if necessary. Confirm
that PostgreSQL's restart counter remains stable and all five DEV services pass
`pnpm check:containers`. Existing database passwords, identities and data are
preserved; `pnpm db:status` checks migration state separately.

### Individual worker startup

Prepare local queue and Python configuration from the repository root:

```powershell
pnpm queue:setup
pnpm pyworker:setup
```

`pnpm dev` now starts the host services together. To run workers separately after
`pnpm dev:prepare`, use their individual commands in separate terminals:

```powershell
pnpm dev:pyworker
```

```powershell
pnpm queue:worker
```

Python setup creates `apps/pyworker/.venv` and a private shared task API token.
It links missing/template values in an existing Web env without printing secrets.
Restart the Node consumer after linking/changing its env. An active published
system configuration is needed for monitoring schedules; view-refresh toggles
do not enable or disable the scheduler.

Check Python directly, without a token:

```powershell
$pythonBase = 'http://127.0.0.1:8010'
Invoke-RestMethod -Uri "$pythonBase/health/live"
Invoke-RestMethod -Uri "$pythonBase/health/ready"
Invoke-RestMethod -Uri "$pythonBase/health"
```

Expected results contain `status: ok`, `service: pyworker` and a check name.
Liveness means the process responds. Readiness means startup completed; it does
not attest to a model or external dependency. The scheduler probes readiness and
records latency; previous samples remain historical observations after recovery.
Python is bound to loopback and is not exposed through Nginx.

In `/admin/queue`, submit a diagnostic with executor **Python**, zero failures,
and verify completion. A controlled failure can exercise the configured retries.
Repeating that job creates a new UUID while preserving the Python executor.
Python tasks require a token even though the health endpoints do not.

The optional reverse queue bridge uses a separate `PYWORKER_QUEUE_TOKEN` and
`PYWORKER_QUEUE_BRIDGE_PORT` in the Node worker's private Web environment, plus
`PYWORKER_QUEUE_URL` and the matching token in the Python environment. It is
disabled when Node's two settings are empty. The PostgreSQL helper separately
requires `PYWORKER_DATABASE_URL`; no database credential is copied from Web.
Configure/restart only the owning processes. Follow the
[connection-helper setup](0314-python-worker.md#optional-connection-helpers) before enabling them.

`pnpm test:pyworker:bridge` needs no database and uses a queue backend fixture.
The full `pnpm test:pyworker:integration` additionally needs local PostgreSQL and
Docker and uses a disposable database. Live transaction verification for the new
helper remains pending; see the [verification record](0314-python-worker.md#defensive-programming-and-helper-verification).

| Symptom | Action |
| --- | --- |
| Python executable/version rejected | Select Python 3.12–3.14 with `PYWORKER_PYTHON`, then run setup; the app-local virtualenv must use a supported interpreter |
| Python cannot bind its port | Identify the process using the configured port; use the existing worker or stop only the verified owner before starting another |
| Worker tokens differ / task returns 401 | Reconcile only the private Python/Web bridge token, then restart both workers; do not print env files or disable authentication |
| Monitoring says not configured | Run setup with an existing Web env, verify `MONITOR_PYWORKER_URL` is set, then restart the Node consumer |
| Health works but jobs stay waiting | Check the separate Node consumer, queue connection and selected executor; HTTP health alone does not consume jobs |
| Python reports busy (503) or task timeout (504) | Inspect bounded task logs and concurrency/timeout settings; pg-boss owns retries, so handlers must tolerate duplicates |
| Source correction does not appear | DEV watches only `.py` files under `src`; env/dependency edits need restart/setup, and `start:pyworker` has no watcher |
| Lint/test reports missing environment or changed dependencies | Run `pnpm pyworker:setup` explicitly; checks never install or rewrite `.env` |
| Node reports incomplete queue bridge configuration | Supply both bridge port and separate queue token, or leave both empty to disable it |
| Queue client returns 401 | Check the separate queue token on both sides; do not replace the task API token or print credentials |
| PostgreSQL URL is rejected | Use the dedicated Python URL without Prisma query options; remote targets require verified TLS |
| Async PostgreSQL reports a Windows event-loop error | Use `asyncio.SelectorEventLoop`; the bundled Uvicorn runner already selects it |
| A submission/commit response is lost | Treat the outcome as unknown; inspect task state before retrying, because the job/write may already exist |
| Reload test hangs after its behavior check passes | Verify the test PID, command and parent tree; terminate only that owned test tree with sufficient Windows permissions, then confirm canary removal |

For structure, settings, request limits and verification commands, use the
[Python worker recipe](0314-python-worker.md). Run `pnpm start:pyworker` for a
prepared environment without reload; no QA/PROD supervisor is installed by these
commands. Stop foreground workers with Ctrl+C in their own terminals.

Creation of application/Keycloak databases belongs to PostgreSQL bootstrap.
Application schema migrations belong to Prisma CLI. Realm setup belongs to
Keycloak startup; manual reconciliation runs in that existing container:

```powershell
pnpm stack:auth:sync
pnpm db:status
```

Changing an env password does not rotate the password stored in an existing
volume/realm. A credentials mismatch deliberately fails validation. Plan explicit
credential rotation rather than deleting data to match configuration.

## TLS and local hostnames

Ignored `infra/local/certs` contains the server certificate `localhost.pem`,
private server key `localhost-key.pem` and public CA `rootCA.pem`. A fresh checkout
needs appropriately issued files; no CA signing key belongs in the repository.
Certificate copying does not prove browser/OS trust.
See [Local HTTPS and CA trust](0318-local-tls.md) for certificate generation and
Windows, Linux and macOS CA import commands.

```powershell
pnpm validate:certs
pnpm validate:certs --host localhost --host modulon.local --host auth.modulon.local --host s3console.modulon.local
```

Validation checks expiry, key match, direct CA signature and selected SANs. Its
DEV defaults follow `CERTS_DIR`/`TLS_*`; pass explicit paths/hosts for other files.
The Web launcher sets Node's extra local CA before startup for configured Modulon
local domains. It never disables TLS verification. Keep Windows hosts entries
aligned with the current application/auth/admin/S3 names; old console aliases no
longer have Nginx routes. No system hosts/trust edits are made by Compose.

## Configuration and cleanup

```powershell
pnpm validate:dev
pnpm validate:qa
pnpm clean:dry
```

Validation reports key names, not secret values. `pnpm clean` deletes dependencies,
build outputs and compiler caches at workspace/package roots, with path/junction
checks. It preserves source, lockfile, env, certificates, volumes and data. Run
`pnpm install --frozen-lockfile` and rebuild after cleanup. Terminal cleanup uses a
spinner and reports `[success] deleted files: <path>` only after successful removal.

## Session and logout diagnostics

For countdown/role states, renewal limits, automatic expiry, hard Keycloak logout
and intermittent login-start 502s, use [Session operation](0402-session-operations.md).
It records the expected status/method boundaries and the latest verification
limits. Do not dump complete callback/logout requests or weaken TLS checks while
investigating an authentication failure.

## Recovery and PROD boundary

Docker volumes are persistence, not backup evidence. Current active data volumes
hold PostgreSQL data and SeaweedFS object/filer state. Removed-service volumes
were retained during the transition; they are not attached to the new services.
There is no backup scheduler, restore automation or verified PROD rollback.

Before storage/schema changes, identify the exact project, images, volumes and
configuration owners. Back up databases, object bytes/filer metadata and necessary
configuration off-host; prove restoration into an isolated environment. Do not
reset roles, realm users or volumes to resolve env drift. Prisma migration
commands stay explicit and must target the intended application database.

PROD remains Compose on Lightsail with Terraform, requiring a separate deployment
task. QA uses the [separate build/deploy/start flow](0316-qa-containers.md). Successful local health or
`pnpm test:infra` does not establish production recovery or complete human-login
acceptance.

[Back to runbooks](0400-runbooks.md) | [Docker cookbook](0302-local-docker.md) | [Keycloak login](0304-keycloak-login.md)
