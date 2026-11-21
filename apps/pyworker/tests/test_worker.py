import asyncio
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from pyworker.config import Settings
from pyworker.main import create_app

TOKEN = "test-token-" + "a" * 48
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(Settings(token=TOKEN, concurrency=1, task_timeout=1))
        self.task = {"job_id": str(uuid4()), "attempt": 0}

    def test_lifecycle_health_and_no_secrets(self):
        client = TestClient(self.app)
        self.assertEqual(client.get("/health/live").status_code, 200)
        self.assertEqual(client.get("/health/ready").status_code, 503)
        with client:
            for endpoint in ["/health", "/health/live", "/health/ready"]:
                response = client.get(endpoint)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "ok")
                self.assertEqual(response.headers["cache-control"], "no-store")
                self.assertNotIn(TOKEN, response.text)
        self.assertFalse(self.app.state.ready)

    def test_authenticated_idempotent_diagnostic(self):
        with TestClient(self.app) as client:
            self.assertEqual(client.post("/v1/tasks/check", json=self.task).status_code, 401)
            self.assertEqual(
                client.post(
                    "/v1/tasks/check", json=self.task, headers={"Authorization": "Bearer wrong"}
                ).status_code,
                401,
            )
            first = client.post("/v1/tasks/check", json=self.task, headers=HEADERS)
            second = client.post("/v1/tasks/check", json=self.task, headers=HEADERS)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json(), second.json())
            self.assertEqual(first.json()["executor"], "pyworker")
            self.assertEqual(first.json()["job_id"], self.task["job_id"])

    def test_validation_and_body_limit_do_not_echo_inputs(self):
        with TestClient(self.app) as client:
            for body in [
                {**self.task, "attempt": "0"},
                {**self.task, "attempt": True},
                {**self.task, "attempt": -1},
                {**self.task, "job_id": "invalid"},
                {**self.task, "command": "secret input"},
            ]:
                response = client.post("/v1/tasks/check", json=body, headers=HEADERS)
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json(), {"error": "invalid_request"})
            response = client.post(
                "/v1/tasks/check",
                content=b"x" * 9000,
                headers={**HEADERS, "Content-Type": "application/json"},
            )
            self.assertEqual(response.status_code, 413)
            self.assertEqual(
                client.post("/v1/tasks/check", content="text", headers=HEADERS).status_code, 415
            )
            self.assertEqual(
                client.post("/v1/tasks/unknown", json=self.task, headers=HEADERS).status_code, 404
            )

    def test_overload_rejects_without_hiding_health(self):
        with TestClient(self.app) as client:
            client.portal.call(self.app.state.slots.acquire)
            try:
                self.assertEqual(
                    client.post("/v1/tasks/check", json=self.task, headers=HEADERS).status_code, 503
                )
                self.assertEqual(client.get("/health/ready").status_code, 200)
            finally:
                client.portal.call(self.app.state.slots.release)
            self.assertEqual(
                client.post("/v1/tasks/check", json=self.task, headers=HEADERS).status_code, 200
            )

    def test_timeout_and_handler_failure_recover(self):
        async def slow(_task):
            await asyncio.sleep(10)

        async def failure(_task):
            raise RuntimeError("private exception details")

        with TestClient(self.app) as client:
            with patch("pyworker.main.run_check", slow):
                self.assertEqual(
                    client.post("/v1/tasks/check", json=self.task, headers=HEADERS).status_code, 504
                )
            with patch("pyworker.main.run_check", failure):
                response = client.post("/v1/tasks/check", json=self.task, headers=HEADERS)
                self.assertEqual(response.status_code, 500)
                self.assertNotIn("private", response.text)
            self.assertEqual(
                client.post("/v1/tasks/check", json=self.task, headers=HEADERS).status_code, 200
            )

    def test_configuration_errors_do_not_disclose_values(self):
        settings = Settings.from_environment({"PYWORKER_API_TOKEN": TOKEN})
        self.assertNotIn(TOKEN, repr(settings))
        for field, value in [
            ("PYWORKER_API_TOKEN", "private"),
            ("PYWORKER_PORT", "0"),
            ("PYWORKER_HOST", "0.0.0.0"),
            ("PYWORKER_MAX_CONCURRENCY", "999"),
            ("PYWORKER_TASK_TIMEOUT_SECONDS", "99"),
        ]:
            with self.assertRaises(ValueError) as error:
                Settings.from_environment({"PYWORKER_API_TOKEN": TOKEN, field: value})
            self.assertIn(field, str(error.exception))

    def test_direct_configuration_also_enforces_invariants(self):
        for overrides in [
            {"token": "short"},
            {"token": "a" * 513},
            {"token": "a" * 32 + ":"},
            {"concurrency": True},
            {"task_timeout": 0},
            {"port": 65536},
            {"host": "0.0.0.0"},
            {"log_level": "invalid"},
        ]:
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                Settings(**{"token": TOKEN, **overrides})
        with self.assertRaisesRegex(ValueError, "Invalid PYWORKER_PORT"):
            Settings.from_environment({"PYWORKER_API_TOKEN": TOKEN, "PYWORKER_PORT": "9" * 5000})

    def test_container_network_binding_requires_explicit_opt_in(self):
        settings = Settings.from_environment(
            {
                "PYWORKER_API_TOKEN": TOKEN,
                "PYWORKER_HOST": "0.0.0.0",
                "PYWORKER_ALLOW_NETWORK_BIND": "true",
            }
        )
        self.assertEqual(settings.host, "0.0.0.0")
        self.assertTrue(settings.allow_network_bind)
        for value in ["false", "yes", "1", ""]:
            with self.assertRaises(ValueError):
                Settings.from_environment(
                    {
                        "PYWORKER_API_TOKEN": TOKEN,
                        "PYWORKER_HOST": "0.0.0.0",
                        "PYWORKER_ALLOW_NETWORK_BIND": value,
                    }
                )

    def test_handler_failure_logs_correlated_metadata_without_exception_text(self):
        async def failure(_task):
            raise RuntimeError("private SQL and credentials")

        with TestClient(self.app) as client:
            with (
                patch("pyworker.main.run_check", failure),
                self.assertLogs("pyworker", "ERROR") as logs,
            ):
                response = client.post("/v1/tasks/check", json=self.task, headers=HEADERS)
            self.assertEqual(response.status_code, 500)
            output = " ".join(logs.output)
            for value in [self.task["job_id"], response.headers["x-request-id"], "RuntimeError"]:
                self.assertIn(value, output)
            self.assertNotIn("private SQL", output)
            self.assertNotIn(TOKEN, output)
            self.assertEqual(response.json()["request_id"], response.headers["x-request-id"])

    def test_ocr_configuration_validation_and_loopback_guard(self):
        settings = Settings.from_environment(
            {
                "PYWORKER_API_TOKEN": TOKEN,
                "PYWORKER_OLLAMA_URL": "http://127.0.0.1:11434",
                "PYWORKER_OCR_VLM_MODEL": "qwen2.5vl:3b",
                "PYWORKER_OCR_TIMEOUT_SECONDS": "90",
                "PYWORKER_OCR_MAX_BYTES": "5242880",
                "PYWORKER_OCR_MAX_PAGES": "5",
                "PYWORKER_OCR_LOW_CONFIDENCE_THRESHOLD": "0.75",
                "PYWORKER_OCR_LEGIBILITY_MIN_AVG": "0.55",
            }
        )
        self.assertEqual(settings.ollama_url, "http://127.0.0.1:11434")
        self.assertEqual(settings.ocr_vlm_model, "qwen2.5vl:3b")
        self.assertEqual(settings.ocr_timeout, 90)
        self.assertEqual(settings.ocr_max_bytes, 5_242_880)
        self.assertEqual(settings.ocr_max_pages, 5)
        self.assertAlmostEqual(settings.ocr_low_confidence_threshold, 0.75)
        self.assertAlmostEqual(settings.ocr_legibility_min_avg, 0.55)

        private = Settings.from_environment(
            {
                "PYWORKER_API_TOKEN": TOKEN,
                "PYWORKER_OLLAMA_URL": "http://ollama:11434",
                "PYWORKER_ALLOW_PRIVATE_NETWORK": "true",
            }
        )
        self.assertEqual(private.ollama_url, "http://ollama:11434")

        for field, value in [
            ("PYWORKER_OLLAMA_URL", "http://ollama:11434"),
            ("PYWORKER_OLLAMA_URL", "http://user:pass@127.0.0.1:11434"),
            ("PYWORKER_OLLAMA_URL", "ftp://127.0.0.1:11434"),
            ("PYWORKER_OCR_VLM_MODEL", "bad model!"),
            ("PYWORKER_OCR_TIMEOUT_SECONDS", "2"),
            ("PYWORKER_OCR_MAX_BYTES", "1024"),
            ("PYWORKER_OCR_MAX_PAGES", "0"),
            ("PYWORKER_OCR_LOW_CONFIDENCE_THRESHOLD", "1.5"),
            ("PYWORKER_OCR_LEGIBILITY_MIN_AVG", "nan"),
        ]:
            with self.subTest(field=field, value=value), self.assertRaises(ValueError) as error:
                Settings.from_environment({"PYWORKER_API_TOKEN": TOKEN, field: value})
            self.assertIn(field, str(error.exception))

    def test_ocr_response_contract_validation(self):
        from pydantic import ValidationError

        from pyworker.contracts import OcrResponse

        valid = {
            "engine": {"detector": "rapidocr-dbnet-onnx", "recognizer": "ollama:qwen2.5vl:3b"},
            "duration_ms": 1200,
            "page_count": 1,
            "assembled_text": "ILE PUNKTÓW",
            "stamp_metadata": {
                "received_date": "2026-01-09",
                "registry_number": "3468/2026",
                "raw_stamp_lines": ["Data wpływu: 09.01.2026"],
            },
            "legibility": {
                "status": "legible",
                "average_confidence": 0.9,
                "low_confidence_ratio": 0.0,
                "recommend_clarification": False,
                "reason": None,
            },
            "pages": [
                {
                    "page_index": 0,
                    "width": 1000,
                    "height": 1400,
                    "source_mode": "handwritten_ocr",
                    "grid_removed": True,
                    "preview_image_data_url": None,
                    "lines": [
                        {
                            "line_id": "p0_l0",
                            "zone": "handwriting",
                            "bbox": [10, 20, 200, 40],
                            "text": "ILE",
                            "word_ids": ["p0_w0"],
                        }
                    ],
                    "words": [
                        {
                            "id": "p0_w0",
                            "line_id": "p0_l0",
                            "text": "ILE",
                            "bbox": [10, 20, 80, 40],
                            "confidence": 0.92,
                            "zone": "handwriting",
                            "aligned_by": "exact",
                        }
                    ],
                }
            ],
        }
        parsed = OcrResponse.model_validate(valid)
        self.assertEqual(parsed.stamp_metadata.registry_number, "3468/2026")
        with self.assertRaises(ValidationError):
            OcrResponse.model_validate({**valid, "unknown": True})
        bad_word = {**valid["pages"][0]["words"][0], "bbox": [10, 20, 0, 40]}
        with self.assertRaises(ValidationError):
            OcrResponse.model_validate(
                {**valid, "pages": [{**valid["pages"][0], "words": [bad_word]}]}
            )


if __name__ == "__main__":
    unittest.main()
