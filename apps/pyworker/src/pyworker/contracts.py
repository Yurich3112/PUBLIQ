"""Versioned input/output contracts for diagnostic and OCR tasks."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

OcrZone = Literal["handwriting", "stamp", "printed"]
OcrSourceMode = Literal["digital_text", "handwritten_ocr", "printed_ocr"]
OcrAlignedBy = Literal["exact", "merged_box", "split_box", "digital_native"]
OcrLegibilityStatus = Literal["legible", "illegible_review_required"]


class CheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    job_id: Annotated[UUID, Field(strict=False)]
    attempt: Annotated[int, Field(ge=0, le=1_000_000)]


class CheckResponse(BaseModel):
    status: Literal["ok"] = "ok"
    executor: Literal["pyworker"] = "pyworker"
    job_id: UUID
    attempt: int
    checksum: str


class OcrOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    max_pages: Annotated[int, Field(ge=1, le=25)] | None = None
    include_preview_images: bool = True


class OcrEngineInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    detector: str = Field(min_length=1, max_length=120)
    recognizer: str = Field(min_length=1, max_length=160)


class OcrWord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64)
    line_id: str = Field(min_length=1, max_length=64)
    text: str = Field(max_length=256)
    bbox: tuple[int, int, int, int]
    confidence: float = Field(ge=0.0, le=1.0)
    zone: OcrZone
    aligned_by: OcrAlignedBy

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, value: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
        x, y, width, height = value
        if x < 0 or y < 0 or width <= 0 or height <= 0:
            raise ValueError("Bounding box requires non-negative origin and positive dimensions")
        return value


class OcrLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    line_id: str = Field(min_length=1, max_length=64)
    zone: OcrZone
    bbox: tuple[int, int, int, int]
    text: str = Field(max_length=4096)
    word_ids: list[str]

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, value: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
        x, y, width, height = value
        if x < 0 or y < 0 or width <= 0 or height <= 0:
            raise ValueError("Line bounding box requires non-negative origin and positive size")
        return value


class OcrPage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page_index: int = Field(ge=0, le=100)
    width: int = Field(gt=0, le=20_000)
    height: int = Field(gt=0, le=20_000)
    source_mode: OcrSourceMode
    grid_removed: bool
    preview_image_data_url: str | None = None
    lines: list[OcrLine]
    words: list[OcrWord]


class StampMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    received_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    registry_number: str | None = Field(default=None, min_length=1, max_length=64)
    raw_stamp_lines: list[str] = Field(default_factory=list)


class LegibilityReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: OcrLegibilityStatus
    average_confidence: float = Field(ge=0.0, le=1.0)
    low_confidence_ratio: float = Field(ge=0.0, le=1.0)
    recommend_clarification: bool
    reason: str | None = Field(default=None, max_length=256)


class OcrResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ok"] = "ok"
    executor: Literal["pyworker"] = "pyworker"
    engine: OcrEngineInfo
    duration_ms: int = Field(ge=0)
    page_count: int = Field(ge=1, le=25)
    assembled_text: str
    stamp_metadata: StampMetadata
    legibility: LegibilityReport
    pages: list[OcrPage]


class UdipPiiRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: Annotated[str, Field(min_length=1, max_length=260_000)]


class UdipOcrRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    content_base64: Annotated[str, Field(min_length=4, max_length=13_981_016)]
