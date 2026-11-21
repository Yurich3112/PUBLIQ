---
brief: Prisma 7.10.1 application schema, UUIDv7/audit models, product prices/images, role catalogue and CLI-only migrations.
tags: [cookbook, prisma, postgresql, database, migrations]
---

# Application database

## Package and boundaries

`packages/database` is the private ESM workspace package `@modulon-poc/database`.
`prisma`, `@prisma/client` and `@prisma/adapter-pg` are pinned to **7.10.1**.
The Prisma CLI configuration is `prisma.config.ts`; its paths are relative to
the package. The `prisma-client` generator emits ignored TypeScript under
`src/generated/prisma`; TypeScript builds the public package into ignored `dist`.
Commit the schema, CLI-generated migrations and root lockfile, not generated code.

Only the application database belongs to this schema. Keycloak and queue
databases retain separate ownership. No migration runs during Web startup/build.

## Models

| Prisma model / SQL table | Purpose |
| --- | --- |
| `User` / `user` | Local application UUID and unique verified `keycloakUuid` reference only |
| `Session` / `session` | Session token/expiry, shared `renewalCount` and `userUuid` relation |
| `Account` / `account` | Provider/subject and optional OIDC tokens; `userUuid` relation |
| `Verification` / `verification` | Expiring technical verification records |
| `System` / `system` | Stable UUIDv7 identity of the installation, with unique key `modulon` |
| `Role` / `role` | UUIDv7 catalogue of nine application role codes; no user assignments |
| `File` / `file` | Logical document, lifecycle status and creation/update audit |
| `FileVersion` / `file_version` | Numbered content revision, unique SeaweedFS UUID, size and creator |
| `Tag` / `tag` | Unique tag name and creation/update audit |
| `FileTag` / `file_tag` | Composite association of file and tag UUIDs |
| `Product` / `product` | Unique code, name/description, status, exact price/currency, optional file image and audit |

Single-column local primary keys are named **`uuid`**, have PostgreSQL type `uuid` and
`@default(dbgenerated("uuidv7()"))`. PostgreSQL 18 generates UUIDv7, including
for inserts made outside Prisma. Foreign keys are `userUuid` with `@db.Uuid`
and reference `User.uuid`. There are no local `id` fields or CUID defaults.
Timestamps use `TIMESTAMPTZ(3)`; session/account rows cascade on user deletion.
`FileTag` uses a composite `(fileUuid, tagUuid)` primary key. Document audit
relations restrict user deletion. Join rows cascade when their owning file/tag
is removed. File statuses, immutable content keys and upload coordination are
described in [Administration and files](0307-admin-files.md).
Product image/author FKs also restrict deletion. Product fields and creation
validation are described in [Administration and products](0309-admin-products.md).
`price` is Decimal(19,4); timestamps include nullable `last_archived_at`.
That field does not by itself execute an archival workflow.

`User` stores only `uuid`, `keycloakUuid`, creation/update timestamps and
relations. Name, email, verification flags, avatar, passwords and realm roles
belong to Keycloak and are not copied into this database. Account has no password
column. Session metadata and OIDC tokens are application authentication state.

`keycloakUuid` and `Account.subject` preserve the verified external Keycloak
subject. They have UUID types but are not regenerated or converted to UUIDv7.
The textual provider name and OIDC `idToken` retain their protocol meanings;
neither is a local record identifier.

This is a custom application identity/session schema, **not** the default Better
Auth profile schema. The [implemented login integration](0304-keycloak-login.md)
explicitly bridges Better Auth's
`id`/`userId` and provider fields to `uuid`/`userUuid`, delegates local key
generation to the database and obtains profile data from Keycloak. A stock Prisma
adapter alone is insufficient for the omitted profile fields.

## DEV configuration

Run commands from the repository root. Create `packages/database/.env` from
its example and use the **application** DB role/name from `infra/local/.env.dev`.
Use the published PostgreSQL `DB_PORT` on `127.0.0.1`, encoding URL credentials.
The existing checkout was initialized only where DATABASE_URL was missing;
credentials were never printed. Web reads a separate `apps/web/.env`.

The CLI loads only its package-local `.env` and preserves supplied process env.
The runtime package never loads CLI env files. Offline generation and validation
also work without DATABASE_URL; connecting/migrating requires a real value.

`SHADOW_DATABASE_URL` is DEV migration tooling only. The local application role
has no CREATEDB privilege, so `migrate dev` needs an independently provisioned,
disposable shadow database owned by the migration role. Its URL is currently
empty; provision it through local infrastructure before generating subsequent
DEV migrations. Never point it at the application, Keycloak or queue database.
`migrate deploy` does not require a shadow database.

