---
brief: Local infrastructure with Compose-owned bootstrap, five-service DEV startup, DEV/QA separation and persistent data.
tags: [cookbook, docker, dev, qa, infrastructure]
---

# Local Docker: DEV and QA

## Current topology

DEV has four core service roles: **db** (PostgreSQL), **auth** (Keycloak),
**proxy** (Nginx) and **s3** (SeaweedFS). The canonical `dev:infra:up` also starts
**s3console**. Next.js runs on the host through `pnpm dev`.
DEV has no init-job containers, pgAdmin, Valkey or cache UI.
QA reuses the four core services and adds Web, Node queue and Python
release containers, plus a transient maintenance profile; see
[QA containers](0316-qa-containers.md).

The `tools` profile provides [S3 console](0317-s3-console.md). Automatic DEV startup,
`dev:infra:up` and DEV `stack:up` enable it, and DEV container checks require all
five services. QA enables it separately with `pnpm s3console:up --mode qa`.
Its official SeaweedFS Admin UI uses a separate panel login.

| Component | Startup work inside the same container |
| --- | --- |
| PostgreSQL | `postgres/start.sh` starts the upstream entrypoint, waits for TCP readiness, then runs `postgres/init/init-databases.sh` |
| Keycloak | `keycloak/start.sh` starts Keycloak, then its bundled Node runtime executes `configure.mjs` after management readiness |
| SeaweedFS | `seaweedfs/start.sh` generates private S3 config in tmpfs, starts `weed mini`, then executes signed bucket initialization |
| Nginx | Official entrypoint renders the checked-in template and starts the proxy |

Health checks remain unready until bootstrap succeeds. A failed setup stops its
own server and fails startup. PostgreSQL bootstrap creates missing application
and Keycloak databases/roles, validates existing owners/privileges/passwords and
preserves application migrations and data. Queue bootstrap creates and validates
its separate database/role inside the same PostgreSQL container.
Keycloak reconciles owned settings, roles, Web/directory clients and themes while
preserving human accounts, passwords and existing secrets. The former API client
is no longer managed by the template; existing unowned realm clients are not deleted.
SeaweedFS preserves objects and creates the configured bucket only when missing.

