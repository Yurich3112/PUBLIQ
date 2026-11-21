# UDIP case workflow

## Purpose

Give authorized staff a shared workflow for registering and routing public information requests, tracking department replies and approving sanitized letters for export.

## ADDED Requirements

### Requirement: Scoped case access

The API SHALL enforce clerk, supervisor and administrator permissions within the applicable case scope. Calendar, routing and graph responses SHALL exclude original scan bytes and working transcriptions.

#### Scenario: Unauthorized case read

- **WHEN** a signed-in actor reads a case outside their permitted scope
- **THEN** the service returns the same `404` as for an unknown case

### Requirement: Idempotent registration on upload

The backend SHALL register a valid PDF or Word upload, allocate a unique case ID and BKS signature, and make the initial status and deadline visible in the calendar. Replaying the same upload by the same actor with the same request ID SHALL return the original case.

#### Scenario: Concurrent intake and retry

- **WHEN** two distinct uploads arrive for the same register year and one is retried
- **THEN** the original uploads receive different signatures and the retry consumes no new signature

### Requirement: Correctable intake text

The backend SHALL extract selectable text directly and use local OCR for scans. The clerk SHALL be able to correct the transcription before anonymization.

#### Scenario: OCR is unavailable

- **WHEN** OCR cannot process a scan
- **THEN** the case remains visible and the clerk can enter its transcription manually

### Requirement: Clerk-approved intake anonymization

PII-Tracer SHALL return potential data ranges as grey suggestions. The clerk SHALL be able to accept, reject, edit or add ranges. Local PLLuM SHALL receive only the sanitized intake revision created after the clerk confirms the ranges.

#### Scenario: Pending intake review

- **WHEN** summarization is requested before the clerk confirms the current intake revision
- **THEN** the backend sends no working text to PLLuM

### Requirement: Structured summary and per-question matching

The system SHALL validate summary JSON containing topic, tags, questions and periods. TypeScript SHALL return independent similar cases and suggested units for each question using approved anonymized knowledge entries. The clerk SHALL confirm destinations.

#### Scenario: Questions concern different units

- **WHEN** two questions have precedents in different units
- **THEN** the response keeps each question, its matches and its suggested units separate

### Requirement: Routing and department replies

The service SHALL track replies per confirmed department. Clerks SHALL be able to attach a response file or paste email text. The application SHALL prepare a message draft for a confirmed external destination. The clerk sends it outside the system.

#### Scenario: One of two departments replies

- **WHEN** a clerk adds a response from one of two internal departments
- **THEN** the service updates that department's state and keeps the other reply pending

### Requirement: Evidence-based draft versions

The service SHALL persist each letter version. Drafting SHALL use responses for the current case as factual evidence and archived replies as examples of form. Missing information and conflicting replies SHALL be visible for the clerk to resolve.

#### Scenario: Current evidence leaves a question open

- **WHEN** a precedent contains an answer missing from current replies
- **THEN** the draft retains a visible gap without presenting the historical answer as current fact

### Requirement: Final review and clean TXT export

The system SHALL run a final PII review on the complete letter. An authorized supervisor SHALL approve its exact text and redaction version before TXT export. The generated TXT SHALL omit the confirmed values. Changing text or ranges SHALL require fresh approval.

#### Scenario: Redaction changes after approval

- **WHEN** a clerk edits the protected ranges of an approved letter
- **THEN** the new version cannot be exported until it has fresh supervisor approval

### Requirement: Separate dispatch record

The system SHALL record the clerk's actual dispatch date separately from approval and export.

#### Scenario: Letter is exported before sending

- **WHEN** the clerk exports the TXT and sends it later
- **THEN** the case is marked as sent only when the clerk records dispatch

### Requirement: Administrator knowledge-base publication

Administrators SHALL be able to add legal acts and archived replies and see their source, version, cluster and links. Matching SHALL include only approved anonymized knowledge versions.

#### Scenario: New archive version awaits approval

- **WHEN** an administrator adds a version with proposed links
- **THEN** the administrator can inspect those links and the version enters matching only after approval

### Requirement: Manual continuation on model failure

Model unavailability SHALL permit manual transcription, structured summarization, drafting from a template and manual redaction. Final supervisor approval SHALL still apply.

#### Scenario: Inference is unavailable

- **WHEN** PLLuM or PII-Tracer cannot run
- **THEN** the clerk can continue with the corresponding manual steps and TXT export still requires approval
