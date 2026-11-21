---
brief: Administrator file catalog, SeaweedFS upload, guarded permanent deletion, lifecycle actions and asynchronous numbered tables.
tags: [cookbook, admin, files, seaweedfs, prisma, ui]
---

# Administration and files

## Entry points and access

The localized routes `/pl/admin/users` and `/en/admin/users` read the Keycloak
directory. `/pl/admin/files` and `/en/admin/files` combine application metadata
with the configured private document bucket. Both use the server admin guard.
`ADMIN_ACCESS` requires a valid session and mapped role level >=80: ROOT, SADMIN
or ADMIN. Each read, refresh and mutation checks access independently through the
[shared server policy](0203-identity-and-access.md#parameterized-server-access).

File route components and Server Actions live under
`apps/web/src/app/[locale]/admin/files`. The upload endpoint is
`POST /api/v1/admin/files/upload`. `src/server/file-catalog.ts` owns Prisma
operations and upload coordination. `src/server/files.ts` owns S3 metadata
listing, object writes and removal. The bucket uses `S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_APP_ACCESS_KEY` and `S3_APP_SECRET_KEY` from server configuration.
These credentials belong in the ignored runtime environment.

## Catalog and revisions

| Model | Responsibility |
| --- | --- |
| `File` | Logical UUIDv7 identity, name, lifecycle status, creation/update audit and tag associations |
| `FileVersion` | Revision number, optional original filename, size, creator, timestamp and unique SeaweedFS object UUID |
| `Tag` | Unique name, UUIDv7 identity and creation/update audit |
| `FileTag` | Composite association between a logical file and a tag |

Each revision uses a separate object key. The highest version number identifies
current content. `FileVersion` enforces uniqueness of `(fileUuid, version)` and
`seaweedUuid`. Size uses PostgreSQL BigInt. Preserve that precision when rendering
and comparing values. File/version audit foreign keys restrict user deletion.
Removing an association cascades through its join row.

A new upload starts at version 1. Choose Replace file in the row actions or
Add version in file details to publish a new current version. The table shows
one row per file. When a file has multiple versions, the chevron next to the
current version number expands older rows below it. Each older row has icon
actions to restore its content as a new current version, download the exact
revision, or open Info. Earlier versions retain separate objects. Downloads
use the revision's stored filename and fall back to the logical name for
older data.
Version writes lock the file and reject a stale current version. For product
images, an added revision must be a valid image. Add and restore actions apply
to active or inactive files.

The rightmost Info icon opens the side panel for the selected revision. It
shows the filename, version, size, creation date and image preview, with the
preview request pinned to that revision. Opening Info keeps preview content
out of the table. Closing the panel returns focus to its Info button. For a
non-image, the panel explains that the file can be downloaded.

The revision catalog uses PostgreSQL and separate S3 keys. The migrations
`20261118000100_file_deletion_intent` and `20261118000200_file_revision_name`
add the deletion guard and optional revision filenames.
Use the [Prisma workflow](0303-prisma-database.md) for another environment and
verify its actual target before deployment.

## Upload workflow

The Add file button expands an upload panel below the table toolbar, using the
same disclosure pattern as the filters. The trigger has a primary outline
when collapsed and a solid primary fill when expanded. The panel accepts
native file selection or drag and drop, displays the selected name and
highlights the drop zone. Validation accepts one nonempty
file up to 8 MiB. The same-origin upload endpoint checks administrator access,
limits bytes as they arrive, and validates and normalizes the filename. The
audit actor comes from the verified server session. Each Web instance accepts
one active file upload per account, including new revisions.

While uploading, the form prevents changes and dismissal. The notification
panel shows bytes transferred, percentage and estimated time remaining once
enough data has been sent. At 100% it shows that the server is saving the file.
The server outcome replaces that notification. Success closes the form and
refreshes the table; failure keeps the form open with a localized error.

Upload coordination creates the file/revision inside a database transaction and
writes its object before committing. After a failure, recovery checks whether
the catalog references the attempted object before removing it. A saved reference
can indicate a committed transaction whose response was lost. If recovery cannot
confirm cleanup, it emits a safe diagnostic. Database and object-store consistency
requires this recovery path because the two services have separate transactions.

## Lifecycle actions

| Status | Meaning in the administration table |
| --- | --- |
| `active` | Active logical file and the default for existing/new catalog records |
| `inactive` | Deactivated logical file |
| `pending_deletion` | Marked for deletion processing |
| `softdelete` | Legacy readable state; no new transition or action button enters it |
| `pending_archiving` | Marked for archival processing |

Status applies to the logical file and all of its revisions. The active,
inactive, pending_archiving and pending_deletion actions update this field.
The matching current-state action is disabled and uses a filled icon. Other
actions have outlines at rest and full semantic fills/contrasting icons on hover.
The server compares the expected current status
before changing it and updates the actor/timestamp. A stale concurrent request
returns a conflict and triggers a list refresh. The current implementation records
pending deletion/archival intent. Execution of those jobs requires a worker flow.
The previous Soft delete button was removed. Existing softdelete records can
still be read and restored or marked for another supported state.

Info for the current row toggles a push aside with file and object identifiers,
revision, status, size, timestamps, audit UUIDs and tags. Selecting another
Info action replaces the details. The selected current row has an accent tint
and a filled Info icon.

## Permanent deletion

`perma_delete` is a separate Delete permanently action with confirmation. It is
not an enum value and is different from pending_deletion. After authorization
and UUID/expected-state validation, `deleteDocument` locks the logical file with
`SELECT ... FOR UPDATE` and checks Product image references before touching S3.
The row action sends its current version number so a stale view cannot start
deletion after another administrator adds a revision. An image still used by a
product returns `inUse`. The database guard protects concurrent image attachment.

Deletion first commits an intent on the file. This blocks content access,
status changes, new versions and new product image references. The file stays
visible with a deletion indicator so an administrator can repeat the action.
All revision keys remain recorded until S3 confirms removal. A successful retry
also tolerates objects removed by the previous attempt. Only then does a
catalog transaction remove all revision rows and the logical file. FileTag
associations cascade, shared tags remain and the audit history records deletion.

Pending confirmation blocks repeated submission and dismissal. Progress and its
result share a notification ID; success immediately removes all visible revisions
of that logical file and refreshes the data. This manual physical operation does
not implement background deletion/archival workers.

## Table controls

Files, Users and Products reuse the [administration table components](0306-ui-components.md#administration-tables).
The shell renders before the first data read. Requests show a four-row body
loader; page/search/filter forms update URL history and fetch data without a
document reload. Refresh actions recheck access for each query. A temporary
failure retains the previous page with feedback; denial clears protected results.

PostgreSQL supplies one row per logical file, with the latest version and a
count of versions. Name, tag and single/multiple version filters apply before
pagination. Expanding a row loads older versions in batches of 25. Objects
outside the catalog are available through S3 tools and the
[reconciliation report](0403-data-recovery.md). Applying search or filters or
changing the row limit resets to page 1.

The numbered paginator remains visible for empty/single pages. It supports first,
previous, next and last navigation, nearby page links, a bounded page-number input
and 1/10/25/50 rows from the query schema. Separate result/page counters use the
whole query total. URL state uses `page`, `limit`, search/filters and sorting;
expanded revisions use their own version cursor.

The first column contains `selectedFile` checkboxes. Whole column headers sort
name, revision, status, size and modified time. Chevrons and `aria-sort` expose the
direction. Sorting covers the fetched page, matching the current Users table.
Names use locale-aware numeric comparison, sizes preserve BigInt precision and
missing metadata stays last. Sorting is preserved in search/filter, page-size
and pagination parameters. Same-page sorting preserves selection and Info state.
Refreshing the list can temporarily hide the table, and a new current version
resets its older-version controls. A new page or filter scope resets the table
state. Bulk actions need a separate consumer of the selected keys.

Status save progress appears in the brief breadcrumb notification with a throbber.
It remains pending until a success or failure replaces the same notification ID.
See the [notification component contract](0306-ui-components.md#notification-center).

## Verification

Run `pnpm test:web`, `pnpm typecheck` and `pnpm lint` for relevant regressions.
Use `pnpm test:browser:reliability` for the live DEV flow. See
[browser prerequisites](0404-reliability-verification.md#commands).
For storage/schema changes, verify migration and upload recovery on a disposable
application database with synthetic objects and remove those fixtures afterward.

Check both locales, native selection/drop, validation, pending controls, Info
toggle, all status actions, conflicts, empty pages, previous/next navigation,
query preservation, checkbox retention and both directions of each sortable
column. Include sizes above JavaScript's safe integer range.

The browser scenario uses slow upload to check live progress, the server's
concurrency limit and cross-origin rejection. It adds a revision through the
row action, opens Info in the aside, checks that preview content stays out
of the table and verifies focus restoration after closing. It checks exact
older-version download bytes, restores them as version 3, then verifies that
the file, revision records and all three S3 objects are gone. Partial S3
deletion failures and retry behavior use controlled responses in server tests.

[Back to cookbook](0300-cookbook.md) | [Products](0309-admin-products.md) | [Coding conventions](0308-code-conventions.md)
