"""Unit and ASGI contract tests for the 5-stage local handwritten OCR pipeline."""

import asyncio
import io
import json
import unittest
from pathlib import Path

import httpx2
from fastapi.testclient import TestClient

from pyworker.config import Settings
from pyworker.contracts import OcrOptions
from pyworker.main import create_app
from pyworker.ocr.aligner import align_line_words
from pyworker.ocr.grid_eraser import erase_graph_grid
from pyworker.ocr.ingest import detect_file_kind, ingest_document
from pyworker.ocr.interfaces import (
    DetectedBox,
    GroupedLine,
    InvalidDocumentError,
    OcrModelUnavailableError,
    RecognizedLine,
    RecognizedToken,
    UnsupportedMediaError,
)
from pyworker.ocr.line_grouper import group_boxes_into_lines
from pyworker.ocr.ollama_recognizer import OllamaLineRecognizer, parse_vlm_line_payload
from pyworker.ocr.pipeline import OcrPipeline
from pyworker.ocr.stamp_parser import parse_stamp_metadata
from pyworker.ocr.word_detector import MorphologicalWordDetector

TOKEN = "test-token-" + "b" * 48
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/octet-stream",
}
REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLES_DIR = (
    REPO_ROOT
    / "docs"
    / "Przykładowe wnioski i odpowiedzi -20261121T114640Z-1-001"
    / "Przykładowe wnioski i odpowiedzi"
)
HANDWRITTEN_SAMPLE = SAMPLES_DIR / "Wniosek - BKS.IV.1431.16.2026.pdf"
DIGITAL_SAMPLE = SAMPLES_DIR / "Odpowiedź - BKS.IV.1431.16.2026.anonymised.pdf"
MULTIPAGE_SCAN_SAMPLE = SAMPLES_DIR / "Wniosek - BKS.IV.1431.543.2026.pdf"


class _StubDetector:
    name = "stub-detector"

    def detect(self, _image_rgb):
        return [
            DetectedBox(bbox=(20, 20, 120, 34), score=0.95),
            DetectedBox(bbox=(160, 20, 140, 34), score=0.95),
            DetectedBox(bbox=(20, 90, 90, 38), score=0.92),
            DetectedBox(bbox=(125, 90, 190, 38), score=0.88),
        ]


class _StubRecognizer:
    name = "stub-ollama:qwen2.5vl:3b"

    def __init__(
        self, *, confidence: float = 0.91, ready: bool = True, fail: Exception | None = None
    ):
        self._confidence = confidence
        self._ready = ready
        self._fail = fail
        self.calls = 0

    async def is_ready(self) -> bool:
        return self._ready

    async def recognize_line(self, _crop_rgb, *, zone, expected_words):
        self.calls += 1
        if self._fail is not None:
            raise self._fail
        if self.calls == 1:
            return RecognizedLine(
                text="Data wpływu: 09.01.2026 nr 3468/2026",
                tokens=[
                    RecognizedToken(text="09.01.2026", confidence=self._confidence),
                    RecognizedToken(text="3468/2026", confidence=self._confidence),
                ],
            )
        return RecognizedLine(
            text="ILE PUNKTÓW",
            tokens=[
                RecognizedToken(text="ILE", confidence=self._confidence),
                RecognizedToken(text="PUNKTÓW", confidence=self._confidence),
            ][: max(1, expected_words)],
        )


def _make_sample_png_bytes(*, with_grid: bool = False) -> bytes:
    import numpy as np
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (600, 400), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    if with_grid:
        for x in range(0, 600, 25):
            draw.line([(x, 0), (x, 399)], fill=(120, 120, 120), width=1)
        for y in range(0, 400, 25):
            draw.line([(0, y), (599, y)], fill=(120, 120, 120), width=1)
    # Draw thick simulated handwritten strokes.
    draw.rectangle([40, 80, 140, 118], outline=(10, 10, 10), width=4)
    draw.rectangle([180, 80, 320, 118], outline=(10, 10, 10), width=4)
    buf = io.BytesIO()
    Image.fromarray(np.asarray(img, dtype=np.uint8)).save(buf, format="PNG")
    return buf.getvalue()


