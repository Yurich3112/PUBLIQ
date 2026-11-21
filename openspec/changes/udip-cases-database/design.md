# Design: UDIP Cases Database & API (`udip-cases-database`)

## Context

The Clerk Calendar/Table frontend and the OCR / Knowledge Graph / PII-Tracer pipeline both operate on active and archival UDIP cases (`BKS.IV.1431.<nr>.<rok>`). We need a single source of truth in PostgreSQL managed through `@modulon-poc/database` (Prisma 7.10.1) so that:
1. The frontend table teammate can fetch all cases (`GET /api/v1/cases`), filter by year (`2025` / `2026`) or search query, display the **5 Green / 5 Red** status split, expand any row to see queried UM Bydgoszcz departments (`departmentQueries`), and paste email text or attach reply files inline.
2. Submitting a verified OCR request or clicking `+ Nowy Wniosek` (`POST /api/v1/cases`) atomically allocates the next sequential `BKS.IV.1431.<nr>.<year>` case number and persists the OCR / routing metadata.

## Goals / Non-Goals

- **Goals:**
  - Define normalized PostgreSQL tables `udip_case` and `udip_department_query` in `packages/database/prisma/schema.prisma` following repository conventions (`uuidv7()`, `@db.Timestamptz(3)`, explicit indexes and foreign keys).
  - Deterministically compute `daysRemaining`, `healthColor` (`GREEN` | `RED`), and `alerts` (`WIELO_WYDZIALOWY`, `BRAK_DYSPONENTA_ZUS_ZDMIKP`, `BLIZNIACZA_SPRAWA_W_BAZIE`, `TERMIN_PILNY`) on every returned case DTO.
  - Idempotently seed the 10 Bydgoszcz cases from `WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx` in `seedDatabase()` so every developer gets the exact 5 Green / 5 Red cases out of the box.
  - Provide authenticated Next.js API routes under `/api/v1/cases` backed by Zod validation.
- **Non-Goals:**
  - Building the Clerk Calendar Table React UI in this change (owned by the frontend table teammate).

## Decisions

### 1. Schema Structure (`udip_case` + `udip_department_query`)
- `udip_case` holds a unique `case_number` (`BKS.IV.1431.<nr>.<rok>`) and a unique composite `(year, sequence_number)` index so auto-incrementing the next case number in a transaction is conflict-free.
- `udip_department_query` is a 1-to-many child table (`onDelete: Cascade`) ordered by `sort_order ASC` so expandable rows in the Calendar Table preserve deterministic department order.

### 2. Deterministic 5 Green / 5 Red Calculation & Demo Reference Date
- Because the Excel spreadsheet `WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx` uses 2025–2026 dates, our health calculator accepts an optional reference date (defaulting to the current date, or each seeded case's calibrated deadline relative to active work):
  - **5 Green Cases:** Completed on time (`processStatus === "E"`, e.g. `293.2025`, `307.2025`, `15.2026`, `16.2026`, `17.2026`) or active cases with `>= 4` days remaining and no overdue department queries.
  - **5 Red Cases:** Active cases (`18.2026`, `509.2026`, `543.2026`, `590.2026`, `599.2026`) that are due today/tomorrow, overdue (`daysRemaining <= 2`), or awaiting urgent multi-department kwerenda / doprecyzowanie (`processStatus` in `A`, `B`, `C`).

### 3. Inline Department Reply Attachment (`POST /api/v1/cases/[uuid]/departments`)
- Allows the clerk to update any department sub-row by either pasting plain email text (`replyText`) or linking/naming an uploaded PDF/DOCX (`replyFileName`, `replyFileUuid`), automatically transitioning the department status to `REPLIED` (🟢 *Odpowiedź otrzymana*) and, when all queried departments have replied, advancing the parent case `processStatus` from `B` to `D` (*Przygotowana odpowiedź*).
