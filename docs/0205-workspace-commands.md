---
brief: Root pnpm workspace, Web/check/test commands and local Docker aliases for Modulon PoC.
tags: [architecture, workspace, pnpm, development, tooling]
---

# Workspace commands

## Workspace and installation

The repository root owns `package.json`, `pnpm-workspace.yaml` and a shared
`pnpm-lock.yaml`. The workspace includes `apps/*` and `packages/*`; currently
`apps/web`, `apps/pyworker`, `packages/database`, `packages/queue` and `packages/monitoring` have manifests. The nested Web lockfile and
workspace config were removed. Existing Web dependency versions and lockfile
integrity/resolution entries were preserved during migration.

Use pnpm 12.15.0, recorded in `packageManager`. Install from the repository root:

```powershell
pnpm install --frozen-lockfile
```

The root inherits the previous Web native-build policy: `@parcel/watcher` and
`@swc/core` allowed; `sharp` and `unrs-resolver` disabled. Prisma and
`@prisma/engines` build scripts are explicitly allowed for the database package. No additional
minimum-release-age rule was introduced. The root manifest includes database build and `db:*` commands; see the
[Prisma workflow](0303-prisma-database.md).
The Web footer displays the root system version.

For step-by-step development, use the [cookbook](0300-cookbook.md). For startup,
health and incident diagnostics, use the [local runbook](0401-local-operations.md).

## Web and verification

