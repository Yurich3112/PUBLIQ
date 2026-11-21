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


def _detect_grid_angle(binary: Any) -> float:
    """Estimate small scan skew (-3°..+3°) maximizing row/column grid projection sharpness."""
    import cv2
    import numpy as np

    height, width = binary.shape[:2]
    scale = min(1.0, 900.0 / max(height, width))
    small = cv2.resize(
        binary,
        (max(1, int(width * scale)), max(1, int(height * scale))),
        interpolation=cv2.INTER_AREA,
    )
    small_bin = (small > 40).astype(np.uint8)
    sh, sw = small_bin.shape
    center = (sw / 2.0, sh / 2.0)

    best_angle = 0.0
    best_score = -1.0
    for step, lo, hi in ((0.25, -3.0, 3.0), (0.05, None, None)):
        start = best_angle - 0.3 if lo is None else lo
        stop = best_angle + 0.3 if hi is None else hi
        angle = start
        while angle <= stop + 1e-6:
            matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(small_bin, matrix, (sw, sh), flags=cv2.INTER_NEAREST)
            r_proj = rotated.sum(axis=1, dtype=np.float64)
            c_proj = rotated.sum(axis=0, dtype=np.float64)
            score = float((r_proj * r_proj).sum() + (c_proj * c_proj).sum())
            if score > best_score:
                best_score = score
                best_angle = angle
            angle += step
    return best_angle


def erase_graph_grid(image_rgb: Any) -> tuple[Any, bool]:
    """Remove periodic (even slightly skewed) graph-paper grid lines while preserving ink.

    Returns (cleaned_rgb, grid_removed) in the original image coordinate space.
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

    angle = _detect_grid_angle(binary)
    center = (width / 2.0, height / 2.0)
    m_fwd = cv2.getRotationMatrix2D(center, angle, 1.0)
    m_inv = cv2.getRotationMatrix2D(center, -angle, 1.0)
    rot_bin = cv2.warpAffine(binary, m_fwd, (width, height), flags=cv2.INTER_NEAREST)

    h_closed = cv2.morphologyEx(
        rot_bin, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 1))
    )
    v_closed = cv2.morphologyEx(
        rot_bin, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 7))
    )

    h_kernel_len = max(45, width // 26)
    v_kernel_len = max(45, height // 30)
    h_lines = cv2.morphologyEx(
        h_closed, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (h_kernel_len, 1))
    )
    v_lines = cv2.morphologyEx(
        v_closed, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, v_kernel_len))
    )

    h_proj = (h_lines > 0).sum(axis=1)
    v_proj = (v_lines > 0).sum(axis=0)

    h_peaks = _find_periodic_peaks(h_proj, min_value=width * 0.18, min_gap=12)
    v_peaks = _find_periodic_peaks(v_proj, min_value=height * 0.18, min_gap=12)

    if not (_is_periodic_grid(h_peaks) and _is_periodic_grid(v_peaks)):
        return image_rgb, False

    # Build a tight 3px band strictly along confirmed periodic grid lines, then rotate back.
    rot_grid_band = np.zeros_like(rot_bin)
    for y in h_peaks:
        rot_grid_band[max(0, y - 1) : min(height, y + 2), :] = 255
    for x in v_peaks:
        rot_grid_band[:, max(0, x - 1) : min(width, x + 2)] = 255

    grid_band = cv2.warpAffine(rot_grid_band, m_inv, (width, height), flags=cv2.INTER_NEAREST)
    hv_orig = cv2.warpAffine(
        cv2.bitwise_or(h_lines, v_lines), m_inv, (width, height), flags=cv2.INTER_NEAREST
    )
    grid_pixels = cv2.bitwise_and(binary, cv2.bitwise_or(grid_band, hv_orig))

    # Protect real pen ink strokes and their narrow crossing junctions.
    non_grid_ink = cv2.subtract(binary, grid_band)
    non_grid_ink = cv2.morphologyEx(
        non_grid_ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    )
    ink_protect = cv2.dilate(
        non_grid_ink, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)), iterations=1
    )

    pure_grid = cv2.subtract(grid_pixels, ink_protect)
    pure_grid_clean = cv2.subtract(
        cv2.dilate(pure_grid, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1),
        ink_protect,
    )

    cleaned = image_rgb.copy()
    cleaned[pure_grid_clean > 0] = (255, 255, 255)

    # Clear tiny isolated residual grid dots / 1-3px dashes far from real ink.
    c_gray = cv2.cvtColor(cleaned, cv2.COLOR_RGB2GRAY)
    c_bin = (c_gray < 210).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(c_bin, connectivity=8)
    speckle_mask = np.zeros_like(c_bin)
    for lbl in range(1, num_labels):
        area = int(stats[lbl, cv2.CC_STAT_AREA])
        bw = int(stats[lbl, cv2.CC_STAT_WIDTH])
        bh = int(stats[lbl, cv2.CC_STAT_HEIGHT])
        if (
            area <= 10
            or (bw <= 3 and bh >= 14 and area <= bw * bh * 0.9)
            or (bh <= 3 and bw >= 14 and area <= bw * bh * 0.9)
        ):
            speckle_mask[labels == lbl] = 1
    cleaned[speckle_mask > 0] = (255, 255, 255)
    return cleaned, True
