"""Stage 4B: Kancelaria intake stamp metadata parser (received_date & registry_number)."""

import datetime as dt
import re

from pyworker.contracts import StampMetadata

DMY_PATTERN = re.compile(r"\b(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(20\d{2})\b")
YMD_PATTERN = re.compile(r"\b(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\b")
REGISTRY_PATTERN = re.compile(r"\b(\d{1,6}\s*/\s*20\d{2})\b")


def _extract_iso_date(text: str) -> str | None:
    for match in YMD_PATTERN.finditer(text):
        year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
        try:
            return dt.date(year, month, day).isoformat()
        except ValueError:
            continue
    for match in DMY_PATTERN.finditer(text):
        day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        try:
            return dt.date(year, month, day).isoformat()
        except ValueError:
            continue
    return None


def _extract_registry_number(text: str) -> str | None:
    match = REGISTRY_PATTERN.search(text)
    return re.sub(r"\s+", "", match.group(1)) if match else None


def parse_stamp_metadata(
    stamp_lines: list[str],
    *,
    header_fallback_lines: list[str] | None = None,
) -> StampMetadata:
    """Extract ISO received_date and registry_number from Kancelaria stamp lines."""
    received_date: str | None = None
    registry_number: str | None = None

    prioritized = sorted(
        stamp_lines,
        key=lambda line: (
            0 if any(k in line.lower() for k in ("wpływ", "wplyw", "data", "nr")) else 1
        ),
    )

    for line in prioritized:
        if received_date is None:
            received_date = _extract_iso_date(line)
        if registry_number is None:
            registry_number = _extract_registry_number(line)

    if (received_date is None or registry_number is None) and header_fallback_lines:
        joined = "\n".join(header_fallback_lines)
        for line in header_fallback_lines:
            lower = line.lower()
            if received_date is None and (
                "wpływ" in lower or "wplyw" in lower or "bydgoszcz" in lower or "referat" in lower
            ):
                received_date = _extract_iso_date(line)
            if registry_number is None and (
                "wpływ" in lower or "wplyw" in lower or "nr" in lower or "referat" in lower
            ):
                registry_number = _extract_registry_number(line)
        if received_date is None:
            received_date = _extract_iso_date(joined)
        if registry_number is None:
            registry_number = _extract_registry_number(joined)

    return StampMetadata(
        received_date=received_date,
        registry_number=registry_number,
        raw_stamp_lines=[line for line in stamp_lines if line.strip()],
    )
