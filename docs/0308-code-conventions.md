---
brief: Coding conventions for readable Next.js modules, defensive validation, shared UI, cookies, data consistency and focused checks.
tags: [cookbook, development, clean-code, validation, security, ui]
---

# Coding conventions

## Scope and readability

Keep a change cohesive around the requested behavior. Preserve existing callers,
stored data and unrelated working-tree edits. Reuse existing representations,
helpers and components when they fit. Extract shared mechanics when actual
consumers need them. Keep route-specific behavior near its route and give shared
modules a concrete responsibility.

Use descriptive names, kebab-case module filenames and PascalCase React component
names. Follow the surrounding formatting. Prefer explicit, readable control flow
and short functions. Comments explain constraints or recovery decisions. Remove
unused helpers, state and imports as the owning implementation changes.

## Framework and configuration boundaries

Start pages/layouts as Server Components and add `"use client"` at interactive
entry points. Keep secrets, database access, provider calls and authorization in
server modules with `server-only`. Pass explicit public DTOs into browser code.
Read the installed Next.js documentation referenced by `apps/web/AGENTS.md`
before framework-sensitive changes.

Use `src/schemas` for shared validation and DTO contracts, `src/server` for data
and business operations, and thin Route Handlers/Server Actions for transport.
Reuse `config/api-routes.ts` and localized navigation helpers. Maintain the
separation of application version and API contract version.

Add environment names to the owning example and schema together. Parse runtime
values with the existing Zod/config helpers. Public settings pass through the
explicit allowlist in `config/public.ts`. Keep private values out of public
bundles, errors, logs, committed examples and documentation. Surface configuration
errors by field and category while keeping invalid values private.

Compute release dates and copyright years from build metadata through
`config/version.ts`. Rendering under prerendering/cache constraints needs a stable
snapshot or an appropriate request/client lifecycle for changing time values.
Use existing hydration helpers for browser-only state.

## Validate at the boundary

Treat form data, query parameters, cookies and upstream responses as untrusted.
Validate types, lengths, ranges, enums and identifiers before use. Define allowed
page sizes and sort columns in schemas. Handle repeated query parameters through
the established parser. Keep UI validation and server validation aligned.

