---
brief: Navigation for the minimal Modulon PoC and its DEV, QA and PROD contracts.
tags: [architecture, overview, poc, deployment]
---

# Architecture

The selected PoC consists of Nginx, one PostgreSQL 18.6 server with application,
Keycloak and queue databases, Next.js UI/backend, SeaweedFS,
and Keycloak with custom themes and a managed application realm. Prisma 7.10.1
belongs to `packages/database` and manages only the application schema.

| Document | Contents |
| --- | --- |
| [System architecture](0201-system-architecture.md) | Selected services, database ownership, queue boundary, DEV/QA/PROD and delivery scope |
| [Environment configuration](0202-environment-configuration.md) | Planned layout, application/Prisma DEV configuration and Compose-owned QA/PROD configuration |
| [Workspace commands](0205-workspace-commands.md) | Root pnpm setup, Web/test/check aliases and local Docker commands |
| [Web foundation](0204-web-foundation.md) | Implemented UI/i18n, installed libraries, workspace commands and verification |
| [Web structure and API](0206-web-structure.md) | Reviewed module boundaries, API routing, health contracts and remaining gaps |
| [Hybrid AI execution](0207-ai-execution-architecture.md) | OpenAI chat streaming, response metrics and prompt versions. Plans for Python CPU models, PII policy and background jobs |
| [Identity and access](0203-identity-and-access.md) | Better Auth, custom Keycloak themes, realm/clients, directory API and application authorization |

The business backend stays in Next.js. Host Node and Python workers extend the
foundation with queue execution and monitoring; no worker container is added to
the DEV infrastructure of four core services plus S3 console. These documents
distinguish implemented DEV and local QA workflows from full environment
acceptance and pending PROD deployment. The sibling
`modulon` repository remains a reference for the environment model and is not
modified by this documentation change.

Third-party terms are recorded in the [license register](0101-third-party-licenses.md).

[Back to documentation overview](0000-overview.md)
