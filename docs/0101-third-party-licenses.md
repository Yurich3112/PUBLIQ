---
brief: License register for the minimal Modulon PoC stack and deployment tools.
tags: [licensing, dependencies, containers, distribution]
---

# Third-party license register

## Scope and status

This register covers the named components selected or proposed for the reusable
application core. License-source links retain the earlier planning register;
they are not a fresh audit of every dependency. PostgreSQL 18.6 and Prisma 7.10.1
are fixed planning requirements. Other versions, image digests and dependency
Web versions are now pinned in `apps/web/package.json` and the root workspace lockfile;
infrastructure digests and the remaining stack versions are unselected.

This is a planning register, not an exhaustive dependency inventory, SBOM,
third-party notices bundle or approval of a complete distributable product.
Upstream branch links below identify license sources, not recommended release
versions. Recheck the actual packages and images selected for release.

The intended environments are:

- **DEV:** Next.js UI/backend runs on the host; dependencies run in Docker.
- **QA:** the complete minimal stack runs in local Docker with release builds.
- **PROD:** Compose runs on AWS Lightsail, provisioned with Terraform.

The selected backend is part of Next.js. Better Auth stores application sessions
in PostgreSQL. `packages/database` uses Prisma 7.10.1 for `app_db` only; Keycloak
and the separate queue database manage their schemas independently. pg-boss owns
the queue schema; a host Node.js process consumes jobs. NestJS, Express, Worker/Pyworker containers,
Valkey, BullMQ, ML libraries and ECharts are not baseline dependencies. The host
Python executor now has an independent hash-locked FastAPI/Uvicorn environment.

The local stack now contains only PostgreSQL, Keycloak, Nginx and SeaweedFS.
Legacy cache/admin UI service files were removed. Copied Keycloak theme LICENSE
and NOTICE files remain with the assets.

Owner-controlled repository materials are governed by the root
[proprietary LICENSE.md](../LICENSE.md). This register records third-party terms and
does not replace them or establish rights in Contributions that have not been
lawfully acquired. See [license guidance](0102-proprietary-license-guidance.md).

## Application libraries

