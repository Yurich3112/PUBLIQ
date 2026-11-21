---
brief: Separate QA image builds, controlled migrations and seeding, and startup of isolated release containers.
tags: [cookbook, qa, docker, deployment, workers]
---

# QA containers

QA runs seven persistent services: PostgreSQL, Keycloak, SeaweedFS, Nginx,
Web, the Node queue consumer and Python. A temporary maintenance container
applies or verifies migrations; it is removed after each operation.
Automatic DEV starts five infrastructure containers, including S3 console, with
application processes on the host. QA's console remains a separate tools profile.
QA has one committed template, `infra/local/.env.qa.example`, and one ignored
configuration file, `infra/local/.env.qa`. Service-specific env files are not used.

The browser uses the same URLs as DEV: `https://modulon.local`,
`https://auth.modulon.local`, `https://authconsole.modulon.local`,
`https://s3.modulon.local` and, when enabled, `https://s3console.modulon.local`.
`web.modulon.local` is the shared Web alias. The environment changes how the
application runs: host processes in DEV, built release containers in QA.
Projects, volumes, credentials and application cookie names stay separate.

To switch from DEV, run from the repository root:

```powershell
pnpm dev:stop
pnpm qa:up
pnpm qa:status
```

Proceed to the next command only after the previous one succeeds. Then open
`https://modulon.local/pl` or `/en`. `qa:up` runs the stages below and `qa:init`
migrates former built-in QA hostnames to the shared public names, preserving
custom domains/ports and existing credentials. If services were launched outside
the DEV supervisor, stop them in their own terminals first.

## Return from QA to DEV

For an ordinary switch, stop QA containers while retaining their images and data,
then let the automatic DEV command prepare and start its own environment:

```powershell
pnpm qa:stop && pnpm dev
```

To remove QA containers and its Compose networks while retaining named volumes:

```powershell
pnpm stack:down --mode qa && pnpm dev
```

These examples use PowerShell 7 or a shell supporting `&&`, so DEV starts only
after QA shutdown succeeds. If the optional QA S3 console was started separately,
stop it first with `pnpm s3console:stop --mode qa` to release its listener too.
`qa:stop` stops services; `stack:down --mode qa` removes the main QA containers.
Neither command deletes database or storage volumes. Re-entering QA still uses
`pnpm dev:stop && pnpm qa:up` and the same `https://modulon.local` browser origin.

Use the pnpm wrappers for QA operations. They derive encoded database URLs in
memory; raw Compose commands with only `.env.qa` lack required
`QA_DATABASE_URL` / `QA_QUEUE_DATABASE_URL` interpolation variables. Do not copy
derived credential-bearing URLs into commands, generated files or logs.

## Commands and order

Run from the repository root with Docker Desktop running and local TLS files
prepared as described in [Local Docker](0302-local-docker.md).

```powershell
pnpm qa:init
pnpm qa:check
pnpm qa:build
pnpm qa:deploy
pnpm qa:start
```

`pnpm qa:up` executes those five commands in order and stops at the first failure.
`qa:init` preserves existing credentials, generates missing placeholder secrets
and fills missing settings in the single private env while preserving the
section comments. It removes the former generated `.web`, `.queue`, `.pyworker`,
`.maintenance` and `.nginx.template` files. Review the ignored
`infra/local/.env.qa` before starting. Commands read its current values directly.

| Command | Responsibility |
| --- | --- |
| `qa:check` | Check local Docker Engine, QA identity/volume isolation, per-service runtime variable allowlists, loopback ports and TLS certificate/key/CA/SANs |
| `qa:build` | Run all eight leaf image commands concurrently through pnpm, with script-prefixed logs |
| `qa:build:web` | Build the standalone Next.js release image |
| `qa:build:queue` | Build the production Node queue image |
| `qa:build:pyworker` | Build the Python runtime image |
| `qa:build:maintenance` | Build the controlled Prisma/seed/queue-schema tool image |
| `qa:build:auth` / `qa:build:s3` | Build the bootstrap-aware infrastructure images using QA-specific tags; legacy technology-name aliases remain supported |
| `qa:build:db` / `qa:build:proxy` | Pull the configured upstream images; legacy technology-name aliases remain supported |
| `qa:deploy` | Stop only QA application workers/Web, start QA PostgreSQL, apply committed Prisma migrations, seed missing defaults and initialize pg-boss |
| `qa:start` | Start prepared infrastructure, verify migration/seed/queue readiness, then start Web and workers and await health |
| `qa:status` / `qa:logs` | Show QA state or recent application logs |
| `qa:stop` | Stop QA containers while preserving their volumes |
| `pnpm stack:down --mode qa` | Remove the main QA containers/networks while preserving named volumes; derives the required runtime variables internally |

Build does not start containers or migrate data. Deploy and start require images
already present locally and use `--no-build --pull never`. Start verifies the
database; it does not apply migrations or seed data. Deploy leaves applications
stopped if migration fails; inspect the error before retrying. Schema rollback
and backup restoration require a separate operator decision.
The maintenance process invokes the installed pinned Prisma CLI directly with
Node; package installation is not part of deploy or start.
Prisma Studio remains a separate `pnpm db:studio` command.