| Command | Effect |
| --- | --- |
| `pnpm dev` | Automatic tool/Engine/config/TLS checks, frozen cached installation, Python preparation, cached Compose build/start and health wait, then Prisma/queue preparation and host services |
| `pnpm dev:start:cold` / `pnpm dev:start:warm` | Compatibility aliases of the same automatic `pnpm dev` workflow |
| `pnpm dev:stop` | Stop the owned host process tree and DEV Compose; preserve volumes |
| `pnpm dev:restart` | Stop owned host services and repeat automatic startup, taking down/restarting Docker without cleaning data |
| `pnpm dev:rebuild` | Stop owned services, validate auth, clean JS outputs/dependencies and Python virtualenv/caches, then perform a cold start |
| `pnpm dev:clean` | Guard stopped host ports, then run the same cleanup as `clean`; preserve Python virtualenv |
| `pnpm dev:infra:delate` / `pnpm dev:infra:delete` | Permanently delete DEV infrastructure containers and all three owned data volumes; preserve host processes, env and certificates |
| `pnpm dev:infra:up` | Build/start five DEV infrastructure containers including the S3 console, wait for health; fresh volumes bootstrap using the current infra env, without host services or Prisma migrations |
| `pnpm dev:infra:down` | Stop/remove DEV containers and networks; preserve volumes |
| `pnpm dev:infra:status` | Show the owning DEV Compose services |
| `pnpm dev:infra:logs` | Show the last 100 log lines for DEV infrastructure |
| `pnpm dev:rebuild:web` | Clear Web outputs, build shared packages and validate Web types/lint; no production Web build |
| `pnpm dev:rebuild:pyworker` | Recreate Python virtualenv/caches and install locked wheels, retaining the existing base interpreter |
| `pnpm dev:rebuild:prisma` | Clear database package outputs, regenerate Prisma Client and compile; no migration/reset |
| `pnpm dev:rebuild:queue` | Clear and recompile the queue package |
| `pnpm dev:rebuild:monitoring` | Clear monitoring outputs, build Prisma and recompile monitoring |
| `pnpm dev:rebuild:docker` | Rebuild/start DEV Compose after taking it down; preserve volumes |
| `pnpm dev.rebuild.<component>` | Dotted aliases for the six component rebuilds above |
| `pnpm dev:run` | Standalone legacy clear/prepare/clear/parallel-service pipeline; no install or Docker startup; the automatic supervisor calls application preparation and services directly |
| `pnpm dev:check:web` | Typecheck and lint Web without writing production build outputs |
| `pnpm check:dev-auth` | Validate the actual Web auth schema and minimum secret length; no secret generation or connectivity claim |
| `pnpm terminal:clear` | Clear interactive terminal output; keep redirected logs intact |
| `pnpm dev:prepare` | Run preflight, package builds, guarded Prisma migrations, conditional seeding and Python preparation |
| `pnpm dev:prepare:application` | Check running infrastructure/host ports, synchronize assets, build shared packages and prepare data; reuse after lifecycle setup without repeating env/TLS/Python preparation |
| `pnpm dev:doctor` | Read-only report for configuration, matching credentials, TLS, Docker, database schemas/migrations and ports; no installs, repairs or restarts |
| `pnpm dev:build` | Build the Prisma/database, queue and monitoring packages |
| `pnpm dev:queue:prepare` | Prepare pg-boss schema and missing diagnostic queue in the verified existing DEV database; preserve jobs, policy and credentials |
| `pnpm dev:migrate` | Check local DEV database targets and apply committed migrations through `db:deploy` |
| `pnpm dev:seed` | Check local targets and seed only missing defaults using the prepared database client |
| `pnpm db:seed:prepared` | Run the seed entrypoint with the package's private env; requires an already-built client |
| `pnpm dev:services` | Run the three owning workspace `dev` scripts concurrently with immediate path-prefixed append-only logs |
| `pnpm dev:web` | Start only Next.js from a prepared checkout; no repeated build or migrations |
| `pnpm pyworker:setup` | Create/update the app-local virtualenv, install hash-locked Python wheels and link private Node-to-Python task configuration |
| `pnpm pyworker:prepare` | Prepare Python without forcing dependency installation when the lock is unchanged |
| `pnpm dev:pythonworker` | Alias of `dev:pyworker`, selected by `dev:services` |
| `pnpm dev:pyworker` | Prepare/start Python; reload only when source `.py` files change |
| `pnpm start:pyworker` | Start prepared Python without reload or dependency installation |
| `pnpm lint:pyworker` / `pnpm test:pyworker` | Check Python formatting/lint or run worker/helper unit tests; require setup and never install or edit env |
| `pnpm test:pyworker:bridge` | Exercise the real Python client and Node HTTP bridge with a queue backend fixture; no PostgreSQL required |
| `pnpm test:pyworker:reload` | Verify source reload and ignored cache edits with a temporary local process |
| `pnpm test:pyworker:integration` | Run bridge/unit checks, then queue retry/repeat/auth and PostgreSQL helper commit/rollback/timeout checks on a disposable database |
| `pnpm dev:preflight` | Validate env/auth/certificates and Docker Engine; container/port/asset checks belong to application preparation |
| `pnpm check:docker` | Check Docker Engine independently; failure prints `ERROR DOCKER ENGINE IS NOT WORKING` |
| `pnpm check:containers` | Check each configured DEV service's running/healthy state in the owning Compose project |
| `pnpm check:dev-ports` | Check Web/Python and optional queue bridge ports; reject duplicate service ports |
| `pnpm check:dev-databases` | Verify local application and separate queue targets before automatic migrations |
| `pnpm build` / `pnpm build:web` | Build the production Web application |
| `pnpm start` / `pnpm start:web` | Start the already-built Web application |
| `pnpm typecheck` | Build/typecheck Prisma, generate Next.js route types and typecheck Web |
| `pnpm lint` | Run Web ESLint and Python Ruff checks |
| `pnpm check` | Run typecheck, lint and default tests, including Python; separate integration/reload commands are not included |
| `pnpm test` | Run script, database client, Web, monitoring and Python unit tests |
| `pnpm queue:setup` | Provision/reconcile the local queue database/role, private Web connection and pg-boss schema |
| `pnpm queue:worker` | Build dependencies and start the durable host queue consumer |
| `pnpm dev:queue` | Start the already-prepared queue consumer without rebuilding |
| `pnpm db:studio` | Start Prisma Studio separately on port 5555; excluded from `dev:services` |
| `pnpm test:queue:integration` | Check restart persistence, ordering and exactly three retries on a disposable database |
| `pnpm test:queue:actions` | Check cancel/resume/retry/repeat/removal, stale-action guards and active-job protection on a disposable database |
| `pnpm test:monitoring` | Build monitoring and check bounded probes and safe status reporting |
| `pnpm test:monitoring:integration` | Verify history aggregation, minute uniqueness and seven-day cleanup on a disposable database |
| `pnpm test:config:integration` | Verify configuration audit, concurrent activation, immutability, worker acknowledgement and configured retention on a disposable database |
| `pnpm test:infra` | Verify fresh four-container bootstrap/restart in a disposable project; requires built images and Docker |
| `pnpm test:dev:infra:integration` | Exercise DEV build/up, no-build startup, status, logs, volume-preserving down and permanent delete on an isolated five-service stack; removes only its test data |
| `pnpm test:auth:integration` | Disposable PostgreSQL + signed OIDC flow test; requires running DEV PostgreSQL |
| `pnpm test:database` | Build Prisma and run three offline client contract tests |
| `pnpm test:database:integration` | Test Prisma deploy/seed, UUIDv7 and concurrent idempotence on two disposable databases |
| `pnpm test:products:integration` | Verify product UUIDv7, exact decimals, references and locking on a disposable database |
| `pnpm db:seed` | Explicitly seed the installation UUIDv7 and nine role codes through Prisma CLI |
| `pnpm test:scripts` | Run tooling/stack tests against temporary fixtures |
| `pnpm test:web` | Run Web API/config, access policies, file/product actions, table queries, preferences and component tests |
| `pnpm test:ui` | Run basic-component tests only |

