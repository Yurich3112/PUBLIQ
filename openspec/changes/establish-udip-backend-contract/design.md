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

### Stage 3 API for redaction, approval and dispatch

The routes share `/api/v1/udip/cases/{caseId}`. The session and case scope apply to every route.

| Method and path | Contract |
| --- | --- |
| `GET/PATCH /documents/{documentId}/redaction` | Read the current intake review. PATCH accepts `{ revision, ranges }` and saves the sanitized intake copy for later PLLuM processing. |
| `GET/PATCH /drafts/redaction` | Read or save review ranges for the latest draft using the same payload. An empty array confirms the review with no removals. |
| `POST /drafts/approval` | Accept `{ revision }`. The approver needs the existing administrative role and must be a different user from the draft author and the redaction submitter. |
| `GET /drafts/export?revision=...` | Download a fresh UTF-8 TXT only when that revision is current and approved. |
| `POST /dispatch` | Accept `{ revision, sentDate }` to record actual sending for the approved revision and move the case to `E`. |

Review responses include the exact working text, suggestions, the current revision, selected ranges, sanitized text and approval time. Ranges are half-open UTF-16 offsets `[start, end)`. PATCH supplies the complete selection. Omit a suggestion to leave that occurrence unchanged and add manual ranges in the same array. The backend validates bounds, rejects offsets inside surrogate pairs and merges overlaps. Invalid ranges return `400`. Stale revisions and unapproved exports return `409`.

The approval is bound to the latest draft version and selected ranges. A text or range change requires a separate approval. The export removes characters from the underlying text and leaves unrelated occurrences intact. It does not record dispatch. Stage 3 uses local deterministic rules for PESEL-like numbers, email and Polish phone formats. PII-Tracer and PLLuM calls remain separate integrations.

### Stage 4 API for calendar, routing and knowledge

`GET /api/v1/udip/cases?year=2026` returns cases ordered by receipt date and case ID. `daysRemaining` uses the recorded due date and Warsaw's current calendar day. The status remains `A` through `E`. `urgency` is red for unsent cases due today, tomorrow or overdue, and green otherwise. `departmentResponses` includes `total`, `received` and `multiDepartment`. Case details expose `pending` or `received` for each assignment, and the existing reply upload route updates only that assignment.

| Route | Contract |
| --- | --- |
| `GET/PATCH /api/v1/udip/cases/{caseId}/summary` | Read or save `{ expectedVersion, summary }`. The JSONB summary contains `topic`, `tags`, `dataSought`, `period` and `questions`. Each question has a UUID, text, optional data sought and an optional period override. Start at version `0`. |
| `GET /api/v1/udip/cases/{caseId}/recommendations` | Return matches and suggested units per question with the published source, rationale and differing periods. `requiresManualSelection` marks a question without a sufficiently strong unit recommendation. |
| `GET/POST /api/v1/udip/cases/{caseId}/routing` | Read or confirm `{ summaryVersion, questionId, unit }`. Confirmation creates or reuses an internal assignment or generates an external email draft from the current question. |
| `POST /api/v1/udip/cases/{caseId}/routing/{routeId}/dispatch` | Record `{ sentDate }` after sending the external message. This is separate from dispatch of the final case letter. |
| `GET/POST /api/v1/admin/udip/knowledge` | Administrators list or import legal acts, ordinances and archive replies. Send JSON with source text, or PDF/DOCX and a multipart `metadata` JSON field. `data` contains the anonymized summary and associated units. Pass `groupId` to add a version of an existing record. |
| `GET /api/v1/admin/udip/knowledge/{id}` | Return the source, version, cluster, units and similar published records for visualization. |
| `POST /api/v1/admin/udip/knowledge/{id}/approval` | Publish the record immediately and supersede any older published version in its group. |

Matching ranks normalized topic and question terms against approved JSONB entries. It returns source references and period differences. External drafts use the confirmed recipient and the current request, while letter drafts still use only the current case's reply documents as evidence.

To create ten synthetic cases for a local demo, migrate the database, run `pnpm build:database`, then run `pnpm --filter @modulon-poc/database db:seed:udip-demo <local-user-uuid>`. The seed uses the database package `.env` or `DATABASE_URL` and preserves existing cases on a repeat run. The first run creates five cases of each urgency relative to the seed date.

### Stage 5 local models

The private Python worker uses the existing bearer token for `POST /v1/tasks/udip/pii`
and `POST /v1/tasks/udip/ocr`. Enable each model by providing paths to local weights.
The PII operation returns only category and half-open UTF-16 ranges. Document and
draft review reads combine these ranges with the local rules. Saves, approval and
export accept the clerk's exact selection and work with the worker stopped.

On PDF intake, extraction tries embedded text before Polish PP-OCRv5. For failed
PDF reads, `POST /documents/{documentId}/ocr` retries OCR. Each successful
transcription is stored as a new revision. The existing document `GET` returns
`textRevision`, current `extractedText`, and `ocr: { revision, text, pages }`
when a scan was read. Word boxes are the engine's own `[x,y,w,h]` in raster pixels,
with the page dimensions supplied for display. Pages may have no boxes.
Use `PATCH /documents/{documentId}` with `{text, expectedRevision}` to correct
the transcription. A stale revision returns `409`. Earlier clients can still
send only `text`. The last OCR read stays available for comparison after a correction.

| Route under `/api/v1/udip/cases/{caseId}` | Contract |
| --- | --- |
| `POST /summary/suggest` | Takes `{documentId,revision}` for the confirmed redacted request. Returns `{expectedVersion,summary}` for review and saving through `PATCH /summary`. A pending review returns `409`. An unavailable model or invalid model JSON returns `503`; the manual summary form remains available. |
| `POST /drafts/suggest` | Takes `{expectedVersion,summaryVersion,intake,points}`. The intake identifies the confirmed redacted request as `{documentId,revision}`. Each mapping in `points` is `{questionId,sources:[{documentId,revision}]}` for confirmed redacted department replies. Returns one point for every summary question with source IDs or `Brak materiału`, plus `mode` (`pllum` or `template`). Save the reviewed proposal with `PUT /drafts` using only each point's `question`, `text` and `sourceDocumentIds`. |

PLLuM accepts only the configured loopback address. Summarization sends the
confirmed redacted request. Drafting sends excerpts from the confirmed request and
current replies and up to three topics of published matching records with their
numbers removed. Points without current evidence stay out of the model call.
If the output fails validation or adds numerical values outside the current point's
evidence, use the deterministic draft from the confirmed excerpts. Every saved
draft still goes through the final redaction and second-user approval flow.

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
