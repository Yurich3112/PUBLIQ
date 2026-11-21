---
brief: Component gallery, shared motion/styles, asynchronous admin tables, Popup, asides, notifications and session UI.
tags: [cookbook, ui, components, accessibility, sessions]
---

# UI components and gallery

## Preview and ownership

Open `https://modulon.local/pl/test` or `/en/test` while Web is running. The
route entry is `apps/web/src/app/[locale]/test/page.tsx`; interactive examples
live in `components-gallery.tsx` beside it. Each locale has a `messages/<locale>/test.json`
catalog registered in `src/i18n/catalogs.ts`.

The gallery demonstrates the basic exports, including VerticalDivider, forms, native Dialog,
tables, tooltips and progress indicators, plus composed Popup, Blur, CornerBadge
and UserPanelV2, plus an isolated notification-center preview. Forms and example controls change local browser state only.
UserPanel preview disables account navigation and logout confirmation submission;
it does not poll or mutate real sessions. It is not evidence of authenticated API
access. No navbar link is required to visit the gallery.

| Location under `apps/web/src` | Edit here |
| --- | --- |
| `ui/basic/styles.ts` | Primitive geometry, button sizes/tones, radius and shared `buttonMotion` |
| `ui/components/styles.ts` | Popup/aside/session slots, table/search styles, `tableMotion`, paginator options and product form |
| `app/globals.css` | Theme/contrast design tokens |
| `ui/components/user-panel.tsx` | Shared V1/V2 identity presentation and account/logout controls |
| `ui/components/use-session-lifecycle.ts` | Polling, countdown, renewal and hard navigation |
| `ui/components/session-details.tsx` / `session-warning.tsx` | Session/role rows and warning Popup |
| `ui/components/session-logout-progress.tsx` | Blocking automatic-logout progress Popup; style slots in `sessionLogoutStyles` |

Import primitives from `@/ui/basic` and composed controls from `@/ui/components`.
Caller classes override conflicting defaults through `cx`/`tailwind-merge`.
Keep complete Tailwind classes in source and translate visible labels in PL/EN.
Prefer shared slots/tokens for defaults rather than copying classes into consumers.

## Administration tables

Users, Files and Products share their query/loading/navigation mechanics. After
server-side page authorization, the shell renders without awaiting directory,
database or storage listing. The first authorized Server Action starts after
hydration. This is client-triggered data loading, not a claim that the initial
HTML contains loaded rows.

| Component | Contract |
| --- | --- |
| `TableQuery` / `useTableQuery` | Intercept marked GET query forms and same-table links; update native history and parse current search params |
| `useTableRefresh` | Fetch the current validated query, retain a prior page on temporary failure, clear it on denial and reject superseded responses |
| `TableLoadingBody` | Full-width body throbber, approximately four rows high |
| `TableDataRegion` | Observe table size and animate height changes without replacing the page shell |
| `TablePaginator` | First/previous/next/last, page links/jump input, tooltips, size choice and separate result/page counters |
| `TableSearch` | Native GET search with symmetric width/opacity/visibility transitions and focus restoration |
| `TableFilters` | Local draft until Apply, applied-count marker and independent selected-state styling |
| `TablePageSize` | Native details menu; submission keeps the current query and resets page scope |

`data-table-query` marks query forms. Modified clicks, external links, downloads
and creation/mutation forms keep their own behavior. Native Back/Forward restores
query state. Each read action accepts and validates the new query and rechecks
access; intercepting the UI is not authorization. Search/filtering covers the
server dataset before pagination. Files metadata filters cover the catalog;
Users/Files sorting remains page-local, whereas Products orders in SQL.

Toolbar order is extra actions → divider → filters → divider → refresh at the
right edge. Non-filter buttons share the neutral outline/default-hover surface.
Filter state owns its fill. `actionColumn` on basic TableHeader/TableCell provides
the visible left border and right alignment for action columns.

Pending reads hide/inert the old body while preserving its component state.
`tableMotion` sets the height/fade duration to 100 ms in `components/styles.ts`;
`tableStyles.loadingBody` sets the loader height to `min-h-36`. The loader centers
within the visible horizontal viewport. Reduced motion disables transitions.
Do not introduce arbitrary network waits to obtain the visual transition.

Paginator totals come from the whole query. Unavailable data uses dashes instead
of invented zero totals and disables navigation. Products keep the table and
paginator for empty/error states: No data for an empty list, a red full-width
ERROR row and owner-bound notification for a failed read. Failed refresh can
retain earlier rows with feedback. See [products](0309-admin-products.md) and
[files](0307-admin-files.md) for their specific query/storage boundaries.

