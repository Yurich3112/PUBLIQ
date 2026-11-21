# Proposal

## Why

Urząd Miasta Bydgoszczy (Biuro Komunikacji Społecznej — BKS) receives ~800 UDIP (*Ustawa o dostępie do informacji publicznej*) requests per year, including real citizen submissions handwritten on graph paper (*kartka w kratkę*) with Kancelaria stamps and barcode stickers (e.g., `Wniosek - BKS.IV.1431.16.2026.pdf`). Today `apps/pyworker` only exposes a diagnostic checksum endpoint (`POST /v1/tasks/check`) and `apps/web` has no OCR or verification workspace, leaving clerks to transcribe messy scans manually and risking misread requests or delayed 14-day statutory deadlines. Adding a 100% local, air-gap-ready handwritten OCR pipeline paired with an interactive 1:1 Split-Screen Verifier turns scanned/handwritten requests into verified text in seconds while keeping the clerk in full legal control.

## What Changes

- **Track B — Backend Handwritten OCR Pipeline (`apps/pyworker`):**
  - Add an authenticated, bounded OCR task endpoint (`POST /v1/tasks/ocr`) alongside the unchanged diagnostic endpoint (`POST /v1/tasks/check`).
  - Implement a 5-step (Stage 0–4) local pipeline:
    - **Stage 0 (Ingestion & Digital Fast-Path):** Accept PDF/PNG/JPEG scans, rasterize scanned PDF pages, and short-circuit native-text digital PDFs with word coordinates without invoking the handwritten pipeline.
    - **Stage 1 (OpenCV Grid Eraser):** Morphologically strip horizontal/vertical graph-paper grid lines while preserving pen strokes and Kancelaria stamps.
    - **Stage 2 (Lightweight Word-Box Detector & Line/Zone Grouper):** Run a local lightweight ONNX word detector (DBNet / RapidOCR detector) to produce `[x, y, w, h]` word boxes, group them into reading-order lines, and classify zones (`handwriting`, `stamp`, `printed`).
    - **Stage 3 (Local Open-Weight Line-Context Recognizer):** Call a local Ollama `Qwen2.5-VL-3B` instance (`PYWORKER_OLLAMA_URL`, loopback by default, zero cloud/OpenAI dependency) on line/block crops to read Polish handwriting with diacritics in context.
    - **Stage 4 (1:1 Alignment, Stamp Metadata & Legibility Gate):** Align recognized tokens 1:1 onto Stage 2 `[x, y, w, h]` word boxes with per-word confidence (`0.0–1.0`), extract Kancelaria stamp metadata (`received_date`, `registry_number`), and compute a document legibility verdict that flags illegible scans.
  - Extend `GET /health/ready` / model readiness reporting and add unit/contract tests covering the real `Wniosek - BKS.IV.1431.16.2026.pdf` sample.

- **Track A — Frontend Split-Screen OCR Verifier (`apps/web`):**
  - Add a server-side authenticated API route (`POST /api/v1/ocr/analyze`) and typed `pyworker` OCR client adapter with origin/session checks, magic-byte/MIME validation, and bounded file size/timeouts.
  - Add a browser-based Split-Screen OCR Verifier workspace (accessible to signed-in clerks without exposing Admin-only tools):
    - **Left Pane:** Rendered page scan with zoom/page controls and interactive SVG/HTML bounding-box overlays color-coded by confidence and zone (Green = high confidence, Amber/Red = uncertain handwriting, Blue = Kancelaria stamp/barcode).
    - **Right Pane:** Editable transcription with 1:1 bidirectional hover/click highlighting against the left scan, inline per-word editing, and extracted stamp metadata chips (`Data wpływu`, `Nr wpływu`).
    - **Verification & Fallback Actions:** Clerk confirmation button (`Zatwierdź tekst wniosku`) that hands verified text + metadata to downstream UDIP case creation/routing, plus a 1-click illegible-scan fallback (`Skan nieczytelny — Wygeneruj wezwanie do uzupełnienia / doprecyzowania`) producing a 7-day clarification notice draft.