## Prisma CLI workflow

```powershell
pnpm install --frozen-lockfile
pnpm db:validate
pnpm db:generate
pnpm build:database
```

Change `prisma/schema.prisma`, then let Prisma generate the migration:

```powershell
pnpm db:format
pnpm db:migrate:create --name describe_change
```

Review the generated SQL; do not handwrite or edit migration SQL. If changes are
needed, adjust the Prisma schema and regenerate the unapplied migration through
the CLI. Do not rewrite migration history that has been applied or shared.
`pnpm db:migrate` runs `prisma migrate dev` and can generate/apply DEV migrations;
the `db:migrate:create` alias adds `--create-only`.

Apply reviewed migrations to a deliberately selected database:

```powershell
pnpm db:status
pnpm db:deploy
pnpm db:status
```

QA/PROD use deployment-supplied DATABASE_URL and `db:deploy` in a controlled job.
Do not bundle a workstation `.env` or run `migrate dev`, reset or `db push` there.
Use a DDL-capable migration role and a restricted runtime role; the copied DEV
role is currently the DB owner, not a completed production role separation.

## Server access

The package exports `createDatabaseClient`, `PrismaClient`, `Prisma`, `RoleCode`,
`ProductStatus` and the identity/catalog/product model types. Its browser export is blocked. The factory validates the connection
string without echoing it, uses the PostgreSQL adapter, a default pool of five
connections (allowed range 1–20), a five-second connect timeout and 30-second idle
timeout. It connects lazily. Process owners call `$disconnect()` on shutdown.

Next.js server modules use `getDatabase()` from `src/server/database.ts`. That
module imports `server-only`, creates the client on demand and reuses it across
DEV hot reloads. A cached client without the Product delegate is retired and
recreated so an older HMR instance cannot break the new product read. This is a
specific compatibility check, not automatic detection of every schema change.
Root Web build/dev commands build the database package first.
No public route exposes model records, tokens or credentials; existing readiness
still validates configuration only and does not claim database availability.

## System, technical actor and initial configuration seed

```powershell
pnpm db:deploy
pnpm db:seed
```

`prisma/seed.ts` is the CLI entrypoint. Prisma's `migrations.seed` setting calls a
package script that builds the generated client before running TypeScript with
the existing Node.js runtime. No extra TS runner is needed. In Prisma 7 the seed
runs explicitly through `prisma db seed`; migration/deployment does not seed data
automatically. The root `db:seed` alias uses that CLI command.

The DEV startup orchestrator explicitly calls `pnpm dev:seed` after migrations.
That alias checks the local application/queue targets and runs
`db:seed:prepared`, which reuses the already-built client and loads the owning
package's private env. This avoids repeating the package build during DEV startup;
it does not change Prisma's migration behavior.

The seed first checks for `System(key=modulon)`, the role codes and the SYSTEM
actor. It issues inserts only for missing defaults, inside one transaction:
`ROOT`, `SADMIN`, `ADMIN`, `SYSTEM`, `AUDITOR`, `VIEWER`, `USER`, `GUEST`, `LOGED`.
PostgreSQL generates one installation and nine role UUIDs with `uuidv7()`. Conflict-safe inserts
preserve existing UUIDs and timestamps during repeated or concurrent runs. A
fresh independent database receives a different system UUID; a restored database
retains the identity in its backup. The seed also creates one local technical
`User(systemKey=SYSTEM)` with no Keycloak identity, account, password or login
session. It grants no role and does not change Keycloak. This audit actor is
separate from both the installation record and the `SYSTEM` role code.

Seed runs serialize on the installation row; unique constraints and conflict-safe
inserts cover concurrent first installation. A complete dataset returns
`status=unchanged` and zero creation counts; the CLI prints a skip message.
Incomplete datasets return `status=seeded` with per-category creation counts.
Removing one unused catalogue role causes the next run to restore only that role;
all remaining identities, timestamps and operator configuration stay unchanged.

If the installation has no configuration versions, the same transaction creates
published version 1 using the default settings, activates it and records the
SYSTEM actor for creation, update, publication and activation. Repeated runs
preserve all existing versions, timestamps and active choices. If versions exist
without an active pointer, the seed leaves activation to the administrator.

Migration `20261113171235_system_seed_actor` adds the unique technical key and
allows the provider reference to be absent only for SYSTEM. Database guards
prevent changing identity kind or attaching sessions/provider accounts to SYSTEM;
the authentication adapter also refuses to hydrate it as a login identity.