`buttonMotion` in `basic/styles.ts` holds complete duration/easing/reduced-motion
tokens, currently 200 ms/ease-out. It controls primitive hover color transitions
and the expanding/collapsing search field. `tableSearchOptions` holds the 320px
expanded/28px collapsed widths. Session/action tones are shared semantic tokens,
not fixed white-on-fill colors.

## Popup

Mount Popup conditionally while open, inside the existing locale providers.
The following fragment assumes translated labels, `open`, `pending` and `close`
are supplied by its owning Client Component:

```tsx
{open && <Popup
  title={t("title")}
  disableClose={pending}
  onClose={close}
  content={<p>{t("message")}</p>}
  actions={<Button size="sm" disabled={pending} onClick={close}>{t("close")}</Button>}
/>}
```

The TrueGuard-compatible API supports `title`, `content`, `actions`, custom
`children`, default/wide size, an accessible label and separate close controls.
Optional `actionsClassName` merges into the inner action grid through `cx`.
Use it for a flow-specific responsive layout while reusing the shared frame,
header, content and footer.
Popup uses a native modal Dialog in a body portal, focus restoration and scroll
locking. `disableClose` prevents Escape, backdrop and X dismissal while an operation
is pending. Hiding X with `showCloseButton=false` alone does not disable the other
dismissal methods.

Geometry is centralized in `popupStyles`:

- Frame and X reuse the Button `radius.control` token (`rounded-md`).
- Header uses `pl-5 pr-1 py-1`; the right-aligned 32px X is `danger-outline`.
- Footer uses `px-5 py-1`. Action buttons are 32px high, with equal 150px columns
  on larger screens and equal flexible columns on small screens. Forms wrapping
  submit buttons participate in the same grid.
- Content scrolls within viewport bounds; default/wide sizes do not remove those bounds.

Login-unavailable, logout confirmation and session-warning flows share this component.

## Blur

`<Blur><Dialog ... /></Blur>` applies the shared blur/dimming classes to a native
Dialog or popover backdrop without adding a DOM wrapper. It preserves the child's
props/ref and merges its classes. This child mode requires a native backdrop;
wrapping an ordinary element does not create a backdrop for it.

An empty Blur renders a decorative, non-interactive absolute surface. Place it
inside a positioned container and put foreground content above it:

```tsx
<div className="relative isolate overflow-hidden rounded-md">
  <p>{t("background")}</p>
  <Blur />
  <div className="relative z-10">{t("foreground")}</div>
</div>
```

Blur is visual presentation. Modal focus boundaries and dismissal belong to the
owning Dialog/Popup or popover component.

## CornerBadge

CornerBadge follows the TrueGuard corner-marker pattern without replacing the
existing inline basic Badge. It can wrap a control or render a marker within an
already positioned container:

```tsx
<CornerBadge placement="top-right" color="red" value={7}
  aria-label={t("unread", { count: 7 })}>
  <Button size="sm">{t("notifications")}</Button>
</CornerBadge>
```

| Prop | Behavior |
| --- | --- |
| `placement` | `top-right` default, `top-left`, `bottom-right`, `bottom-left` |
| `value` | Missing/null/empty string: dot; `0`: visible count; multiple characters: pill |
| `color` | `green` default, `red`, `blue`, `amber`, `neutral` |
| `className` | Marker override |
| `wrapperClassName` | Optional wrapper override |

The marker ignores pointer events so it does not block its button. Give a status
dot a localized accessible description. Leave room around corner markers: the
gallery includes four positions with dot/zero/count/text and an editable example.

## UserPanelV2 and session presentation

`AuthButton` builds the authenticated lifecycle DTO on the server and selects
UserPanelV2. Real UserPanel mode requires that DTO; preview mode accepts the
fictional example without enabling server mutations. V1 remains available and
shares identity/account/logout logic.

The final animation has two stages:

1. Over 200ms, the identity row expands from the 150px trigger toward 350px,
   anchored to its right edge where space permits. Avatar grows from 16px to
   48px while name/email move into place and the chevron reverses.
2. The details/actions unfold downward over 200ms. Closing first folds those
   details, then shrinks the identity row. Background blur transitions over 400ms
   from the beginning. Reduced-motion skips transitions.

The popover clamps to the viewport, scrolls when necessary and minimizes on
background click, header click or Escape. An open modal takes precedence over its
Escape listener. The trigger remains disabled until hydration.

