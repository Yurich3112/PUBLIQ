"""Stage 2B: Reading-order line grouper and stamp/handwriting zone classifier."""

from typing import Any

from pyworker.contracts import OcrZone
from pyworker.ocr.interfaces import DetectedBox, GroupedLine


def _union_bbox(boxes: list[DetectedBox]) -> tuple[int, int, int, int]:
    x0 = min(b.bbox[0] for b in boxes)
    y0 = min(b.bbox[1] for b in boxes)
    x1 = max(b.bbox[0] + b.bbox[2] for b in boxes)
    y1 = max(b.bbox[1] + b.bbox[3] for b in boxes)
    return (x0, y0, max(1, x1 - x0), max(1, y1 - y0))


def _same_line(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    ay0, ah = a[1], a[3]
    by0, bh = b[1], b[3]
    ay1, by1 = ay0 + ah, by0 + bh
    overlap = min(ay1, by1) - max(ay0, by0)
    min_h = max(1, min(ah, bh))
    if overlap / min_h >= 0.42:
        return True
    ac = ay0 + ah / 2.0
    bc = by0 + bh / 2.0
    return abs(ac - bc) <= min_h * 0.55


def _detect_stamp_regions(image_rgb: Any) -> list[tuple[int, int, int, int]]:
    """Detect rectangular Kancelaria stamp frames and barcode stickers in upper half."""
    try:
        import cv2
    except ImportError:
        return []

    height, width = image_rgb.shape[:2]
    if height < 200 or width < 200:
        return []

    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    regions: list[tuple[int, int, int, int]] = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area_ratio = (w * h) / (width * height)
        # Typical Kancelaria stamp or barcode sticker: upper 45% of page, 1.5%-15% page area.
        if y > height * 0.45:
            continue
        if not (0.015 <= area_ratio <= 0.16):
            continue
        aspect = w / max(1, h)
        if 1.1 <= aspect <= 3.8:
            regions.append((x, y, w, h))
    return regions


def _inside_region(
    bbox: tuple[int, int, int, int],
    regions: list[tuple[int, int, int, int]],
) -> bool:
    cx = bbox[0] + bbox[2] / 2.0
    cy = bbox[1] + bbox[3] / 2.0
    for rx, ry, rw, rh in regions:
        if rx - 12 <= cx <= rx + rw + 12 and ry - 12 <= cy <= ry + rh + 12:
            return True
    return False


def group_boxes_into_lines(
    boxes: list[DetectedBox],
    *,
    page_index: int,
    image_rgb: Any | None = None,
    default_zone: OcrZone = "handwriting",
) -> list[GroupedLine]:
    """Cluster word boxes into top-to-bottom left-to-right lines and tag stamp zones."""
    if not boxes:
        return []

    stamp_regions = _detect_stamp_regions(image_rgb) if image_rgb is not None else []
    sorted_boxes = sorted(boxes, key=lambda item: (item.bbox[1], item.bbox[0]))

    clusters: list[tuple[OcrZone, list[DetectedBox]]] = []
    for box in sorted_boxes:
        zone: OcrZone = "stamp" if _inside_region(box.bbox, stamp_regions) else default_zone
        placed = False
        for cluster_zone, cluster_boxes in clusters:
            if cluster_zone != zone:
                continue
            ref_bbox = _union_bbox(cluster_boxes)
            if _same_line(ref_bbox, box.bbox):
                cluster_boxes.append(box)
                placed = True
                break
        if not placed:
            clusters.append((zone, [box]))

    lines: list[GroupedLine] = []
    for zone, cluster_boxes in clusters:
        ordered = sorted(cluster_boxes, key=lambda item: item.bbox[0])
        lines.append(
            GroupedLine(
                line_id="",
                zone=zone,
                bbox=_union_bbox(ordered),
                boxes=ordered,
            )
        )

    lines.sort(key=lambda line: (line.bbox[1], line.bbox[0]))
    for idx, line in enumerate(lines):
        line.line_id = f"p{page_index}_l{idx}"
    return lines
