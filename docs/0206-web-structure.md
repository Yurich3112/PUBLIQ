---
brief: Reviewed Next.js source structure, API and locale boundaries, health contracts and remaining implementation gaps.
tags: [architecture, nextjs, api, structure, clean-code]
---

# Web structure and API boundaries

## Current layout

```text
apps/web/
  package.json                 ESM application in the root pnpm workspace
  next.config.ts               Next.js, next-intl, compiler and typed-route setup
  messages/pl/                 Polish catalogs
  messages/en/                 Matching English catalogs
  public/                      Branding and published license; no env/private keys
  src/
    app/
      [locale]/
        layout.tsx             HTML/body, locale validation, providers and shell
        page.tsx               Product-specific Server Component
        test/                  Localized interactive component gallery
        admin/users/           Protected Keycloak directory table
        admin/files/           Protected file table, upload and status actions
        admin/products/        Protected product table and creation action/panel
        admin/products/create/ Direct entry to the product creation panel
      api/
        route.ts               GET /api: public version discovery
        v1/
          route.ts             GET /api/v1: service/version/endpoint discovery
          auth/[...all]/route.ts   Restricted Better Auth HTTP boundary
          health/
            live/route.ts      GET /api/v1/health/live
            ready/route.ts     GET /api/v1/health/ready
      globals.css              Shared Tailwind tokens and preference variants
    config/
      public.ts                Public schema and safe configuration parsing
      server.ts                Server-only runtime env loading/validation
      api-routes.ts            Locale-independent paths shared with clients
      version.ts               Public system version from the root manifest
    server/
      auth/                    OIDC, UUIDv7 adapter, directory, session policy/plugins and Server Actions
      health.ts                Liveness/readiness results; no UI/Next.js dependency
      http.ts                  Server-only noncached JSON response policy
      file-catalog.ts          Prisma metadata, audited status changes and upload coordination
      files.ts                 S3 metadata paging/counting, writes and recovery removal
      products.ts              Filtered/sorted SQL product queries and exact amount DTOs
      create-product.ts        Product validation, optional image normalization and recovery
    i18n/                      Locale routing, catalogs, navigation and validation
    schemas/                   Preference/locale, access policy, file/product query and creation validators
    cookies/                   Browser preference helpers, not authentication
    ui/
      basic/                   Reusable semantic controls and styles
      components/              Preferences, popups/asides, shared table controls, notifications and session UI
      layout/                  Navbar, footer and shell styles
    proxy.ts                   Locale routing, excluding the exact API prefix
packages/database/             Prisma 7.10.1 schema, CLI migrations and server client
tests/web/                     API/config/preferences/catalog and UI tests
```

`route.ts` exposes an HTTP endpoint. A directory or `page.tsx` alone is not an
API handler. The existing locale root layout owns the UI shell; API routes do
not render HTML layouts, request translations or acquire locale prefixes.

