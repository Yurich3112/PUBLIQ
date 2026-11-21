"""Local-only inference for the UDIP worker. Results contain no model diagnostics."""

import base64
import os
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from threading import Lock

_pii_lock = Lock()
_ocr_lock = Lock()
_pii_types = {
    "private_person",
    "account_number",
    "private_url",
    "private_date",
    "private_address",
    "private_email",
    "private_phone",
    "other_pii",
    "secret",
}


class ModelUnavailable(Exception):
    pass


def _directory(key: str) -> Path:
    value = os.getenv(key)
    if not value or not (path := Path(value).resolve()).is_dir():
        raise ModelUnavailable()
    return path


@lru_cache(maxsize=1)
def _pii_model():
    path = _directory("UDIP_PII_MODEL_DIR")
    from transformers import AutoModel

    model = AutoModel.from_pretrained(str(path), trust_remote_code=True, local_files_only=True)
    return model.eval()


def detect_pii(text: str) -> list[dict]:
    if not _pii_lock.acquire(blocking=False):
        raise ModelUnavailable()
    try:
        model = _pii_model()
        utf16 = [0]
        for char in text:
            utf16.append(utf16[-1] + (2 if ord(char) > 0xFFFF else 1))
        # Keep below the tokenizer limit even for four UTF-8 bytes per character.
        window, overlap = 900, 160
        spans = set()
        for offset in range(0, len(text), window - overlap):
            chunk = text[offset : offset + window]
            predicted, _ = model.predict(chunk)
            for span in predicted:
                if 0 <= span.start < span.end <= len(chunk) and span.label in _pii_types:
                    spans.add((utf16[offset + span.start], utf16[offset + span.end], span.label))
            if offset + window >= len(text):
                break
        return [{"range": [start, end], "kind": kind} for start, end, kind in sorted(spans)[:2000]]
    finally:
        _pii_lock.release()


@lru_cache(maxsize=1)
def _ocr_model():
    detection = _directory("UDIP_OCR_DET_MODEL_DIR")
    recognition = _directory("UDIP_OCR_REC_MODEL_DIR")
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    from paddleocr import PaddleOCR
    from paddlex.inference import load_pipeline_config

    config = load_pipeline_config("OCR")
    config["SubModules"]["TextDetection"]["model_dir"] = str(detection)
    config["SubModules"]["TextRecognition"]["model_dir"] = str(recognition)
    return PaddleOCR(
        lang="pl",
        ocr_version="PP-OCRv5",
        device="cpu",
        cpu_threads=2,
        enable_mkldnn=False,
        paddlex_config=config,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        text_det_limit_side_len=1600,
        text_det_limit_type="max",
        return_word_box=True,
        text_rec_score_thresh=0.5,
    )


def _page_words(result: Mapping, width: int, height: int) -> list[dict]:
    words = []
    for line, boxes in zip(
        result.get("text_word", []), result.get("text_word_boxes", []), strict=False
    ):
        for word, box in zip(line, boxes, strict=False):
            if not isinstance(word, str) or not word.strip() or len(word) > 250 or len(box) != 4:
                continue
            x0, y0, x1, y1 = map(int, box)
            if 0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height:
                words.append({"text": word, "box": [x0, y0, x1 - x0, y1 - y0]})
    return words


def read_pdf_scan(content_base64: str) -> dict:
    if not _ocr_lock.acquire(blocking=False):
        raise ModelUnavailable()
    try:
        model = _ocr_model()
        import numpy as np
        import pymupdf

        lines, pages = [], []
        word_count = 0
        with pymupdf.open(
            stream=base64.b64decode(content_base64, validate=True), filetype="pdf"
        ) as document:
            if document.needs_pass or not 1 <= len(document) <= 20:
                raise ValueError("Unsupported scan")
            for number, page in enumerate(document, 1):
                scale = min(2.5, 2700 / max(page.rect.width, page.rect.height))
                raster = page.get_pixmap(
                    matrix=pymupdf.Matrix(scale, scale), colorspace=pymupdf.csRGB
                )
                image = np.frombuffer(raster.samples, dtype=np.uint8)
                image = image.reshape(raster.height, raster.width, 3)[:, :, ::-1].copy()
                for result in model.predict(image):
                    lines.extend(result["rec_texts"])
                    words = _page_words(result, raster.width, raster.height)[: 5000 - word_count]
                    word_count += len(words)
                    pages.append(
                        {
                            "page": number,
                            "width": raster.width,
                            "height": raster.height,
                            "words": words,
                        }
                    )
        text = "\n".join(lines).strip()
        if len(text.encode("utf-16-le")) // 2 > 100_000:
            raise ValueError("Scan text exceeds limit")
        return {"text": text, "pages": pages}
    finally:
        _ocr_lock.release()
