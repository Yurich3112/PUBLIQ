"""Stage 0: Document magic-byte validation, digital-PDF fast-path, and scan rasterization."""

import base64
import io
from typing import Literal

from pyworker.ocr.interfaces import (
    DigitalWord,
    IngestedPage,
    InvalidDocumentError,
    UnsupportedMediaError,
)

FileKind = Literal["pdf", "png", "jpeg"]

MAX_RENDER_LONG_EDGE = 2400
MAX_PREVIEW_WIDTH = 1600
DIGITAL_TEXT_MIN_CHARS = 20
RENDER_DPI = 200


def detect_file_kind(data: bytes) -> FileKind:
    """Validate file type strictly from leading magic bytes."""
    if len(data) >= 5 and data[:5] == b"%PDF-":
        return "pdf"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    raise UnsupportedMediaError("unsupported_media_type")


def _encode_preview_data_url(image_pil) -> str:
    from PIL import Image

    preview = image_pil
    if preview.width > MAX_PREVIEW_WIDTH:
        ratio = MAX_PREVIEW_WIDTH / preview.width
        preview = preview.resize(
            (MAX_PREVIEW_WIDTH, max(1, round(preview.height * ratio))),
            Image.Resampling.LANCZOS,
        )
    buffer = io.BytesIO()
    preview.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _resize_to_budget(image_pil):
    from PIL import Image

    longest = max(image_pil.width, image_pil.height)
    if longest <= MAX_RENDER_LONG_EDGE:
        return image_pil, 1.0
    scale = MAX_RENDER_LONG_EDGE / longest
    resized = image_pil.resize(
        (max(1, round(image_pil.width * scale)), max(1, round(image_pil.height * scale))),
        Image.Resampling.LANCZOS,
    )
    return resized, scale


def _ingest_image(data: bytes, *, include_preview: bool) -> list[IngestedPage]:
    import numpy as np
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(data)) as raw:
            oriented = ImageOps.exif_transpose(raw)
            rgb = oriented.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError):
        raise InvalidDocumentError("invalid_document") from None

    if rgb.width < 1 or rgb.height < 1:
        raise InvalidDocumentError("invalid_document")
    resized, _scale = _resize_to_budget(rgb)
    preview = _encode_preview_data_url(resized) if include_preview else None
    return [
        IngestedPage(
            page_index=0,
            width=resized.width,
            height=resized.height,
            image_rgb=np.asarray(resized, dtype=np.uint8),
            preview_image_data_url=preview,
            digital_words=[],
        )
    ]


def _ingest_pdf_pymupdf(
    data: bytes, *, max_pages: int, include_preview: bool
) -> list[IngestedPage]:
    import fitz  # type: ignore[import-not-found]
    import numpy as np
    from PIL import Image

    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise InvalidDocumentError("invalid_document") from None

    with doc:
        page_count = doc.page_count
        if page_count < 1:
            raise InvalidDocumentError("invalid_document")
        if page_count > max_pages:
            raise InvalidDocumentError("page_limit_exceeded")

        pages: list[IngestedPage] = []
        zoom = RENDER_DPI / 72.0
        for index in range(page_count):
            page = doc.load_page(index)
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            pil_image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            resized, resize_scale = _resize_to_budget(pil_image)
            total_scale = zoom * resize_scale

            raw_words = page.get_text("words")
            extracted: list[DigitalWord] = []
            char_total = 0
            for item in raw_words:
                x0, y0, x1, y1, word_text = item[0], item[1], item[2], item[3], str(item[4]).strip()
                if not word_text:
                    continue
                char_total += len(word_text)
                bx = max(0, int(round(x0 * total_scale)))
                by = max(0, int(round(y0 * total_scale)))
                bw = max(1, int(round((x1 - x0) * total_scale)))
                bh = max(1, int(round((y1 - y0) * total_scale)))
                extracted.append(DigitalWord(text=word_text, bbox=(bx, by, bw, bh)))

            digital_words = extracted if char_total >= DIGITAL_TEXT_MIN_CHARS else []
            preview = _encode_preview_data_url(resized) if include_preview else None
            pages.append(
                IngestedPage(
                    page_index=index,
                    width=resized.width,
                    height=resized.height,
                    image_rgb=np.asarray(resized, dtype=np.uint8),
                    preview_image_data_url=preview,
                    digital_words=digital_words,
                )
            )
        return pages