class OcrPureLogicTests(unittest.TestCase):
    def test_magic_byte_detection(self):
        self.assertEqual(detect_file_kind(b"%PDF-1.7\n"), "pdf")
        self.assertEqual(detect_file_kind(b"\x89PNG\r\n\x1a\nxxxx"), "png")
        self.assertEqual(detect_file_kind(b"\xff\xd8\xff\xe0xxxx"), "jpeg")
        with self.assertRaises(UnsupportedMediaError):
            detect_file_kind(b"PK\x03\x04docx-bytes")

    def test_aligner_exact_merged_and_split_boxes(self):
        line = GroupedLine(
            line_id="p0_l0",
            zone="handwriting",
            bbox=(10, 10, 300, 40),
            boxes=[
                DetectedBox((10, 10, 80, 40)),
                DetectedBox((110, 10, 80, 40)),
                DetectedBox((210, 10, 100, 40)),
            ],
        )
        exact = align_line_words(
            line,
            RecognizedLine(
                text="ILE PUNKTÓW ALKOHOLU",
                tokens=[
                    RecognizedToken("ILE", 0.95),
                    RecognizedToken("PUNKTÓW", 0.90),
                    RecognizedToken("ALKOHOLU", 0.88),
                ],
            ),
            page_index=0,
            start_word_index=0,
        )
        self.assertEqual([w.aligned_by for w in exact], ["exact", "exact", "exact"])
        self.assertEqual([w.text for w in exact], ["ILE", "PUNKTÓW", "ALKOHOLU"])

        merged = align_line_words(
            line,
            RecognizedLine(
                text="ILE PUNKTÓW",
                tokens=[RecognizedToken("ILE", 0.95), RecognizedToken("PUNKTÓW", 0.90)],
            ),
            page_index=0,
            start_word_index=0,
        )
        self.assertEqual(len(merged), 2)
        self.assertTrue(all(w.aligned_by == "merged_box" for w in merged))

        split = align_line_words(
            GroupedLine(
                line_id="p0_l1",
                zone="handwriting",
                bbox=(10, 60, 260, 40),
                boxes=[DetectedBox((10, 60, 260, 40))],
            ),
            RecognizedLine(
                text="W BYDGOSZCZY",
                tokens=[RecognizedToken("W", 0.95), RecognizedToken("BYDGOSZCZY", 0.92)],
            ),
            page_index=0,
            start_word_index=0,
        )
        self.assertEqual(len(split), 2)
        self.assertTrue(all(w.aligned_by == "split_box" for w in split))
        self.assertTrue(all(w.confidence <= 0.75 for w in split))
        self.assertEqual(split[0].bbox[0] + split[0].bbox[2], split[1].bbox[0])

    def test_stamp_parser_extracts_iso_date_and_registry(self):
        meta = parse_stamp_metadata(
            [
                "URZĄD MIASTA BYDGOSZCZY",
                "KANCELARIA OGÓLNA",
                "Data wpływu: 09.01.2026",
                "nr wpływu: 3468/2026",
            ]
        )
        self.assertEqual(meta.received_date, "2026-01-09")
        self.assertEqual(meta.registry_number, "3468/2026")
        empty = parse_stamp_metadata([])
        self.assertIsNone(empty.received_date)
        self.assertIsNone(empty.registry_number)

    def test_vlm_payload_parser_preserves_polish_diacritics(self):
        payload = json.dumps(
            {
                "text": "PRZYBYŁO W BYDGOSZCZY OD OBJĘCIA FUNKCJI",
                "tokens": [
                    {"text": "PRZYBYŁO", "confidence": 0.88},
                    {"text": "W", "confidence": 0.97},
                    {"text": "BYDGOSZCZY", "confidence": 0.91},
                ],
            }
        )
        parsed = parse_vlm_line_payload(payload)
        self.assertEqual(parsed.tokens[0].text, "PRZYBYŁO")
        self.assertAlmostEqual(parsed.tokens[0].confidence, 0.88)

    def test_ollama_recognizer_mock_transport_and_errors(self):
        import numpy as np

        crop = np.full((40, 120, 3), 255, dtype=np.uint8)

        def ok_handler(request: httpx2.Request) -> httpx2.Response:
            if request.url.path == "/api/tags":
                return httpx2.Response(200, json={"models": [{"name": "qwen2.5vl:3b"}]})
            return httpx2.Response(
                200,
                json={
                    "message": {
                        "content": json.dumps(
                            {
                                "text": "SPRZEDAŻY ALKOHOLU",
                                "tokens": [
                                    {"text": "SPRZEDAŻY", "confidence": 0.86},
                                    {"text": "ALKOHOLU", "confidence": 0.93},
                                ],
                            }
                        )
                    }
                },
            )

        recognizer = OllamaLineRecognizer(
            base_url="http://127.0.0.1:11434",
            model="qwen2.5vl:3b",
            transport=httpx2.MockTransport(ok_handler),
        )
        self.assertTrue(asyncio.run(recognizer.is_ready()))
        line = asyncio.run(recognizer.recognize_line(crop, zone="handwriting", expected_words=2))
        self.assertEqual([t.text for t in line.tokens], ["SPRZEDAŻY", "ALKOHOLU"])

        def fail_handler(_request: httpx2.Request) -> httpx2.Response:
            return httpx2.Response(404, json={"error": "model not found"})

        broken = OllamaLineRecognizer(
            base_url="http://127.0.0.1:11434",
            model="qwen2.5vl:3b",
            transport=httpx2.MockTransport(fail_handler),
        )
        with self.assertRaises(OcrModelUnavailableError):
            asyncio.run(broken.recognize_line(crop, zone="handwriting", expected_words=2))


