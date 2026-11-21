---
brief: Seven-day service history, bounded probes, protected overview, PostgreSQL scheduling and cleanup.
tags: [cookbook, monitoring, scheduler, postgresql, administration]
---

# Service monitoring

## Runtime and ownership

`/admin/monitoring` renders its shell before fetching detailed history through an independently
authorized Server Action (minimum ADMIN level 80). `packages/monitoring` keeps
probe execution and history aggregation server-only; its `contracts` export is
safe for browser types and constants. No probe URLs or credentials reach clients.

`/admin` is the administrator dashboard: one combined eight-hour availability
bar and seven service tiles. Each tile shows its last probe, response time,
reason and independently refreshed counters. The dashboard reads products,
catalog files/versions, tags, local identities and active sessions from the
application database; human-user totals from Keycloak; physical application-bucket
objects/bytes from S3; and retained jobs grouped by state from pg-boss. Python
counts include only jobs explicitly assigned to that executor. Historical job
counts follow queue retention, not an installation-wide lifetime total.

Both routes are locale-prefixed (`/pl/admin`, `/en/admin`, and their
`/monitoring` subpages). The tiles use role labels WEB, BACKEND, DB, AUTH, S3,
QUEUE and PYWORKER; those labels do not rename persisted monitoring identifiers.
Detailed per-service timelines belong to `/[locale]/admin/monitoring`, while
the dashboard keeps only the aggregate availability bar and summary tiles.

The combined bar uses the worst service status; missing/stale measurements cannot
produce a healthy system status. Dashboard refresh defaults to every 30 seconds
while visible, with pause/manual controls. Every Server Action rechecks access.
Independent data-source failures show unavailable statistics instead of false
zeroes. S3 totals scan metadata in batches of 1000 with a five-second/100-page
budget; exceeding it makes that source unavailable. Each tile distinguishes the
last stored health observation from the time its counters were refreshed.

Run application migrations and start the existing durable worker:

```powershell
pnpm db:deploy
pnpm queue:setup
pnpm queue:worker
```

The worker uses `QUEUE_DATABASE_URL` for pg-boss and `DATABASE_URL` for application
history. These remain separate database roles and connections. It also needs
the Web/Keycloak endpoint configuration and the application's S3 credentials.
The launcher trusts the local CA before starting Node; TLS verification remains
enabled. Production needs a supervised worker and appropriate certificate trust.

`monitoring.collect` and `monitoring.cleanup` are persisted cron schedules
in pg-boss, with exclusive queues and configured retries. A published, active
[system configuration](0313-system-configuration.md) controls their intervals,
retention and slow-response threshold. Defaults are one minute, seven days and
three retries. Without an active version the worker pauses scheduling.
Each handler is registered before scheduling; applying a new version also
submits a job. Duplicate deliveries are safe:
the application model uniquely identifies each service and UTC minute, and
cleanup is idempotent. There is no scheduler timer inside a Next.js request.
Multiple worker processes may consume these jobs; delivery is not exactly once.

## Signals and retention

| Service | Probe |
| --- | --- |
| WEB | Canonical `/pl` route returns HTTP 200 HTML |
| SERVER | `/api/v1/health/ready` reports `ok`; this endpoint validates configuration |
| PostgreSQL | Independent application-database `SELECT 1` |
| Keycloak | Realm OpenID discovery responds with JSON |
| SeaweedFS | Authenticated S3 list request limited to one object |
| Queue worker | pg-boss reports a live instance with the diagnostic consumer |
| PYWORKER | Optional `MONITOR_PYWORKER_URL` returns JSON with `status: ok` or `healthy` |

An empty Python URL means **not configured**, not an outage. Probes use fixed
server configuration, reject non-HTTP URLs and embedded credentials, do not
follow redirects, and bound HTTP/S3 calls to five seconds. JSON bodies are capped
at 64 KiB. Healthy responses slower than the active threshold (default 1500 ms)
become degraded. Stored reasons are fixed codes, never raw errors or URLs.

`pnpm pyworker:setup` fills a missing/template Python monitoring URL with
`http://127.0.0.1:8010/health/ready`. Start `pnpm dev:pyworker` and restart the Node
queue worker after linking its env. The next scheduled observation then measures
the Python service. See the [Python worker recipe](0314-python-worker.md).

Prisma owns `ServiceHealthSample` in the application database: UUIDv7, service,
status, UTC timestamp, elapsed milliseconds, optional HTTP status, reason and
expiry. Observations expire after the configured retention (one to seven days).
Reads exclude expired records immediately; deletion runs at the configured
cleanup interval. Physical cleanup waits for worker/database availability.
If PostgreSQL itself is down, samples cannot be persisted: the resulting gap and
stale current status remain unknown rather than inventing historical outages.

The UI defaults to the last **8 hours**, with a dropdown for 8h, 24h, 72h or
7 days. Queries aggregate only the selected window; database retention stays
seven days. Tick intervals are respectively 5, 15, 60 or 120 minutes (96, 96,
72 or 84 ticks). Dashed separators and a relative time axis mark 1h, 4h, 12h or
24h divisions. Changing the window refreshes the history in place; responses
from an earlier selection cannot replace the current range.

Each tick shows the worst observed status in its interval.
Green means healthy, amber degraded, red error and gray unknown
or unconfigured. Empty intervals remain gray. Hover or keyboard focus shows the
interval, status, sample count and average response time. Arrow keys, Home and End
navigate a row. Current status becomes unknown after three configured measurement
intervals without a sample, with a three-minute minimum. The last check time and
response latency are visible on each row.
Automatic view refresh defaults to off. The toolbar toggle enables 30-second
refreshes on visible pages and remains filled while enabled; manual refresh and
range selection also fetch data without document navigation. Background probes
follow the active configuration regardless of the viewing preference.
Timing and appearance live in `ui/components/styles.ts`; no chart dependency is
needed for this discrete timeline.

## Authenticated navigation

Admin page segments explicitly export `instant = false`: session/role checks in
the shared authenticated layout may block navigation, which Next.js 16.4's
speculative instant validator cannot guarantee through the parent client shell.
Global validation, Cache Components and partial prefetching remain enabled.
Session verification starts after `connection()` so cryptography and expiring
Keycloak tokens are evaluated only for an actual request. Access checks remain
in the layout, each page and every data/action boundary.

## Verification

```powershell
pnpm test:monitoring
pnpm test:monitoring:integration
pnpm test:queue:integration
pnpm typecheck
pnpm lint
pnpm test:web
```

The monitoring integration test applies migrations to a disposable PostgreSQL
database and checks UUIDv7, aggregation, minute idempotence, stale/empty history
and retention. Browser checks should cover tooltips, keyboard navigation,
narrow-screen width and authenticated table navigation without console errors.

[Back to cookbook](0300-cookbook.md)
