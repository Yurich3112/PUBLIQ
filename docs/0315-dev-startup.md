---
brief: Automatic DEV startup, supervised shutdown, modular rebuilds, Docker health and guarded Prisma preparation.
tags: [cookbook, development, startup, docker, prisma, worker]
---

# DEV startup

Run `pnpm dev` for both fresh and previously prepared dependencies and images.
The entrypoint uses Node built-ins and loads before `node_modules` exists.
`dev:start:cold` and `dev:start:warm` remain compatibility aliases of this same
workflow. It uses `pnpm install --frozen-lockfile --prefer-offline`, prepares the
virtualenv only as needed and always builds/starts Compose with cache. Missing
images no longer require a different command. Packages are not upgraded.

Configure private env files and local TLS first; see [local HTTPS](0318-local-tls.md).
Install Node (documented version: 26; minimum 22.18 for native TypeScript), the
pinned pnpm version from `package.json`, Docker Engine/Compose and Python
3.12–3.14. Startup checks tools and the running Engine before installation.
It reuses an existing virtualenv's base interpreter, respects `PYWORKER_PYTHON`
and otherwise probes the default Python plus installed versioned interpreters
(the `py` launcher on Windows). It never downloads Python or starts Docker Desktop.

Each of the eight stages below prints its purpose and elapsed time; operations
lasting over 15 seconds print periodic progress. Compose streams its own output.
Failure stops later stages, preserves diagnostics and tells you to rerun
`pnpm dev` after fixing the problem. Normal startup preserves volumes, secrets
and OS trust; missing env/TLS or credential conflicts require explicit correction.
Application auth validation follows package installation because its schema uses
workspace dependencies, but precedes Python preparation, Docker changes and
migrations. `AUTH_SECRET` must contain at least 32 characters.

| Stage | Work |
| --- | --- |
| 1 | Verify Node, pinned pnpm, Docker Engine/Compose and supported Python |
| 2 | Verify DEV env, TLS and free host listener ports |
| 3 | Synchronize frozen pnpm packages, preferring cached downloads |
| 4 | Validate application auth configuration without exposing values |
| 5 | Prepare Python virtualenv and hash-locked dependencies as needed |
| 6 | Build/start Compose with cache and wait for healthy services; restart first only for `dev:restart` |
| 7 | Prepare shared packages/Prisma, queue schema, committed migrations and missing seed defaults |
| 8 | Start supervised Web, queue and Python services concurrently |

## Lifecycle and component rebuilds

`scripts/dev.mjs` owns a workspace-specific local control channel throughout
setup/runtime and supervises the pnpm host-service tree. A second lifecycle
operation cannot acquire that channel. `dev:restart`, global `dev:rebuild` and
`dev:stop` ask the existing supervisor to stop its descendants before proceeding.
They never select processes by port, executable name or persisted PID. The
configured Web/Python/queue-bridge ports must then be free. Individually launched
services and legacy sessions must be stopped manually in their original terminals.

| Command | Behavior |
| --- | --- |
| `pnpm dev:stop` | Stop supervised host services and take down DEV Compose, retaining volumes |
| `pnpm dev:restart` | Stop the host session and repeat automatic startup, taking down/restarting DEV Compose without cleanup |
| `pnpm dev:clean` | Guard stopped host ports, then reuse `clean`; keep Python `.venv` |
| `pnpm dev:rebuild` | Stop the host session, validate auth, take down DEV Compose, clean JS dependencies/outputs and Python environment/caches, reinstall and cold-start the entire stack |
| `pnpm dev:rebuild:web` | Clear Web outputs/cache, build shared packages, typecheck/lint Web; production output is still built explicitly with `build:web` |
| `pnpm dev:rebuild:pyworker` | Recreate `.venv` and Python caches, then install hash-locked wheels; recover the previous base interpreter before deletion unless `PYWORKER_PYTHON` is set |
| `pnpm dev:rebuild:prisma` | Clear database outputs, run `prisma generate` and compile; retain schema, migrations and database contents |
| `pnpm dev:rebuild:queue` | Clear queue outputs and compile |
| `pnpm dev:rebuild:monitoring` | Clear monitoring outputs, build Prisma and compile monitoring |
| `pnpm dev:rebuild:docker` | Take down DEV Compose, rebuild/start its services and wait for health |

