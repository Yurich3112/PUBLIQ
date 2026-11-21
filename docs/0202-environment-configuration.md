---
brief: Configuration contract for the single Next.js application, packages/database and isolated DEV, QA and PROD runtimes.
tags: [architecture, configuration, environments, secrets]
---

# Environment configuration

## Status and ownership

Web/Prisma and server-side DEV login are implemented. Local Compose now declares
only PostgreSQL, Keycloak, Nginx and SeaweedFS; setup scripts execute inside their
own containers. QA additionally runs Web, Node queue and Python release services
with a transient controlled maintenance container. See the [Docker workflow](0302-local-docker.md).

## File layout

The layout includes implemented Web, Prisma and host Python configuration alongside
implemented QA Dockerfiles and one QA runtime env. AWS delivery remains pending.

```text
apps/
  pyworker/
    .env
    .env.example
    .venv/                ignored, created by pnpm pyworker:setup
    requirements.lock
    src/pyworker/
  web/
    .env
    .env.example
    Dockerfile
    src/
packages/
  database/
    .env
    .env.example
    prisma.config.ts
    prisma/
      schema.prisma
      migrations/
    src/
infra/
  local/
    compose.yaml
    compose.dev.yaml
    compose.qa.yaml
    .env.dev
    .env.dev.example
    .env.qa
    .env.qa.example
    nginx/
    postgres/init/
    keycloak/
      Dockerfile
      realms/
      themes/modulon/
    seaweedfs/
  aws/
    compose.prod.yaml
    .env.prod.example
    terraform/
scripts/
docs/
```

Local configuration belongs under `infra/local`. Shared Keycloak theme/Nginx
sources may also build PROD artifacts; production runtime configuration belongs
under `infra/aws` and secrets are supplied at deployment. Do not duplicate themes
or import another repository's env files. Root pnpm commands now provide the
launcher interface; see [workspace commands](0205-workspace-commands.md).

## Local tooling and runtime status

The root pnpm workspace wraps Docker Compose, Web development and Prisma CLI.
DEV is isolated as modulonpocdev, QA as modulonpocqa. Only safe examples belong
in Git; real env and local certificates are ignored. Removed service credentials,
images, ports and hostnames were pruned from the infrastructure env templates.
The retained database/Keycloak/S3 secrets were preserved; existing volumes were
not reset. Old unused volumes remain unattached rather than deleted.

PostgreSQL owns database creation in its startup script, Keycloak owns realm
reconciliation, and SeaweedFS owns S3 config/bucket initialization. No separate
DEV init containers or host bootstrap scripts remain. QA uses a separate
maintenance profile for explicit migration/seed deployment. Keycloak/SeaweedFS have custom
images containing the runtimes needed by their setup scripts. Health checks gate
readiness on completed setup. DEV TLS files remain the copied server certificate,
private server key and public CA; copying does not establish browser trust.

## Environment sources

| Consumer | DEV source | QA source | PROD source |
| --- | --- | --- | --- |
| Next.js UI/backend | `apps/web/.env` | Explicit Web mapping from `infra/local/.env.qa` | Deployment-managed Web configuration/secrets |
| Prisma CLI | `packages/database/.env` | Explicit migration mapping from `infra/local/.env.qa`, used by `qa:deploy` | Controlled migration job supplied by deployment |
| Node queue worker | Server-only `apps/web/.env`, including separate queue DB and Python bridge settings | Explicit queue mapping from `infra/local/.env.qa` | Worker deployment not implemented |
| Python executor | `apps/pyworker/.env`; known inherited `PYWORKER_*` settings take precedence; unrelated inherited secrets are excluded | Explicit Python mapping from `infra/local/.env.qa` | Worker deployment not implemented |
| Infrastructure/bootstrap | `infra/local/.env.dev` | `infra/local/.env.qa` | Deployment-managed configuration/secrets |

