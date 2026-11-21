---
brief: Authenticated SeaweedFS Admin UI included in DEV startup and optionally enabled in QA, with configuration in STORAGE.
tags: [cookbook, s3, seaweedfs, docker, tools, operations]
---

# SeaweedFS Admin UI

`s3console` runs the official `weed admin` command in the Compose `tools` profile.
`pnpm dev`, `dev:infra:up` and DEV `stack:up` enable it automatically; QA enables
it separately. It replaces the former S3 Manager container. The image is
`chrislusf/seaweedfs:4.51` in DEV. QA additionally pins manifest digest
`sha256:f7a49e3f3972ebed5be2ed4befa4a0c68eb7bdddba6e692d42729ceb545134b8`.
It connects to the existing `s3:9333` master, discovers its filer and
provides authenticated cluster administration and file browsing/operations.
The owning SeaweedFS storage container retains `-admin.ui=false`; the optional
console is a separate process and does not restart or replace storage.

## Commands

Start the owning DEV infrastructure or QA stack first, then:

```powershell
pnpm s3console:up
```

Open `https://s3console.modulon.local/login` for DEV. Nginx terminates TLS and
proxies to the optional console. Direct loopback access remains available at
`http://127.0.0.1:8090/login`. Login uses `S3CONSOLE_ADMIN_USERNAME` and
`S3CONSOLE_ADMIN_PASSWORD` from the selected ignored infrastructure env.
Passwords are not printed by the tooling. Separate phases remain available:

```powershell
pnpm s3console:init
pnpm s3console:build
pnpm s3console:start
pnpm s3console:status
pnpm s3console:logs
pnpm s3console:stop
```

`init` migrates the former console settings, creates a random password only
when missing/a placeholder and preserves an existing valid login. `build` pulls
the configured official image. `start` requires the image locally and healthy
SeaweedFS, checks the port and starts only the console with
`--no-deps --no-build --pull never`. `up` combines those three steps.
Occupied ports block startup without stopping another service.

Select QA and optionally override the configured host port:

```powershell
pnpm s3console:up --mode qa --port 8091
pnpm s3console:stop --mode qa
```

DEV is the default; PROD is rejected. Each command accepts `--mode dev|qa` and
`--port`. Without an override, the owning env supplies `S3CONSOLE_PORT`.
Normal `pnpm dev` and DEV `stack:up` enable this profile: DEV starts five
infrastructure containers. `qa:up` starts seven persistent services; enabling
the optional QA console separately adds its eighth container.

## STORAGE configuration

Both `.env.dev.example` and `.env.qa.example` place avatar storage variables
under `# ---[AVATARS]---` and console configuration under `# ---[CONSOLE]---`,
inside `STORAGE`. Real values remain in ignored `.env.dev` / `.env.qa`.

| Variable | Default / meaning |
| --- | --- |
| `S3CONSOLE_IMAGE` | DEV: `chrislusf/seaweedfs:4.51`; QA: version plus manifest digest |
| `S3CONSOLE_HOST` | `s3console.modulon.local` in both DEV and QA; run the environments alternately |
| `S3CONSOLE_PORT` | `8090`, published on `127.0.0.1` only |
| `S3CONSOLE_ADMIN_USERNAME` | `admin`, a separate panel account |
| `S3CONSOLE_ADMIN_PASSWORD` | Placeholder in examples; `init` generates 32 random bytes as hex |
| `S3CONSOLE_CPU_LIMIT` | `0.5` |
| `S3CONSOLE_MEMORY_LIMIT` | `128m` |

Only `WEED_ADMIN_USER`, `WEED_ADMIN_PASSWORD` and timezone are mapped into the
console process. No S3 keys, database passwords, OIDC credentials or application
session secrets are supplied. Admin credentials use environment variables,
not process command-line arguments. S3 credentials for application/avatar access
remain unchanged. There is no separate console env file; migration removes the
obsolete generated `.env.dev.s3console` / `.env.qa.s3console` files and obsolete
S3 Manager flags (`ALLOW_DELETE`, metadata and timeout settings).

