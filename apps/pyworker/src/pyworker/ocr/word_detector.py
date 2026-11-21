"""Stage 2A: Lightweight word-level bounding-box detector with gap splitting."""

from typing import Any

from pyworker.ocr.interfaces import DetectedBox


def _split_wide_box_by_projection(
    binary_inv: Any,
    bbox: tuple[int, int, int, int],
    score: float,
    text: str | None = None,
) -> list[DetectedBox]:
    """Subdivide a multi-word region into individual word boxes using adaptive vertical ink gaps."""
    import numpy as np

    x, y, w, h = bbox
    if h <= 0 or w < max(36, int(h * 1.5)):
        return [DetectedBox(bbox=bbox, score=score, text=text)]

    roi = binary_inv[y : y + h, x : x + w]
    if roi.size == 0:
        return [DetectedBox(bbox=bbox, score=score, text=text)]

    margin = max(0, int(h * 0.10))
    core = roi[margin : h - margin, :] if h - 2 * margin >= 8 else roi
    col_sum = (core > 0).sum(axis=0)
    ink_cols = col_sum > max(1, int(core.shape[0] * 0.04))

    runs: list[tuple[int, int]] = []
    in_seg = False
    seg_start = 0
    for idx, has_ink in enumerate(ink_cols):
        if has_ink and not in_seg:
            in_seg = True
            seg_start = idx
        elif not has_ink and in_seg:
            runs.append((seg_start, idx))
            in_seg = False
    if in_seg:
        runs.append((seg_start, w))
    if len(runs) <= 1:
        return [DetectedBox(bbox=bbox, score=score, text=text)]

    # Merge tiny intra-letter stroke breaks first.
    chars: list[tuple[int, int]] = [runs[0]]
    char_join = max(3, int(h * 0.05))
    for s0, s1 in runs[1:]:
        if s0 - chars[-1][1] <= char_join:
            chars[-1] = (chars[-1][0], s1)
        else:
            chars.append((s0, s1))
    if len(chars) <= 1:
        return [DetectedBox(bbox=bbox, score=score, text=text)]

    gaps = [chars[i + 1][0] - chars[i][1] for i in range(len(chars) - 1)]
    # Keep fine atomic sub-word ink chunks so Stage 4 DP alignment can merge
    # split fragments (e.g. BYD + GOSZCZ -> BYDGOSZCZ) using whole-line word context.
    min_word_gap = max(8, int(h * 0.16))
    pos_gaps = sorted(g for g in gaps if g > 0)
    if len(pos_gaps) >= 4:
        med = pos_gaps[len(pos_gaps) // 2]
        min_word_gap = max(min_word_gap, int(med * 1.45))
        min_word_gap = min(min_word_gap, max(12, int(h * 0.28)))

    word_spans: list[tuple[int, int]] = [chars[0]]
    for idx, (s0, s1) in enumerate(chars[1:]):
        if gaps[idx] >= min_word_gap:
            word_spans.append((s0, s1))
        else:
            word_spans[-1] = (word_spans[-1][0], s1)

    if len(word_spans) <= 1:
        return [DetectedBox(bbox=bbox, score=score, text=text)]

    sub_bboxes: list[tuple[int, int, int, int]] = []
    for s0, s1 in word_spans:
        sub_w = s1 - s0
        if sub_w < 5:
            continue
        sub_roi = roi[:, s0:s1]
        rows = np.nonzero((sub_roi > 0).sum(axis=1) > 0)[0]
        if len(rows) == 0:
            continue
        r0, r1 = int(rows[0]), int(rows[-1]) + 1
        sub_bboxes.append((x + s0, y + r0, sub_w, max(1, r1 - r0)))

    if not sub_bboxes:
        return [DetectedBox(bbox=bbox, score=score, text=text)]

    # Keep any recognized draft text attached to the first box if token counts differ,
    # or 1:1 when the word count matches the split box count.
    tokens = text.split() if text else []
    if len(tokens) == len(sub_bboxes):
        return [
            DetectedBox(bbox=bb, score=score, text=tok)
            for bb, tok in zip(sub_bboxes, tokens, strict=True)
        ]
    return [
        DetectedBox(bbox=bb, score=score, text=(text if idx == 0 else None))
        for idx, bb in enumerate(sub_bboxes)
    ]


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
            import logging

            logging.getLogger("RapidOCR").setLevel(logging.WARNING)
            try:
                from rapidocr import RapidOCR  # type: ignore[import-not-found]

                self._engine = RapidOCR(
                    params={
                        "Global.use_det": True,
                        "Global.use_cls": False,
                        "Global.use_rec": True,
                    }
                )
                self._engine_kind = "rapidocr_v3"
            except ImportError:
                from rapidocr_onnxruntime import RapidOCR  # type: ignore[import-not-found]

                self._engine = RapidOCR(use_det=True, use_cls=False, use_rec=True)
                self._engine_kind = "rapidocr_onnxruntime"
        return self._engine_kind, self._engine

    def _extract_regions(self, image_rgb: Any) -> list[tuple[Any, str | None, float]]:
        import cv2

        kind, engine = self._get_engine()
        bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        if kind == "rapidocr_v3":
            output = engine(bgr, use_det=True, use_cls=False, use_rec=True)
            raw_boxes = getattr(output, "boxes", None)
            if raw_boxes is None:
                return []
            boxes_list = list(raw_boxes)
            txts = list(output.txts) if getattr(output, "txts", None) is not None else []
            scores = list(output.scores) if getattr(output, "scores", None) is not None else []
            regions: list[tuple[Any, str | None, float]] = []
            for idx, poly in enumerate(boxes_list):
                txt = str(txts[idx]).strip() if idx < len(txts) and txts[idx] else None
                sc = float(scores[idx]) if idx < len(scores) else 0.90
                regions.append((poly, txt, max(0.0, min(1.0, sc))))
            return regions
        result, _elapse = engine(bgr, use_det=True, use_cls=False, use_rec=True)
        if not result:
            return []
        legacy: list[tuple[Any, str | None, float]] = []
        for item in result:
            if isinstance(item, (list, tuple)) and len(item) >= 3:
                legacy.append((item[0], str(item[1]).strip() or None, float(item[2])))
            elif isinstance(item, (list, tuple)) and len(item) >= 1:
                legacy.append((item[0], None, 0.90))
        return legacy

    def detect(self, image_rgb: Any) -> list[DetectedBox]:
        import cv2

        try:
            regions = self._extract_regions(image_rgb)
        except Exception:
            return self._fallback.detect(image_rgb)

        if not regions:
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
        for polygon, draft_text, score in regions:
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
            if w < 5 or h < 5:
                continue
            boxes.extend(
                _split_wide_box_by_projection(binary, (x0, y0, w, h), score, text=draft_text)
            )
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