`apps/web/.env` was initialized from its safe local example only when absent.
It is ignored by Git; its database URL uses local application credentials.
DEV preference cookies use `UI_PREFERENCE_COOKIE_DOMAIN=modulon.local` to share
the theme with Keycloak. Empty domain means host-only preferences for localhost-only
work and produces an informational validator warning. Authentication cookies stay
host-only. A changed env value is not a database/client credential
rotation. Next.js loads only its own application-local env.

DEV preflight checks the configured Web and Python ports and the optional queue
bridge port. Studio's port is excluded. It reports existing listeners without stopping
them. Availability is a point-in-time check, not a port reservation. `pnpm dev`
checks Docker but does not start or stop it; use the separate stack commands.

## Configuration and cleanup

| Command | Effect |
| --- | --- |
| `pnpm validate:env` / `pnpm validate:dev` | Match DEV env keys against committed examples, without printing values |
| `pnpm validate:qa` | Match QA env keys and require nonempty values |
| `pnpm validate:prod` | Apply the same strict value check to existing PROD examples |
| `pnpm validate:certs` | Validate dates, matching key, direct local CA signature and requested SANs |
| `pnpm check:ports` | Check Web's DEV port; explicit port arguments are also supported |
| `pnpm clean:dry` | Preview dependency directories, generated outputs and compiler/linter cache files without deletion |
| `pnpm clean` | Delete `node_modules`, known build directories, `*.tsbuildinfo` and `.eslintcache` at workspace/package roots |

Cleanup includes root and package `node_modules` by default. The old
`--dependencies` flag is accepted for compatibility and is no longer necessary.
Sources, lockfile, env, certificates, virtual environments and data are preserved.
Run `pnpm install --frozen-lockfile` before using application commands again.
No cleanup command was run against actual outputs during workspace setup.
An env scan with no templates reports nothing to validate; it does not establish
PROD readiness. Certificate validation does not establish browser/OS trust.

## Docker aliases

Optional S3 operator tooling is separate from normal startup. Use
`pnpm s3console:up` or the individual `s3console:init`, `s3console:build`,
`s3console:start`, `s3console:stop`, `s3console:status` and `s3console:logs`
commands. Append `--mode qa` for QA or `--port 8091` for another local port.
`pnpm test:s3console:integration` exercises a disposable bucket through a running
console. See [S3 console](0317-s3-console.md) for operator permissions and limits.

