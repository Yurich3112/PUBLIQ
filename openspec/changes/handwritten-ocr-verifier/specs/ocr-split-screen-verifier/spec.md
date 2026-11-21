# Spec Delta

## Purpose

Provides an authenticated browser Split-Screen OCR Verifier workspace and Next.js backend proxy that lets UM Bydgoszcz clerks upload scanned or handwritten UDIP requests, inspect 1:1 color-coded word bounding boxes beside editable text, confirm verified content, or trigger a 1-click illegible-scan clarification notice.

## ADDED Requirements

### Requirement: Authenticated clerk access and upload proxy
The web application SHALL expose an authenticated `POST /api/v1/ocr/analyze` route and a browser OCR verifier workspace accessible to signed-in clerks and administrators without granting access to Admin-only panels.

#### Scenario: Signed-in clerk uploads a scanned PDF or image
- **WHEN** an authenticated clerk submits a PDF, PNG, or JPEG file (up to 10 MiB) from a same-origin browser session to `POST /api/v1/ocr/analyze`
- **THEN** the web backend validates the session, origin, file size, and magic bytes, forwards the document to the local worker with the server-side bearer token, and returns the structured OCR result plus renderable page image data

#### Scenario: Unauthenticated request to OCR API or workspace
- **WHEN** an unauthenticated visitor opens the OCR verifier page or calls `POST /api/v1/ocr/analyze`
- **THEN** the web application denies access (redirecting to sign-in for the page or returning HTTP 401/403 for the API) and never contacts the Python worker

#### Scenario: Worker unavailable during OCR upload
- **WHEN** the Python worker or its local VLM dependency is unavailable or times out
- **THEN** `POST /api/v1/ocr/analyze` returns a sanitized error status (`503` or `504`) and the UI displays an actionable retry message without leaking internal service URLs or stack traces

### Requirement: Split-screen scan viewer with color-coded bounding boxes
The UI SHALL render a responsive side-by-side split-screen layout displaying the scanned page image with interactive word bounding boxes on the left pane and the editable transcription on the right pane.

#### Scenario: Color coding by confidence and zone
- **WHEN** an OCR result is loaded into the Split-Screen Verifier
- **THEN** the left pane overlays `[x, y, w, h]` boxes scaled accurately to the displayed image dimensions: green for high-confidence words (`>= 0.80`), amber/red for uncertain words (`< 0.80`), and blue for `stamp` zone words

#### Scenario: Multi-page document navigation and zoom
- **WHEN** an uploaded PDF contains multiple pages (such as a 2-page scanned request)
- **THEN** the clerk can switch pages and adjust scan zoom while bounding-box overlays remain accurately aligned to the rendered image

### Requirement: Bidirectional 1:1 word highlighting and inline editing
The UI SHALL synchronize hover, focus, and click selection 1:1 between each bounding box on the left scan and its corresponding word token in the right transcription pane, allowing the clerk to edit any word inline.

#### Scenario: Hovering or clicking a word in the transcription
- **WHEN** the clerk hovers over or clicks a word in the right-hand transcription pane
- **THEN** the corresponding `[x, y, w, h]` bounding box on the left-hand scan highlights and scrolls into view if needed

#### Scenario: Clicking a bounding box on the scan
- **WHEN** the clerk clicks a bounding box on the left-hand scan (such as an amber low-confidence handwritten word)
- **THEN** the right-hand pane focuses that exact word for inline editing and shows its original OCR text and confidence percentage

#### Scenario: Clerk edits a misread handwritten word
- **WHEN** the clerk corrects a word's text in the right-hand pane and confirms the edit
- **THEN** the word updates in the assembled transcription, marks the token as clerk-verified (clearing the low-confidence warning), and preserves the original bounding-box link

### Requirement: Kancelaria stamp metadata display
The UI SHALL surface extracted Kancelaria stamp metadata (`Data wpływu` and `Nr wpływu`) alongside the verification controls so the clerk can inspect or correct them before confirming the request.

#### Scenario: Stamp metadata extracted from scan
- **WHEN** the OCR response includes `stamp_metadata.received_date` and `stamp_metadata.registry_number`
- **THEN** the verifier displays editable metadata badges for `Data wpływu` and `Nr wpływu` and keeps stamp text separated from the citizen's request body by default

### Requirement: Clerk verification confirmation handoff
The UI SHALL require explicit clerk confirmation (`Zatwierdź tekst wniosku`) before exporting or handing off the verified request text and stamp metadata to downstream UDIP case workflows.

#### Scenario: Clerk confirms verified transcription
- **WHEN** the clerk clicks `Zatwierdź tekst wniosku`
- **THEN** the verifier produces a finalized verified payload containing the edited body text, extracted/edited stamp metadata, page count, and verification summary, ready for downstream case creation or clipboard/JSON handoff

### Requirement: Illegible scan fallback — 7-day clarification notice
The UI SHALL always provide a 1-click fallback action (`Skan nieczytelny — Wygeneruj wezwanie do uzupełnienia / doprecyzowania`)—and visually emphasize it when `legibility.recommend_clarification` is `true`—that generates a formal 7-day clarification draft addressed to the applicant.

#### Scenario: Automatic illegibility warning banner
- **WHEN** the OCR response sets `legibility.recommend_clarification` to `true`
- **THEN** the verifier displays a prominent warning banner alerting the clerk that the handwriting may be too illegible to process and highlighting the 1-click clarification notice button

#### Scenario: Clerk generates 7-day clarification draft
- **WHEN** the clerk clicks `Skan nieczytelny — Wygeneruj wezwanie do uzupełnienia / doprecyzowania`
- **THEN** the verifier opens an editable official UM Bydgoszcz BKS clarification notice draft pre-filled with the 7-day statutory deadline, Kancelaria intake metadata (when available), and copy/download actions
