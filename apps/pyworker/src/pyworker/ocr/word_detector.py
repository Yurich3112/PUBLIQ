"""Stage 2A: Lightweight word-level bounding-box detector with gap splitting."""

from typing import Any

from pyworker.ocr.interfaces import DetectedBox


def _split_wide_box_by_projection(
    binary_inv: Any,
    bbox: tuple[int, int, int, int],
    score: float,
) -> list[DetectedBox]:
    """Subdivide a wide multi-word box into word boxes using vertical ink gaps."""
    import numpy as np

    x, y, w, h = bbox
    if h <= 0 or w < max(36, int(h * 2.2)):
        return [DetectedBox(bbox=bbox, score=score)]

    roi = binary_inv[y : y + h, x : x + w]
    if roi.size == 0:
        return [DetectedBox(bbox=bbox, score=score)]

    col_sum = (roi > 0).sum(axis=0)
    min_gap = max(8, int(h * 0.32))
    ink_cols = col_sum > max(1, int(h * 0.04))

    segments: list[tuple[int, int]] = []
    in_seg = False
    seg_start = 0
    zero_run = 0
    for idx, has_ink in enumerate(ink_cols):
        if has_ink:
            if not in_seg:
                in_seg = True
                seg_start = idx
            zero_run = 0
        elif in_seg:
            zero_run += 1
            if zero_run >= min_gap:
                seg_end = idx - zero_run + 1
                if seg_end > seg_start:
                    segments.append((seg_start, seg_end))
                in_seg = False
                zero_run = 0
    if in_seg:
        seg_end = int(np.nonzero(ink_cols)[0][-1]) + 1 if np.any(ink_cols) else w
        if seg_end > seg_start:
            segments.append((seg_start, seg_end))

    if len(segments) <= 1:
        return [DetectedBox(bbox=bbox, score=score)]

    result: list[DetectedBox] = []
    for s0, s1 in segments:
        sub_w = s1 - s0
        if sub_w < 3:
            continue
        sub_roi = roi[:, s0:s1]
        rows = np.nonzero((sub_roi > 0).sum(axis=1) > 0)[0]
        if len(rows) == 0:
            continue
        r0, r1 = int(rows[0]), int(rows[-1]) + 1
        result.append(DetectedBox(bbox=(x + s0, y + r0, sub_w, max(1, r1 - r0)), score=score))
    return result or [DetectedBox(bbox=bbox, score=score)]


class MorphologicalWordDetector:
    """Zero-weight OpenCV word detector fallback when ONNX weights are unavailable."""

    name = "opencv-morph-word-detector"

    def detect(self, image_rgb: Any) -> list[DetectedBox]:
        import cv2

        height, width = image_rgb.shape[:2]
        gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
        binary = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            25,
            12,
        )
        # Remove isolated 1-2px scanner speckles.
        cleaned = cv2.morphologyEx(
            binary, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        )
        # Dilate horizontally just enough to connect characters inside a word, not across words.
        char_join_w = max(7, min(18, width // 110))
        dilated = cv2.dilate(
            cleaned,
            cv2.getStructuringElement(cv2.MORPH_RECT, (char_join_w, 3)),
            iterations=1,
        )
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        boxes: list[DetectedBox] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            if w < 8 or h < 8:
                continue
            if w > width * 0.92 and h > height * 0.92:
                continue
            if h > height * 0.25 and w < 12:
                continue
            boxes.extend(_split_wide_box_by_projection(cleaned, (x, y, w, h), 0.90))
        return boxes


class RapidOcrWordDetector:
    """Lightweight ONNX DBNet text detector (~15 MB) with word-level gap splitting."""

    name = "rapidocr-dbnet-onnx"

    def __init__(self) -> None:
        self._engine: Any = None
        self._engine_kind: str = ""
        self._fallback = MorphologicalWordDetector()

    def _get_engine(self) -> tuple[str, Any]:
        if self._engine is None:
            try:
                from rapidocr import RapidOCR  # type: ignore[import-not-found]

                self._engine = RapidOCR(
                    params={
                        "Global.use_det": True,
                        "Global.use_cls": False,
                        "Global.use_rec": False,
                    }
                )
                self._engine_kind = "rapidocr_v3"
            except ImportError:
                from rapidocr_onnxruntime import RapidOCR  # type: ignore[import-not-found]

                self._engine = RapidOCR(use_det=True, use_cls=False, use_rec=False)
                self._engine_kind = "rapidocr_onnxruntime"
        return self._engine_kind, self._engine

    def _extract_polygons(self, image_rgb: Any) -> list[Any]:
        import cv2

        kind, engine = self._get_engine()
        bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        if kind == "rapidocr_v3":
            output = engine(bgr, use_det=True, use_cls=False, use_rec=False)
            raw_boxes = getattr(output, "boxes", None)
            if raw_boxes is None:
                return []
            return list(raw_boxes)
        result, _elapse = engine(bgr, use_det=True, use_cls=False, use_rec=False)
        if not result:
            return []
        return [
            item[0] if isinstance(item, (list, tuple)) and len(item) >= 1 else item
            for item in result
        ]

    def detect(self, image_rgb: Any) -> list[DetectedBox]:
        import cv2

        try:
            polygons = self._extract_polygons(image_rgb)
        except Exception:
            return self._fallback.detect(image_rgb)

        if not polygons:
            return self._fallback.detect(image_rgb)

        gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
        binary = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            25,
            12,
        )
        img_h, img_w = image_rgb.shape[:2]
        boxes: list[DetectedBox] = []
        for polygon in polygons:
            if polygon is None or len(polygon) == 0:
                continue
            xs = [int(round(float(pt[0]))) for pt in polygon]
            ys = [int(round(float(pt[1]))) for pt in polygon]
            x0 = max(0, min(xs))
            y0 = max(0, min(ys))
            x1 = min(img_w, max(xs))
            y1 = min(img_h, max(ys))
            w = x1 - x0
            h = y1 - y0
            if w < 4 or h < 4:
                continue
            boxes.extend(_split_wide_box_by_projection(binary, (x0, y0, w, h), 0.95))
        return boxes or self._fallback.detect(image_rgb)


WordDetectorProtocol = RapidOcrWordDetector | MorphologicalWordDetector


def create_default_word_detector() -> WordDetectorProtocol:
    """Prefer RapidOCR ONNX DBNet detector; fall back gracefully to OpenCV word detector."""
    try:
        import rapidocr  # type: ignore[import-not-found]  # noqa: F401

        return RapidOcrWordDetector()
    except ImportError:
        pass
    try:
        import rapidocr_onnxruntime  # type: ignore[import-not-found]  # noqa: F401

        return RapidOcrWordDetector()
    except ImportError:
        return MorphologicalWordDetector()