See [Local Docker: DEV and QA](0302-local-docker.md) for setup and startup order,
including project isolation and the [separate QA stages](0316-qa-containers.md).

| Command | Effect |
| --- | --- |
| `pnpm stack:init` | Initialize a missing DEV infrastructure env from its template; preserve an existing file |
| `pnpm stack:config` | Validate selected Compose configuration quietly |
| `pnpm stack:up` | Build/start the selected stack, wait for container-owned bootstrap/health and remove project orphans |
| `pnpm stack:down` | Stop the selected Compose project, preserving volumes |
| `pnpm stack:ps` | Show the selected project's containers |
| `pnpm stack:logs` | Show recent selected-project logs |
| `pnpm stack:pull` | Pull selected external images |
| `pnpm stack:auth:sync` | Reconcile managed Keycloak realm settings inside its existing container |

These commands default to DEV. Append `--mode qa` to select QA, for example:

```powershell
pnpm stack:config --mode qa
```

To return from QA to DEV, use `pnpm qa:stop && pnpm dev`. To remove QA containers
while retaining their named data volumes, use `pnpm stack:down --mode qa && pnpm dev`.
If QA's optional S3 console was started separately, stop it first with
`pnpm s3console:stop --mode qa`. QA wrappers derive required credential-bearing
database URLs in memory; see [environment switching](0316-qa-containers.md#return-from-qa-to-dev).

Automatic DEV runs five infrastructure containers in modulonpocdev, including
S3 console; QA is isolated as modulonpocqa and enables its console separately.
Both use the shared four-service base. QA adds Web, Node queue and Python
containers plus a transient maintenance profile. Ports overlap by default;
occupied ports block QA startup without stopping DEV. Use `qa:init`, `qa:check`,
`qa:build`, `qa:deploy`, `qa:start` individually or `qa:up` for the ordered flow.
`qa:build:<service>` builds one target; `qa:build` runs the eight leaf commands
concurrently with prefixed logs. `qa:status`, `qa:logs` and `qa:stop` operate QA
separately. `stack:up --mode qa` is guarded: use the explicit QA flow.
PROD is a separate future deployment contract.

## History, reconciliation and recovery

| Command | Effect |
| --- | --- |
| `pnpm storage:report` | Read-only PostgreSQL/document-bucket reconciliation report |
| `pnpm storage:cleanup --report <path> --confirm <sha256>` | Explicitly approved, aged orphan cleanup with live revalidation |
| `pnpm test:storage:conditional-delete` | Verify local SeaweedFS rejects a mismatched delete ETag using one owned temporary object |
| `pnpm backup:create dev` / `pnpm backup:create qa` | Offline backup of all selected-project data volumes; console state when present |
| `pnpm backup:restore <directory>` | Restore verified archives into new random volume names |
| `pnpm test:reliability` | Focused timeout, logout race, process cleanup, reconciliation and backup guard tests |
| `pnpm test:products:integration` | Disposable migrated database, audit snapshots, concurrency and SQL deadlines |
| `pnpm test:queue:recovery` | Recover a durable job after forcibly stopping its active test worker |
| `pnpm test:pyworker:shutdown` | Verify an active Python request drains before process exit on Windows/POSIX |
| `pnpm test:browser:reliability` | Canonical-domain login, two administrators, popup/session/table/preview regressions |
| `pnpm test:backup:integration` | Isolated fresh stack, backup, restore, three database canaries and S3 bytes |

See [history and recovery](0403-data-recovery.md) for prerequisites and recovery
acceptance, and [reliability verification](0404-reliability-verification.md) for
browser setup and the audit scope. These commands do not enable the deferred
[30-day trash processor](9999-backlog.md).

[Back to architecture](0200-architecture.md)