The Keycloak image includes Node plus UBI9-compatible runtime libraries; the
SeaweedFS image includes the pinned upstream `weed` binary in a Node Alpine
runtime. These execute setup inside their owning containers, not on the host.
Shell wrappers forward termination to the server and active bootstrap process.
The UBI library build follows [Keycloak container guidance](https://www.keycloak.org/server/containers).

## Prepare configuration

Run from the repository root with Docker Desktop available:

```powershell
pnpm install --frozen-lockfile
pnpm stack:init
pnpm qa:init
pnpm validate:dev
pnpm validate:qa
pnpm validate:certs
```

`stack:init` generates secrets for missing env files and preserves existing files.
Committed `.env.dev.example` / `.env.qa.example` describe only retained settings.
Real values remain ignored. Review `STACK_NAME`, ports, public URLs and TLS paths
before startup. DEV is `modulonpocdev`; QA is `modulonpocqa`, with independent
volumes. Published defaults overlap, so use these modes alternately unless ports
and browser origins are explicitly isolated.

Provide ignored `infra/local/certs/localhost.pem`, `localhost-key.pem` and
`rootCA.pem`. The server certificate must cover the selected names. Browser/OS
trust is a workstation prerequisite; copying certificates does not establish it.
Use [Local HTTPS and CA trust](0318-local-tls.md) for generation and OS-specific
CA installation commands.
Example Windows hosts entries for DEV (edit as administrator if missing):

```text
127.0.0.1 modulon.local web.modulon.local auth.modulon.local authconsole.modulon.local s3.modulon.local s3console.modulon.local
```

QA uses the same public names and ports as DEV: `modulon.local`,
`web.modulon.local`, `auth.modulon.local`, `authconsole.modulon.local`,
`s3.modulon.local` and `s3console.modulon.local`. Stop DEV before starting QA;
the difference is that QA runs built release containers instead of host app
processes. Compose projects, data volumes and credentials remain independent.
Host and container dependency URLs are different concerns.

## Start DEV

```powershell
pnpm stack:config
pnpm stack:up
pnpm stack:ps
pnpm dev
```

`stack:up` invokes Docker Compose; bootstrap is part of container startup.
`pnpm dev` then checks Engine/container readiness and prepares/starts the host
applications through the [DEV startup pipeline](0315-dev-startup.md).
Direct Compose also performs the same container setup:

```powershell
docker compose --env-file infra/local/.env.dev -f infra/local/compose.yaml -f infra/local/compose.dev.yaml up --detach --build --wait --remove-orphans
```

`--remove-orphans` removes obsolete containers only from the selected Compose
project. It does not remove named data volumes. Restarting a container re-runs
its idempotent bootstrap. `pnpm stack:auth:sync` manually reconciles the realm by
executing the same Node script inside the running Keycloak container; it creates
no extra container and requires no host Node connection to Keycloak APIs.

## Access

| Service | DEV access |
| --- | --- |
| Web through Nginx | `https://modulon.local/pl`, `/en`; host listener is port 3000 |
| PostgreSQL | Loopback TCP 5432, application and Keycloak roles stay separate |
| Keycloak issuer | `https://auth.modulon.local/realms/modulon` |
| Keycloak administration | `https://authconsole.modulon.local/admin/` |
| Local administration redirect | Loopback HTTP 8080 redirects to the canonical Keycloak administration URL |
| S3 API | `https://s3.modulon.local` or loopback HTTP 8333 |

The old API/worker/console upstreams and hostnames are not routed by Nginx.
Application API routes are on the Web origin under `/api/v1`. Anonymous S3 access
is denied. Credentials must not be pasted into public commands/logs.

## QA, logs and stop

```powershell
pnpm stack:config --mode qa
pnpm stack:logs
pnpm stack:auth:sync
pnpm stack:down
```

Use `pnpm qa:up` for ordered initialization/check/build/deploy/start, or run its
[separate phases](0316-qa-containers.md). QA reports occupied ports before
mutations; it never stops DEV automatically. Choose distinct ports/origins for
concurrent operation or stop the owning DEV services explicitly.
`down` preserves volumes. Do not use `down --volumes`, global prune or database
reset for ordinary troubleshooting. Old unused service volumes from the previous
layout were intentionally preserved when their containers were removed.

## Nginx fallback page

The 502 page retains the TrueGuard background/system font, English text and
Modulon logo/favicon. Nginx serves its assets locally even when Web is unavailable.
The original status, no-store and CSP remain; direct internal HTML access returns
404. Validate/reload using `docker exec dev-proxy-0 nginx -t` and
`docker exec dev-proxy-0 nginx -s reload` after snippet changes.

## Verification

Both DEV/QA Compose models validate. The disposable seven-service QA test passed
HTTPS/OIDC discovery, migrations/seed, durable Node-to-Python execution and task
authentication rejection without replacing DEV containers; see
[QA verification and limits](0316-qa-containers.md#verification-and-limits).
Those checks predate the automatic five-service DEV workflow. The core-service
test `pnpm test:infra` exercises a
separate four-service project with fresh volumes, generated test credentials and
random published ports, repeats bootstrap and restarts it. It removes only that
project's containers, networks, volumes and temporary env. The final images passed
fresh bootstrap, repeat initialization and restart with exactly four healthy
containers. Earlier live checks also verified preserved application migration status,
Keycloak issuer/directory credentials, signed existing-bucket access, anonymous
S3 denial and 404 for the then-removed console/API hosts. That older 404 check
does not describe the current S3 console route. The 13 tooling tests passed
for that earlier bootstrap slice.
It requires built
local images and certificates. Application Prisma migrations remain separate
from database creation: `pnpm dev` applies them through guarded `dev:migrate`,
while `pnpm db:deploy` is the independent CLI operation.

The newer `pnpm test:dev:infra:integration` exercises five-service DEV build/up,
status/logs, down preserving all three data volumes, no-build startup and permanent
delete/repeated delete. It uses its own project, instance index, random ports,
generated test configuration and volumes; it does not reset normal DEV data.
The recorded run passed, including real streamed progress and heartbeat messages.
See [automatic-start verification](0315-dev-startup.md#verification) for the
latest tooling checks and the remaining live-start boundary.

[Back to cookbook](0300-cookbook.md) | [Local runbook](0401-local-operations.md) | [Keycloak login](0304-keycloak-login.md)