SessionDetails, SessionWarning and the warning-only top-right countdown badge
consume one lifecycle hook. The hook verifies every 10 seconds while visible,
counts down each second and never renews through polling. Role absence/unavailability
are explicit states; role chips are not an authorization boundary. Expiry performs
automatic hard navigation in real mode.
Before its automatic logout request, SessionLogoutProgress paints a headerless,
buttonless Popup with a localized Throbber label and Blur. It cannot be skipped;
the existing hard-logout result determines navigation. A server-confirmed renewed
lease resolves the progress state by rechecking the session.

### Session warning actions

The expiring-session Popup has three equal-width actions in desktop order.

| Position | PL / EN label | Tone | Callback |
| --- | --- | --- | --- |
| Left | Wyloguj teraz / Sign out now | `danger-outline`, red fill on hover | `hardSignOut()` |
| Middle | Rozumiem / Understood | `main-outline`, neutral fill on hover | `dismiss()` |
| Right | Przedłuż sesję / Extend session | `warning-outline`, yellow fill on hover | `renew()` |

The footer uses full-width columns on desktop and stacks the buttons in the same
order on narrow screens. The renewal button stays visible and disabled when the
renewal cap is reached or the expired preview cannot renew.

`pending || logoutPending` disables all three actions and popup dismissal.
The operation's button shows a localized throbber and busy state. Failed manual
logout displays a retryable error. Acknowledgement dismisses the current warning;
a later expiry value can produce another warning.

If the session expires during manual logout, the warning remains mounted and
blocked through the pending request. The lifecycle effect waits for that request
to settle. A failed manual request with an expired session hands off to automatic
logout and its blocking progress Popup. The in-flight guard prevents overlapping
logout requests.

Isolated Edge checks exercised PL/EN, 320px and desktop layout, button order,
semantic colors, equal widths, acknowledgement, renewal, limit handling, pending
guards and retry feedback. A separate check used the real lifecycle hook with
simulated API responses to verify expiry during manual logout and the automatic
handoff. Those checks establish the tested UI/hook behavior.