## Ports and isolation

Default QA ports overlap DEV: 80, 443, 8080, 5432 and 8333. If another stack owns
them, the command reports `ERROR QA PORTS ARE OCCUPIED` before startup or
migrations. It never stops DEV automatically. Either stop the known owning
services explicitly or choose unused QA ports and matching public HTTPS URLs.
Existing running QA bindings are allowed when restarting its own project.
Port checks describe current availability and do not reserve ports.

QA uses its own project name, volume names, credentials and cookie names.
The default browser DNS/hosts entries and local certificate are shared with DEV.
When custom origins are configured, update hosts/TLS accordingly. The public Keycloak
issuer remains canonical inside containers through Nginx network aliases and
the mounted local CA. One checked-in Nginx template serves both DEV and QA;
its HTTPS listener and Compose mapping use the configured HTTPS port. No private
Nginx template is generated. The optional S3 console has its own configured hostname.

Only loopback infrastructure ports are published. Web and Python have no direct
published host port. Python listens on `0.0.0.0` only with explicit
`PYWORKER_ALLOW_NETWORK_BIND=true` and belongs to the internal workers network.
Node permits plain HTTP to the exact `pyworker` service name only with
`PYWORKER_ALLOW_PRIVATE_NETWORK=true`; authenticated requests still require the
shared private task token. The optional reverse queue bridge and Python database
helper are not enabled by this QA configuration.

## Images and secrets

The Web Dockerfile separates manifest/dependency installation, backend builds,
Next.js build, standalone Web runtime, production queue runtime and maintenance
targets. The Python Dockerfile installs hash-verified runtime wheels in a builder
and copies its virtualenv and source into an unprivileged runtime; Ruff stays in
development. Web, queue, maintenance and Python run as non-root users. Queue and
Python use read-only filesystems with a temporary writable `/tmp`.

Root and infrastructure `.dockerignore` files exclude private env files, TLS
keys, local data, dependency directories and generated outputs from build
contexts. Builds receive only public configuration arguments. Runtime settings
are read from the single `.env.qa` and mapped explicitly in `compose.qa.yaml`:

| Consumer | Permitted secrets |
| --- | --- |
| Web | Application/queue DB, Web OIDC/directory clients, sessions and application/avatar S3 identities |
| Queue | Application/queue DB, application S3 identity and Python task token |
| Python | Python task token; no database, OIDC or S3 credentials |
| Maintenance | Application and queue DB connections only |

The launcher derives percent-encoded PostgreSQL connection URLs in memory and
passes them in the child process environment, never command-line arguments or
extra files. Containers receive only their declared environment mapping; the
entire infrastructure env is never attached with `env_file`. The resolved
Compose environment is validated against each consumer's exact allowlist before
startup. Direct ad-hoc Compose invocations require those derived variables;
use the repository's `qa:*` or `stack:* --mode qa` commands instead.

The template shares the DEV infrastructure/visual section layout and adds
`WEB - NEXT.JS`, `QUEUE WORKER`, `PYTHON WORKER` and `DATABASE MAINTENANCE`.
Each section identifies the multi-stage Dockerfile/target; Python concurrency,
task timeout and log level are configured in its runtime subsection. Existing
credentials are preserved during migration. Secrets in committed QA examples
remain placeholders and are generated independently of DEV. Secret annotations
`# <<< [!]` end at column 100 in both example files.

## Verification and limits

`pnpm test:scripts` covers phase separation, target/port guards, runtime secret
separation and command routing. `pnpm test:qa:integration` requires the built
images and certificates. It creates an isolated random QA project with fresh
credentials and free ports, applies migrations/seed, starts all seven services,
checks HTTPS Web and canonical OIDC discovery, executes a durable queue task in
Python and verifies unauthenticated task rejection. It also checks image metadata
for fixture secrets and verifies that DEV container IDs are unchanged.
Cleanup removes only this disposable project's containers, volumes, networks
and private fixture files.

After changing QA to the shared DEV hostnames, 78 script tests passed, including
default hostname/origin parity, migration of legacy names, preservation of secrets
and ports, custom-domain preservation and repeated-init idempotence. The actual
QA Compose wrapper configuration also validated without exposing derived URLs.
The full disposable QA integration passed again with the shared hostnames:
seven healthy services, Web HTTPS and canonical OIDC discovery through internal
DNS/TLS, durable queue-to-Python execution and invalid-token rejection. It
confirmed unchanged DEV container IDs and removed only its own test resources.
These integration checks use isolated ports/data and do not perform a live
DEV-to-QA or QA-to-DEV switch on the user's normal stacks.

The disposable full-stack test passed. This does not establish browser SSO,
restart endurance, capacity, backup restoration or PROD acceptance. Terraform
and production deployment remain separate work. Runtime env inspection and image
metadata checks do not replace a complete image-layer secret audit.

[Back to cookbook](0300-cookbook.md) | [Command reference](0205-workspace-commands.md)
