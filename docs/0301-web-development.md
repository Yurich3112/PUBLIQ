---
brief: Practical recipes for installing the workspace, developing Next.js UI and maintaining PL/EN translations.
tags: [cookbook, nextjs, ui, i18n, configuration]
---

# Web development recipes

## 1. Prepare the checkout

Use the root workspace, not a separate installation inside `apps/web`. The
manifest records pnpm 12.15.0; Node.js 26.12.1 was used for the recorded checks.
Read [workspace commands](0205-workspace-commands.md) for the command contracts.

```powershell
pnpm install --frozen-lockfile
pnpm stack:init
```

`stack:init` creates a missing `infra/local/.env.dev` and, for DEV, the missing
`apps/web/.env`, `apps/pyworker/.env` and `packages/database/.env` from their
examples. It preserves every file that already exists and does not start Docker
or rotate passwords already written into a volume. A fresh clone does not
contain those ignored files or TLS material. Provision the local server
certificate, key and public CA before DEV preflight; see
[Local HTTPS and CA trust](0318-local-tls.md). The filenames the stack expects
are `infra/local/certs/localhost.pem`, `localhost-key.pem` and `rootCA.pem`.

The shipped examples already use the same local database user and password in
`apps/web/.env`, `packages/database/.env` and `infra/local/.env.dev`, so a fresh
clone connects without hand-editing URLs. If you replace an infrastructure
password, update both application URLs to match; see the
[database recipe](0303-prisma-database.md).

Do not copy another developer's live database, session or production credentials
into templates. Keep `.env` files and private keys ignored. The shared lockfile
and existing native-build allowlist belong to the repository root.

## 2. Start the DEV services

```powershell
pnpm dev
```

This runs the [ordered DEV startup](0315-dev-startup.md): env/certificate and Docker
checks, shared builds, guarded application migrations and Python preparation,
then Web and both workers together. Start Prisma Studio separately with
`pnpm db:studio`. Docker and healthy DEV
containers must already be available. Open `http://localhost:3000/pl` or `/en`;
`/` redirects to Polish. Stop the foreground pnpm group with Ctrl+C.

For Web-only UI work in a prepared checkout, use `pnpm dev:web`; it launches only
Next.js and skips the aggregate preparation/migrations. The implemented UI can
render without PostgreSQL, Keycloak or SeaweedFS, but protected data flows need
their respective services.

For the HTTPS login flow, use `https://modulon.local/pl` or `/en`. DEV sets
`UI_PREFERENCE_COOKIE_DOMAIN=modulon.local` to share the theme with Keycloak.
For localhost-only UI work, leave this domain empty; its validator warning is
informational. Other missing/invalid values must be
resolved in the owning env file. Use the [runbook](0401-local-operations.md) for
port conflicts and startup failures.

## 3. Change configuration

| File | Responsibility |
| --- | --- |
| `apps/web/.env.example` | Committed, safe application configuration names/defaults |
| `apps/web/.env` | Ignored DEV application values |
| `apps/web/src/config/public.ts` | Public Zod schema and explicit client-safe allowlist |
| `apps/web/src/config/server.ts` | Server-only runtime settings and validation |
| `infra/local/.env.dev` / `.env.qa` | Selected local infrastructure mode |

For a new setting, update its owning template and schema together. Add secrets
only to server configuration; never to the public allowlist or `NEXT_PUBLIC_*`.
The UI receives only public configuration props. Restart Web after env changes.
Do not change cookie names casually: existing preferences remain under the old
names. Keep preference names distinct from the sibling application's names.

Run `pnpm validate:dev` after updating the DEV schema/template. The env script
checks keys and basic env syntax; Zod validates application values at runtime.
It does not test database credentials or network access. The Web launcher passes
its local env `PORT` to Next.js, matching the DEV port check; an explicit process
`PORT` override takes precedence. See the alternate-port recipe in the runbook.

## 4. Add a localized page

Create the route under `apps/web/src/app/[locale]`, for example
`settings/page.tsx`. Start with a Server Component. For a translated heading,
merge the following keys into the existing `common` namespace in both catalogs:

`apps/web/messages/pl/common.json`:

```json
{"common": {"settings": {"title": "Ustawienia", "save": "Zapisz"}}}
```

`apps/web/messages/en/common.json`:

```json
{"common": {"settings": {"title": "Settings", "save": "Save"}}}
```

These are additions to the existing objects, not replacement files. Then use:

```tsx
import { getTranslations } from "next-intl/server";
import { Heading } from "@/ui/basic";

export default async function SettingsPage() {
  const t = await getTranslations("common.settings");
  return <Heading level={1}>{t("title")}</Heading>;
}
```

The parent locale layout already supplies language context, theme/contrast
providers, navbar/footer and `<main>`. Use `Link` from `@/i18n/navigation` for
internal links so the locale is retained. Client Components use `useTranslations`
from `next-intl`; add `"use client"` only when browser interaction requires it.

Changing an existing catalog needs matching keys in PL and EN. New catalog files
also need explicit imports and registration in `src/i18n/catalogs.ts` for every
locale. Rendering uses those static registrations; creating a JSON file alone
does not load it. `pnpm test:web` checks file/key parity and agreement with the
registered catalogs.

## 5. Reuse the existing UI

