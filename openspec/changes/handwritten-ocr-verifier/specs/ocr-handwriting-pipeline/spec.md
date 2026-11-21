# Spec Delta

## Purpose

Provides a local, air-gap-ready multi-stage OCR pipeline that transforms uploaded PDF or image scans of UDIP requests—including handwritten notes on graph paper with Kancelaria stamps—into reading-order Polish transcriptions mapped 1:1 to word-level bounding boxes, confidence scores, zone tags, stamp metadata, and a legibility verdict.

## ADDED Requirements

### Requirement: Authenticated bounded OCR task endpoint
The worker SHALL expose an authenticated `POST /v1/tasks/ocr` endpoint that accepts a bounded document payload and returns structured word-level OCR results while keeping existing `POST /v1/tasks/check` behavior unchanged.

#### Scenario: Valid authenticated OCR request
- **WHEN** a caller sends `POST /v1/tasks/ocr` with a valid bearer token and a supported PDF, PNG, or JPEG document within the configured size limit
- **THEN** the worker returns HTTP 200 with a JSON payload containing per-page dimensions, word-level bounding boxes, assembled text, stamp metadata, and legibility status

#### Scenario: Missing or invalid bearer token
- **WHEN** a caller sends `POST /v1/tasks/ocr` without a valid bearer token
- **THEN** the worker rejects the request with HTTP 401 and does not run OCR processing

#### Scenario: Existing diagnostic endpoint compatibility
- **WHEN** a caller sends `POST /v1/tasks/check` with an 8 KiB JSON diagnostic payload and valid bearer token
- **THEN** the worker enforces the existing 8 KiB limit, 5-second default timeout, and checksum response contract unchanged

### Requirement: Input validation and page/size bounds
The worker SHALL validate uploaded file signatures (magic bytes), reject unsupported formats or payloads exceeding configured byte and page limits, and return sanitized error codes without echoing document bytes.

#### Scenario: Oversized document payload
- **WHEN** a caller submits a document larger than the configured OCR body limit (10 MiB)
- **THEN** the worker aborts reading the stream and returns HTTP 413 with a sanitized error code

#### Scenario: Unsupported or spoofed file type
- **WHEN** a caller submits a file whose magic bytes do not match PDF, PNG, or JPEG (even if its filename or media type claims otherwise)
- **THEN** the worker rejects the request with HTTP 415 and does not attempt image decoding

#### Scenario: Multi-page PDF exceeding maximum page budget
- **WHEN** a caller submits a PDF with more pages than the configured OCR page cap (default 10 pages)
- **THEN** the worker rejects the request with HTTP 422 with a page-limit error code

### Requirement: Digital PDF native-text fast-path
The worker SHALL detect PDF pages that already contain selectable native text and extract their words and normalized bounding boxes directly without invoking the handwritten recognition pipeline.

#### Scenario: Selectable digital PDF page
- **WHEN** a submitted PDF page contains selectable embedded text covering the page content
- **THEN** the worker extracts word bounding boxes and text directly, sets `source_mode` to `digital_text`, and skips grid-line erasure and handwritten VLM inference

#### Scenario: Image-only scanned PDF page
- **WHEN** a submitted PDF page contains no selectable embedded text (such as a scanned handwritten or printed form)
- **THEN** the worker rasterizes the page to an image and executes the full scanned/handwritten OCR pipeline

### Requirement: Graph-paper grid suppression
The worker SHALL detect and remove repeating horizontal and vertical background grid lines on scanned pages before word detection and handwriting recognition while preserving handwritten ink strokes and official stamps.

#### Scenario: Handwritten request on graph paper
- **WHEN** a scanned page contains graph-paper ruling intersecting handwritten Polish letters (such as `Wniosek - BKS.IV.1431.16.2026.pdf`)
- **THEN** the preprocessing stage suppresses the background grid lines without erasing letter strokes or breaking stamp legibility, and records `grid_removed: true` in page metadata

#### Scenario: Clean white-background scan
- **WHEN** a scanned page has no repeating graph-paper grid
- **THEN** the preprocessing stage leaves the ink content unaltered and records `grid_removed: false`

### Requirement: Word-level bounding boxes and zone classification
The worker SHALL detect individual words as pixel-coordinate bounding boxes `[x, y, w, h]` relative to each rendered page image, group words into top-to-bottom left-to-right reading-order lines, and classify each word's zone as `handwriting`, `stamp`, or `printed`.

