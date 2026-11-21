"""Versioned input/output for an idempotent diagnostic task."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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


class UdipPiiRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: Annotated[str, Field(min_length=1, max_length=260_000)]


class UdipOcrRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    content_base64: Annotated[str, Field(min_length=4, max_length=13_981_016)]
