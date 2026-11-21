# Proposal

## Why

The UDIP module needs one workflow for registering requests, routing individual questions, tracking department replies and approving the final letter. Modulon supplies the authentication, database, document handling and worker boundaries.

## What Changes

- Register a PDF or Word upload with a generated BKS signature and calendar deadline. Extract digital text directly and use OCR for scans.
- Let the clerk correct and anonymize the intake text. Summarize the sanitized copy with local PLLuM and match its individual questions against published anonymized precedents in TypeScript.
- Let the clerk confirm each destination. Track department responses separately and prepare an external message for the clerk to send outside the system.
- Draft from responses for the current case, expose gaps and conflicts, and preserve letter versions. Scan the final letter for PII and require supervisor approval of that version before clean TXT export. Record actual dispatch separately.
- Version legal acts and archived replies in the admin knowledge base. Publish them to matching after approval and show their cluster and links. Preserve a manual path if a local model is unavailable.

## Capabilities

### New Capabilities

- `udip-case-intake` covers intake, question routing, departmental evidence, approved export and knowledge-base publication.

### Modified Capabilities

None.

## Impact

- The UDIP module uses the existing Next.js API and authorization, the Prisma workspace for cases and draft versions, and the Python worker for OCR and PII detection. Frontend work consumes versioned HTTP responses.
- Implementation remains staged across case intake and calendar, OCR, anonymization, routing and draft generation, and the admin knowledge-base view. See [the UDIP product specification](../../../docs/UDIP_COMPLETE_IDEA.md) for broader demo context.