Component rebuilds require stopped host services and return without launching
host services or applying migrations/seeds. JS components synchronize the shared
pnpm installation; Web validates auth. Python and Docker rebuilds operate without
installing JS packages or requiring Web auth. Dotted aliases `dev.rebuild.web`, `dev.rebuild.pyworker`,
`dev.rebuild.prisma`, `dev.rebuild.queue`, `dev.rebuild.monitoring` and
`dev.rebuild.docker` delegate to the corresponding colon commands. Start all
services with `pnpm dev`, or use the individual launchers after preparation.
Global rebuild handles every component. Generated Prisma files are regenerated
by the owning build, without deleting schema/migration sources.

Ctrl+C stops the supervised host tree and leaves Docker running. Use `dev:stop`
to take Docker down too. Cleanup uses fixed generated paths with resolved-path
and junction/symlink checks. It preserves private env, source, lockfiles, TLS and
data volumes. On POSIX, an abnormal supervisor kill may leave `.local/dev-control.sock`;
remove that stale socket only after confirming the original session has ended.

## Standalone preparation commands

| Order | Reusable command | Effect |
| --- | --- | --- |
| 1 | `pnpm terminal:clear` | Clear an interactive terminal; redirected logs remain intact |
| 2 | `pnpm pyworker:prepare` | Prepare Python; install locked dependencies only when missing or changed |
| 3 | `pnpm dev:preflight` | Validate DEV env/auth/TLS and Docker Engine |
| 4 | `pnpm check:containers`, `pnpm check:dev-ports`, `pnpm preferences:sync` | Check service health/ports and synchronize assets |
| 5 | `pnpm dev:build` | Build Prisma/database, queue and monitoring; generate Prisma Client |
| 6 | `pnpm dev:queue:prepare` | Prepare pg-boss while preserving jobs, policy and credentials |
| 7 | `pnpm dev:migrate` | Verify local targets, then apply committed Prisma migrations |
| 8 | `pnpm dev:seed` | Verify local targets, then insert only missing defaults |
| 9 | `pnpm terminal:clear` | Clear after every preparation command succeeds |
| 10 | `pnpm dev:services` | Start Web, Python and queue concurrently |

`dev:prepare` groups steps 2–8; `dev:prepare:application` groups steps 4–8.
The lifecycle validates env/TLS and prepares Python before bringing up Docker,
then reuses only application preparation. The automatic entrypoint keeps its
stage history visible instead of clearing the terminal. Those phases and shared package builds
are no longer repeated. The supervised Python launcher verifies its prepared
environment without reinstalling dependencies or rewriting env. Migration and
seed commands keep their target guards for safe independent use. Global rebuild
retains its pre-clean configuration/dependency check before the clean install.
The low-level `dev:run` command reuses these aliases
through `&&`; a nonzero preparation exit prevents the second clear and every
host-service launch. Failed setup diagnostics therefore stay visible.

Automatic startup uses `prisma migrate deploy`, not interactive migration
generation. It applies the migrations already stored in the repository and does
not reset the database or invent a new migration. `pnpm db:migrate` remains the
explicit command for developing migrations. The local target guard checks both
owning application env files, inherited URL overrides, the separate queue target,
loopback host, port, database and role against `infra/local/.env.dev`. Unexpected
URL options or a remote target stop the automatic migration step without printing
connection values.

