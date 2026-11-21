# Tasks

## 1. Intake and calendar

- [x] 1.1 Add case, document and signature allocation records. Verify concurrent registration, idempotent upload replay and calendar visibility before extraction.
- [x] 1.2 Add role-scoped case routes with document metadata. Verify owner, assignee, administrator and unrelated user access against the test database.
- [x] 1.3 Store originals and extract digital PDF and DOCX text. Verify failed extraction leaves the case accessible and supports manual transcription.
- [ ] 1.4 Verify case and document workflows with real signed-in sessions and the project clerk, supervisor and administrator grants.
- [ ] 1.5 Connect the local OCR worker and verify authorized real scans.
- [x] 1.6 Return the oldest cases first with year filtering, Warsaw deadline urgency and department reply counts. Seed and verify five green and five red cases.

## 2. Anonymization, summary and routing

- [x] 2.0 Save clerk-selected UTF-16 intake ranges using manual and rule-based suggestions. Verify duplicate occurrences, overlap, emoji and stale transcription revisions.
- [ ] 2.1 Connect PII-Tracer intake suggestions and clerk editing. Check false positives and missed ranges on permitted project documents and check that only confirmed sanitized text reaches PLLuM.
- [x] 2.2 Save versioned manual JSON summaries with questions, sought data and periods.
- [x] 2.3 Rank approved knowledge in TypeScript per question, show source and period differences, and allow clerk confirmation or manual routing.
- [x] 2.4 Track responses per department. Verify independent pending states and file and pasted-text inputs.
- [x] 2.5 Generate external message drafts from the current question after recipient confirmation and record external dispatch separately.
- [ ] 2.6 Connect local PLLuM summaries to the shared JSON schema. Test malformed model output and inspect the bounded context from approved records.

## 3. Versioned letters and TXT

- [x] 3.1 Generate template drafts from current case replies and preserve each version. Verify source IDs, missing material and concurrent stale writes.
- [x] 3.2 Run final rule-based and manual PII review, supervisor approval and clean TXT export. Test stale approval after text or range changes and verify removed values are absent from TXT bytes.
- [x] 3.3 Record actual dispatch date independently. Test that exporting a draft leaves the case unsent.
- [ ] 3.4 Surface conflicting replies and allow archived letters as templates for form only.

## 4. Administrator knowledge base and integration

- [x] 4.1 Add administrator-only import, source versioning, clustering, link data for visualization and publication. Verify that matching sees the approved version immediately and that a clerk cannot import knowledge.
- [ ] 4.2 Verify the complete path with authorized PDFs and Word documents, including a simulated model outage and manual completion.
