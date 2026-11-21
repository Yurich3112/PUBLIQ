---
brief: Router for practical setup and development recipes for the implemented Modulon PoC foundation.
tags: [cookbook, development, overview]
---

# Development cookbook

Use these recipes when setting up a checkout or changing the application. Run
PowerShell and pnpm commands from the repository root unless stated otherwise.
Documentation follows the repository's English convention.

| Recipe | Covers |
| --- | --- |
| [Local HTTPS and CA trust](0318-local-tls.md) | Certificate generation and public CA installation on Windows, Linux and macOS |
| [S3 console](0317-s3-console.md) | Official authenticated SeaweedFS Admin UI, STORAGE configuration and DEV/QA commands |
| [Web development](0301-web-development.md) | Workspace setup, DEV configuration, pages, UI components, PL/EN messages and checks |
| [Keycloak login](0304-keycloak-login.md) | Better Auth, role display, session policy, hard logout and acceptance limits |
| [UI components and gallery](0306-ui-components.md) | Basic/composed components, centralized styles, Popup, Blur, CornerBadge and UserPanelV2 |
| [Administration and files](0307-admin-files.md) | Catalog/revisions/tags, upload, status actions, physical deletion and numbered pagination |
| [Administration and products](0309-admin-products.md) | Product/audit schema, price/currency, optional image upload and URL-addressable creation aside |
| [PostgreSQL job queue](0311-postgresql-queue.md) | Separate queue database, worker, three retries and newest-first admin table |
| [Service monitoring](0312-service-monitoring.md) | Seven-day status ticks, hover details, minute scheduling and cleanup |
| [System configuration](0313-system-configuration.md) | Audited revisions, one active version, scheduler settings and worker synchronization |
| [Python worker](0314-python-worker.md) | Isolated runtime, defensive boundaries, queue bridge/PostgreSQL helpers, health and verification limits |
| [QA containers](0316-qa-containers.md) | Separate image builds, migration/seed deployment, guarded startup and disposable acceptance |
| [DEV startup](0315-dev-startup.md) | Ordered checks/build/migrations, terminal clearing, Docker readiness and parallel Web/workers |
| [Coding conventions](0308-code-conventions.md) | Readability, validation, server/client boundaries, cookies, consistency, UI and focused checks |
| [Account profile and avatars](0305-account-profile-and-avatars.md) | Personal information, security, private avatar bucket and native profile Save |
| [Prisma application database](0303-prisma-database.md) | Prisma 7.10.1 package, UUIDv7 identity/session models, CLI-only migrations and server access |
| [Local Docker: DEV and QA](0302-local-docker.md) | Mode comparison, preparation, dependency/Web startup, QA prerequisites, logs and switching modes |
| [Workspace command reference](0205-workspace-commands.md) | Exact root aliases for Web, tests, configuration and Docker |
| [Web foundation](0204-web-foundation.md) | Implemented modules, library versions and acceptance boundary |

The current implementation has one Web application, with server-side Keycloak
login, session renewal/expiry and DEV application DB migrations. Disposable-user
SSO/logout and isolated UI checks passed; this is not acceptance of every login
path or environment. Profile avatars use a dedicated S3 bucket. Document upload,
the file catalog and administrative lifecycle status actions are implemented
through their own application/bucket boundary. Products reuse that file catalog
for optional images. Administration tables load their bodies asynchronously and
change query data without document navigation. Layouts and Server Actions share
an explicit server-side access policy.
The PostgreSQL queue and Python executor run on the host in DEV and in release
containers in QA; see [QA containers](0316-qa-containers.md). PROD delivery remains
separate work. The Python executor has its own setup recipe; there is
no separate business API service.

For startup, health checks, troubleshooting and container operations, use
[Runbooks](0400-runbooks.md). For ownership and future contracts, use
[Architecture](0200-architecture.md).

[Back to documentation overview](0000-overview.md)
