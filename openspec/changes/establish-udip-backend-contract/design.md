# Design

## Context

Modulon already has Next.js, Prisma, Better Auth and Keycloak, file handling and a private Python worker. The UDIP domain must be added inside this application. The frontend consumes a versioned HTTP contract.

## Goals / Non-Goals

**Goals**

- Implement the complete case workflow with local extraction, detection and inference.
- Keep permissions, confirmations, evidence and letter versions auditable through the backend.

**Scope boundary**

- External dispatch occurs outside the application. The backend drafts the message and stores the clerk's dispatch record.

## Decisions

### Component boundaries

| Component | Responsibility |
| --- | --- |
| Next.js and TypeScript in `apps/web` | API, permissions, case IDs, workflow, deadlines, file access, summary validation, matching, document versions and TXT export |
| Prisma and PostgreSQL | Cases, document records, extraction and redaction revisions, question routing, department replies, draft versions, approvals and dispatch records |
| PostgreSQL `jsonb` | Validated knowledge records linked to a source version, publication status, cluster and similar records |
| Local Python worker | OCR for scans and PII-Tracer suggestions for both the intake text and the complete final letter |
| Local PLLuM | Generate a structured summary and draft from permitted inputs. TypeScript selects and ranks the precedent context. |

### Registration and intake

- `POST /api/v1/udip/cases` accepts `multipart/form-data` with one `file` (PDF or DOCX, up to 10 MiB), `clientRequestId`, `receivedDate`, `dueDate` and optional `applicantName` and `subject`. New requests return `201` with `{ case, document }`. The transaction allocates the case UUID and unique `BKS.IV.1431.<number>.<year>` signature using a per-year counter. An identical replay returns `200` with the same case. A changed upload with the same key returns `409`.
- Register before extraction so failures remain visible in the calendar. The document handler extracts digital text directly and uses the Python worker for scanned pages. Reuse the OCR branch's word coordinates and confidence where applicable. A corrected transcription replaces the working revision for downstream processing.
- `GET /api/v1/udip/cases?year=2026` returns authorized case summaries. Include ID, signature, receipt date, due date, days remaining and process status. Store dates as calendar dates and compute remaining days in `Europe/Warsaw`. The initial contract uses the recorded due date. Confirm deadline calculation and register starting values before production use.
- `GET /api/v1/udip/cases/{caseId}` returns the case, document metadata and assignments. Stage 1 reuses the existing session and role levels. A user can read a case they own or are assigned to. Administrators can read all cases. An unknown or inaccessible case returns `404` and responses are not cached.
- PII-Tracer proposes grey ranges. The clerk can edit and confirm them. Generate the sanitized intake text on the server and bind it to the current working revision. Send only this copy to local PLLuM. Keep the authorized working document access separate from case lists and routing.

### Structured summary and question routing

- Validate model output before use. The contract contains `topic`, `tags`, `questions` and `periods`. Each question gets a stable backend ID within the summary revision. Questions can refer to one or more periods. Preserve uncertain dates as stated in the document for the clerk to resolve.
- TypeScript matches each question against approved anonymized records in PostgreSQL and returns independent `similarCases` and `suggestedUnits` lists keyed by question ID. Each match identifies the source version. Send only a small selected set of relevant anonymized excerpts to PLLuM when it needs context.
- The clerk confirms or changes routing per question. Track one response state per confirmed department and link it to the questions it covers. Accept response files and pasted email text. For an external institution, provide a message draft and destination for outside dispatch.

### Drafts, approval and export

- Draft from current case replies, preserving their source links. Archived examples guide form. Keep missing evidence and conflicting replies visible in the draft workspace. Store each generated or edited draft as a new version.
- After final edits, analyze the entire letter with PII-Tracer. The clerk adjusts or supplies ranges. The supervisor approves the specific pair of letter version and redaction revision. Any edit to either requires fresh approval.
- Export a fresh TXT from that approved pair by removing protected values at generation time. Keep original text out of the rendered copy and export response. Record the date of successful external sending separately when the clerk supplies it.

