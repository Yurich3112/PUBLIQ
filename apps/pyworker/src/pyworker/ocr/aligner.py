"""Stage 4A: Deterministic 1:1 alignment between Stage 2 word boxes and Stage 3 tokens."""

from pyworker.contracts import OcrAlignedBy, OcrWord
from pyworker.ocr.interfaces import DetectedBox, GroupedLine, RecognizedLine, RecognizedToken


def _merge_boxes(
    a: tuple[int, int, int, int], b: tuple[int, int, int, int]
) -> tuple[int, int, int, int]:
    x0 = min(a[0], b[0])
    y0 = min(a[1], b[1])
    x1 = max(a[0] + a[2], b[0] + b[2])
    y1 = max(a[1] + a[3], b[1] + b[3])
    return (x0, y0, max(1, x1 - x0), max(1, y1 - y0))


def _reduce_boxes(
    boxes: list[tuple[int, int, int, int]], target: int
) -> list[tuple[int, int, int, int]]:
    """Greedily merge adjacent pairs with the smallest horizontal gap until len == target."""
    current = list(boxes)
    while len(current) > target and len(current) >= 2:
        best_idx = 0
        best_gap = float("inf")
        for idx in range(len(current) - 1):
            gap = current[idx + 1][0] - (current[idx][0] + current[idx][2])
            if gap < best_gap:
                best_gap = gap
                best_idx = idx
        merged = _merge_boxes(current[best_idx], current[best_idx + 1])
        current[best_idx : best_idx + 2] = [merged]
    return current


def _expand_boxes(
    boxes: list[tuple[int, int, int, int]],
    tokens: list[RecognizedToken],
) -> list[tuple[int, int, int, int]]:
    """Split widest boxes proportionally until len(boxes) == len(tokens)."""
    current = list(boxes)
    target = len(tokens)
    while len(current) < target:
        widest_idx = max(range(len(current)), key=lambda i: current[i][2])
        x, y, w, h = current[widest_idx]
        if w < 2:
            # Degenerate 1px box: duplicate rightmost coordinate with min width 1.
            current.insert(widest_idx + 1, (x + 1, y, 1, h))
            continue
        left_weight = max(1, len(tokens[min(widest_idx, target - 1)].text))
        right_weight = max(1, len(tokens[min(widest_idx + 1, target - 1)].text))
        split_w = max(1, min(w - 1, round(w * left_weight / (left_weight + right_weight))))
        left_box = (x, y, split_w, h)
        right_box = (x + split_w, y, max(1, w - split_w), h)
        current[widest_idx : widest_idx + 1] = [left_box, right_box]
    return current


def align_line_words(
    line: GroupedLine,
    recognized: RecognizedLine,
    *,
    page_index: int,
    start_word_index: int,
) -> list[OcrWord]:
    """Map recognized tokens 1:1 onto word bounding boxes with confidence adjustment."""
    tokens = [tok for tok in recognized.tokens if tok.text.strip()]
    if not tokens or not line.boxes:
        return []

    raw_boxes = [box.bbox for box in line.boxes]
    aligned_by: OcrAlignedBy
    if len(tokens) == len(raw_boxes):
        aligned_boxes = raw_boxes
        aligned_by = "exact"
    elif len(tokens) < len(raw_boxes):
        aligned_boxes = _reduce_boxes(raw_boxes, len(tokens))
        aligned_by = "merged_box"
    else:
        aligned_boxes = _expand_boxes(raw_boxes, tokens)
        aligned_by = "split_box"

    words: list[OcrWord] = []
    for offset, (token, bbox) in enumerate(zip(tokens, aligned_boxes, strict=True)):
        conf = max(0.0, min(1.0, token.confidence))
        if aligned_by == "merged_box":
            conf = round(conf * 0.92, 4)
        elif aligned_by == "split_box":
            conf = round(min(conf, 0.75), 4)
        else:
            conf = round(conf, 4)
        words.append(
            OcrWord(
                id=f"p{page_index}_w{start_word_index + offset}",
                line_id=line.line_id,
                text=token.text.strip(),
                bbox=bbox,
                confidence=conf,
                zone=line.zone,
                aligned_by=aligned_by,
            )
        )
    return words


def build_digital_words(
    boxes: list[tuple[str, tuple[int, int, int, int]]],
    *,
    line_id: str,
    page_index: int,
    start_word_index: int,
) -> list[OcrWord]:
    """Build exact high-confidence OcrWord entries for native selectable PDF text."""
    return [
        OcrWord(
            id=f"p{page_index}_w{start_word_index + offset}",
            line_id=line_id,
            text=text,
            bbox=bbox,
            confidence=0.99,
            zone="printed",
            aligned_by="digital_native",
        )
        for offset, (text, bbox) in enumerate(boxes)
    ]


def ensure_non_empty_boxes(boxes: list[DetectedBox]) -> list[DetectedBox]:
    return [b for b in boxes if b.bbox[2] > 0 and b.bbox[3] > 0]