| Component | Purpose | Project license | Status / scope |
| --- | --- | --- | --- |
| [Next.js](https://github.com/vercel/next.js/blob/canary/license.md) | UI, SSR and business backend | MIT | Selected |
| [React / React DOM](https://github.com/react/react/blob/main/LICENSE) | User interface | MIT | Selected |
| [React Compiler](https://github.com/facebook/react/tree/main/compiler/packages/babel-plugin-react-compiler) | Component optimization during the Web build | MIT | Installed `babel-plugin-react-compiler` 1.0.0 as a development dependency; installed package declares MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE) | Styling | MIT | Selected, does not include separately licensed commercial UI products |
| [Bootstrap Icons](https://github.com/twbs/icons/blob/main/LICENSE) | Icons | MIT | Selected, the full Bootstrap framework is not required |
| [React Bootstrap Icons](https://github.com/ismamz/react-bootstrap-icons/blob/master/LICENSE) | React Bootstrap icon components | MIT | Installed 1.11.6; replaces the earlier react-icons selection |
| [next-intl](https://github.com/amannn/next-intl/blob/main/LICENSE) | PL/EN routing and translations | MIT | Installed 4.14.9 |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge/blob/main/LICENSE.md) | Merge component Tailwind classes | MIT | Installed 3.7.0 |
| [Zod](https://github.com/colinhacks/zod/blob/main/LICENSE) | Public/runtime config validation | MIT | Installed 4.6.7 |
| [Better Auth](https://github.com/better-auth/better-auth/blob/main/LICENSE.md) | Next.js OIDC integration and PostgreSQL application sessions | MIT | Selected open-source library, hosted products and commercial services are separate |
| [Prisma ORM / Client / PostgreSQL adapter](https://github.com/prisma/prisma/blob/main/LICENSE) | Application schema/migrations in `packages/database` | Apache-2.0 | Installed package pin: 7.10.1; hosted Prisma services are separate |
| [node-postgres (`pg`)](https://github.com/brianc/node-postgres/blob/master/LICENSE) | PostgreSQL driver and connection pool | MIT | Prisma adapter dependency; also pinned directly at 8.23.1 in the queue package |
| [pg-boss](https://github.com/timgit/pg-boss/blob/master/LICENSE) | Durable PostgreSQL jobs, retries and worker supervision | MIT | Pinned at 12.38.2 in `packages/queue`; installed package declares MIT |
| [AWS SDK for JavaScript v3](https://github.com/aws/aws-sdk-js-v3/blob/main/LICENSE) | S3-compatible avatar storage | Apache-2.0 | Installed `@aws-sdk/client-s3` 3.1164.0; local package declares Apache-2.0; explicit local endpoint and credentials |
| [sharp](https://github.com/lovell/sharp/blob/main/LICENSE) | Avatar validation, metadata stripping and WebP normalization | Apache-2.0 | Installed directly at 0.35.5; local package declares Apache-2.0; bundled libvips/codecs retain their separate terms |

These rows cover the named libraries and identified core dependencies. They do
not enumerate every package that a future install will resolve. The i18n library
is next-intl; the installed package includes its MIT license. Fonts, theme assets and any future
runtime assets also need explicit selection and notices. Preserve the installed
queue packages' license files, including their transitive dependencies, in distributions.

## Python executor dependencies

The installed Python 3.14 environment's package metadata declares the following
licenses. Exact versions and wheel hashes live in `apps/pyworker/requirements.lock`;
this is a metadata inventory, not a distribution legal audit. Preserve the actual
package license/notice files when redistributing, including the selected Python
runtime's terms and bundled components.

| Packages (pinned version) | Declared license |
| --- | --- |
| FastAPI 0.162.6, annotated-doc 0.0.6, annotated-types 0.8.0, anyio 4.16.0, h11 0.16.0 | MIT |
| Pydantic 2.14.3, pydantic_core 2.50.4, typing-inspection 0.4.5, truststore 0.10.5 | MIT |
| Ruff 0.17.5 (development) | MIT |
| Uvicorn 0.54.0, Starlette 1.10.0, click 8.5.1, idna 3.20 | BSD-3-Clause |
| httpx2 2.16.0 (runtime bridge and test client), httpcore2 2.16.0 | BSD-3-Clause |
| psycopg 3.3.9, psycopg-binary 3.3.9, psycopg-pool 3.3.3 | LGPL-3.0-only |
| tzdata 2026.6 (Windows dependency) | Apache-2.0 |
| opentelemetry-api 1.45.2 | Apache-2.0 |
| typing_extensions 4.16.0 | PSF-2.0 |

No model weights, STT engine or ML runtime are included. Setup and dependency
ownership are described in the [Python worker recipe](0314-python-worker.md).

## Container inventory

The license column identifies the main software, not a single license covering
the entire image. Web, queue, Python, maintenance, Keycloak and SeaweedFS
Dockerfiles are implemented for local QA. A complete production distribution
inventory remains pending.

| Container / group | Main software | Main software license | Distribution boundary |
| --- | --- | --- | --- |
| `web` | Project code, Next.js UI/backend, Better Auth, Prisma, React and Node.js | Owner-controlled code: proprietary; Next.js/React/Better Auth: MIT; Prisma: Apache-2.0; Node.js: MIT plus bundled terms | Preserve dependency and runtime notices |
| `db`, Debian-based | PostgreSQL 18.6; app, Keycloak and queue databases | [PostgreSQL License](https://www.postgresql.org/about/licence/) | Check the selected image's operating-system packages and extensions |
| `proxy`, Alpine-based | Nginx Open Source | [BSD-2-Clause](https://nginx.org/LICENSE) | Additional modules and image packages have their own terms |
| `auth` | Keycloak with custom login/account themes and managed realm | [Apache-2.0](https://github.com/keycloak/keycloak/blob/main/LICENSE.txt) | Java, Node bootstrap runtime, UBI9 libraries and theme assets retain their separate terms |
| `s3` | SeaweedFS open-source edition | [Apache-2.0](https://github.com/seaweedfs/seaweedfs/blob/master/LICENSE) | Pinned upstream weed binary with Node/Alpine bootstrap runtime; enterprise offerings are outside this selection |
| `s3console` | Official SeaweedFS Admin UI (`weed admin`) | [Apache-2.0](https://github.com/seaweedfs/seaweedfs/blob/4.51/LICENSE) | Official 4.51 image (DEV version tag, QA pinned manifest digest); optional `tools` profile and separate login; image packages retain their own terms |
| Database migrations / bootstrap | Project scripts, Prisma or PostgreSQL utilities | Owner-controlled scripts: proprietary, tool licenses apply | Final image and tool selection pending |
| Offline backup | Existing PostgreSQL image used as a tar helper | Preserve the selected image package notices | No additional image; physical data/metadata volume archives, matching versions required for restore |

An image may contain packages under GPL, LGPL, BSD, MIT and other licenses in
addition to the main project's license. Debian itself distributes packages
under multiple licenses, see [Debian license information](https://www.debian.org/legal/licenses/).
Do not label a whole image MIT or Apache-2.0 solely because its main application
uses that license. Check source-availability and notice obligations for the
actual components being redistributed.

## Runtimes and development or deployment tools

| Component | Purpose | License / terms | Notes |
| --- | --- | --- | --- |
| [Node.js](https://github.com/nodejs/node/blob/main/LICENSE) | TypeScript application runtime | MIT plus bundled-component licenses | Preserve the full license information shipped with the selected runtime |
| [TypeScript](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) | Language tooling and compiler | Apache-2.0 | Build tooling |
| [pnpm](https://github.com/pnpm/pnpm/blob/main/LICENSE) | JavaScript workspace and dependencies | MIT | Development and build tooling |
| [mkcert](https://github.com/FiloSottile/mkcert/blob/master/LICENSE) | Local HTTPS certificates | BSD-3-Clause | Local tooling, not the public PROD certificate solution |
| [Docker Engine / Moby](https://github.com/moby/moby/blob/master/LICENSE) | Linux container runtime stack | Apache-2.0 for the Moby project | Other runtime components have their own licenses |
| [Docker Compose](https://github.com/docker/compose/blob/main/LICENSE) | Multi-container application management | Apache-2.0 | Separate from Docker Desktop subscription terms |
| [Docker Desktop](https://docs.docker.com/subscription-billing/desktop-license/) | Local Docker environment on Windows | Docker Subscription Service Agreement | Free for qualifying uses, a paid subscription is required for other categories |
| [Terraform, contemporary releases](https://github.com/hashicorp/terraform/blob/main/LICENSE) | Lightsail infrastructure provisioning | BUSL-1.1 with an Additional Use Grant | Not a permissive open-source license, review the exact release and intended use |
| [Terraform AWS Provider](https://github.com/hashicorp/terraform-provider-aws/blob/main/LICENSE) | AWS resource definitions | MPL-2.0 | Separate license from Terraform itself |

Terraform's current Additional Use Grant permits production use subject to its
conditions, including restrictions on competitive hosted or embedded offerings.
Provisioning the project's own application is distinct from offering Terraform
as a competing product. Reassess the terms before bundling or reselling deployment
tooling. See the [Terraform license](https://github.com/hashicorp/terraform/blob/main/LICENSE).

The AWS provider's MPL-2.0 obligations concern covered provider code and its
distribution. The provider's license must not be confused with the license of
Terraform configuration or the project's application code, see the
[provider license](https://github.com/hashicorp/terraform-provider-aws/blob/main/LICENSE).

Docker Desktop's current free categories include personal use, education,
non-commercial open-source projects and qualifying small businesses. Larger
professional organizations and government entities require a paid subscription.
Evaluate the actual user organization, not only the size of this project. See
the [Docker Desktop license terms](https://docs.docker.com/subscription-billing/desktop-license/).

## Hosting and optional future services, model weights and assets

External AI services and model weights are outside the minimal baseline. AWS
Lightsail remains the PROD hosting target. These entries retain the terms
boundary for future integrations; they do not select an AI dependency.

| Element | Applicable terms | Selection boundary |
| --- | --- | --- |
| AWS Lightsail / Bedrock | [AWS Customer Agreement](https://aws.amazon.com/agreement/) and applicable service/model terms | Service charges and provider terms are independent of the AWS SDK license |
| OpenAI API | [OpenAI Services Agreement](https://openai.com/policies/services-agreement/) and applicable service terms | The SDK's Apache-2.0 license does not make the hosted API free |
| Downloaded model weights | License of each selected model repository | Not covered by the Transformers or PyTorch license, inspect the model card and license files |
| OCR models, datasets, fonts, maps and other assets | Terms of each selected artifact | Not yet selected, do not infer commercial or redistribution rights from the host library |

Model repositories can declare different or custom licenses. The model's usage
and redistribution terms must be checked before release, see
[Hugging Face repository licensing](https://github.com/huggingface/hub-docs/blob/main/docs/hub/repositories-licenses.md).

## Commercial use and release requirements

The MIT, Apache-2.0, BSD and PostgreSQL licenses listed here permit commercial
use subject to their conditions and do not themselves require the project's
separate application code to be published. They do not remove obligations for
other dependencies or assets. Consult the actual
[MIT](https://github.com/better-auth/better-auth/blob/main/LICENSE.md),
[Apache-2.0](https://github.com/prisma/prisma/blob/main/LICENSE),
[BSD](https://nginx.org/LICENSE) and
[PostgreSQL](https://www.postgresql.org/about/licence/) terms.

Before distributing a release:

1. Pin package versions, container base images and digests.
2. Inventory resolved packages, operating-system components, model weights and
   shipped assets, generate an SBOM from the actual release artifacts.
3. Verify licenses and redistribution conditions against those exact versions.
4. Package required license texts, copyright statements and notices, meet any
   applicable source-distribution obligations for shipped components.
5. Retain Apache NOTICE content where required and identify modifications as
   required by the applicable licenses.
6. Review Terraform, Docker Desktop and external service terms separately from
   application-library licenses.
7. Verify the root proprietary terms, rights in Contributions and any separate
   customer license for the intended distribution. The repository access license
   is not a general customer deployment or resale permission.

Infrastructure, support and hosted model costs are separate from dependency
license royalties. No conclusion about all components of a future distribution
should be drawn solely from the project names in this planning register.

[Back to licensing](0100-licensing.md)
