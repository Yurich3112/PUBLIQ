# Proposal: UDIP Cases Database & API (`udip-cases-database`)

## Why

The City Hall of Bydgoszcz (**Biuro Komunikacji Społecznej — BKS**) processes ~800 public information requests (*UDIP*) per year and currently tracks them manually in an Excel spreadsheet (`WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx`). To support the **Clerk Calendar & Table Organizer** (built by our frontend teammate), the **Split-Screen Handwritten OCR Verifier**, the **2-Tier Knowledge Graph / AI Routing**, and the **Irreversible PII-Tracer Anonymizer**, we need a shared PostgreSQL + Prisma database schema (`UdipCase` and `UdipDepartmentQuery`), deterministic seeding of the 10 Bydgoszcz benchmark cases (5 Green / 5 Red visual split), and typed Next.js API endpoints (`/api/v1/cases`).

## What Changes

- **PostgreSQL & Prisma Schema (`packages/database/prisma/schema.prisma`):**
  - Add enums `UdipProcessStatus` (`A`, `B`, `C`, `D`, `E`), `UdipRoutingType` (`INTERNAL_DEPARTMENTS`, `EXTERNAL_AUTHORITY`, `CLARIFICATION_7D`), `UdipTemplateType` (`MERIT_RESPONSE`, `KWERENDA_EXTENSION`, `CLARIFICATION_CALL`, `EXTERNAL_REDIRECT`), and `UdipDeptStatus` (`PENDING`, `REPLIED`, `KWERENDA_REQUESTED`).
  - Add `UdipCase` (`udip_case`) storing official signature (`BKS.IV.1431.<nr>.<rok>`), year, sequence number, Kancelaria registry number, applicant name/contact, subject, received/deadline/answered dates, assignee name/initials/user, process status `A–E`, multi-department flag, OCR metadata, Knowledge Graph match (`matchedCaseNumber`, `matchSimilarity`), external authority routing (`ZUS`, `ZDMiKP`, `WKZ`), and draft/anonymized response text.
  - Add `UdipDepartmentQuery` (`udip_department_query`) for expandable per-department rows under each case, supporting inline status (`PENDING`, `REPLIED`, `KWERENDA_REQUESTED`), pasted department email replies (`replyText`), and attached reply files (`replyFileName`, `replyFileUuid`).
- **Database Migration & 10-Case Bydgoszcz Seed (`packages/database/src/seed.ts`, `packages/database/src/udip-cases.ts`):**
  - Add SQL migration `20261121223000_udip_cases` creating the new enums, tables, indexes, and foreign keys.
  - Seed the 10 cases from `WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx` with realistic department sub-rows and a **5 Green / 5 Red** urgency distribution for the live demo.
  - Export typed data-access helpers (`listUdipCases`, `getUdipCaseByNumberOrUuid`, `createUdipCase`, `updateUdipCase`, `upsertUdipDepartmentReply`) and computed DTO fields (`daysRemaining`, `healthColor`, `alerts`).
- **Next.js Zod Contracts & REST API (`apps/web/src/schemas/udip-case.ts`, `apps/web/src/app/api/v1/cases/`):**
  - Expose `GET /api/v1/cases` (with `year`, `status`, `healthColor`, `search` filters + summary counters: total, greenCount, redCount, multiDepartmentCount) and `POST /api/v1/cases` (auto-assigning the next `BKS.IV.1431.<nr>.<year>` signature).
  - Expose `PATCH /api/v1/cases/[uuid]` (updating case status, deadline/kwerenda, or draft/anonymized text) and `POST /api/v1/cases/[uuid]/departments` (attaching a department reply file or pasting raw email text inline).

## Capabilities

### New Capabilities

- `udip-cases-database`: PostgreSQL schema, Prisma models, 10-case Bydgoszcz seed data (5 Green / 5 Red), and `/api/v1/cases` endpoints for the Clerk Calendar Table and OCR/AI pipeline.

### Modified Capabilities

- None.

## Impact

- `packages/database/prisma/schema.prisma` & `packages/database/prisma/migrations/20261121223000_udip_cases/migration.sql`
- `packages/database/src/udip-cases.ts`, `packages/database/src/seed.ts`, `packages/database/src/index.ts`
- `apps/web/src/config/api-routes.ts`, `apps/web/src/schemas/udip-case.ts`, `apps/web/src/server/udip-cases.ts`
- `apps/web/src/app/api/v1/cases/route.ts`, `apps/web/src/app/api/v1/cases/[uuid]/route.ts`, `apps/web/src/app/api/v1/cases/[uuid]/departments/route.ts`
- `tests/web/udip-cases.test.mjs`
