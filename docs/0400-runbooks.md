---
brief: Router for operating and troubleshooting the current local Modulon PoC setup.
tags: [runbook, operations, overview]
---

# Runbooks

| Procedure | Scope |
| --- | --- |
| [Local operations](0401-local-operations.md) | Web and host worker lifecycle, Python health, queue diagnostics, env/TLS, Docker and recovery boundaries |
| [Session operation](0402-session-operations.md) | Session policy, role/countdown checks, renewal cap, automatic/hard logout and troubleshooting |
| [History and recovery](0403-data-recovery.md) | Product/file history, PostgreSQL-S3 report, guarded cleanup and offline backup/restore |
| [Reliability verification](0404-reliability-verification.md) | Audit scope, browser/fault checks, prerequisites and evidence boundaries |
| [Local Docker: DEV and QA](0302-local-docker.md) | Step-by-step Docker startup, mode separation and project isolation |
| [Local HTTPS and CA trust](0318-local-tls.md) | Certificate generation and CA import for Windows, Linux and macOS |
| [Workspace command reference](0205-workspace-commands.md) | Exact aliases and command effects |

DEV starts four core infrastructure services plus S3 console; Web and workers
run on the host. Local QA has separate image build, migration and startup stages;
see [QA containers](0316-qa-containers.md) for its contracts and verification scope.
PROD on Lightsail is a target, with no deployment or recovery
procedure implemented here yet. A successful Compose configuration check is not
proof of a healthy running stack.

For development recipes, use the [cookbook](0300-cookbook.md). For environment
ownership, use [environment configuration](0202-environment-configuration.md).

[Back to documentation overview](0000-overview.md)
