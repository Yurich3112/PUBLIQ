---
brief: Configure and verify session countdown, renewal limits, role display and hard Keycloak logout in DEV.
tags: [runbook, authentication, sessions, keycloak, troubleshooting]
---

# Session operation and troubleshooting

This procedure covers the implemented DEV application session. QA/PROD still
require their own delivery configuration and acceptance. See the
[login cookbook](0304-keycloak-login.md) for implementation and endpoint contracts.
Run commands from the repository root. Keep real env files, cookies and provider
responses out of commits, screenshots and support reports.

## Apply session policy

Set the following names in ignored `apps/web/.env`; the safe template is
`apps/web/.env.example`:

```dotenv
SESSION_TTL=900
SESSION_WARNING=120
SESSION_AUTO_REFRESH=false
SESSION_MAX_REFRESHES=3
```

TTL/warning are seconds; warning must be smaller than TTL. The renewal cap covers
manual and navigation extensions across all tabs. Zero disables renewal. True
enables renewal on localized non-home navigation; use a short TTL such as 900
seconds (15 minutes). False leaves navigation read-only. Home, initial load,
reload and background verification do not renew in either mode.

```powershell
pnpm validate:dev
pnpm db:status
```

If this checkout has unapplied application migrations, confirm the DEV target,
then apply the committed migrations with `pnpm db:deploy`. Do not hand-edit SQL,
reset the database or migrate Keycloak/queue databases. The additive
`20261108225820_session_renewal_counter` migration supplies the shared counter;
see the [database recipe](0303-prisma-database.md#session-renewal-counter).

Restart Web through `pnpm dev` after changing policy. Do not start a second listener
on the same port or build into the active dev `.next`. TTL changes apply to new
sessions and successful extensions, not retroactively to existing expiry dates.
The env validator checks keys/syntax; auth Zod validation checks policy ranges and
the strict `true`/`false` value when auth configuration is loaded.

For changed Keycloak client settings, `pnpm stack:auth:sync` reconciles owned DEV
configuration while preserving existing users and secrets. The Web client's two
exact post-logout return URLs must match its canonical origin plus `/pl` and `/en`.
Do not use realm reset or secret rotation to repair a redirect mismatch.

## Verify behavior

Use the canonical HTTPS application origin with a disposable/approved test account.
Do not use production identities for automated mutation checks.

1. Sign in and open UserPanelV2. Confirm name/email, role state, second-by-second
   countdown and used/maximum renewal count. Role chips must reflect the account,
   not a seeded local assignment.
2. While visible, inspect the network method/path: `GET /api/v1/auth/session-status`
   occurs every 10 seconds and on focus. Its expiry must not advance from these
   reads. Avoid copying cookies, complete request dumps or provider query strings.
3. With automatic renewal false, change pages: no navigation extension should occur.
   With true, navigate to a different localized non-home route and check for
   `POST /api/v1/auth/renew-session`. Home/reload do not count. Near-full-TTL requests
   within the 10-second coalescing window do not consume another renewal.
4. Below the warning threshold, confirm the dropdown's top-right time badge and
   warning Popup. Verify the three actions in order, Sign out now in red,
   Understood in the standard style and Extend session in yellow. All use outline
   styles at rest and fill with contrasting icons on hover, using shared 200 ms
   motion and reduced-motion support. Check equal
   desktop columns and a vertical stack at 320px in PL/EN. Understood dismisses
   the current warning. Renewal advances expiry and increments the count, then
   clears the warning/badge. At the cap, Extend session stays visible and disabled.
   During renewal/logout, all actions and Escape/backdrop dismissal are blocked.
   The active operation shows its throbber. A later expiry can open a new warning.
5. At zero or an authoritative 401, confirm a signing-out Popup appears first,
   with Throbber and blurred background, no header/buttons, and no Escape/backdrop
   dismissal. It stays until automatic full-document logout navigation; no click
   is required. Transient 503 alone must not force logout. An
   older tab must not terminate a newer identity or a server-renewed lease.
6. Sign in again, choose Sign out and confirm. Local session/cookies are revoked,
   Keycloak logout returns to the correct locale, and another Sign in should show
   the credentials form rather than silently reuse the ended SSO session.
7. In an isolated browser/API fixture, hold the warning's manual logout response
   pending and let the session expire. Confirm the warning remains blocked and
   only one logout request is in flight. Return a manual failure and check that
   automatic expiry logout takes over with the blocking progress Popup. For a
   failure while the session remains active, verify retry feedback and re-enabled
   controls. Use simulated responses for these deterministic failure checks.

Repeat relevant UI checks in PL/EN, mobile width and reduced motion. The
`/pl/test`/`/en/test` UserPanel is a safe presentation preview and cannot validate
actual sign-out, renewal or directory permissions.

## Diagnose a failure

| Symptom | Inspect | Expected boundary |
| --- | --- | --- |
| Role list says no role | Exact Keycloak effective realm names and the nine-code application allowlist | No implicit USER/GUEST grant |
| ADMIN seems missing | Managed hierarchy `ROOT -> SADMIN -> ADMIN -> USER -> LOGED`, effective realm mappings and bootstrap status | Bootstrap renames legacy ADMINISTRATOR in place; if both names exist, resolve assignments explicitly before retrying |
| Roles unavailable | Read-only directory credential/permissions and provider reachability | Null/unavailable is distinct from an empty assignment |
| Countdown differs across tabs | Refocus and inspect status expiry/public UUIDs | Client clock is presentation; DB expiry and atomic count decide |
| Renewal returns 403 | Warning window, cap, automatic-mode flag, pathname and exact Origin | Polls/home cannot renew; exhausted cap needs another sign-in |
| Session status returns 401 | Expiry, revoked session or disabled identity | Automatic logout; no expired-session renewal |
| Status returns 503/network failure | Web/DB/directory availability and policy validation | Error alone is not proof of logout |
| Manual logout fails before navigation | POST status and confirmation error, without dumping the response URL | Retry remains available; do not claim revocation succeeded |
| Session expires during pending manual logout | Warning busy state, logoutPending and request sequence | Keep the warning blocked through the request; after failure, expired-session logout takes over automatically |
| Keycloak rejects logout return | Managed client `post.logout.redirect.uris`, canonical app origin, selected locale | Exact `/pl` and `/en` URLs; never accept a browser-provided arbitrary redirect |
| Logout returns directly home | Both signed session cookie and valid logout-only context may be absent | Context has a 300-second post-expiry grace; never derive provider identity from a UUID alone |
| Verification flashes after login | Request cancellation versus actual service failure | Initial check runs immediately; effect cleanup/older responses must not show an error |
| Avatar missing or fails to load | Image URL/loading separately from session status | Person icon replaces absent/broken images; no invented profile data |
| Admin stays open after a role change | Effective roles on the next visible 10-second/focus/navigation check | Losing all ROOT/SADMIN/ADMIN roles replaces the document with access-denied; normal session remains valid |
| Cookie cleared but another device stays signed in | Application/provider/global logout are separate scopes | This flow does not revoke every device or implement back-channel logout |
| Login start intermittently returns 502 | Web listener/readiness and proxy request ID/status using safe logs | Observed during Server Action starts; root cause not established |

For 502, start with [local operations](0401-local-operations.md) and confirm the
actual Web process and health endpoint. Do not disable TLS checks, reset users or
assume every 502 is a bad credential. Record only safe host/path/status/request ID,
never full callback/logout URLs. Nginx already omits query strings from safe access
logs; retain that property when investigating.

## Reproduce checks and understand the evidence

```powershell
pnpm check
pnpm test:auth:integration
```

The integration command uses a disposable local PostgreSQL database and signed OIDC
fixture, then removes both. It verifies read-only checks, missing/unavailable roles,
concurrent renewals, shared cap, signed cookie expiry, home exclusion, CSRF, expired
session rejection and hard-logout identity/lease protection. It requires the local
DEV PostgreSQL container and its matching configuration.

The products/access/table implementation checks passed 107 Web tests, 18 script
tests, types/lint and focused database/auth integrations. Its isolated browser
checks verified denial of the next protected data action after ADMIN-to-USER
demotion. Admin access requires level 80; the managed hierarchy is
ROOT=100, SADMIN=90, ADMIN=80, USER=50, LOGED=0. Existing lifecycle polling updates
navigation independently of these server action checks. See
[product verification](0309-admin-products.md#verification-and-limits).
A separate live Keycloak disposable-user
check verified UI hard logout, DB revocation, localized return and a credentials
prompt on the next sign-in; its account/browser fixtures were removed. That live
check started OIDC via the API after intermittent Server Action/proxy 502s during
initial attempts. It does not prove every login-start path, QA/PROD or recovery.
Documentation validation is separate from those implementation results.

Additional verification removed the normal session cookie and row after actual
provider ID-token expiry, then reloaded: the logout-only context still completed
Keycloak logout and the next sign-in required credentials. Its disposable account
and local identity references were removed. The context cookie contains an opaque
signed handle, not a JWT; its encrypted record uses the existing Verification
model and cannot grant access or renew a session. Host/domain auth-cookie variants,
chunks and both legacy API paths were checked separately; preference cookies stayed.

[Back to runbooks](0400-runbooks.md) | [Session contract](0304-keycloak-login.md)