Import controls from `@/ui/basic`; shared defaults live in
`src/ui/basic/styles.ts`. Prefer semantic native controls and the existing
Tailwind tokens to a second component system. For example, inside a component
using the `common.settings` translator:

```tsx
<Button type="submit" tone="main" className="rounded-none">
  {t("save")}
</Button>
```

Import `Button` from `@/ui/basic`. Its default type is `button`; set `submit`
explicitly for forms. Caller `className` overrides conflicting shared defaults
through `tailwind-merge`. Supply labels, error associations and disabled/pending
states as appropriate. A styled button does not implement saving: the owning
business service and protected mutation still need implementation.

`Throbber` from `@/ui/basic` follows the TrueGuard ring design and accepts
`size="sm" | "md" | "lg"` (14/18/22px) and an optional visible localized `label`.
With a label it announces a status; without one it is decorative. The ring uses
the current text color, a transparent top edge and a one-second rotation, disabled
for reduced-motion preferences. Authentication actions already use its small size.
Enabled buttons use a pointer cursor through the shared Button primitive.

Open `/pl/test` or `/en/test` to preview all 46 exports from `@/ui/basic`,
including form controls, tables, tooltips, progress indicators and native Dialog.
The gallery also demonstrates the composed Popup in default, wide and locked
states. Changes to its example form and controls stay in browser memory;
submitting the form does not call an API. Edit examples in
`src/app/[locale]/test/components-gallery.tsx` and labels in each locale's
`messages/<locale>/test.json`.

The gallery also includes Blur, editable CornerBadge examples and a safe
UserPanelV2 preview. Use the [UI component recipe](0306-ui-components.md) for
props, style slots, animation stages and the boundary between preview and real
session behavior.

Import `Popup` from `@/ui/components` and mount it conditionally while open.
Its TrueGuard-compatible API accepts `title`, `content`, `actions` or custom
`children`, `size="default" | "wide"`, and close controls including `disableClose`.
It provides a native modal focus boundary, scroll locking and focus restoration;
the login-unavailable message and logout confirmation use this component.
Popup layout classes live in `src/ui/components/styles.ts` under `popupStyles`.
Its frame and close button reuse `radius.control` from `src/ui/basic/styles.ts`,
so their corner radius matches ordinary buttons. Adjust that shared token to
change the common radius; keep popup-specific appearance in `popupStyles`.

Icons come from `react-bootstrap-icons`, matching the current user selection.
Hide decorative icons from assistive technology and give icon-only actions an
accessible label. Existing preferences/selectors live in `@/ui/components` and
must remain inside the providers already mounted by the locale layout.

Use `src/app/globals.css` for design tokens and shared light/dark/high-contrast
styles. Check text, controls, keyboard focus and mobile width in both languages.
Theme preference cookies are UI state, not authorization.
Theme and contrast selectors stay disabled until hydration, compute rapid toggles
from the current preference, and synchronize the navbar/footer on focus and reload.
With a configured parent domain, both providers remove earlier host-only cookies
before persisting the shared preference. Otherwise two cookies with the same name
can make the displayed colors disagree with the button state. This migration is
automatic and touches only the configured UI preference cookie, not auth cookies.

## 6. Verify a change

Stop the dev process before the release build: dev and build share `.next`.
The checks below do not establish QA/PROD or complete browser acceptance.

```powershell
pnpm check
pnpm build
```

`check` runs package/Web types, lint and the configured tooling/database/Web tests.
Use the command output for current test counts and coverage.
`pnpm test:auth:integration` additionally exercises a
signed OIDC fixture and disposable PostgreSQL database.
Use `pnpm test:web` for a focused Web run or `pnpm test:ui` for basic components.
`pnpm test:products:integration` checks product schema, precise amounts, references
and locking on a disposable database. Browser creation/query evidence and its
limits are recorded in the [product recipe](0309-admin-products.md).

For manual browser acceptance, check `/pl`, `/en`, locale switching, theme and
contrast persistence, keyboard focus, mobile navigation and translated text fit.
Use the [Web smoke procedure](0401-local-operations.md#verify-web) for HTTP checks.
Stop the dev process before testing `pnpm build` / `pnpm start` on the same port.

## 7. Work that needs another implementation slice

`better-auth` is installed; do not copy the sibling's paused auth/Valkey adapter.
The [server-side login flow](0304-keycloak-login.md) now implements the initial
Keycloak/Better Auth integration using the
[Prisma package and CLI migration workflow](0303-prisma-database.md). The four
identity/session models use local `uuid`/UUIDv7 keys and Keycloak references;
root `db:*` commands are implemented. Database operations must not target Keycloak
or queue internals through application Prisma migrations.

The [file catalog/upload flow](0307-admin-files.md) now handles document metadata,
status actions, reference-safe permanent deletion and SeaweedFS writes.
The [product flow](0309-admin-products.md) supports an exact price/currency and
optional image; `/admin/products/create` opens its side panel. Shared
[administration tables](0306-ui-components.md#administration-tables) render before
data and update queries without full-document navigation. Product editing,
stored-image delivery, durable queue consumption, pending archival/
deletion processing and the QA Web Dockerfile remain additional implementation
slices. No API/worker service should be added
solely to match the old directory placeholders. Update the relevant contract,
recipe and acceptance evidence when those features become real.

[Back to cookbook](0300-cookbook.md) | [Coding conventions](0308-code-conventions.md) | [Runbooks](0400-runbooks.md)