Only safe `.example` files belong in Git. There is no root master DEV env or
fallback to `modulon` configuration. Resolve paths relative to the owning
application/package, including from root launchers.

DEV uses host ports to reach dependency containers. QA/PROD use Compose service
DNS for private traffic. Public application, issuer, callback and signed S3 URLs
are configured separately from internal transport addresses.

## Planned Web configuration contract

Setting groups below describe the intended interface. The Web template and auth runtime validation now implement the login settings;
see [Keycloak login](0304-keycloak-login.md) for the current names and DEV setup.
S3/PROD configuration remains planned.

| Setting/group | Responsibility |
| --- | --- |
| `APP_ENV` | `dev`, `qa` or `prod` |
| `NODE_ENV` | `development` in DEV; `production` in QA/PROD |
| Application/auth public URL and trusted origins | Canonical HTTPS origin, exact callbacks and redirect allowlist |
| `DATABASE_URL` | Runtime role connection to `app_db` only |
| `QUEUE_DATABASE_URL` | Separate server-only pg-boss producer/consumer connection |
| `PYWORKER_URL`, `PYWORKER_API_TOKEN` | Private Node-to-Python task bridge; token never reaches the browser |
| `PYWORKER_QUEUE_BRIDGE_PORT`, `PYWORKER_QUEUE_TOKEN` | Optional Node-hosted, loopback-only producer/status bridge; both empty disables it |
| `MONITOR_PYWORKER_URL` | Optional readiness probe target for the scheduler |
| Better Auth secret and cookie configuration | Session protection, lifetimes and environment-specific names |
| Keycloak issuer, realm, Web client ID/secret | Server-side OIDC integration |
| Keycloak Admin API endpoint, directory client ID/secret | Restricted server-side directory reads |
| S3 internal/public endpoints, region, bucket and application keys | Authorized object operations and browser-reachable signed URLs |
| Locale and UI preference configuration | PL/EN, theme preference and environment-specific cookies |

