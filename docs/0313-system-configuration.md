---
brief: Audited immutable configuration revisions, atomic activation, worker acknowledgement and scheduled runtime settings.
tags: [cookbook, configuration, administration, prisma, scheduler, audit]
---

# Versioned system configuration

## Ownership and lifecycle

`/admin/settings` requires the existing minimum ADMIN level 80 at the layout,
page and every Server Action. Its table loads asynchronously, filters/searches
on the server and uses the shared paginator and single-owner editing aside.
The toolbar refresh is manual. Secrets, URLs and credentials remain in the
environment; versioned settings contain only the allowlisted operational values.

`SystemConfigVersion` belongs to the existing seeded `System` with key `modulon`.
Versions have UUIDv7 identities, monotonically allocated version numbers, a name,
description and `DRAFT`, `PUBLISHED` or `ARCHIVED` lifecycle status. Creation and
updates record timestamp/actor pairs. Publication and archival have separate
nullable timestamp/actor pairs. Actor UUIDs come from the verified session and
reference local users with restrictive foreign keys.

Only drafts can be edited. Publishing freezes the settings; copying any version
creates a new draft with new creation audit. Archival preserves the settings and
sets its own actor/time. There is no destructive version-delete action.
The edit button on a published version opens a prefilled copy form. Saving
creates a new draft; cancelling creates no version. The current active revision
continues running until the new draft is published and explicitly activated.

`System.activeConfigUuid` is the single source of active configuration. Only a
published version belonging to that system can be selected. Activation locks the
system row, checks the caller's previous active pointer, switches it atomically
and appends `SystemConfigActivation` with the previous/current versions and actor.
Concurrent activation cannot silently overwrite a newer choice. A previously
published, unarchived version can be activated again as a rollback.

The initial pointer is nullable for migration/bootstrap. `pnpm db:seed` creates
one published, active default version only when no versions exist. A dedicated
non-login local `SYSTEM` actor owns its audit; no human or Keycloak identity is
invented. Rerunning the seed never overrides existing versions or active choices.
Without seeding/activation the worker pauses scheduled monitoring. Subsequent
versions are created, published and activated by an administrator.
After initialization, the database prevents clearing the active pointer or
archiving the active version. Switch to another published version first.

PostgreSQL constraints/triggers additionally enforce value bounds, audit pairs,
ownership of the active version and immutability of published settings. These
custom guards are retained in migration `20261113154344_system_configuration`;
preserve them when changing the schema. Draft edits and lifecycle actions also
use an expected update timestamp, advanced monotonically to detect stale writes.

## Runtime values

| Setting | Default | Allowed values |
| --- | --- | --- |
| Monitoring interval | 60 seconds | 1, 2, 3, 4, 5, 10, 15, 20, 30 or 60 minutes |
| Cleanup interval | 60 seconds | Same minute intervals |
| History retention | 7 days | 1–7 days |
| Queue retries | 3 after the initial attempt | 0–10 |
| Slow response threshold | 1500 ms | 100–5000 ms |

The minute-aligned intervals map directly to persisted pg-boss cron schedules.
The retry policy applies to newly created diagnostic and monitoring jobs; existing
jobs retain their original retry policy. A shorter retention also removes old
observations whose original expiry was longer. Maximum retained monitoring
history remains seven days. The monitoring stale threshold scales to three
configured measurement intervals, with a three-minute minimum.

## Worker reconciliation

The durable worker rechecks configuration every ten seconds. This control interval
is fixed so configuration changes remain discoverable even when monitoring is
paused or scheduled infrequently. The control cycle also removes expired health
history and enforces the seven-day hard ceiling, including before first activation;
this housekeeping does not execute an inactive configuration. Reconciliation and activation serialize on the
system row. The worker idempotently updates queue policies and schedules in the
separate queue database, then records its applied version, application time and
heartbeat in `SystemConfigWorker` only after application succeeds.

The two databases do not share a transaction. An interrupted/failed application
can leave partial queue changes; it is not acknowledged and the next reconciliation
reapplies the current configuration. The UI exposes applied versions and failures
or stale reports. Refresh the table to read current worker state.

Monitoring jobs carry their configuration UUID. Before executing, the handler
checks the active pointer and skips obsolete/unversioned jobs. Jobs already
executing may finish with their initial settings. Exclusive queues and existing
service/minute uniqueness preserve idempotence; delivery is not exactly once.

## Commands and verification

```powershell
pnpm db:deploy
pnpm db:seed
pnpm queue:worker
pnpm test:config:integration
pnpm test:queue:integration
pnpm test:monitoring:integration
pnpm check
```

The configuration integration test uses a disposable database and verifies
concurrent version allocation/activation, audit identity, immutable publication,
archival guards, rollback, cloning and worker acknowledgement. Queue tests check
pausing/resuming schedules, changed cron intervals, pinned version data and retry
inheritance. Browser checks cover the protected table, navigation and draft form.

[Back to cookbook](0300-cookbook.md)