This table is a local role vocabulary. User profile data and role assignments
remain in Keycloak; no `User.role` column or local authorization mapping is added.
Realm roles are not renamed by seeding. Keycloak bootstrap separately manages the
same nine-code vocabulary and the `ROOT -> SADMIN -> ADMIN -> USER -> LOGED` composite
hierarchy. It renames legacy `ADMINISTRATOR` to `ADMIN` while preserving role UUID
and assignments. AUDITOR, VIEWER, SYSTEM and GUEST remain independent.

`20261108195829_system_role_catalogue` was generated by Prisma CLI against temporary
development/shadow databases. Its additive SQL creates only the catalogue enum,
two tables and unique constraints; existing identity/session data is untouched.
The migration and explicit CLI seed were applied to the verified local DEV
application database `modulon`; migration status is current. Keycloak/queue
databases were excluded. QA/PROD are not migrated by this workstation operation.

```powershell
pnpm test:database:integration
```

The integration check provisions two isolated local databases, applies migrations
through Prisma CLI, runs the CLI seed twice, checks zero-change results and tests
four concurrent first runs plus recovery of one missing role.
It verifies UUIDv7, stable timestamps/UUIDs, distinct installation identities,
all nine roles, one non-login SYSTEM actor, an audited active baseline, preservation
of operator settings and rejection of SYSTEM authentication, then removes both databases.
It requires the DEV PostgreSQL container and matching local application credentials.

## Product and role migrations

`20261112090000_products` adds Product, its lifecycle enum, audit/image foreign
keys and indexes. `20261112120000_logged_role` adds LOGED to RoleCode. Both were
generated through Prisma CLI, reviewed and applied to the local DEV application
database. The explicit seed and Keycloak reconciliation preserved existing data;
no volume reset was needed. These workstation operations do not migrate QA/PROD.

```powershell
pnpm test:products:integration
```

The product integration uses a disposable database and checks UUIDv7, exact
Decimal values, optional images, code uniqueness, restrictive image/author FKs,
archival timestamp persistence and concurrent image-attachment locking. It does
not exercise the entire browser upload workflow. Real upload and data-only query
acceptance are recorded in the [product recipe](0309-admin-products.md#verification-and-limits).

## Session renewal counter

`20261108225820_session_renewal_counter` was generated and applied by Prisma CLI
to the verified DEV application database. It adds `Session.renewalCount` with
default zero; existing sessions/identities remain intact. An isolated temporary
shadow database was used because the runtime application role cannot create DBs;
that shadow database was removed after migration. Never use an application,
Keycloak or queue database as a shadow target.

The Better Auth renewal plugin conditionally updates expiry and increments the
counter together, comparing the prior expiry/count and authenticated user UUID.
Concurrent requests cannot exceed `SESSION_MAX_REFRESHES`; the counter is shared
across manual/navigation renewal and browser tabs. It is technical session state,
not a user role/profile field. See the [session policy](0304-keycloak-login.md#session-lifecycle-and-role-display).

`pnpm test:auth:integration` applies the committed migrations to a disposable DB
and verifies parallel renewal, caps, expired-session rejection and cookie lifetime.
Generating a client or building Web does not apply migrations to another environment.

## Recorded verification

Prisma CLI generated `20261108155145_init_identity_uuidv7` with
`migrate dev --name init_identity_uuidv7 --create-only` against isolated test/shadow DBs.
`migrate deploy` and `migrate status` then passed on the test DB. Live client
checks verified PostgreSQL 18.6, database-generated UUIDv7 in all four tables,
UUID foreign keys, absence of profile/password columns, preserved external
Keycloak subjects, unique constraints, relations and cascade deletion. Both temporary databases were removed. The
persistent databases were not migrated during that test. The application DEV DB
was subsequently migrated via Prisma CLI for the login integration; Keycloak
remains outside application Prisma ownership.

`pnpm test:database` builds the package and tests URL redaction, pool bounds and
lazy initialization without requiring a live DB. It is included in `pnpm check`.
The full check passed types, Web lint and 38 tests; the release build also passed.

References: [PostgreSQL UUIDv7 generation](https://www.postgresql.org/docs/18/functions-uuid.html),
[Prisma 7 configuration](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference),
[Prisma 7 seeding](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/seeding),
[Prisma client generator](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators),
[Better Auth core schema](https://better-auth.com/docs/concepts/database).

[Back to cookbook](0300-cookbook.md) | [Environment configuration](0202-environment-configuration.md)
