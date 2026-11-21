---
brief: Transactional catalog history, PostgreSQL-S3 reconciliation and offline backup/restore.
tags: [runbook, audit, storage, backup, recovery]
---

# Catalog history and data recovery

The application database migration `20261117000100_change_history` adds history
for products, logical files and file revisions. PostgreSQL triggers record the
actor UUID, timestamp, operation and before/after snapshots in the same transaction
as the business change. Rollbacks leave no history entry. Decimal prices and
revision sizes remain strings in JSON, preserving exact values.

The product and file information panels include a collapsed Change history section.
Opening it loads the private history; previous/new values are expandable and older
entries are paginated. File history includes revision creation and deletion.

The administrator endpoint is:

```text
GET /api/v1/admin/history?entity=product&uuid=<uuid>
GET /api/v1/admin/history?entity=file&uuid=<uuid>
GET /api/v1/admin/history?entity=file_version&uuid=<revision-uuid>
```

Responses contain at most 100 entries, newest first. Pass the returned `next`
UUID as `before` for the next batch. Access is checked on each request; responses
are private and not cached. Deleting an entity or identity preserves its history.
The history does not backfill past changes and has no editing/deletion UI.

Application deletes set the verified actor in a transaction-local PostgreSQL
setting. SQL maintenance tools must set `app.actor_uuid` themselves; a direct SQL
delete without that context records an unknown actor rather than attributing it
to the previous editor. Database-owner access remains a trusted administration
boundary. History is in the application database and is included in its backup.

## PostgreSQL-S3 reconciliation

```powershell
pnpm storage:report
```

This read-only command scans the document bucket and application catalog. It
reports missing objects, size mismatches, objects without a `FileVersion`, and
catalog files without product references. A generic document without a product
reference is legitimate and is never automatically removed. Avatar storage is
outside this document-bucket report.

The private report is written under ignored `infra/local/backups/`. Scans stop
at 100,000 entries instead of publishing an incomplete report as complete.
The inventory is an observation across two systems, not an atomic cross-system
snapshot; review questionable entries and repeat after uploads finish.

After reviewing the JSON report, optional cleanup requires its exact SHA-256:

```powershell
pnpm storage:cleanup --report infra/local/backups/reconciliation-<id>.json --confirm <reported-sha256>
```

Cleanup accepts reports no older than 24 hours and only document objects with
UUID keys older than 24 hours. It locks catalog writes for each candidate,
requires the same database/schema/storage target fingerprint as the report,
rechecks live references and verifies S3 ETag, size and modification time before
issuing a conditional delete. Referenced, recently uploaded, changed and unknown
objects are protected. The command never deletes catalog records or repairs
missing content by inventing metadata. Restore missing content from backup.
Save the command result alongside the reviewed report as operational evidence.

## Offline backup

Stop writers and the containers owning the persistent volumes first:

```powershell
# DEV: stops the owned host processes and removes containers, preserving volumes.
pnpm dev:stop
pnpm backup:create dev

# Alternative for QA, including a separately enabled console:
pnpm qa:stop
pnpm s3console:stop --mode qa
pnpm backup:create qa
```

The command refuses active volume consumers and foreign/external/custom-driver
volumes. It archives PostgreSQL (application,
Keycloak and queue databases together), SeaweedFS (objects and filer/master
metadata together), and S3 console state when that optional volume exists. A manifest contains archive SHA-256
checksums and the exact existing PostgreSQL helper image ID. No image is pulled.
A failed backup has no completed manifest and must not be treated as usable.

These are physical local backups; keep the matching PostgreSQL and SeaweedFS
versions available for recovery. Retain the matching ignored environment files,
application encryption secrets and TLS/CA material separately in an encrypted
vault. They are not included in the volume archives. Archives contain private
data and database credentials: encrypt them before off-host retention. Git ignore
is not encryption. Export the referenced local images for an offline recovery site.

## Restore and verify

```powershell
pnpm backup:restore infra/local/backups/backup-<id>
pnpm test:backup:integration
```

Restore checks every checksum before creating targets, then extracts into three
new `modulonrestore-<random>-*` volumes. There are two targets when the optional
console was never used, otherwise three. It never overwrites DEV/QA volumes and
does not start services automatically. Preserve the returned JSON: it lists the
new volume names and marks runtime acceptance as pending.
If extraction fails, the error identifies the `org.modulon.restore` label of the
fresh partial targets retained for inspection. Source archives/volumes are not
modified. Remove only those explicitly identified partial targets after review.

For an actual recovery, create a separate private Compose env from the matching
saved env. Set `STACK_NAME` to the returned project; map `DB_VOLUME_NAME`,
`S3_VOLUME_NAME` and `S3CONSOLE_VOLUME_NAME` to the returned volumes. If console state was absent,
use a new `<restore-project>-s3console` name for its eventual empty volume. Use a fresh
decimal `INSTANCE_INDEX` and unused host ports. `PROXY_HTTPS_PORT` must be a real
nonzero port because it is also the container listener. Keep source image versions
and credentials. Run Compose using that explicit env and project, rather than
changing the active DEV/QA private files.

Verify all three database connections, migration state, catalog/history row
counts, Keycloak realm/client data, queue jobs and document/avatar object counts.
Run the reconciliation report against the restored application database and
restored S3 endpoint. In a controlled switch to the canonical domains, verify Web
readiness, browser login, file download/preview and one durable diagnostic job.
Do not delete the source volumes until this acceptance is recorded.

The automated isolated test starts fresh infrastructure, writes a canary to each
of the three databases and an S3 object, stops the stack, archives/restores into
new volumes and starts the restored DB/auth/storage/proxy. It checks all health
signals, idempotent bootstrap, the three database canaries and exact restored
object bytes. It removes only its own test projects and volumes. This validates
physical infrastructure recovery; Web business acceptance after a real recovery
remains the separate check above.

[Back to runbooks](0400-runbooks.md)
