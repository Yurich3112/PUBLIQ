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


def _merge_span(boxes: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes)
    y1 = max(b[1] + b[3] for b in boxes)
    return (x0, y0, max(1, x1 - x0), max(1, y1 - y0))


def _reduce_boxes(
    boxes: list[tuple[int, int, int, int]],
    tokens: list[RecognizedToken],
) -> list[tuple[int, int, int, int]]:
    """Merge atomic ink chunks into word boxes via character-width + gap-aware DP."""
    m = len(boxes)
    k = len(tokens)
    if k <= 0 or m <= 0:
        return []
    if k == 1:
        return [_merge_span(boxes)]
    if m <= k:
        return list(boxes)

    line_x0 = boxes[0][0]
    line_x1 = max(b[0] + b[2] for b in boxes)
    line_w = max(1.0, float(line_x1 - line_x0))
    line_h = max(1.0, float(max(b[3] for b in boxes)))
    gaps = [max(0.0, float(boxes[i + 1][0] - (boxes[i][0] + boxes[i][2]))) for i in range(m - 1)]
    max_gap = max(1.0, max(gaps, default=1.0))

    word_lens = [max(1, len(tok.text.strip())) for tok in tokens]
    total_units = float(sum(word_lens) + max(0, k - 1))
    exp_starts: list[float] = []
    exp_ends: list[float] = []
    cursor = 0.0
    for length in word_lens:
        exp_starts.append(cursor / total_units)
        cursor += length
        exp_ends.append(cursor / total_units)
        cursor += 1.0

    # dp[j][b] = minimum cost to align words 0..j onto atomic chunks 0..b (inclusive).
    inf = float("inf")
    dp = [[inf] * m for _ in range(k)]
    parent = [[-1] * m for _ in range(k)]

    for j in range(k):
        es, ee = exp_starts[j], exp_ends[j]
        ew = ee - es
        min_a = j
        max_b_limit = m - (k - 1 - j)
        for b in range(min_a, max_b_limit):
            a_start = 0 if j == 0 else j
            a_end = 0 if j == 0 else b
            best_cost = inf
            best_a = -1
            for a in range(a_start, a_end + 1):
                prev_cost = 0.0 if j == 0 else dp[j - 1][a - 1]
                if prev_cost == inf:
                    continue
                act_s = (boxes[a][0] - line_x0) / line_w
                act_e = ((boxes[b][0] + boxes[b][2]) - line_x0) / line_w
                act_w = act_e - act_s
                cost = (act_s - es) ** 2 + (act_e - ee) ** 2 + 1.5 * ((act_w - ew) ** 2)
                if a > 0:
                    # Reward placing word boundaries at wider horizontal whitespace gaps.
                    cost -= 0.12 * (gaps[a - 1] / max_gap)
                if b > a:
                    # Penalize merging across unusually wide horizontal gaps inside one word.
                    cost += 0.06 * sum((gaps[i] / line_h) ** 2 for i in range(a, b))
                total = prev_cost + cost
                if total < best_cost:
                    best_cost = total
                    best_a = a
            dp[j][b] = best_cost
            parent[j][b] = best_a

    # Backtrack optimal chunk ranges for each word.
    spans: list[tuple[int, int]] = []
    cur_b = m - 1
    for j in range(k - 1, -1, -1):
        a = parent[j][cur_b]
        if a < 0:
            a = j
        spans.append((a, cur_b))
        cur_b = a - 1
    spans.reverse()
    return [_merge_span(boxes[a : b + 1]) for a, b in spans]


def _split_box_for_tokens(
    box: tuple[int, int, int, int],
    tokens: list[RecognizedToken],
) -> list[tuple[int, int, int, int]]:
    """Split a single multi-word box proportionally across its assigned tokens."""
    if len(tokens) <= 1:
        return [box]
    x, y, w, h = box
    weights = [max(1, len(tok.text.strip())) for tok in tokens]
    total = sum(weights)
    result: list[tuple[int, int, int, int]] = []
    cur_x = x
    remaining_w = w
    for idx, weight in enumerate(weights):
        if idx == len(weights) - 1:
            part_w = max(1, remaining_w)
        else:
            min_left_for_rest = len(weights) - 1 - idx
            raw_w = round(w * weight / total)
            part_w = max(1, min(remaining_w - min_left_for_rest, raw_w))
        result.append((cur_x, y, part_w, h))
        cur_x += part_w
        remaining_w = max(1, remaining_w - part_w)
    return result


def _expand_boxes(
    boxes: list[tuple[int, int, int, int]],
    tokens: list[RecognizedToken],
) -> list[tuple[int, int, int, int]]:
    """Assign tokens monotonically to boxes via DP, then split multi-token boxes proportionally."""
    m = len(boxes)
    k = len(tokens)
    if m == 0 or k == 0:
        return []
    if m == 1:
        return _split_box_for_tokens(boxes[0], tokens)

    total_box_w = float(sum(max(1, b[2]) for b in boxes))
    box_fracs = [max(1, b[2]) / total_box_w for b in boxes]
    word_lens = [max(1, len(tok.text.strip())) for tok in tokens]
    total_chars = float(sum(word_lens))

    # dp[i][t] = min cost to assign boxes 0..i to cover tokens 0..t (inclusive).
    inf = float("inf")
    dp = [[inf] * k for _ in range(m)]
    parent = [[-1] * k for _ in range(m)]

    for i in range(m):
        max_t = k - (m - 1 - i)
        for t in range(i, max_t):
            s_start = 0 if i == 0 else i
            s_end = 0 if i == 0 else t
            best_cost = inf
            best_s = -1
            for s in range(s_start, s_end + 1):
                prev_cost = 0.0 if i == 0 else dp[i - 1][s - 1]
                if prev_cost == inf:
                    continue
                tok_frac = sum(word_lens[s : t + 1]) / total_chars
                cost = (tok_frac - box_fracs[i]) ** 2
                total = prev_cost + cost
                if total < best_cost:
                    best_cost = total
                    best_s = s
            dp[i][t] = best_cost
            parent[i][t] = best_s

    groups: list[tuple[int, int]] = []
    cur_t = k - 1
    for i in range(m - 1, -1, -1):
        s = parent[i][cur_t]
        if s < 0:
            s = i
        groups.append((s, cur_t))
        cur_t = s - 1
    groups.reverse()

    expanded: list[tuple[int, int, int, int]] = []
    for box, (s, t) in zip(boxes, groups, strict=True):
        expanded.extend(_split_box_for_tokens(box, tokens[s : t + 1]))
    return expanded


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
        aligned_boxes = _reduce_boxes(raw_boxes, tokens)
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
            if line.zone == "printed" and conf >= 0.88:
                conf = round(conf * 0.92, 4)
            else:
                conf = round(min(conf, 0.75), 4)
        else:
            conf = round(conf, 4)
        words.append(
            OcrWord(
                id=f"p{page_index}_w{start_word_index + offset}",
                line_id=line.line_id,
                text=token.text.strip(),
                bbox=bbox,
                angle_deg=line.angle_deg,
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