Queue database/role provisioning (`pnpm queue:setup`) remains explicit.
After infrastructure bootstrap creates that database/role, `dev:queue:prepare`
automatically creates/upgrades the library schema and missing diagnostic queue.
It does not change credentials, provision roles or overwrite existing retry policy.
This also handles a fresh volume after `dev:infra:delate` and `dev:infra:up`.
Application seeding now follows every successful migration step. Existing
defaults are checked first and preserved; missing defaults are added atomically.
An unchanged run prints `[skip] Seed data already exists`. A failed seed blocks
service launch and the second screen clear. `dev:seed` reuses the already-built
client through `db:seed:prepared`; `db:seed` remains the standalone build/CLI
entrypoint. See [seed ownership and guarantees](0303-prisma-database.md#system-technical-actor-and-initial-configuration-seed).
The DEV pipeline neither rotates credentials nor recreates databases or volumes.

## Docker checks

The project namespace stays `modulonpocdev`. Service roles are `db`, `auth`, `s3`,
`proxy` and `s3console`; container names are `dev-<role>-<instance>`. Explicit
`*_VOLUME_NAME` settings keep existing storage independent of display names.
DEV `stack:up/down/ps/logs` commands delegate to `dev:infra:up/down/status/logs`.
Only explicit `dev:infra:delete` (and its legacy misspelling `delate`) deletes data.

`pnpm dev:doctor` reports independent read-only checks for config/secret consistency,
TLS, Docker, service health, database connections, pending Prisma migrations,
pg-boss schema/diagnostic queue and host ports. Busy ports are informational because
DEV may already be running. Failed checks return a nonzero exit and suggest a
command; no repairs, installs or restarts are performed.

| Command | Successful check | Failure |
| --- | --- | --- |
| `pnpm check:docker` | Docker Engine answers `docker info` | `ERROR DOCKER ENGINE IS NOT WORKING` |
| `pnpm check:containers` | Every configured DEV Compose service is running and healthy in the owning project | `ERROR DOCKER CONTAINERS ARE NOT READY` with service states, or `ERROR DOCKER CONTAINERS CANNOT BE VERIFIED` |

Container inspection uses the explicit DEV project and both DEV Compose files.
A healthy container in another project cannot satisfy the check. Missing,
stopped, restarting, starting and unhealthy services prevent startup. Commands
are bounded and omit raw daemon diagnostics/configuration from errors. A CLI
permission/context problem can also prevent verification; run the same commands
in the normal user terminal to distinguish it from a stopped Engine.

## Host services and ports

`dev:services` runs `dev` in exactly three selected workspace packages using
`--parallel --stream --reporter=append-only`. Services work concurrently and each
output line is appended with its workspace path. Output is streamed immediately
instead of being grouped until a process exits or displayed as a redrawn status
panel. The individual root aliases select the same owning package scripts:

```text
apps/web dev: ...
apps/pyworker dev: ...
packages/queue dev: ...
apps/web dev: ...
```

| Command | Default listener / behavior |
| --- | --- |
| `pnpm dev:web` | Next.js on port 3000; Web env `PORT` is used unless overridden by the process |
| `pnpm dev:pythonworker` | Alias of `dev:pyworker`; source-only reload, default loopback port 8010 |
| `pnpm dev:queue` | Start the prepared Node consumer; optional authenticated queue bridge has its own configured port |

Prisma Studio stays outside this flow. Run `pnpm db:studio` separately when
needed; it listens on port 5555. Its port does not block ordinary DEV startup.

`pnpm check:dev-ports` checks Web, Python and the optional queue bridge.
Duplicate configured service ports are rejected. Existing listeners are reported
without terminating them. `pnpm check:ports` still supports individual port
checks and defaults to Web only. Port checks are point-in-time observations;
the application remains responsible for reporting a later bind conflict.

For separate terminals, run `pnpm dev:prepare` once, then the desired service
aliases individually. `queue:worker` remains the standalone convenience command
that builds its dependencies before starting the queue consumer. `dev:web` and
`dev:queue` are prepared-runtime launchers and do not repeat builds or migrations.
Stop the foreground service group with Ctrl+C. Once service launch begins,
inspect each service's output/readiness; successful preparation does not establish
that all long-lived applications stayed healthy.

## Verification

`pnpm test:scripts` covers automatic startup and its cold/warm aliases, a copied
checkout without `node_modules`, interpreter selection, pre-install tool/config
failures and prevention of later phases after installation/auth/Python/Compose
or application-preparation failure. Supervisor tests verify workspace isolation
and shutdown of only owned process trees. Fixture pnpm graphs also cover all
three selected services, streamed prefixes and Studio's separate command;
their two clear operations belong to legacy `dev:run`, not automatic startup.
Separate tests cover Compose/project/health isolation, secret-safe errors, ports
and guarded migration targets. These tests do not start the actual applications.

| Check | Scope |
| --- | --- |
| `pnpm test:scripts` | Deterministic tooling/workflow tests; the recorded automatic-start change passed 76 tests |
| `pnpm test:dev:infra:integration` | Real cached build/up, status, logs, down preserving three volumes, up --no-build, delete and repeated delete on a disposable five-service project |
| `pnpm dev:doctor` | Read-only diagnosis of the configured local environment |

The isolated infrastructure integration passed, including visible Compose output
and elapsed-time updates. Its containers and test volumes were removed; the
normal DEV project's data were preserved. Actual automatic-start tool checks
passed with Node 26.12.1, pnpm 12.15.0, Docker/Compose and Python 3.14.
The full new `pnpm dev` attempt stopped because a workspace supervisor was already
active. That session was left running; end-to-end launch of the new workflow in
this checkout remains to be repeated after the original session ends. Passing
fixture tests does not establish a live application start.

To smoke-test a configured local stack, run `pnpm dev`; it may apply committed
migrations after its target checks pass. Use the separately available read-only
checks first when diagnosing an existing environment.

[Back to cookbook](0300-cookbook.md) | [Command reference](0205-workspace-commands.md)