### Stage 2 API for documents and template drafts

The following routes share `/api/v1/udip/cases/{caseId}`. Mutations use the same-origin session checks from Modulon.

| Method and path | Request and behavior |
| --- | --- |
| `POST /assignments` | An owner or administrator registers `departmentCode` and `departmentName`. |
| `POST /assignments/{assignmentId}/documents` | Send `multipart/form-data` with `file` (PDF or DOCX) and `clientRequestId`, or JSON with `text` and `clientRequestId`. Records the response for that department. |
| `GET /documents/{documentId}` | Read the document state and extracted text for the current case. |
| `GET /documents/{documentId}/original` | Download the original file as an attachment. |
| `PATCH /documents/{documentId}` | Save a manual transcription using `{ "text": "…" }` and set the read state to `ready`. |
| `POST /drafts` | Generate a draft with `{ expectedVersion, points }`. Each point has `question` and `sourceDocumentIds` from the current case. Start with `expectedVersion: 0`. |
| `PUT /drafts` | Save a new version with the same structure and a `text` field on each edited point. Set `expectedVersion` to the version being edited. A stale version returns `409` with `currentVersion`. |
| `GET /drafts[?version=N]` | Read the latest or the selected saved draft with its version, rendered text and source references. |

New originals are linked to an immutable Modulon file version in S3/SeaweedFS. The file catalog protects referenced originals from removal. Earlier originals stored in PostgreSQL remain readable. Text extraction runs after registration, so an empty or unreadable PDF stays in the calendar with read state `failed`. This stage uses local PDF and DOCX parsers and allows manual correction. OCR is a later integration.

Template generation uses only readable department replies in the same case. A point without usable replies shows `Brak materiału`. Existing replies are cited by document ID. Draft retrieval returns the working version for review. Final approved TXT export remains a later step.

### Knowledge base and manual fallback

- Administrators upload acts and archived replies. Store original source and version metadata, validated anonymized matching content, proposed cluster and similar record links. The admin graph can show pending placement. Matching reads only approved anonymized versions.
- On OCR failure, allow manual text. On PLLuM failure, allow a manual validated summary and drafts from a template. On PII-Tracer failure, allow manual ranges. Display dependency failure through workflow state and keep the final supervisor gate. Local work stays available without a cloud fallback.

## Risks / Trade-offs

- Verify the role mapping with clerk, supervisor and administrator accounts. Bind approvals and confirmations to a revision to prevent concurrent edits from reusing stale decisions.
- Test OCR bounding boxes and PII false negatives on authorized project documents. Include mixed digital and scanned pages, Polish PII, and extraction from the final TXT. The synthetic test covers only basic model operation.
- Evaluate question matching on positive, ambiguous and unmatched examples. Validate model JSON and treat source text as data. A recommendation must retain its question ID and the evidence required for clerk review.

## Migration Plan

1. Add the UDIP schema, upload and calendar routes with separate test data.
2. Integrate extraction and redaction, then add question matching, decision records and department replies.
3. Add draft versions, final approval and export, then validate the full workflow and administrator publication against authorized samples.

## Baseline verification

| Check | Result |
| --- | --- |
| Node development preflight and Python launcher | Six tests passed with the Node runtime bundled in VS Code. |
| Python diagnostic task | Deterministic checksum and JSON round trip verified. |
| PLLuM | Local health returned `ok` and chat-completions returned `4`. |
| PII-Tracer | Local offline inference masked a synthetic email and phone in a Polish sentence. Evaluation on project documents is pending. |
| UDIP intake | Applied all migrations to a disposable PGlite database running PostgreSQL 18 and registered synthetic PDF and DOCX requests. Verified scope, pagination, replay and concurrent signature allocation. |
| Full development stack | Docker Engine was unavailable in the checked environment. Web, Keycloak, PostgreSQL and real-document OCR integration remain unverified. |
