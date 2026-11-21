---
brief: Entry point for the minimal Modulon PoC documentation.
tags: [overview, documentation, poc]
---

# Documentation overview

This repository implements a DEV model with four core infrastructure services
plus S3 console, container-owned bootstrap, host-run Web and workers,
localized UI, identity/session flows and
private profile-avatar storage, an administrator file catalog/upload flow and
products with optional images. Shared asynchronous tables and server-side role
thresholds are implemented. The documentation distinguishes that working
scope, including the PostgreSQL queue, host workers, audited versioned runtime
configuration, Python health endpoints and opt-in connection helpers, from
the implemented local QA container flow and pending PROD delivery.
The selected target is Nginx, PostgreSQL 18.6 with three databases, Next.js
UI/backend, SeaweedFS and Keycloak with custom themes and realm.
Prisma 7.10.1 in `packages/database` manages the application schema only.

Use [automatic DEV startup](0315-dev-startup.md) for the single `pnpm dev` workflow,
[local TLS](0318-local-tls.md) for certificate generation and OS trust, and
[service monitoring](0312-service-monitoring.md) for the admin dashboard and
separate service-history page.

The component gallery, animated user panel, session countdown/renewal and hard
Keycloak logout are implemented alongside PL/EN routing and Prisma; the complete target
is not implemented, deployed or audited as a distribution. The sibling
`modulon` repository provides memory/context and the retained DEV/QA/PROD model;
its implementation and test results do not establish acceptance here.

| Chapter | Contents |
| --- | --- |
| [Licensing](0100-licensing.md) | Proprietary terms, contributions and third-party licenses |
| [Architecture](0200-architecture.md) | Minimal service map, configuration, identity/API access and DEV/QA/PROD |
| [Development cookbook](0300-cookbook.md) | Workspace setup, UI, admin files/products, coding conventions, PL/EN translations and change verification |
| [Runbooks](0400-runbooks.md) | Web operation, health checks, startup diagnostics, env/TLS and Docker mode handling |
| [Backlog](9999-backlog.md) | Deferred trash retention and automatic archiving |

[Back to repository introduction](../README.md)