- **Alignment with the 6 HackNation Jury Validation Tests:**
  - **Test #1 (Upload PDF/Word & match archive):** Produces clean, clerk-verified Polish text from scanned/handwritten PDFs (including `16.2026`, `543.2026`, `590.2026`) so downstream archive matching works on scans, not only digital DOCX files.
  - **Test #2 (Draft response layout):** Preserves verified applicant question text and Kancelaria stamp metadata (`Data wpływu`, `Nr wpływu`) for accurate BKS draft letters and 14-day deadline calculation.
  - **Test #3 (Anonymization readiness):** Outputs word-level offsets and verified text free of raw scan noise, ready for downstream `PII-Tracer` scanning (while keeping raw scan contents out of server/worker logs).
  - **Test #4 (Ease of use, stability & real-world usability):** Interactive 1:1 hover/click verification and 1-click *Wezwanie do uzupełnienia* directly reflect mentor-validated BKS workflows on real graph-paper handwriting.
  - **Test #5 (Calendar ordering & deadlines):** Extracts `Data wpływu` from the Kancelaria stamp to seed accurate 14-day statutory deadlines in the calendar table.
  - **Test #6 (Knowledge base updates & local air-gap viability):** Runs 100% locally on open-weight models (OpenCV + ONNX word detector + local Ollama `Qwen2.5-VL-3B`) with zero internet dependency.

## Capabilities

### New Capabilities

- `ocr-handwriting-pipeline`: Local air-gap multi-stage OCR pipeline in `apps/pyworker` (PDF/image ingestion, OpenCV grid-line removal, word-level `[x, y, w, h]` detection and zone classification, local Ollama `Qwen2.5-VL-3B` line-context recognition, 1:1 word-box alignment, Kancelaria stamp metadata extraction, and legibility scoring).
- `ocr-split-screen-verifier`: Authenticated browser Split-Screen OCR Verifier in `apps/web` (`POST /api/v1/ocr/analyze` proxy contract, interactive bounding-box scan viewer, 1:1 hover/click/edit word transcription sync, stamp metadata display, confirmation handoff, and 1-click illegible-scan 7-day clarification draft).

### Modified Capabilities

<!-- None: openspec/specs/ has no existing specs yet, and existing pyworker diagnostic endpoint POST /v1/tasks/check remains unchanged. -->

## Impact

- **Backend (`apps/pyworker`):** New `src/pyworker/ocr/` modules (`pipeline.py`, `ingest.py`, `grid_eraser.py`, `word_detector.py`, `line_grouper.py`, `ollama_recognizer.py`, `aligner.py`, `stamp_parser.py`), new `POST /v1/tasks/ocr` route, path-scoped body-size/content-type handling in `transport.py`, Ollama/OCR env settings in `config.py` and `scripts/pyworker.mjs`, updated `requirements.in` / `requirements.lock` (OpenCV headless, ONNX/RapidOCR detector, PyMuPDF/pypdfium2, Pillow), and new tests in `apps/pyworker/tests/`.
- **Frontend (`apps/web`):** New Zod schemas in `src/schemas/ocr.ts`, server adapter in `src/server/ocr.ts`, authenticated route handler in `src/app/api/v1/ocr/analyze/route.ts`, navigation/API route registration in `src/config/api-routes.ts` & `src/config/navigation.ts`, Split-Screen UI components under `src/app/[locale]/ocr/` (and reusable verifier component for the upcoming case intake modal), Polish/English i18n messages, and unit/route tests in `tests/web/`.
- **Local Infrastructure / Runtime:** Requires a local Ollama service (`127.0.0.1:11434`) with `qwen2.5vl:3b` pulled for live handwritten recognition; offline unit/CI tests inject a deterministic mock recognizer so `pnpm check` passes without a GPU or running Ollama daemon.
- **Backward Compatibility:** Existing `POST /v1/tasks/check` (8 KiB JSON, 5s timeout), `GET /health/live`, `GET /health/ready`, and Modulon admin file/chat routes remain fully backward compatible.
