---
brief: Scope, commands and boundaries of the product/file/session/runtime reliability audit.
tags: [runbook, reliability, testing, audit]
---

# Reliability verification

## Audit scope

| Item | Implemented behavior / verification |
| --- | --- |
| 1. Failed product upload | Recovery checks `FileVersion` before deleting S3, including a committed image whose product was concurrently deleted. Regression test in `product-create.test.mjs`. |
| 2. Stacked Escape | Native modal registration order determines the top popup. A blocked top popup never delegates Escape to a lower popup. Real session-warning/delete-confirmation browser test. |
| 3. SQL deadlines | Application queries have server statement/lock deadlines and a client query deadline. Dashboard sources and monitoring operations have bounded aggregate waits; one source can fail without hiding others. Disposable `pg_sleep` and aggregation tests. |
| 4. Web trust root | Launcher resolves `CERTS_DIR` and `TLS_CA_PEM` from infrastructure env, with explicit process overrides; respects `NODE_EXTRA_CA_CERTS`. Temporary-path tests. |
| 5. Infrastructure assertion | Expected service names use the same sorted order as actual names. The HTTPS test also uses a nonzero listener port. Real isolated stack passes. |
| 6. Page shrink | A now-invalid page is replaced in history and the valid page is refetched before publishing rows. Browser checks URL, count and rows after two pages become one. |
| 7. Preview changes | Preview state is owned by its URL; changing selection remounts its image/error state and aborts the old request. Browser switches failed image → PDF → valid image. |
| 8. Preview formats | Unsupported/corrupt image content returns 415; unavailable storage remains 503. The UI explains unsupported formats rather than offering a misleading service-error retry. |
| 9. Fixture cleanup | Already-exited children return immediately; graceful and forced waits have deadlines. Python queue fixture also bounds readiness HTTP calls. |
| 10. Bridge secret | Templates leave the optional bridge disabled. Node/Python reject the published placeholder. Python preparation can replace only the known legacy Web/Python placeholder with a separate random shared secret; it preserves private credentials. |
| 11. Copy/docs | Removed stale product/image and Dockerfile gaps, conflicting console startup text, queue labels in settings and duplicate loading labels. |
| 12. Stale deletion | Product deletion includes `expectedUpdatedAt` as well as expected status. Two real administrators exercise name/price update versus stale deletion. |
| 13. Windows shutdown | Supervisor drains the Node consumer before Python, then closes the owned process tree. Python receives a private stdin shutdown command; Node uses IPC. Active Python task completion and bounded forced fallback are tested. |
| 14. Renewal/logout race | Automatic revocation uses checked expiry plus renewal count, including a stale 401 reported after renewal. A valid newer lease survives with cookies/logout context intact; disabled identities are revoked. If a renewal cookie is lost and status cannot resynchronize, the client returns to the public page without a revocation loop. Explicit manual logout still revokes the selected session. |
| 15. Full login | Browser clicks the real sign-in button and follows Server Action → Next.js → Keycloak → callback. The button waits for hydration. Request boundaries propagate Next.js prerender interruption instead of treating it as an authentication outage. |
| 16. Catalog history | Transactional triggers, private paginated administrator endpoint and lazy product/file history panels show actor/time/operation/before/after. File history includes its revisions; exact money/size values survive JSON. |
| 17. Reconciliation | Read-only complete report plus separately approved aged-orphan cleanup with locked reference and S3 identity revalidation. See the recovery runbook. |
| 18. Backup/restore | Offline PostgreSQL/SeaweedFS/console volume archives, hashes and fresh restore targets. Real test verifies all three database canaries, object bytes and restored infrastructure health. |
| 19. Business pending states | Deferred by user decision: `pending_deletion` trash with permanent deletion after 30 days belongs in the backlog. Automatic archiving also needs its policy. No business deletion processor is enabled. |
| 20. Browser/fault tests | Two administrators, nested popups, actual session expiry, page shrink, preview recovery and interrupted-worker job recovery are covered by the commands below. |

## Commands

```powershell
pnpm check
pnpm test:reliability
pnpm test:products:integration
pnpm test:auth:integration
pnpm test:pyworker:integration
pnpm test:pyworker:reload
pnpm test:pyworker:shutdown
pnpm test:queue:recovery
pnpm test:backup:integration
pnpm test:storage:conditional-delete
pnpm test:browser:reliability
```

Integration commands use fresh databases/projects/ports and remove their fixtures.
`pnpm check` requires a prepared Python virtualenv. Windows process-tree tests
need permission to stop their own fixture processes. A sandbox denial is not a
passing shutdown test.

The browser test requires running DEV at the canonical `https://modulon.local`,
trusted local CA, matching private env files and an available Edge executable.
It creates temporary Keycloak administrators and only its own products/files.
It does not use real people or change existing role assignments.

The existing local browser-tool installation is reused by default:

```powershell
$env:NODE_EXTRA_CA_CERTS = (Resolve-Path infra/local/certs/rootCA.pem).Path
pnpm test:browser:reliability
```

For a fresh checkout, install the test-only Playwright package in an ignored
local tooling directory (the tested version is 1.65.0), or provide its ESM entry
file URL in `PLAYWRIGHT_MODULE`. No browser test dependency is added to the Web
runtime. `BROWSER_EXECUTABLE` overrides the default Windows Edge location.
Resolve the CA path using the configured `CERTS_DIR` / `TLS_CA_PEM` when customized.

Run a production Web build after stopping DEV: both use the default `.next`
output directory. During this audit, stale generated output caused repeated DEV
reloads, failed JavaScript chunk requests and a disabled sign-in button. Stopping
DEV, removing only `apps/web/.next`, then running `pnpm dev` restored the complete
login flow. This cache reset does not require deleting Docker volumes or user data.

## Evidence boundaries

The completed audit run passed `pnpm check` (280 tests, type checks and lint),
the canonical-domain browser scenario, authentication integration, Python
reload/drain checks, interrupted-queue recovery and isolated backup/restore.
The final read-only DEV inventory reported zero missing objects, size
mismatches, orphan objects and unlinked catalog files. These results describe
that run; repeat the commands after changes or environment recovery.

The browser test simulates a 503 at the protected image endpoint; the server
storage-error mapping has its own unit test. It never interrupts the shared DEV
storage container. PDF rejection uses actual fixture bytes in S3. The history UI
uses controlled API rows in its browser check; its PostgreSQL triggers, exact
values, parent revision linkage, actor attribution and rollback behavior are
verified separately in a disposable migrated database. Production migrations
and production deployment are not performed by these tests.

The file revision scenario exercises real upload, notification progress,
older-version Info in a side panel, byte-exact download, restoration as a new
version and permanent deletion of every revision. See
[administration and files](0307-admin-files.md#verification) for the checks and
the controlled failure cases.

The conditional-delete test checks the actual local SeaweedFS response: an
incorrect `If-Match` must return 412 and preserve the owned fixture; a matching
ETag must delete it. It does not touch existing application objects.

The interrupted-worker test deliberately kills its own active diagnostic worker
and verifies pg-boss retries/completes the durable job. It establishes recovery
of the diagnostic contract, not idempotency of future business side effects.

The backup test validates physical infrastructure recovery; business acceptance
after restoring a real environment is specified in
[history and recovery](0403-data-recovery.md). Trash retention and archiving remain
explicit [backlog](9999-backlog.md) work.

[Back to runbooks](0400-runbooks.md)