class OcrImageAndPdfStageTests(unittest.TestCase):
    def test_grid_eraser_distinguishes_graph_paper_from_clean_scan(self):
        grid_pages = ingest_document(_make_sample_png_bytes(with_grid=True))
        _cleaned, grid_removed = erase_graph_grid(grid_pages[0].image_rgb)
        self.assertTrue(grid_removed)

        clean_pages = ingest_document(_make_sample_png_bytes(with_grid=False))
        _cleaned2, grid_removed2 = erase_graph_grid(clean_pages[0].image_rgb)
        self.assertFalse(grid_removed2)

    def test_real_hackathon_samples_ingest_grid_erase_and_word_detect(self):
        if not HANDWRITTEN_SAMPLE.exists():
            self.skipTest("Sample PDFs not present")

        # 1. Handwritten graph-paper PDF (16.2026) -> scanned raster + grid removed + word boxes.
        hw_pages = ingest_document(HANDWRITTEN_SAMPLE.read_bytes(), include_preview=False)
        self.assertEqual(len(hw_pages), 1)
        self.assertEqual(hw_pages[0].digital_words, [])
        cleaned, grid_removed = erase_graph_grid(hw_pages[0].image_rgb)
        self.assertTrue(grid_removed)
        boxes = MorphologicalWordDetector().detect(cleaned)
        self.assertGreater(len(boxes), 10)
        lines = group_boxes_into_lines(boxes, page_index=0, image_rgb=hw_pages[0].image_rgb)
        self.assertGreater(len(lines), 4)
        self.assertTrue(all(line.line_id.startswith("p0_l") for line in lines))

        # 2. Digital native-text PDF (Odpowiedź 16.2026) -> digital fast-path.
        dig_pages = ingest_document(DIGITAL_SAMPLE.read_bytes(), include_preview=False)
        self.assertEqual(len(dig_pages), 1)
        self.assertGreater(len(dig_pages[0].digital_words), 20)

        # 3. Multi-page scanned PDF (543.2026) -> 2 pages, page cap enforced.
        mp_bytes = MULTIPAGE_SCAN_SAMPLE.read_bytes()
        mp_pages = ingest_document(mp_bytes, max_pages=5, include_preview=False)
        self.assertEqual(len(mp_pages), 2)
        with self.assertRaises(InvalidDocumentError):
            ingest_document(mp_bytes, max_pages=1, include_preview=False)


class OcrEndpointTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(token=TOKEN, concurrency=1, task_timeout=2, ocr_timeout=5)
        self.recognizer = _StubRecognizer(confidence=0.91, ready=True)
        self.pipeline = OcrPipeline(
            self.settings,
            detector=_StubDetector(),
            recognizer=self.recognizer,
        )
        self.app = create_app(self.settings, ocr_pipeline=self.pipeline)

    def test_ocr_endpoint_success_readiness_and_privacy_safe_logs(self):
        png_bytes = _make_sample_png_bytes(with_grid=True)
        with TestClient(self.app) as client:
            health = client.get("/health/ready")
            self.assertEqual(health.status_code, 200)
            self.assertEqual(health.json()["ocr"], "ready")
            self.assertNotIn("11434", health.text)

            with self.assertLogs("pyworker", "INFO") as logs:
                res = client.post(
                    "/v1/tasks/ocr",
                    content=png_bytes,
                    headers={
                        **HEADERS,
                        "X-File-Name": "Wniosek_16_2026.png",
                        "X-OCR-Options": json.dumps({"include_preview_images": True}),
                    },
                )
            self.assertEqual(res.status_code, 200)
            body = res.json()
            self.assertEqual(body["status"], "ok")
            self.assertEqual(body["page_count"], 1)
            self.assertTrue(body["pages"][0]["grid_removed"])
            self.assertTrue(
                body["pages"][0]["preview_image_data_url"].startswith("data:image/png;")
            )
            self.assertEqual(body["legibility"]["status"], "legible")
            self.assertFalse(body["legibility"]["recommend_clarification"])

            log_output = " ".join(logs.output)
            self.assertIn("event=ocr_completed", log_output)
            self.assertNotIn("PUNKTÓW", log_output)
            self.assertNotIn("Wniosek_16_2026", log_output)

    def test_ocr_endpoint_rejects_auth_media_size_and_illegible_flag(self):
        small_settings = Settings(
            token=TOKEN, concurrency=1, task_timeout=2, ocr_timeout=5, ocr_max_bytes=65_536
        )
        illegible_pipeline = OcrPipeline(
            small_settings,
            detector=_StubDetector(),
            recognizer=_StubRecognizer(confidence=0.35, ready=False),
        )
        app = create_app(small_settings, ocr_pipeline=illegible_pipeline)
        with TestClient(app) as client:
            self.assertEqual(client.get("/health/ready").json()["ocr"], "degraded")
            self.assertEqual(
                client.post(
                    "/v1/tasks/ocr",
                    content=b"abc",
                    headers={"Content-Type": "application/octet-stream"},
                ).status_code,
                401,
            )
            self.assertEqual(
                client.post(
                    "/v1/tasks/ocr",
                    content=b"abc",
                    headers={
                        "Authorization": f"Bearer {TOKEN}",
                        "Content-Type": "application/json",
                    },
                ).status_code,
                415,
            )
            self.assertEqual(
                client.post("/v1/tasks/ocr", content=b"x" * 70_000, headers=HEADERS).status_code,
                413,
            )
            self.assertEqual(
                client.post("/v1/tasks/ocr", content=b"not-a-pdf", headers=HEADERS).status_code,
                415,
            )
            self.assertEqual(
                client.post(
                    "/v1/tasks/ocr",
                    content=_make_sample_png_bytes(),
                    headers={**HEADERS, "X-OCR-Options": '{"bad":1}'},
                ).status_code,
                422,
            )
            low_res = client.post(
                "/v1/tasks/ocr", content=_make_sample_png_bytes(), headers=HEADERS
            )
            self.assertEqual(low_res.status_code, 200)
            self.assertEqual(low_res.json()["legibility"]["status"], "illegible_review_required")
            self.assertTrue(low_res.json()["legibility"]["recommend_clarification"])

    def test_ocr_endpoint_maps_unavailable_and_timeout(self):
        unavail_pipeline = OcrPipeline(
            self.settings,
            detector=_StubDetector(),
            recognizer=_StubRecognizer(fail=OcrModelUnavailableError("down")),
        )
        with TestClient(create_app(self.settings, ocr_pipeline=unavail_pipeline)) as client:
            res = client.post("/v1/tasks/ocr", content=_make_sample_png_bytes(), headers=HEADERS)
            self.assertEqual(res.status_code, 503)
            self.assertEqual(res.json()["error"], "ocr_model_unavailable")

        timeout_pipeline = OcrPipeline(
            self.settings,
            detector=_StubDetector(),
            recognizer=_StubRecognizer(fail=TimeoutError()),
        )
        with TestClient(create_app(self.settings, ocr_pipeline=timeout_pipeline)) as client:
            res = client.post("/v1/tasks/ocr", content=_make_sample_png_bytes(), headers=HEADERS)
            self.assertEqual(res.status_code, 504)
            self.assertEqual(res.json()["error"], "task_timeout")

    def test_ocr_options_validation(self):
        self.assertEqual(OcrOptions(max_pages=3, include_preview_images=False).max_pages, 3)


if __name__ == "__main__":
    unittest.main()
