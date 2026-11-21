"""End-to-end local OCR pipeline orchestrating Stages 0-4."""

from time import perf_counter
from typing import Any

from pyworker.config import Settings
from pyworker.contracts import (
    LegibilityReport,
    OcrEngineInfo,
    OcrLine,
    OcrOptions,
    OcrPage,
    OcrResponse,
    OcrSourceMode,
    OcrWord,
)
from pyworker.ocr.aligner import align_line_words, build_digital_words
from pyworker.ocr.grid_eraser import erase_graph_grid
from pyworker.ocr.ingest import ingest_document
from pyworker.ocr.interfaces import DetectedBox, IngestedPage, LineRecognizer, WordDetector
from pyworker.ocr.line_grouper import group_boxes_into_lines
from pyworker.ocr.ollama_recognizer import OllamaLineRecognizer
from pyworker.ocr.stamp_parser import parse_stamp_metadata
from pyworker.ocr.word_detector import create_default_word_detector


def _crop_with_padding(image_rgb: Any, bbox: tuple[int, int, int, int], pad: int = 10) -> Any:
    height, width = image_rgb.shape[:2]
    x, y, w, h = bbox
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(width, x + w + pad)
    y1 = min(height, y + h + pad)
    return image_rgb[y0:y1, x0:x1]


def _compute_legibility(
    body_words: list[OcrWord],
    *,
    low_conf_threshold: float,
    min_avg_confidence: float,
) -> LegibilityReport:
    if not body_words:
        return LegibilityReport(
            status="illegible_review_required",
            average_confidence=0.0,
            low_confidence_ratio=1.0,
            recommend_clarification=True,
            reason="Nie wykryto czytelnych słów w treści wniosku.",
        )

    avg = sum(word.confidence for word in body_words) / len(body_words)
    low_count = sum(1 for word in body_words if word.confidence < low_conf_threshold)
    low_ratio = low_count / len(body_words)
    illegible = avg < min_avg_confidence or low_ratio > 0.50

    return LegibilityReport(
        status="illegible_review_required" if illegible else "legible",
        average_confidence=round(avg, 4),
        low_confidence_ratio=round(low_ratio, 4),
        recommend_clarification=illegible,
        reason=(
            "Niska pewność odczytu pisma ręcznego — rozważ wezwanie do doprecyzowania."
            if illegible
            else None
        ),
    )


