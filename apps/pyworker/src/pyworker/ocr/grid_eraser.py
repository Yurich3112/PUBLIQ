"""Stage 1: OpenCV morphological graph-paper grid eraser preserving handwritten ink."""

from typing import Any


def _find_periodic_peaks(projection, *, min_value: float, min_gap: int = 10) -> list[int]:
    """Extract 1D peak centers separated by at least min_gap pixels."""
    peaks: list[int] = []
    length = len(projection)
    idx = 0
    while idx < length:
        if projection[idx] >= min_value:
            start = idx
            while idx < length and projection[idx] >= min_value:
                idx += 1
            center = (start + idx - 1) // 2
            if not peaks or center - peaks[-1] >= min_gap:
                peaks.append(center)
        else:
            idx += 1
    return peaks


def _is_periodic_grid(peaks: list[int], *, min_lines: int = 5) -> bool:
    """Confirm peaks form a repeating graph-paper grid rather than isolated rules."""
    if len(peaks) < min_lines:
        return False
    diffs = [peaks[i + 1] - peaks[i] for i in range(len(peaks) - 1)]
    valid_diffs = [d for d in diffs if 12 <= d <= 120]
    if len(valid_diffs) < min_lines - 1:
        return False
    valid_diffs.sort()
    median = valid_diffs[len(valid_diffs) // 2]
    if median <= 0:
        return False
    consistent = sum(1 for d in valid_diffs if abs(d - median) <= max(4, median * 0.25))
    return consistent >= max(4, int(len(valid_diffs) * 0.55))


def erase_graph_grid(image_rgb: Any) -> tuple[Any, bool]:
    """Remove periodic graph-paper grid lines while keeping pen strokes intact.

    Returns (cleaned_rgb, grid_removed).
    """
    import cv2
    import numpy as np

    height, width = image_rgb.shape[:2]
    if height < 120 or width < 120:
        return image_rgb, False

    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    binary = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_MEAN_C,
        cv2.THRESH_BINARY_INV,
        21,
        10,
    )

    h_kernel_len = max(45, width // 28)
    v_kernel_len = max(45, height // 32)
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (h_kernel_len, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_kernel_len))

    h_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, h_kernel)
    v_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, v_kernel)

    h_proj = (h_lines > 0).sum(axis=1)
    v_proj = (v_lines > 0).sum(axis=0)

    h_peaks = _find_periodic_peaks(h_proj, min_value=width * 0.22)
    v_peaks = _find_periodic_peaks(v_proj, min_value=height * 0.22)

    if not (_is_periodic_grid(h_peaks) and _is_periodic_grid(v_peaks)):
        return image_rgb, False

    # Build a thin mask restricted to confirmed grid lines so straight pen strokes survive.
    grid_mask = cv2.bitwise_or(h_lines, v_lines)
    thick_ink_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    non_grid_ink = cv2.subtract(binary, grid_mask)
    ink_neighborhood = cv2.dilate(non_grid_ink, thick_ink_kernel, iterations=1)

    # Erase pure background grid lines directly; inpaint only narrow intersections with ink.
    pure_grid = cv2.subtract(grid_mask, ink_neighborhood)
    intersections = cv2.bitwise_and(grid_mask, ink_neighborhood)

    cleaned = image_rgb.copy()
    cleaned[pure_grid > 0] = (255, 255, 255)

    if int(np.count_nonzero(intersections)) > 0:
        dilated_pure = cv2.dilate(
            pure_grid, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1
        )
        # Mild Telea inpainting bridges tiny breaks where grid crossed ink strokes.
        cleaned = cv2.inpaint(cleaned, dilated_pure, inpaintRadius=2, flags=cv2.INPAINT_TELEA)

    return cleaned, True