#### Scenario: Handwritten body with Kancelaria stamp and barcode sticker
- **WHEN** a scanned page contains both handwritten body lines and rectangular office stamps or barcode stickers
- **THEN** every detected word includes a unique identifier, `[x, y, w, h]` pixel coordinates, line index, and zone tag distinguishing `stamp` regions from `handwriting` body text

### Requirement: Local air-gapped line-context handwriting recognition and 1:1 alignment
The worker SHALL transcribe handwritten lines using only a local open-weight vision-language service (with zero cloud or external internet calls) and align the resulting Polish tokens 1:1 onto the detected word bounding boxes with per-word confidence scores between `0.0` and `1.0`.

#### Scenario: Polish handwritten lines with diacritics
- **WHEN** handwritten Polish lines containing diacritical characters (`Ą, Ć, Ę, Ł, Ń, Ó, Ś, Ź, Ż`) are processed through the local line-context recognizer
- **THEN** the response maps each recognized word 1:1 to a detected `[x, y, w, h]` bounding box with a confidence score in `[0.0, 1.0]` and assembles the full reading-order transcription

#### Scenario: Token count mismatch between detector boxes and line transcription
- **WHEN** the local line-context recognizer returns fewer or more tokens than the word detector's boxes on a line
- **THEN** the aligner deterministically reconciles spans (merging adjacent boxes or splitting proportional box widths) so every emitted word retains a valid non-overlapping bounding box and flags reconciled tokens with reduced confidence for clerk review

#### Scenario: Local VLM service unavailable or timed out
- **WHEN** the configured local VLM endpoint cannot be reached or exceeds the OCR timeout budget
- **THEN** the worker returns HTTP 503 (`ocr_model_unavailable`) or HTTP 504 (`task_timeout`) without falling back to any external cloud provider

### Requirement: Kancelaria stamp metadata extraction
The worker SHALL parse Kancelaria intake stamp and barcode zones to extract structured `received_date` (ISO `YYYY-MM-DD`) and `registry_number` (e.g., `3468/2026`) when present.

#### Scenario: Standard UM Bydgoszcz Kancelaria stamp detected
- **WHEN** a scanned page contains a stamp with `Data wpływu: 09.01.2026` and `nr wpływu: 3468/2026`
- **THEN** the response populates `stamp_metadata.received_date` with `"2026-01-09"` and `stamp_metadata.registry_number` with `"3468/2026"`

#### Scenario: No intake stamp present
- **WHEN** a scanned page contains no recognizable Kancelaria intake stamp
- **THEN** the response returns `null` for missing `stamp_metadata` fields without failing OCR

### Requirement: Document legibility gate
The worker SHALL compute an aggregate legibility assessment across body words and flag a document as `illegible_review_required` when overall confidence falls below the configured threshold or when an excessive share of body words are low-confidence.

#### Scenario: Mostly clear handwriting
- **WHEN** body-word average confidence meets or exceeds the legibility threshold and the low-confidence word ratio is within bounds
- **THEN** the response sets `legibility.status` to `"legible"` and `legibility.recommend_clarification` to `false`

#### Scenario: Severely illegible handwriting or degraded scan
- **WHEN** body-word average confidence falls below the legibility threshold or zero body words are reliably recognized
- **THEN** the response sets `legibility.status` to `"illegible_review_required"` and `legibility.recommend_clarification` to `true`

### Requirement: Privacy-safe logging and OCR readiness visibility
The worker SHALL keep raw document bytes, transcribed text, and extracted applicant details out of logs, and SHALL report OCR dependency readiness without leaking internal URLs or credentials.

#### Scenario: Completed or failed OCR task logging
- **WHEN** an OCR request succeeds or fails
- **THEN** structured logs record only correlation metadata (`request_id`, `page_count`, `word_count`, `duration_ms`, `source_mode`, and error type) and never log recognized text or raw file content

#### Scenario: Worker readiness check with OCR subsystem
- **WHEN** a health monitor queries `GET /health/ready`
- **THEN** the response preserves the existing readiness payload and exposes sanitized OCR capability status (`ready` or `degraded`) without exposing hostnames, ports, or tokens