The console uses UID/GID 1000, a read-only filesystem, dropped capabilities,
resource limits and writable `/tmp` tmpfs. Exactly one named volume is mounted
at `/data`: `modulonpocdev-s3console` in DEV or `modulonpocqa-s3console` in QA.
The volume follows the existing project/service naming scheme, without the
container instance suffix. It is separate from the application's SeaweedFS data
volume and is never shared across environments.

The official image declares `/data`; the explicit mount prevents Docker from
creating an anonymous volume. Session keys and administration state use
`-dataDir=/data/admin`, so they survive container replacement. Fresh volumes use
the upstream image directory ownership for UID/GID 1000. The launcher validates
that there is exactly one volume, at the correct path, owned by the selected
project. Stateless Web, Python, queue, Nginx and Keycloak services do not need
artificial persistent volumes; Keycloak's database is in PostgreSQL.

For an existing installation, preserve both the former anonymous `/data` volume
and the previous `/tmp/admin` contents before replacing the console. The latter
is tmpfs and disappears on container removal. DEV migration copied and compared
those files, retained recovery copies, then replaced only the console. The
existing authenticated session remained valid. Old volumes are not deleted
automatically. Admin login-page health is checked separately from the integration
check of master/filer operations.

Map the chosen hostname to `127.0.0.1` in workstation DNS/hosts and ensure the
local TLS certificate covers it. The DEV hosts entry is:

```text
127.0.0.1 s3console.modulon.local
```

QA reuses `s3console.modulon.local` and the same hosts entry; use the configured
QA HTTPS port and stop the DEV stack before switching environments.
After changing `S3CONSOLE_HOST`, apply the selected Nginx service configuration.
QA reads the single `.env.qa` directly and uses the shared Nginx template. The template
resolves the optional console dynamically, so its absence does not block Nginx
startup; requests receive the normal unavailable-service response. HTTPS proxy
responses mark console cookies Secure and HttpOnly. The login still belongs to
SeaweedFS Admin UI.

Only the direct UI HTTP port is published, on loopback; the worker gRPC port is not
published and legacy listeners are disabled. Docker peers on `edge` can still
reach the container. This is local operator tooling on a trusted infrastructure
network; external access requires a separately authenticated/TLS-protected
operations design. The native panel is still described upstream as work in
progress, so feature availability must be verified for the selected version.

## File operations and verification

This is cluster/filer administration, with broader access than an application
S3 identity. Direct upload/delete bypasses Modulon's PostgreSQL catalog, audit
and permissions. Use Modulon for ordinary application file lifecycle changes.
No application objects are edited automatically by console startup.

`pnpm test:scripts` covers migration/idempotence, credential isolation, required
login, project/port guards and starting only the selected console. With DEV
console running, `pnpm test:s3console:integration` verifies anonymous access
redirects, rejected credentials and missing login CSRF token, authenticated
cluster/files pages, upload, exact download, file properties and cleanup of one
uniquely named disposable filer directory. It touches no application buckets.
Use `--mode qa` and an optional `--port` for another prepared console.
The real DEV integration passed; QA Compose configuration is validated separately.
With the local CA supplied through `NODE_EXTRA_CA_CERTS`, add `--https` to the
integration command to verify the configured hostname/TLS proxy and Secure/HttpOnly
cookies. HTTPS testing requires hostname resolution to loopback.
Full browser/cluster maintenance acceptance and PROD deployment remain separate.

Upstream: [Admin UI](https://github.com/seaweedfs/seaweedfs/wiki/Admin-UI),
[versioned admin implementation](https://github.com/seaweedfs/seaweedfs/blob/4.51/weed/command/admin.go),
[Apache-2.0 license](https://github.com/seaweedfs/seaweedfs/blob/4.51/LICENSE).

[Back to cookbook](0300-cookbook.md) | [Local Docker](0302-local-docker.md)
