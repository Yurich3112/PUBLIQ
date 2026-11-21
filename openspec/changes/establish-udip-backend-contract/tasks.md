# Tasks

## 1. Intake and calendar

- [x] 1.1 Add case, document and signature allocation records. Verify concurrent registration, idempotent upload replay and calendar visibility before extraction.
- [x] 1.2 Add role-scoped case routes with document metadata. Verify owner, assignee, administrator and unrelated user access against the test database.
- [ ] 1.3 Connect direct PDF and Word extraction and local OCR. Verify authorized scans and manual correction when extraction fails.
- [ ] 1.4 Verify case and document workflows with real signed-in sessions and the project clerk, supervisor and administrator grants.

## 2. Anonymization, summary and routing

- [ ] 2.1 Connect PII-Tracer intake suggestions and clerk editing. Check false positives and missed ranges on permitted project documents and check that only confirmed sanitized text reaches PLLuM.
- [ ] 2.2 Add local JSON summaries and manual summaries using the same schema. Test malformed model output, multiple questions and periods.
- [ ] 2.3 Add TypeScript ranking of PostgreSQL knowledge records and clerk confirmation. Test different destinations in the same request and inspect the bounded context sent to PLLuM.
- [ ] 2.4 Track responses per department and generate external message drafts. Verify independent pending states and file and pasted-text inputs.

## 3. Versioned letters and TXT

- [ ] 3.1 Draft from the current case replies and preserve each version. Test visible gaps and conflicts and confirm archives are used for form only.
- [ ] 3.2 Run final PII review, supervisor approval and clean TXT export. Test stale approval after an edit and verify removed values are absent from raw TXT bytes.
- [ ] 3.3 Record actual dispatch date independently. Test that exporting a draft leaves the case unsent.

## 4. Administrator knowledge base and integration

- [ ] 4.1 Add source versioning, clustering, link visualization and publication. Test that pending versions appear to administrators and are excluded from matches until approval.
- [ ] 4.2 Verify the complete path with authorized PDFs and Word documents, including a simulated model outage and manual completion.