Administration pages authorize and render the table shell before reading data.
Client refresh invokes protected Server Actions; `TableQuery` updates marked
query forms/links with native history and refreshes table data without document
navigation. Product creation uses the same page with a URL-controlled side panel.
These business flows add no public REST endpoints. See the
[table contract](0306-ui-components.md#administration-tables) and
[product recipe](0309-admin-products.md).

## Why health originally lived outside API

Root-level health paths are valid operational endpoints. Their important property
is being independent of localized UI and authentication. In this PoC, the
canonical Web endpoints now live under `/api/v1/health` to keep the HTTP backend
together. The old Web `/health/live` and `/health/ready` handlers were removed;
clients and QA Web health configuration use the new paths.

The internal Nginx `/health/live` and Keycloak management `/health/ready` endpoints
belong to those services and retain their own paths. Do not globally rewrite
every service health URL when changing Web routing.

## API contract

| Endpoint | Result | Meaning |
| --- | --- | --- |
| `GET /api` | Public `service`, `defaultVersion` and supported `versions` | Version discovery only |
| `GET /api/v1` | `service`, `apiVersion`, system `version` and endpoint paths | v1 discovery; no env values or business data |
| `GET /api/v1/health/live` | 200 with `status: ok`, `service: web`, `check: liveness` | The process answers requests |
| `GET /api/v1/health/ready` | 200/configuration up, or 503/configuration down | Application configuration is valid; no DB/auth/S3 probes yet |
| `POST /api/v1/chat` | Private NDJSON stream for an authenticated user | Saves the prompt, streams the reply and returns completed response metrics. [Chat contract](0207-ai-execution-architecture.md#chat-stream-and-response-details) |
| `GET /api/v1/chat/attachments/{uuid}` | Private download for the conversation owner | Retrieves a saved chat attachment |

Handlers wait for a request with `connection()` and return JSON with
`Cache-Control: no-store`. Readiness uses 503 on invalid configuration and never
returns the invalid values, secrets or validation details. Unsupported mutation
methods have no handler. These diagnostic endpoints are intentionally public;
future business routes must authenticate, validate input and enforce ownership.

API contract version `v1` is independent of application version `0.1.0`. Future
breaking contracts use a new version namespace. Old unversioned health URLs have
no aliases; unsupported versions return 404.

Use the Web origin plus `/api/v1/...` as the canonical API location. The local proxy now routes only Web, Keycloak and S3; separate API/worker/console
upstreams have been removed.

The restricted auth boundary additionally serves read-only session status,
server-checked renewal and hard sign-out. Status/renewal/logout are Better Auth
plugin endpoints rather than locale pages. See the complete
[auth endpoint contract](0304-keycloak-login.md#http-boundary) and
[component ownership guide](0306-ui-components.md) before extending either boundary.

## Clean-code decisions applied

| Area | Applied decision |
| --- | --- |
| HTTP transport | Thin Route Handlers; readiness checks moved into `src/server/health.ts` |
| Response policy | One `jsonNoStore` helper for discovery and diagnostic handlers |
| Shared paths | `config/api-routes.ts` prevents the footer status widget and API discovery from using different health URLs |
| Module naming | Replaced ambiguous `config/config.ts` and `_config.ts` with `public.ts` and `server.ts` |
| Server boundary | Server modules use `server-only`; public schemas/cookies contain no private runtime configuration |
| Locale proxy | API exclusion matches `/api` and `/api/...`, not unrelated page prefixes such as `/apiculture` |
| Module format | Web declares ESM; Next.js tracing uses `import.meta.dirname` consistently |
| UI readability | Homepage service labels are defined once with their keys instead of rebuilding a label map inside JSX |
| Package naming | Empty `packages/db` scaffold renamed to the agreed `packages/database` without creating a fictitious Prisma implementation |

Keep product-specific Server Component content in its route while it remains
local and cohesive. Extract feature services/components when actual business
behavior or reuse requires it. No generic repository layer, empty CRUD modules,
second HTTP framework or unused authentication endpoint was introduced.

## Review scope and verification

The review covered `apps/web/src`, Web framework/config/module setup, root
workspace entry points, test wiring and consumers of Web health URLs. An import
graph check covered 95 TypeScript modules and 8 client entry points: local imports
resolved, and no client import path reached `server-only`, `process.env`, Node
modules or Next.js server APIs. This is static boundary evidence, not a full
security audit or browser accessibility acceptance.

Regression tests cover public health results, invalid readiness/redaction and
noncached error responses. Existing UI/preferences/catalog and script tests
remain part of `pnpm check`; all 35 tests, types and lint passed. The release
build and quiet QA Compose validation also passed. Runtime HTTP checks verified
API discovery and GET/HEAD health, rejected POST, noncached JSON, API 404, PL/EN
pages and a page prefix beginning with `api` that still receives locale routing.
Invalid runtime configuration produced readiness 503 without private values,
while liveness stayed 200. Temporary servers were stopped after testing.

Generated stale DEV route types were removed after the move; they are build
artifacts, not source modules. Existing DEV containers were not restarted.

The following implementation gaps remain explicit:

- Server-side Better Auth/Keycloak sessions, role display, renewal and hard logout
  are integrated. Shared server policies enforce minimum role level 80 for admin
  pages and actions. Broader resource policies and every login-start path remain
  outside that evidence. See the
  [login recipe](0304-keycloak-login.md).
- Prisma schema/client/migrations now exist and DEV DB deployment passed; production
  role separation remains pending. See the
  [database recipe](0303-prisma-database.md).
- Private avatar operations and the document catalog/upload/status flow are
  implemented. Durable queue execution and pending archival/deletion processing
  need their own worker flow. See [Administration and files](0307-admin-files.md).
- Automatic DEV starts four core infrastructure services plus S3 console with
  container-owned bootstrap. Local QA includes Web/worker Dockerfiles, explicit
  auth/DB runtime configuration and separate build/migrate/start stages; see
  [QA containers](0316-qa-containers.md).
- Latest UI checks cover selected browser/keyboard/mobile interactions, not a full
  accessibility audit or production recovery. The 35-test paragraph above records
  the earlier structural slice; the later products/access/table slice passed 107
  Web tests and 18 script tests, types/lint and focused integrations. See
  [recorded verification](0309-admin-products.md#verification-and-limits).

[Back to architecture](0200-architecture.md) | [Web cookbook](0301-web-development.md)
