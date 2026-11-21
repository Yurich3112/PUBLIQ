---
brief: PostgreSQL job queue, separate credentials, pg-boss schema setup, durable worker, retries and administration table.
tags: [cookbook, queue, postgresql, pg-boss, worker, administration]
---

# PostgreSQL job queue

## Ownership and commands

`packages/queue` pins pg-boss 12.38.2 and pg 8.23.1. Queue tables live in the
`pgboss` schema of the separate `modulon_queue` database. They are managed by
pg-boss, never by application Prisma migrations. The restricted queue role cannot
connect to application or Keycloak databases; the application role cannot connect
to the queue database. Web uses a separate server-only `QUEUE_DATABASE_URL`.

```powershell
pnpm install --frozen-lockfile
pnpm queue:setup
pnpm dev
```

Run the durable consumer in a second terminal:

```powershell
pnpm queue:worker
```

`pnpm dev:queue` starts the already-prepared consumer without repeating package
builds. `pnpm dev` prepares and launches Web and both workers together;
an HTTP request is not a durable consumer. Outside local development, run the
worker under the environment's process supervisor and supply its queue secret,
application database connection and monitoring endpoint/S3 configuration.
No cloud or QA/PROD deployment is implied by the DEV commands.

`queue:setup` explicitly provisions the configured local DEV queue database and
role, preserves existing passwords/ownership, initializes the library schema and
creates the `system.check` queue. New credentials go only into ignored
`infra/local/.env.dev` and `apps/web/.env`. It never prints the connection string.
Bootstrap also provisions the queue database on fresh Compose starts. For an
existing checkout, run setup before the next `stack:up` so the added env fields
are populated without resetting volumes. Restart Web if its env loader has not
picked up the new connection.

## Execution and retries

The default is **one initial attempt plus three retries**, at most four executions.
Queue setup explicitly sets `retryLimit: 3`; producers inherit the current queue
policy. The active system configuration can change the limit for new jobs.
Runtime defaults start with a five-second
retry delay, exponential backoff/jitter and a 60-second delay cap.

The worker fetches one job at a time, uses a ten-second heartbeat and a 60-second
active-job expiration. Its supervisor recovers abandoned/expired attempts through
the same retry policy. Graceful stop drains for up to 30 seconds. Delivery can be
repeated: future handlers must be idempotent and use attempt-aware settlement.
Do not promise exactly-once business side effects.

Queued/retry jobs retain a seven-day waiting window. Completed jobs remain visible
for 14 days before library maintenance removes them. The queue owner bounds its
connection pool; Web and the worker use separate instances with at most five
connections each against a 12-connection role limit. Stop the consumer before
library schema upgrades and account for setup connections separately.

Database polling has a separate failure cooldown. After three consecutive failures
of the same pg-boss statement, actual database attempts are delayed by 5, 10, 20,
40 and at most 60 seconds. Intermediate polls fail locally without issuing SQL or
repeating the generic error log. One probe is admitted when the cooldown expires;
a successful query restores normal polling. Successful unrelated statements do
not reset the failed statement's counter. Logs contain retry timing and a validated
SQLSTATE code when available, never SQL, parameters or connection credentials.
This does not change job retry limits or introduce delayed shutdown timers.
Run `pnpm test:queue:backoff` for deterministic cooldown/recovery tests.

After deleting DEV volumes, `pnpm dev:prepare` (also part of `pnpm dev`) runs
`dev:queue:prepare` before launching the consumer. Docker bootstrap creates the
database/role; this guarded step creates/migrates the pg-boss schema and missing
diagnostic queue using the existing credentials. It preserves existing jobs and
queue policy and does not provision roles or edit env. `pnpm queue:setup` remains
the explicit provisioning/reconciliation command. A running consumer from before the reset must also be restarted. The
cooldown limits load/logging during an outage; it does not recreate missing tables.

The diagnostic popup selects Node.js (a harmless database check) or Python (an
authenticated deterministic checksum through the [Python executor](0314-python-worker.md)).
The Node consumer owns claiming and retries for both. Repeating a diagnostic
preserves its executor. The admin can
request zero failures for success, one to three for eventual success, or four to
reach Failed after exhausting retries. It does not execute arbitrary client-supplied
commands or automatically process file/product pending-deletion statuses.

Python may also submit the existing diagnostic and read a job's state through
the optional Node-hosted HTTP bridge. This is a machine producer/status API:
the shared bridge token is checked on every endpoint, and Node supplies the
seeded SYSTEM actor instead of trusting a caller-provided user UUID. It does not
replace administrator session checks on the Web interface. Python never claims
jobs, writes pg-boss SQL or schedules its own retries. A submission with a lost
response may already have been accepted and is not automatically repeated.
See [bridge configuration and limits](0314-python-worker.md#queue-bridge).

The same worker applies active configuration schedules for `monitoring.collect`
and `monitoring.cleanup`. They use exclusive queues, configured retries and one-day job
history. Application health observations have a separate seven-day retention.
See [Service monitoring](0312-service-monitoring.md) for probes, credentials and
cleanup availability limits.

Business writes in the application database and queue publication cannot share
a normal transaction. Add an application outbox and idempotent publication when
implementing such business workflows; queue internals stay outside Prisma.

## Administration

Localized `/admin/queue` pages use the shared minimum ADMIN level 80 policy for
entry, every data refresh and diagnostic submission. The initial shell renders
before reading queue data. SQL filtering/counting precedes pagination, with
fixed `created_on DESC, id DESC` ordering, newest first.

The table shows status, retry count/limit, timestamps and a details aside.
Row actions depend on the current state: retry a failed job with one additional
attempt, repeat a completed job as a new UUID with the current retry policy,
resume a cancelled job, cancel a waiting/retry job, or remove a non-active record.
Each operation requires confirmation and independently authorizes the administrator.
Active jobs cannot be cancelled or removed from this UI; removal does not undo
business effects already performed.

The queue adapter locks the selected job and checks its expected state, retry
count and last administrative action UUID before using pg-boss's public lifecycle
APIs in the same transaction. This prevents stale clicks and duplicate repeat
submissions from producing multiple jobs. Retained records store the last admin
actor/action token; repeated jobs record their source UUID and verified creator.
Only registered diagnostic/monitoring queues are accepted. Replaying a monitoring
job also requires its configuration to remain active; the worker rechecks it.

Search covers task name/UUID; the status filter and pagination update browser
history without navigating the document. Automatic refresh defaults to off; the
filled toolbar toggle enables five-second polling on visible pages. Disabling
the toggle stops polling; manual refresh remains available at the far right.
Failures retain the table shell and show a top notification. Payloads, raw worker
errors, stack traces and credentials are not exposed to the browser.

The package owns its bounded read-only SQL over the pinned library schema, including
a newest-first index. Review those queries when changing the pg-boss pin.

## Verification

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm test:queue:integration
pnpm test:queue:actions
pnpm validate:dev
pnpm stack:config
```

The queue integration test creates/removes a disposable database. It checks
persistence across client restart, newest-first pagination, successful retry,
failure after exactly three retries, and server-side search/state counts.
Web tests check action authorization, bounded diagnostic input and actor ownership.
Local browser acceptance additionally exercises diagnostic submission, real worker
completion/failure and table-only filtering. These checks do not establish
production recovery, throughput or business-handler idempotency.

[Back to cookbook](0300-cookbook.md) | [System architecture](0201-system-architecture.md)