class OcrPipeline:
    """Air-gapped multi-stage OCR pipeline with injectable detector and VLM recognizer."""

    def __init__(
        self,
        settings: Settings,
        *,
        detector: WordDetector | None = None,
        recognizer: LineRecognizer | None = None,
    ) -> None:
        self._settings = settings
        self._detector = detector or create_default_word_detector()
        self._recognizer = recognizer or OllamaLineRecognizer(
            base_url=settings.ollama_url,
            model=settings.ocr_vlm_model,
            timeout_seconds=settings.ocr_timeout,
        )

    async def is_ready(self) -> bool:
        return await self._recognizer.is_ready()

    async def _process_digital_page(
        self, page: IngestedPage
    ) -> tuple[OcrPage, list[str], list[str]]:
        boxes = [DetectedBox(bbox=item.bbox, score=1.0) for item in page.digital_words]
        box_to_text = {item.bbox: item.text for item in page.digital_words}
        grouped = group_boxes_into_lines(
            boxes,
            page_index=page.page_index,
            image_rgb=None,
            default_zone="printed",
        )
        all_words: list[OcrWord] = []
        lines: list[OcrLine] = []
        body_lines: list[str] = []
        for grp in grouped:
            pairs = [(box_to_text.get(b.bbox, ""), b.bbox) for b in grp.boxes]
            pairs = [(t, bb) for t, bb in pairs if t]
            line_words = build_digital_words(
                pairs,
                line_id=grp.line_id,
                page_index=page.page_index,
                start_word_index=len(all_words),
            )
            if not line_words:
                continue
            line_text = " ".join(w.text for w in line_words)
            all_words.extend(line_words)
            lines.append(
                OcrLine(
                    line_id=grp.line_id,
                    zone="printed",
                    bbox=grp.bbox,
                    text=line_text,
                    word_ids=[w.id for w in line_words],
                )
            )
            body_lines.append(line_text)
        return (
            OcrPage(
                page_index=page.page_index,
                width=page.width,
                height=page.height,
                source_mode="digital_text",
                grid_removed=False,
                preview_image_data_url=page.preview_image_data_url,
                lines=lines,
                words=all_words,
            ),
            body_lines,
            [],
        )

    async def _process_scanned_page(
        self, page: IngestedPage
    ) -> tuple[OcrPage, list[str], list[str], list[str]]:
        cleaned_rgb, grid_removed = erase_graph_grid(page.image_rgb)
        detected = self._detector.detect(cleaned_rgb)
        default_zone = "handwriting" if grid_removed else "handwriting"
        grouped = group_boxes_into_lines(
            detected,
            page_index=page.page_index,
            image_rgb=page.image_rgb,
            default_zone=default_zone,
        )

        all_words: list[OcrWord] = []
        lines: list[OcrLine] = []
        body_lines: list[str] = []
        stamp_lines: list[str] = []
        header_lines: list[str] = []

        for idx, grp in enumerate(grouped):
            # Use original image for stamps so frame/barcode text is untouched; cleaned for body.
            source_img = page.image_rgb if grp.zone == "stamp" else cleaned_rgb
            crop = _crop_with_padding(source_img, grp.bbox)
            recognized = await self._recognizer.recognize_line(
                crop, zone=grp.zone, expected_words=len(grp.boxes)
            )
            line_words = align_line_words(
                grp,
                recognized,
                page_index=page.page_index,
                start_word_index=len(all_words),
            )
            if not line_words:
                continue
            line_text = " ".join(w.text for w in line_words)
            all_words.extend(line_words)
            lines.append(
                OcrLine(
                    line_id=grp.line_id,
                    zone=grp.zone,
                    bbox=grp.bbox,
                    text=line_text,
                    word_ids=[w.id for w in line_words],
                )
            )
            if grp.zone == "stamp":
                stamp_lines.append(line_text)
            else:
                body_lines.append(line_text)
                if idx < 6:
                    header_lines.append(line_text)

        source_mode: OcrSourceMode = "handwritten_ocr" if grid_removed else "printed_ocr"
        if any(line.zone == "handwriting" for line in lines):
            source_mode = "handwritten_ocr"

        return (
            OcrPage(
                page_index=page.page_index,
                width=page.width,
                height=page.height,
                source_mode=source_mode,
                grid_removed=grid_removed,
                preview_image_data_url=page.preview_image_data_url,
                lines=lines,
                words=all_words,
            ),
            body_lines,
            stamp_lines,
            header_lines,
        )

    async def process_document(
        self,
        data: bytes,
        *,
        options: OcrOptions | None = None,
    ) -> OcrResponse:
        started = perf_counter()
        opts = options or OcrOptions()
        page_cap = min(opts.max_pages or self._settings.ocr_max_pages, self._settings.ocr_max_pages)
        ingested = ingest_document(
            data,
            max_pages=page_cap,
            include_preview=opts.include_preview_images,
        )

        ocr_pages: list[OcrPage] = []
        assembled_lines: list[str] = []
        stamp_lines: list[str] = []
        header_lines: list[str] = []
        body_words: list[OcrWord] = []

        for page in ingested:
            if page.digital_words:
                ocr_page, p_body, p_stamps = await self._process_digital_page(page)
                p_headers = p_body[:6]
            else:
                ocr_page, p_body, p_stamps, p_headers = await self._process_scanned_page(page)
            ocr_pages.append(ocr_page)
            assembled_lines.extend(p_body)
            stamp_lines.extend(p_stamps)
            if page.page_index == 0:
                header_lines.extend(p_headers)
            body_words.extend(w for w in ocr_page.words if w.zone != "stamp")

        stamp_metadata = parse_stamp_metadata(stamp_lines, header_fallback_lines=header_lines)
        legibility = _compute_legibility(
            body_words,
            low_conf_threshold=self._settings.ocr_low_confidence_threshold,
            min_avg_confidence=self._settings.ocr_legibility_min_avg,
        )
        duration_ms = round((perf_counter() - started) * 1000)

        return OcrResponse(
            engine=OcrEngineInfo(
                detector=self._detector.name,
                recognizer=self._recognizer.name,
            ),
            duration_ms=duration_ms,
            page_count=len(ocr_pages),
            assembled_text="\n".join(assembled_lines),
            stamp_metadata=stamp_metadata,
            legibility=legibility,
            pages=ocr_pages,
        )