See the
[session contract](0304-keycloak-login.md#session-lifecycle-and-role-display) and
[operating procedure](0402-session-operations.md).

## Notification center

The authenticated navbar displays NotificationCenter before UserPanel. AuthButton
mounts it only after server session/profile verification. Anonymous visitors have
no navbar bell. An empty list uses Bell; any active entry uses BellFill and a
CornerBadge pill, capped visually at `99+` with the full count in its accessible
label. Badge severity follows error, warning, success, info. All colors use shared
semantic tokens, including high contrast. New entries trigger a bounded three-second
pulse; progress updates do not restart it, and reduced motion disables animation.

The center uses the shared full-height right-hand `OverlayAside`, with a count,
per-severity summary, empty state, individual dismissal and bulk clear. It shares
its header/footer and resize behavior with the push aside. The overlay blurs the
surrounding shell and blocks interaction behind it. X, Escape and backdrop clicks
close the panel while its notifications remain available. Localized tooltips
inside the panel use `topLayer` mode. Panel geometry follows the main navbar row
and shell footer measurements. See [aside behavior](#aside-panels).

NotificationProvider owns in-memory state shared by application clients. Producers
use `useNotifications()` only within this provider and while its verified owner
is bound:

```tsx
const { pushNotification, removeNotification } = useNotifications();

pushNotification({
  id: "report-export",
  mode: "info",
  title: t("exportTitle"),
  message: t("exportRunning"),
  dismissible: false,
});

// Upsert the same operation ID when it finishes.
pushNotification({
  id: "report-export",
  mode: "success",
  message: t("exportComplete"),
  autoCloseMs: 5000,
});

// Operation owner may remove an obsolete protected entry explicitly.
removeNotification("report-export");
```

Input supports `mode`, optional `id`/`title`, ReactNode `message`, `persistent`,
`dismissible`, `autoCloseMs`, `brief`, `pending` and optional asynchronous `onDismiss`. Default expiry
is five seconds. Hover and keyboard focus pause countdowns independently; both
must leave before resuming. Expiry also runs while the panel is closed. Persistent
entries remain until dismissal; `dismissible: false` additionally prevents both
individual and bulk dismissal until their producer updates/removes them. Closing
the panel does not cancel an operation. The message can contain operation-specific
controls; cancellation remains the producer's responsibility.

IDs update entries rather than duplicate them. State is cleared when owner changes
or unmounts; retained callbacks from an older account cannot mutate a new owner's
list. Nothing is stored in localStorage, cookies or the database. This ports the
reference's UI center, not a server notification feed or persistent inbox.

`NotificationStrip` shares the breadcrumbs row. Its right-aligned message uses
a severity gradient fading toward the left. A brief success fades after its
timeout and stays outside the bell count. Retained important notifications can
collapse into a blob and travel toward the bell before remaining in its center.
Reduced motion skips those transitions.

For page-level operation progress, keep the announcement pending until its result
is known. The following fragment assumes translated labels and an owning mutation
that supplies the completion event.

```tsx
const { pushNotification } = useNotifications();
const operationId = pushNotification({
  mode: "info", message: t("saving"), brief: true, pending: true,
});

// After the mutation succeeds, replace progress under the same ID.
pushNotification({
  id: operationId, mode: "success", message: t("saved"), brief: true,
});
```

The pending strip renders a throbber and stays visible past the normal timeout.
Failure replaces it with the existing error notification behavior. Completion in
a hidden tab clears its pending state. Owner changes discard the operation UI.
File-status actions use this mechanism for saving feedback.

The `/pl/test` and `/en/test` preview uses a separate provider with severity,
brief, timed and protected examples. Store tests cover ownership, upserts,
expiry/pause, protected clearing, bounded pulses and pending/result replacement.
Isolated Edge checks exercised long-running save progress, success expiry and
failure handling using simulated actions. Earlier authenticated checks verified
bell visibility and removal after hard logout. Full authenticated acceptance of
every current interaction remains a separate check.

## Aside panels

`AsideProvider` owns shell reservations and `AsideContent` wraps the affected
page content. Mount `OverlayAside` or `PushAside` from `ui/components/aside.tsx`
inside those providers and supply `open`, `onClose`, `title` and its content.

| Variant | Behavior |
| --- | --- |
| `OverlayAside` | Covers the page from the right and blurs/blocks the shell behind it |
| `PushAside` | Reserves space beside the page and keeps the remaining workspace usable |

Both span the viewport height. Their header follows the main navbar row height,
and their footer follows the shell footer height. The content has its own scroll
area. The left resize separator includes a centered three-dot grip and resize
cursor. Pointer dragging and ArrowLeft/ArrowRight, Shift, Home and End adjust the
bounded width. Default bounds are 280–720px with a desired width of 360px.
Push mode preserves a workspace beside it. Below 768px both variants use a
full-width overlay. Desired width lives in component state and resets when the
owning component unmounts.

Use the overlay for the notification center and the push variant for table Info
details and product creation. Supply a trigger ref for focus restoration and use
localized labels for closing/resizing. `disableClose` blocks X, Escape, backdrop
and default-footer dismissal during a pending save. Product creation is addressed
by its localized `/admin/products/create` URL. Panel closing and operation
cancellation have separate owners.

## Navigation and footer

The shell owns primary/secondary navigation, localized breadcrumbs and the status
strip. Admin navigation uses server-verified access. Column actions and short-lived
operation feedback belong to the owning page and shared notification provider.

The footer takes company text from `APP_COMPANY_NAME`, defaulting to `BOSIT`, and
displays copyright/build year through `config/version.ts`. Display versions use
`major.minor.patch+YYYYMMDD` when build-date metadata is available. Build metadata
provides stable values for prerendering. The date suffix omits time-of-day.

## Semantic colors

`globals.css` defines `standard`, `accent`, `primary`, `success`, `warning` and
`error` colors with matching foreground, hover and active tokens. Standard retains
the existing neutral appearance; the other palettes use independently tuned,
Bootstrap-inspired hues. `danger` remains an alias of error for existing callers.
Use matched pairs such as `bg-success text-success-foreground`; avoid fixed white
text because dark themes use light fills with dark foregrounds.

Button tones, Badge and CornerBadge share these tokens. `/pl/test` and `/en/test`
include swatches and actual controls. Light, dark and system preferences all have
normal and high-contrast palettes. Browser checks measured text-on-fill contrast
for surfaces and button normal/hover/active states: minimum 6.25:1 normally and
8.15:1 in high contrast across the checked combinations. This is focused palette
evidence, not a complete accessibility audit.

Missing profile images use the Person icon in the trigger and expanded identity
row. Image load errors switch to the same fallback without changing session state.

## Focused verification

Run `pnpm test:ui` for primitive behavior and `pnpm test:web` for Web/config/auth
regressions. Then inspect `/pl/test` and `/en/test` at 320px, 390px and desktop,
including light/dark, high contrast, reduced motion, keyboard focus and dismissal.
Use a separate authenticated pass for actual account/session behavior; preview
mode deliberately cannot prove it.

[Back to cookbook](0300-cookbook.md) | [Web development](0301-web-development.md)
