"""Validated process configuration without credentials in diagnostics."""

import math
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from urllib.parse import urlsplit

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
MODEL_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]{1,128}$")


def _validate_ollama_url(url: str, *, allow_private_network: bool) -> None:
    if not isinstance(url, str) or len(url) > 2048 or any(ch.isspace() for ch in url):
        raise ValueError("Invalid PYWORKER_OLLAMA_URL")
    parsed = urlsplit(url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
        or (parsed.port is not None and not 1 <= parsed.port <= 65535)
    ):
        raise ValueError("Invalid PYWORKER_OLLAMA_URL")
    if parsed.scheme == "http" and parsed.hostname not in LOOPBACK_HOSTS:
        if not allow_private_network:
            raise ValueError("Invalid PYWORKER_OLLAMA_URL")


@dataclass(frozen=True, slots=True)
class Settings:
    token: str = field(repr=False)
    host: str = "127.0.0.1"
    port: int = 8010
    concurrency: int = 4
    task_timeout: int = 5
    log_level: str = "info"
    allow_network_bind: bool = False
    allow_private_network: bool = False
    ollama_url: str = "http://127.0.0.1:11434"
    ocr_vlm_model: str = "gemma3:4b"
    ocr_timeout: int = 120
    ocr_max_bytes: int = 20 * 1024 * 1024
    ocr_max_pages: int = 10
    ocr_low_confidence_threshold: float = 0.80
    ocr_legibility_min_avg: float = 0.60

    def __post_init__(self) -> None:
        if (
            not isinstance(self.token, str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{32,512}", self.token)
            or "CHANGE_ME" in self.token
        ):
            raise ValueError("PYWORKER_API_TOKEN must be configured")
        if type(self.allow_network_bind) is not bool:
            raise ValueError("Invalid PYWORKER_ALLOW_NETWORK_BIND")
        if type(self.allow_private_network) is not bool:
            raise ValueError("Invalid PYWORKER_ALLOW_PRIVATE_NETWORK")
        if self.host not in {"127.0.0.1", "::1"} and not (
            self.allow_network_bind and self.host == "0.0.0.0"
        ):
            raise ValueError(
                "PYWORKER_HOST requires loopback or an explicit private-network opt-in"
            )
        for key, value, minimum, maximum in [
            ("PYWORKER_PORT", self.port, 1024, 65535),
            ("PYWORKER_MAX_CONCURRENCY", self.concurrency, 1, 16),
            ("PYWORKER_TASK_TIMEOUT_SECONDS", self.task_timeout, 1, 15),
            ("PYWORKER_OCR_TIMEOUT_SECONDS", self.ocr_timeout, 5, 300),
            ("PYWORKER_OCR_MAX_BYTES", self.ocr_max_bytes, 65_536, 33_554_432),
            ("PYWORKER_OCR_MAX_PAGES", self.ocr_max_pages, 1, 25),
        ]:
            if type(value) is not int or not minimum <= value <= maximum:
                raise ValueError(f"Invalid {key}")
        for key, value, minimum, maximum in [
            ("PYWORKER_OCR_LOW_CONFIDENCE_THRESHOLD", self.ocr_low_confidence_threshold, 0.1, 0.99),
            ("PYWORKER_OCR_LEGIBILITY_MIN_AVG", self.ocr_legibility_min_avg, 0.1, 0.95),
        ]:
            if (
                not isinstance(value, (int, float))
                or isinstance(value, bool)
                or not math.isfinite(value)
                or not minimum <= float(value) <= maximum
            ):
                raise ValueError(f"Invalid {key}")
        if self.log_level not in {"error", "warning", "info", "debug"}:
            raise ValueError("Invalid PYWORKER_LOG_LEVEL")
        if not isinstance(self.ocr_vlm_model, str) or not MODEL_NAME_PATTERN.fullmatch(
            self.ocr_vlm_model
        ):
            raise ValueError("Invalid PYWORKER_OCR_VLM_MODEL")
        _validate_ollama_url(self.ollama_url, allow_private_network=self.allow_private_network)

    @classmethod
    def from_environment(cls, env: Mapping[str, str] | None = None) -> "Settings":
        values = os.environ if env is None else env

        def integer(key: str, default: int, minimum: int, maximum: int, max_len: int = 8) -> int:
            value = values.get(key, str(default))
            if len(value) > max_len or not value.isascii() or not value.isdecimal():
                raise ValueError(f"Invalid {key}")
            parsed = int(value)
            if not minimum <= parsed <= maximum:
                raise ValueError(f"Invalid {key}")
            return parsed

        def floating(key: str, default: float, minimum: float, maximum: float) -> float:
            raw = values.get(key, str(default))
            if len(raw) > 10 or not raw.isascii():
                raise ValueError(f"Invalid {key}")
            try:
                parsed = float(raw)
            except ValueError:
                raise ValueError(f"Invalid {key}") from None
            if not math.isfinite(parsed) or not minimum <= parsed <= maximum:
                raise ValueError(f"Invalid {key}")
            return parsed

        def boolean(key: str, default: str = "false") -> bool:
            raw = values.get(key, default)
            if raw not in {"true", "false"}:
                raise ValueError(f"Invalid {key}")
            return raw == "true"

        return cls(
            token=values.get("PYWORKER_API_TOKEN", ""),
            host=values.get("PYWORKER_HOST", "127.0.0.1"),
            port=integer("PYWORKER_PORT", 8010, 1024, 65535, max_len=6),
            concurrency=integer("PYWORKER_MAX_CONCURRENCY", 4, 1, 16, max_len=6),
            task_timeout=integer("PYWORKER_TASK_TIMEOUT_SECONDS", 5, 1, 15, max_len=6),
            log_level=values.get("PYWORKER_LOG_LEVEL", "info"),
            allow_network_bind=boolean("PYWORKER_ALLOW_NETWORK_BIND"),
            allow_private_network=boolean("PYWORKER_ALLOW_PRIVATE_NETWORK"),
            ollama_url=values.get("PYWORKER_OLLAMA_URL", "http://127.0.0.1:11434"),
            ocr_vlm_model=values.get("PYWORKER_OCR_VLM_MODEL", "gemma3:4b"),
            ocr_timeout=integer("PYWORKER_OCR_TIMEOUT_SECONDS", 120, 5, 300, max_len=6),
            ocr_max_bytes=integer("PYWORKER_OCR_MAX_BYTES", 20 * 1024 * 1024, 65_536, 33_554_432),
            ocr_max_pages=integer("PYWORKER_OCR_MAX_PAGES", 10, 1, 25, max_len=6),
            ocr_low_confidence_threshold=floating(
                "PYWORKER_OCR_LOW_CONFIDENCE_THRESHOLD", 0.80, 0.1, 0.99
            ),
            ocr_legibility_min_avg=floating("PYWORKER_OCR_LEGIBILITY_MIN_AVG", 0.60, 0.1, 0.95),
        )
