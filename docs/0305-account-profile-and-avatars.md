---
brief: Keycloak personal information and security console with a dedicated private SeaweedFS avatar bucket.
tags: [cookbook, keycloak, profile, avatars, s3, security]
---

# Account profile and avatars

The navbar's **My account** action opens the native Keycloak Account Console.
The custom theme navigation exposes **Personal information** and **Account security**
(signing in and device activity). Applications, linked accounts, groups and resources
are omitted from the navigation; this does not remove OIDC clients or change API
permissions. Native password changes, optional authenticator-app setup, active
sessions and session revocation remain owned by Keycloak. No MFA enrollment is forced.

## Personal information

Email is required. First name, last name, middle name, phone number, preferred
language and picture are optional. Phone numbers use an international format,
such as `+48123456789`; this is profile data, not SMS authentication or a verified
recovery factor. PL/EN labels are included. The registration template still renders
only email, password and password confirmation (plus hidden locale/security fields).
SMTP delivery/email verification and passkey enrollment have not been configured
or accepted in this change. The security pass verified native password and
authenticator-app controls, not enrollment of a human user's second factor.

Keycloak owns all profile fields. Application PostgreSQL stores only the existing
identity references and authentication state; no profile columns or image blobs
were introduced. Prisma migrations were not needed.

## Avatar storage boundary

| Setting | DEV | QA |
| --- | --- | --- |
| General application bucket | Existing `S3_BUCKET` | Existing mode-specific `S3_BUCKET` |
| Avatar bucket | `modulon-keycloak` | `modulonqa-keycloak` |
| Credential prefix | `S3_AVATAR_*` | Separate `S3_AVATAR_*` values |

SeaweedFS bootstrap creates both buckets idempotently. The avatar identity has
Read/Write permissions only on the avatar bucket. General application credentials
are not granted access to this bucket. The operator identity retains bootstrap
permissions. Buckets are private and anonymous S3 reads/listing remain denied.
All objects stay in the existing SeaweedFS volume; no additional container is needed.

The server-only Web configuration is documented in `apps/web/.env.example`:
`S3_AVATAR_ENDPOINT`, `S3_AVATAR_REGION`, `S3_AVATAR_BUCKET`,
`S3_AVATAR_ACCESS_KEY` and `S3_AVATAR_SECRET_KEY`. Only dedicated avatar credentials
reach Web. DEV uses the host listener; a future QA Web container must use private
service DNS. Real credentials remain in ignored env files. QA Web delivery is
still incomplete; a validated Compose model does not establish QA acceptance.

## Upload and save

1. In Keycloak Personal information, choose **Upload picture**.
2. The theme sends the file to Web's `POST /api/v1/profile/avatar`, with the
   application's HttpOnly session cookie. If that session expired, sign in to
   Modulon again. No administrator credential or provider token enters browser code.
3. Web accepts only its own origin and the configured Keycloak public origin,
   verifies the session and derives the object owner from its verified Keycloak
   UUID. A request cannot choose another user's UUID, bucket or object path.
4. PNG, JPEG and WebP inputs are limited to 2 MiB and 16 million pixels. SVG,
   animation and corrupt images are rejected. Sharp re-encodes to a 256×256 WebP,
   strips metadata and applies EXIF orientation. The process allows six attempts
   per minute per identity; this limiter is local to one Web process.
5. The uploaded object's URL is inserted into the native `picture` form field.
   **Save** uses Keycloak's existing self-service form and permissions. The read-only
   directory service account receives no write or realm-management privileges.
   **Remove picture** clears the field; Save commits that change.

Keycloak stores only `picture`, a URL constrained to this application's avatar
endpoint. Next.js also validates that origin/path before displaying a profile image.
The file bytes are stored in S3, never in either application or Keycloak DB.
The navbar and user panel hydrate the picture and names from Keycloak on demand.

`GET /api/v1/avatars/{opaque-owner}/{content-hash}.webp` serves only validated image
paths from this bucket. The owner prefix is an HMAC, not an exposed user UUID.
These avatar URLs are readable by anyone who knows the URL; they must not be used
for private documents. The bucket itself is not public. Responses have a fixed
WebP content type, `nosniff`, a restrictive content policy and one-hour caching.

Uploading does not save the profile automatically. Cancelled/replaced uploads can
leave unreferenced objects in this small PoC bucket. Automated garbage collection,
per-user storage quotas and image moderation are not implemented. Do not apply a
blanket expiry lifecycle to this bucket: it could delete currently referenced images.
Deleting a Keycloak user does not automatically remove S3 objects.

## Operation and verification

```powershell
pnpm stack:up
pnpm dev
pnpm test:web
pnpm test:infra
```

Web tests cover origin/session enforcement, identity-bound object ownership,
format/size limits, normalization, path validation and rate limiting. A live isolated
Edge pass used a disposable Keycloak identity to test actual Better Auth login,
native profile Save, middle name/phone, avatar upload and preview, anonymous S3
denial, PL/EN controls, security/device navigation, mobile layout and the avatar/name
in the real application navbar. The fixture identity, application rows, image and
browser profile were removed; existing human users were not modified.
The workspace check passed 49 tests plus types/lint; the isolated fresh-volume
four-container bootstrap/restart test and QA env validation also passed.
`pnpm audit --prod` reported no known vulnerabilities in the installed production
Node dependency graph. This does not assess operating-system packages or images.

For upload failures, verify Web is running and its session is current, inspect the
generic response status (401, 413, 415, 429 or 503), and check dedicated S3 env
values without logging credentials. Avatar uploads use only local SeaweedFS; the
SDK receives explicit endpoint/credentials and does not use an ambient AWS profile.
Back up the SeaweedFS data volume along with Keycloak DB to preserve picture links.

[Back to cookbook](0300-cookbook.md) | [Keycloak login](0304-keycloak-login.md)
