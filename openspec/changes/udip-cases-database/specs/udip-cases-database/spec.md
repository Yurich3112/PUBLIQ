# Specification: UDIP Cases Database & API (`udip-cases-database`)

## ADDED Requirements

### Requirement: PostgreSQL Schema for UDIP Cases and Department Queries
The system SHALL persist UDIP public information requests in PostgreSQL table `udip_case` and per-department inquiries in `udip_department_query` via Prisma, including official signature `BKS.IV.1431.<nr>.<rok>`, process status `A–E`, dates, assignee initials, OCR transcription, Knowledge Graph match metadata, external authority routing, and expandable department reply rows.

#### Scenario: Creating a new UDIP case with automatic sequential signature
- **WHEN** an authenticated clerk creates a new UDIP case for year `2026` without providing a manual sequence number
- **THEN** the database assigns the next sequential number for `2026`, formats `caseNumber` as `BKS.IV.1431.<nr>.2026`, defaults `deadlineDate` to `receivedDate + 14 days`, sets `isMultiDepartment = true` when 2 or more department queries are attached, and returns the created case with its department sub-rows.

### Requirement: Idempotent 10-Case Bydgoszcz Seed (5 Green / 5 Red)
The database seed SHALL idempotently populate the 10 Bydgoszcz cases from `WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx` with 5 Green cases and 5 Red cases, including multi-department sub-rows and twin-case Knowledge Graph links (`599.2026` ↔ `307.2025`, `543.2026` ↔ `293.2025`).

#### Scenario: Running database seed multiple times
- **WHEN** `seedDatabase()` executes on an initialized PostgreSQL database
- **THEN** all 10 official `BKS.IV.1431.*` cases and their department sub-rows exist without duplicating rows on subsequent runs, and summary statistics report `5` Green cases and `5` Red cases.

### Requirement: Calendar Table REST API and Inline Department Replies
The web application SHALL expose authenticated endpoints under `/api/v1/cases` to list cases with computed `daysRemaining`, `healthColor` (`GREEN` | `RED`), and `alerts`, create new cases (including from OCR verification), update case process status `A–E`, and attach pasted email replies or file metadata to individual department queries.

#### Scenario: Clerk pastes a department email reply inside an expanded calendar row
- **WHEN** an authenticated clerk sends a department reply (`replyText` or `replyFileName`) to `/api/v1/cases/[uuid]/departments`
- **THEN** the target `UdipDepartmentQuery` row transitions to `REPLIED` with `repliedAt` recorded, and the updated case DTO is returned with refreshed department statuses.