Authenticate before reading protected data, then authorize the requested action.
Resolve mutation actors from the verified session. A layout or hidden button
provides presentation and navigation control. Every protected server entry point
must perform its own access check. Keep role-decision memoization request-local.
Reuse `requireAccess(policy)` or `withAccess(policy, callback)` with a server-owned
policy, such as `ADMIN_ACCESS`. Never accept the required threshold or effective
role level from browser input. See the
[access policy](0203-identity-and-access.md#parameterized-server-access).

Use explicit result states for expected outcomes such as denial, invalid input,
conflict and temporary failure. Show translated actionable feedback. Keep the
cause observable through safe diagnostics where recovery needs investigation.
Only return fields needed by the consumer from database and provider responses.

## Cookies and preferences

Reuse `src/cookies/core.js` and its typed preference adapters for browser
preferences. Keep name/value validation, encoding and set/remove serialization
centralized. Cookie removal must match the path/domain scope used for creation.
Use the existing host-only/shared-domain migration when saving preferences.

The configured language, theme and contrast names are distinct and validated.
Authentication cookies are owned by the server auth flow. Follow its namespace,
expiry, chunk cleanup and session policy for changes to authentication state.
Preference values must never determine access rights.

## Data safety and concurrent work

Use Prisma for the application database and preserve the Keycloak/queue ownership
boundaries. Generate migration changes through the documented Prisma CLI workflow,
review their SQL and validate on a disposable database where useful. Confirm the
actual target before applying a migration and reuse existing authorization.
Keep generated clients/build output out of source control.

Python tasks may use the explicit PostgreSQL helper for task-owned data access;
this does not transfer application schema/migration ownership from Prisma.
Reuse one bounded helper per owning lifecycle, bind SQL values as parameters and
use its transaction context. Never fall back to Web or queue credentials, bypass
domain authorization, or retry a write with an unknown commit outcome. Queue
access from Python goes through the Node producer/status bridge, not direct
pg-boss SQL. See [connection helpers](0314-python-worker.md#optional-connection-helpers).

Use PostgreSQL-generated UUIDv7 for local record identities and preserve verified
external subjects. Keep foreign keys, indexes, uniqueness and deletion policies
consistent with the owning model. Use `///` for Prisma model/field documentation.
Preserve BigInt precision across database, server DTO and UI comparisons.
Serialize Decimal prices as exact strings and validate scale without converting
the complete amount through JavaScript floating-point numbers.

Use atomic database operations or transactions for related updates. Include an
expected value/version where a concurrent write could overwrite another user's
change. Model retries and partial failures explicitly. File upload recovery checks
the committed reference before deleting an attempted storage object. Apply the
same reasoning to future operations spanning multiple services.
Permanent file deletion locks the catalog row and checks product references before
storage deletion. Retain metadata after partial storage failure for an idempotent
retry; a database transaction cannot roll back deleted storage objects.

## Shared UI and asynchronous operations

Use `@/ui/basic`, composed components and centralized semantic styles. Import
`cx` for caller overrides and keep complete Tailwind class names discoverable.
Add matching PL/EN keys for visible text and accessible labels. Use native buttons,
checkboxes, forms and links with their intended semantics.

Provide accessible names for icon-only controls, hide decorative icons and expose
sort, expanded, invalid and busy states. Keep focus usable through opening,
closing and async transitions. Validate narrow screens, contrast and reduced
motion for affected interactions. Use shared Tooltip behavior, including top-layer
mode where the owning panel requires it.

Keep filter edits local until Apply. Reset pagination when search/filter scope or
page size changes, and preserve the other active query parameters. Keep temporary
data refresh failures distinct from authorization failures. Sort a copied array
and document whether order covers the fetched page or the entire dataset.
Apply search and filters to the full server dataset before pagination. Product
sorting is SQL-wide; user/file sorting currently covers the fetched page only.
Render the table shell immediately, then load through the protected data action.
Reuse `TableQuery` for same-table native-history navigation and
`TableDataRegion`/`TableLoadingBody` for the four-row loading body. Shared
`tableMotion` defines the 100 ms height/fade transition; do not delay requests to
simulate animation. Shared `buttonMotion` defines the 200 ms button transition.

Prevent duplicate mutations while pending. Place operation progress in the shared
brief notification strip when it belongs to the page status. Use `pending: true`
and replace the same notification ID on completion. Keep notification callbacks
bound to their original owner. A closeable panel and cancellation of its operation
are separate controls.

For a blocking popup operation, disable its action controls and use
`disableClose={pending}`. Restore retry/cancel after a recoverable error. Cancel
timers, observers and listeners during cleanup, and guard obsolete async results
against replacing a newer query or account state.

## Verification and documentation

Run the checks that cover the changed boundary and inspect their actual output.
Use the root `pnpm check` for the integrated types/lint/test suite and `pnpm build`
for release compilation. For focused changes, choose the relevant test entrypoints
from `package.json`. Add regression coverage when behavior, recovery or boundary
validation needs it. Keep tests directed at observable behavior.

Separate unit/fixture checks, disposable-service integration checks and real
authenticated browser acceptance in the reported evidence. A simulated API proves
the UI interaction it exercises. Record remaining uncertainty explicitly.

Keep durable documentation in `docs` with `brief`/`tags` frontmatter and the
numbered route from `0000-overview.md`. English is the repository convention.
Preserve existing metadata, link new recipes from their chapter router and update
stale feature claims with the implementation. Repository memory under `.ai`
follows its separately authorized workflow.

[Back to cookbook](0300-cookbook.md) | [Web structure](0206-web-structure.md)