Web does not receive the PostgreSQL superuser password, Keycloak database
credentials, master-realm administrator credentials or operator S3 keys.
Queue database credentials stay in Node processes that publish/consume jobs.
Python uses a separate token for its optional HTTP queue client, never a pg-boss
database connection. Its optional `PYWORKER_DATABASE_URL` is a dedicated
least-privilege PostgreSQL credential, without fallback to Web's `DATABASE_URL`.
See the [Python configuration and helpers](0314-python-worker.md#optional-connection-helpers) and
[identity and access](0203-identity-and-access.md) for the separate clients.

For the optional queue bridge, Python reads `PYWORKER_QUEUE_URL` and
`PYWORKER_QUEUE_TOKEN` from its own private env. The matching token and listening
port belong to the Node worker's private Web env. This token is distinct from
`PYWORKER_API_TOKEN`, which protects the opposite direction. Setup does not
generate the optional queue token or provision a PostgreSQL account for Python.

`NEXT_PUBLIC_*` settings are public and incorporated during the Next.js build.
Prefer relative browser API paths and server-loaded runtime configuration to
promote one release image from QA to PROD. Any public build variable must be
identical in both environments, or the image must be rebuilt and reverified.
See [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).

## Prisma CLI and runtime separation

Use Prisma 7.10.1 with `@prisma/client` and `@prisma/adapter-pg` at the same version.
`packages/database/prisma.config.ts` is the implemented explicit CLI config path;
launchers must select/pass it rather than depend on the shell directory or a
generator's default filename. Its schema and migrations target `app_db` only.
Load the package's DEV env explicitly with a stable path; never override QA/PROD
settings with workstation values. See the
[Prisma 7 configuration reference](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference).

The exported runtime package does not import the CLI env loader. Web supplies
its own connection to the client factory, with a bounded pool and development
hot-reload reuse. Migration credentials may have DDL permissions; runtime roles
should not. Keycloak and pg-boss migrations use their own tools/credentials.

QA/PROD run reviewed application migrations as a one-shot deployment job, without
bundling `packages/database/.env`. A DEV shadow database, if required, is isolated
and disposable, distinct from all three persistent databases and available only
to migration tooling.

## Web session settings

`SESSION_TTL`, `SESSION_WARNING`, `SESSION_AUTO_REFRESH` and
`SESSION_MAX_REFRESHES` belong to Web's server-only auth configuration. They are
not Nginx or Keycloak realm settings. The safe Web template documents seconds,
strict boolean mode selection, the recommended 15-minute TTL for navigation
renewal, home exclusion and the shared renewal cap. Do not add them to public
`NEXT_PUBLIC_*` settings; only the explicit lifecycle DTO reaches the browser.

These settings are distinct from Keycloak's `AUTH_SESSION_IDLE_SECONDS` and
`AUTH_SESSION_MAX_SECONDS`. Application renewal does not extend provider SSO.
Use the [session runbook](0402-session-operations.md) to apply and verify changes;
restart Web and provision each environment's own values.

## Compose and state isolation

Keep the `modulon` model: base local Compose plus DEV/QA overrides and explicit
env-file selection. DEV runs Next.js on the host; QA targets the complete release
stack locally, but Web delivery remains incomplete. PROD targets Compose on
Lightsail and Terraform for infrastructure.

Compose `--env-file` supplies interpolation values. Containers receive only
values explicitly selected in service configuration, not the entire source file.
See [Compose interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

| Service/job | Configuration scope |
| --- | --- |
| Web | Application DB, Better Auth/OIDC, directory API and application S3 settings |
| PostgreSQL/bootstrap | Server settings and separate app, Keycloak and queue database/role provisioning |
| Keycloak | Its database, hostname, realm and theme settings |
| Realm reconciliation | Controlled setup credentials for owned roles, clients and themes; never Web runtime credentials |
| SeaweedFS | Persistent object/filer data and S3 identities |
| Nginx | Routes, upstreams, public hostnames and TLS material |
| Application migration | `app_db` migration connection only |

DEV/QA have separate project names, volumes, credentials, cookies and domains.
Standard ports may overlap, so switch modes by stopping the active stack while
preserving volumes. Concurrent stacks require deliberate port/hostname overrides.
Use repository-specific project and volume names to avoid reusing sibling state.

Bind local infrastructure ports to loopback. Nginx reaches DEV Web through the
host gateway and QA Web through internal service DNS. Canonical public Keycloak
URLs must resolve and pass TLS validation from browser and backend. Do not
disable certificate verification. DEV and QA preference/auth cookies differ.

Env edits do not rotate existing database passwords, Keycloak client secrets. Bootstrap and realm reconciliation preserve data and human
accounts. No volume resets or credential synchronization are performed by this
documentation change.

## Secrets and build exclusions

Existing Git rules ignore actual env files and retain safe templates. Docker
build contexts must separately exclude operational env files, certificates,
private keys, runtime data and backups. Git ignore rules do not control image
contents. No secrets belong in docs, logs, browser bundles, Terraform
configuration/state or container build arguments.

## Planned acceptance checks

1. Web loads its own DEV env; Prisma CLI loads its package DEV env. Runtime
   imports do not load CLI secrets.
2. Three databases exist with isolated roles. Prisma touches only `app_db`;
   Web cannot access Keycloak or queue tables.
3. QA starts with infrastructure-owned configuration and no DEV env mounts.
4. Containers receive selected values; examples/images contain no real secrets.
5. Auth callbacks, origins, directory API and signed S3 URLs work with valid TLS.
6. DEV/QA data stays separate and survives restarts. Port conflicts are reported
   rather than automatically stopping another stack.
7. QA/PROD use the same verified release image with runtime configuration.

These are implementation requirements, not completed runtime results.

[Back to architecture](0200-architecture.md)
