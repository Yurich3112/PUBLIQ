# Tasks: UDIP Cases Database & API (`udip-cases-database`)

## 1. Prisma Schema & SQL Migration (`packages/database`)

- [x] 1.1 Add `UdipProcessStatus`, `UdipRoutingType`, `UdipTemplateType`, `UdipDeptStatus`, `UdipCase`, and `UdipDepartmentQuery` models to `packages/database/prisma/schema.prisma`.
- [x] 1.2 Create SQL migration `packages/database/prisma/migrations/20261121223000_udip_cases/migration.sql` and run `pnpm --filter @modulon-poc/database run db:deploy` and `db:generate`.
- [x] 1.3 Implement `packages/database/src/udip-cases.ts` with 10-case Bydgoszcz seed data (5 Green / 5 Red), computed `daysRemaining` / `healthColor` / `alerts`, and CRUD + inline department reply helpers; wire into `packages/database/src/seed.ts` and `packages/database/src/index.ts`.

## 2. Next.js Zod Contracts & API Endpoints (`apps/web`)

- [x] 2.1 Add `/api/v1/cases` routes to `apps/web/src/config/api-routes.ts` and create Zod schemas in `apps/web/src/schemas/udip-case.ts`.
- [x] 2.2 Implement server data-access layer `apps/web/src/server/udip-cases.ts` and REST route handlers `apps/web/src/app/api/v1/cases/route.ts`, `apps/web/src/app/api/v1/cases/[uuid]/route.ts`, and `apps/web/src/app/api/v1/cases/[uuid]/departments/route.ts`.

## 3. Verification & Seeding

- [x] 3.1 Build `@modulon-poc/database`, apply the migration and 10-case Bydgoszcz seed to local PostgreSQL (`pnpm db:seed`), and add unit tests in `tests/web/udip-cases.test.mjs`.