def _extract_pypdfium_words(textpage, *, page_h: float, total_scale: float) -> list[DigitalWord]:
    full_text = textpage.get_text_bounded().strip()
    if len("".join(full_text.split())) < DIGITAL_TEXT_MIN_CHARS:
        return []

    digital_words: list[DigitalWord] = []
    buf_chars: list[str] = []
    buf_boxes: list[tuple[float, float, float, float]] = []

    def flush_word() -> None:
        if not buf_chars or not buf_boxes:
            buf_chars.clear()
            buf_boxes.clear()
            return
        word_str = "".join(buf_chars).strip()
        if word_str:
            left = min(b[0] for b in buf_boxes)
            bottom = min(b[1] for b in buf_boxes)
            right = max(b[2] for b in buf_boxes)
            top = max(b[3] for b in buf_boxes)
            bx = max(0, int(round(left * total_scale)))
            by = max(0, int(round((page_h - top) * total_scale)))
            bw = max(1, int(round((right - left) * total_scale)))
            bh = max(1, int(round((top - bottom) * total_scale)))
            digital_words.append(DigitalWord(text=word_str, bbox=(bx, by, bw, bh)))
        buf_chars.clear()
        buf_boxes.clear()

    for char_idx in range(textpage.count_chars()):
        ch = textpage.get_text_range(char_idx, 1)
        if not ch or ch.isspace():
            flush_word()
            continue
        try:
            box = textpage.get_charbox(char_idx)
        except Exception:
            continue
        buf_chars.append(ch)
        buf_boxes.append(box)
    flush_word()
    return digital_words


def _ingest_pdf_pypdfium2(
    data: bytes, *, max_pages: int, include_preview: bool
) -> list[IngestedPage]:
    import numpy as np
    import pypdfium2 as pdfium  # type: ignore[import-not-found]

    try:
        doc = pdfium.PdfDocument(data)
    except Exception:
        raise InvalidDocumentError("invalid_document") from None

    try:
        page_count = len(doc)
        if page_count < 1:
            raise InvalidDocumentError("invalid_document")
        if page_count > max_pages:
            raise InvalidDocumentError("page_limit_exceeded")

        pages: list[IngestedPage] = []
        scale = RENDER_DPI / 72.0
        for index in range(page_count):
            page = doc[index]
            _page_w, page_h = page.get_size()
            bitmap = page.render(scale=scale)
            pil_image = bitmap.to_pil().convert("RGB")
            resized, resize_scale = _resize_to_budget(pil_image)
            total_scale = scale * resize_scale

            textpage = page.get_textpage()
            digital_words = _extract_pypdfium_words(
                textpage, page_h=page_h, total_scale=total_scale
            )
            preview = _encode_preview_data_url(resized) if include_preview else None
            pages.append(
                IngestedPage(
                    page_index=index,
                    width=resized.width,
                    height=resized.height,
                    image_rgb=np.asarray(resized, dtype=np.uint8),
                    preview_image_data_url=preview,
                    digital_words=digital_words,
                )
            )
        return pages
    finally:
        doc.close()


def ingest_document(
    data: bytes,
    *,
    max_pages: int = 10,
    include_preview: bool = True,
) -> list[IngestedPage]:
    """Validate magic bytes and convert PDF/PNG/JPEG into bounded page descriptors."""
    if not data:
        raise InvalidDocumentError("invalid_document")
    kind = detect_file_kind(data)
    if kind in {"png", "jpeg"}:
        return _ingest_image(data, include_preview=include_preview)
    try:
        return _ingest_pdf_pypdfium2(data, max_pages=max_pages, include_preview=include_preview)
    except ImportError:
        return _ingest_pdf_pymupdf(data, max_pages=max_pages, include_preview=include_preview)
