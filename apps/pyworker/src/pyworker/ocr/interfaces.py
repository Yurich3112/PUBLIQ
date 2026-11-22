"""Shared internal types, protocols, and safe exceptions for the OCR pipeline."""

from dataclasses import dataclass, field
from typing import Any, Protocol

from pyworker.contracts import OcrZone


class UnsupportedMediaError(ValueError):
    """Raised when uploaded file magic bytes are not PDF, PNG, or JPEG."""


class InvalidDocumentError(ValueError):
    """Raised when a document is corrupt, empty, or exceeds configured page limits."""


class OcrModelUnavailableError(RuntimeError):
    """Raised when a required local OCR/VLM engine is unavailable."""


@dataclass(frozen=True, slots=True)
class DigitalWord:
    text: str
    bbox: tuple[int, int, int, int]
    zone: OcrZone = "printed"


@dataclass(slots=True)
class IngestedPage:
    page_index: int
    width: int
    height: int
    image_rgb: Any  # numpy.ndarray (H, W, 3) uint8
    preview_image_data_url: str | None
    digital_words: list[DigitalWord] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class DetectedBox:
    bbox: tuple[int, int, int, int]
    score: float = 1.0
    text: str | None = None
    angle_deg: float = 0.0


@dataclass(slots=True)
class GroupedLine:
    line_id: str
    zone: OcrZone
    bbox: tuple[int, int, int, int]
    boxes: list[DetectedBox]
    angle_deg: float = 0.0


@dataclass(frozen=True, slots=True)
class RecognizedToken:
    text: str
    confidence: float


@dataclass(frozen=True, slots=True)
class RecognizedLine:
    text: str
    tokens: list[RecognizedToken]


class WordDetector(Protocol):
    name: str

    def detect(self, image_rgb: Any) -> list[DetectedBox]: ...


class LineRecognizer(Protocol):
    name: str

    async def recognize_line(
        self,
        crop_rgb: Any,
        *,
        zone: OcrZone,
        expected_words: int,
    ) -> RecognizedLine: ...

    async def is_ready(self) -> bool: ...
