"""Stage 3: Local air-gapped Ollama Qwen2.5-VL-3B recognizer (single-page batch + line mode)."""

import asyncio
import base64
import io
import json
import re
from typing import Any

import httpx2

from pyworker.contracts import OcrZone
from pyworker.ocr.interfaces import (
    GroupedLine,
    OcrModelUnavailableError,
    RecognizedLine,
    RecognizedToken,
)

MAX_OLLAMA_RESPONSE_BYTES = 262_144
MAX_PAGE_CROP_EDGE = 896
MAX_STRIP_BATCH_LINES = 16
ROW_TAG_PATTERN = re.compile(r"^\s*\[(\d{1,3})\]\s*(.*)$")
SYSTEM_PROMPT = (
    "You are an OCR engine for Polish administrative documents (Urząd Miasta Bydgoszczy — "
    "UDIP requests, Polish handwriting, and Kancelaria intake stamps). "
    "Transcribe ONLY the visible Polish text accurately, preserving Polish diacritics "
    "(ĄĆĘŁŃÓŚŹŻąćęłńóśźż), dates, and numbers. Never invent or repeat text. "
    'Return ONLY valid JSON: {"text": "...", "tokens": [{"text": "...", "confidence": 0.90}]}.'
)
STRIP_SYSTEM_PROMPT = (
    "Jesteś ekspertem OCR polskich wniosków o informację publiczną (Urząd Miasta Bydgoszczy). "
    "Otrzymujesz OBRAZ ponumerowanych wierszy pisma ręcznego/skanu [1]..[N] oraz wstępny OCR. "
    "Na podstawie OBRAZU i kontekstu CAŁEGO zdania po polsku odtwórz dokładne, prawdziwe polskie "
    "słowa (polskie znaki ĄĆĘŁŃÓŚŹŻąćęłńóśźż, daty DD.MM.RRRR, nazwy miast i nazwiska). "
    "Typowe pomyłki pisma ręcznego: J→I, V→U, 6→G, 2→Z, 0→O, P→D, T→Ż; łącz rozbite wyrazy "
    "(np. TRY bIE → TRYBIE, BYD GOSZCZ → BYDGOSZCZ) i nie wstawiaj kropek między literami. "
    "Zwróć TYLKO linie w formacie: [k] <poprawiony tekst>"
)
PROOFREAD_SYSTEM_PROMPT = (
    "Jesteś korektorem tekstu po OCR polskich pism urzędowych (Urząd Miasta Bydgoszczy, UDIP). "
    "Otrzymasz ponumerowane wiersze [1]..[N] odczytane z pisma odręcznego. "
    "Popraw WYŁĄCZNIE oczywiste literówki OCR na podstawie kontekstu całego zdania w języku polskim "
    "(typowa zamiana liter w piśmie ręcznym: J→I np. 'JLE'→'ILE', 'OBECIA FUNDUCJI'→'OBJĘCIA FUNKCJI', "
    "'BRUSWEGO'→'BRUSKIEGO', 'PO DNIA DZIESIĄTEGO'→'DO DNIA DZISIEJSZEGO', 'OPOWIEDZIAŁ W TRYBIE'→'ODPOWIEDŹ W TRYBIE'). "
    "ZASADY BEZWZGLĘDNE:\n"
    "1. Zachowaj dokładnie tę samą liczbę i numerację wierszy [1]..[N].\n"
    "2. Nie łącz wierszy, nie dodawaj nowych słów spoza sensu zdania, nie zmieniaj dat ani imion.\n"
    "3. Zwróć TYLKO poprawione wiersze w formacie [k] <tekst> bez żadnych komentarzy."
)


def _encode_crop_base64(crop_rgb: Any, *, max_edge: int = 896) -> str:
    from PIL import Image

    pil_img = Image.fromarray(crop_rgb, mode="RGB")
    if max(pil_img.width, pil_img.height) > max_edge:
        pil_img.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    pil_img.save(buffer, format="JPEG", quality=90)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def parse_vlm_line_payload(raw_content: str) -> RecognizedLine:
    """Parse strict JSON line response with safe plain-text fallback."""
    cleaned = raw_content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    try:
        data = json.loads(cleaned)
    except ValueError:
        tokens = [
            RecognizedToken(text=piece, confidence=0.72) for piece in cleaned.split() if piece
        ]
        return RecognizedLine(text=" ".join(t.text for t in tokens), tokens=tokens)

    if isinstance(data, dict):
        raw_tokens = data.get("tokens")
        tokens: list[RecognizedToken] = []
        if isinstance(raw_tokens, list):
            for entry in raw_tokens:
                if not isinstance(entry, dict):
                    continue
                word_text = str(entry.get("text", "")).strip()
                if not word_text:
                    continue
                raw_conf = entry.get("confidence", 0.85)
                try:
                    conf = float(raw_conf)
                except (TypeError, ValueError):
                    conf = 0.75
                conf = max(0.0, min(1.0, conf))
                for piece in word_text.split():
                    tokens.append(RecognizedToken(text=piece, confidence=conf))
        if not tokens and isinstance(data.get("text"), str):
            for piece in data["text"].split():
                tokens.append(RecognizedToken(text=piece, confidence=0.80))
        assembled = (
            str(data.get("text", "")).strip()
            if isinstance(data.get("text"), str) and data.get("text", "").strip()
            else " ".join(t.text for t in tokens)
        )
        return RecognizedLine(text=assembled, tokens=tokens)

    return RecognizedLine(text="", tokens=[])


def parse_vlm_page_payload(raw_content: str, expected_lines: int) -> list[RecognizedLine]:
    """Parse single-pass page JSON into a list aligned to detected lines."""
    cleaned = raw_content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    extracted: list[RecognizedLine] = []
    try:
        data = json.loads(cleaned)
    except ValueError:
        data = None

    if isinstance(data, dict) and isinstance(data.get("lines"), list):
        for item in data["lines"]:
            if isinstance(item, str):
                text = item.strip()
                conf = 0.78
            elif isinstance(item, dict):
                text = str(item.get("text", "")).strip()
                try:
                    conf = max(0.0, min(1.0, float(item.get("confidence", 0.80))))
                except (TypeError, ValueError):
                    conf = 0.78
            else:
                continue
            if not text:
                continue
            tokens = [RecognizedToken(text=piece, confidence=conf) for piece in text.split()]
            extracted.append(RecognizedLine(text=text, tokens=tokens))
    else:
        for raw_line in cleaned.splitlines():
            text = raw_line.strip()
            if not text:
                continue
            tokens = [RecognizedToken(text=piece, confidence=0.72) for piece in text.split()]
            extracted.append(RecognizedLine(text=text, tokens=tokens))

    if expected_lines <= 0:
        return []
    if not extracted:
        return [RecognizedLine(text="", tokens=[]) for _ in range(expected_lines)]

    # Map extracted lines cleanly onto the expected detected line slots.
    result: list[RecognizedLine] = []
    if len(extracted) <= expected_lines:
        result.extend(extracted)
        while len(result) < expected_lines:
            result.append(RecognizedLine(text="", tokens=[]))
        return result

    # More VLM lines than detected slots: merge trailing lines into the final slot.
    result.extend(extracted[: expected_lines - 1])
    tail_tokens = [tok for line in extracted[expected_lines - 1 :] for tok in line.tokens]
    result.append(RecognizedLine(text=" ".join(t.text for t in tail_tokens), tokens=tail_tokens))
    return result


POLISH_VOWELS = set("aeiouyąęóAEIOUYĄĘÓ")
MIXED_INTERNAL_CASE_RE = re.compile(r"[a-ząćęłńóśźż][A-ZĄĆĘŁŃÓŚŹŻ]")
TRIPLE_REPEAT_RE = re.compile(r"(.)\1\1")


def _score_token_confidence(
    token: str,
    *,
    base_conf: float,
    changed_by_proofread: bool = False,
) -> float:
    """Assign realistic per-word confidence so clean Polish words stay neutral and only garbled/edited words turn red."""
    stripped = token.strip(".,;:!?()[]\"'„”/-")
    letters = [ch for ch in stripped if ch.isalpha()]
    digits = [ch for ch in stripped if ch.isdigit()]

    # Flag genuinely garbled tokens (<0.80 -> red highlight for quick clerk verification):
    # 1. 4+ letters with zero Polish vowels (e.g. "ŁCPCW")
    if len(letters) >= 4 and not any(ch in POLISH_VOWELS for ch in letters):
        return round(min(base_conf, 0.62), 4)
    # 2. Weird internal uppercase inside a lowercase word (e.g. "obslLgi")
    if MIXED_INTERNAL_CASE_RE.search(stripped):
        return round(min(base_conf, 0.64), 4)
    # 3. Mixed digits + letters in a short token that isn't a known code/date (e.g. "wpływu:7b")
    if letters and digits and len(stripped) <= 10 and "/" not in stripped and "." not in stripped:
        return round(min(base_conf, 0.66), 4)
    # 4. Triple repeated character noise
    if TRIPLE_REPEAT_RE.search(stripped):
        return round(min(base_conf, 0.65), 4)

    if changed_by_proofread:
        return round(min(base_conf, 0.76), 4)
    return round(max(0.0, min(1.0, base_conf)), 4)


def parse_numbered_vlm_payload(
    raw_content: str,
    expected_lines: int,
    *,
    start_index: int = 1,
    fallback_drafts: list[tuple[str, float]] | None = None,
) -> list[RecognizedLine]:
    """Parse strictly numbered '[k] text' VLM rows for guaranteed 1:1 line alignment."""
    if expected_lines <= 0:
        return []

    by_index: dict[int, str] = {}
    for raw_line in raw_content.splitlines():
        match = ROW_TAG_PATTERN.match(raw_line.strip())
        if not match:
            continue
        idx = int(match.group(1))
        text = match.group(2).strip()
        # Strip accidental doubled tag like "[1] [1] Jerzy".
        inner = ROW_TAG_PATTERN.match(text)
        if inner:
            text = inner.group(2).strip()
        if start_index <= idx < start_index + expected_lines and text:
            by_index[idx] = text

    if not by_index:
        return parse_vlm_page_payload(raw_content, expected_lines=expected_lines)

    results: list[RecognizedLine] = []
    for offset in range(expected_lines):
        row_num = start_index + offset
        draft_text, draft_conf = (
            fallback_drafts[offset]
            if fallback_drafts and offset < len(fallback_drafts)
            else ("", 0.72)
        )
        vlm_text = by_index.get(row_num, "").strip()

        chosen = vlm_text
        # Trust clean VLM-transcribed Polish lines (>=0.88) while flagging garbled tokens individually.
        if draft_text and vlm_text.casefold() == draft_text.casefold() and draft_conf >= 0.82:
            conf = round(max(0.90, min(0.96, draft_conf)), 4)
        else:
            conf = 0.88
        if draft_text and (
            not vlm_text or len(vlm_text.split()) > max(4, len(draft_text.split()) * 2 + 2)
        ):
            chosen = draft_text
            conf = round(max(0.45, min(0.76, draft_conf)), 4)
        elif not chosen and draft_text:
            chosen = draft_text
            conf = round(max(0.45, min(0.76, draft_conf)), 4)

        tokens = [
            RecognizedToken(
                text=piece,
                confidence=_score_token_confidence(piece, base_conf=conf),
            )
            for piece in chosen.split()
            if piece
        ]
        results.append(RecognizedLine(text=" ".join(t.text for t in tokens), tokens=tokens))
    return results


def _build_numbered_strip_sheet(
    page_rgb: Any,
    lines: list[GroupedLine],
    *,
    start_index: int = 1,
) -> Any:
    """Stack line crops vertically with red [k] tags so VLM keeps exact 1:1 row mapping."""
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    target_row_h = 64
    label_w = 68
    pad_y = 14
    max_content_w = 1040
    img_h, img_w = page_rgb.shape[:2]

    crops: list[Image.Image] = []
    for line in lines:
        x, y, w, h = line.bbox
        x0 = max(0, x - 8)
        y0 = max(0, y - 3)
        x1 = min(img_w, x + w + 8)
        y1 = min(img_h, y + h + 3)
        sub = page_rgb[y0:y1, x0:x1]
        if h >= 42 and sub.size > 0:
            gray = cv2.cvtColor(sub, cv2.COLOR_RGB2GRAY)
            bold = cv2.erode(
                gray, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2)), iterations=1
            )
            sub = cv2.cvtColor(bold, cv2.COLOR_GRAY2RGB)
        crop = Image.fromarray(sub, mode="RGB")
        scale = min(target_row_h / max(1, crop.height), max_content_w / max(1, crop.width))
        scale = max(0.55, min(2.0, scale))
        nw = max(1, int(round(crop.width * scale)))
        nh = max(1, int(round(crop.height * scale)))
        crops.append(crop.resize((nw, nh), Image.Resampling.LANCZOS))

    sheet_w = label_w + max((c.width for c in crops), default=240) + 24
    sheet_h = sum(c.height + pad_y for c in crops) + pad_y
    sheet = Image.new("RGB", (sheet_w, sheet_h), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 24)
    except OSError:
        font = ImageFont.load_default()

    y_cur = pad_y
    for offset, crop in enumerate(crops):
        row_num = start_index + offset
        draw.text(
            (8, y_cur + max(0, (crop.height - 24) // 2)),
            f"[{row_num}]",
            fill=(180, 0, 0),
            font=font,
        )
        sheet.paste(crop, (label_w, y_cur))
        y_cur += crop.height + pad_y
        draw.line(
            [(0, y_cur - pad_y // 2), (sheet_w, y_cur - pad_y // 2)],
            fill=(225, 225, 225),
            width=1,
        )
    return np.asarray(sheet, dtype=np.uint8)


class OllamaLineRecognizer:
    """Air-gapped HTTP client calling local Ollama /api/chat for OCR recognition."""

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        timeout_seconds: int = 120,
        max_concurrency: int = 2,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._semaphore = asyncio.Semaphore(max(1, max_concurrency))
        self._transport = transport
        self.name = f"ollama:{model}"

    def _client(self, timeout: float) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(
            base_url=self._base_url,
            timeout=timeout,
            follow_redirects=False,
            trust_env=False,
            limits=httpx2.Limits(max_connections=4, max_keepalive_connections=2),
            transport=self._transport,
        )

    async def is_ready(self) -> bool:
        """Check whether local Ollama is reachable and has the configured model."""
        try:
            async with asyncio.timeout(2.0):
                async with self._client(2.0) as client:
                    response = await client.get("/api/tags")
                    if response.status_code != 200:
                        return False
                    payload = response.json()
                    models = payload.get("models", []) if isinstance(payload, dict) else []
                    names = {str(item.get("name", "")) for item in models if isinstance(item, dict)}
                    return self._model in names or any(
                        name.startswith(f"{self._model}:") or name.split(":")[0] == self._model
                        for name in names
                    )
        except Exception:
            return False

    async def _post_chat(self, body: dict[str, Any]) -> str:
        async with self._semaphore:
            try:
                async with asyncio.timeout(self._timeout_seconds):
                    async with self._client(float(self._timeout_seconds)) as client:
                        async with client.stream("POST", "/api/chat", json=body) as response:
                            if response.status_code == 404:
                                raise OcrModelUnavailableError("ocr_model_not_found")
                            if response.status_code != 200:
                                raise OcrModelUnavailableError("ocr_model_unavailable")
                            raw = bytearray()
                            async for chunk in response.aiter_bytes():
                                if len(raw) + len(chunk) > MAX_OLLAMA_RESPONSE_BYTES:
                                    raise OcrModelUnavailableError("ocr_response_too_large")
                                raw.extend(chunk)
                            envelope = json.loads(raw)
            except TimeoutError:
                raise
            except OcrModelUnavailableError:
                raise
            except (httpx2.HTTPError, ValueError, OSError):
                raise OcrModelUnavailableError("ocr_model_unavailable") from None

        message = envelope.get("message") if isinstance(envelope, dict) else None
        content = message.get("content", "") if isinstance(message, dict) else ""
        return content if isinstance(content, str) else ""

    async def recognize_line(
        self,
        crop_rgb: Any,
        *,
        zone: OcrZone,
        expected_words: int,
    ) -> RecognizedLine:
        image_b64 = _encode_crop_base64(crop_rgb, max_edge=640)
        user_prompt = (
            f"Strefa: {zone}. Szacowana liczba słów w linii: {max(1, expected_words)}. "
            "Przepisz dokładnie tekst z tego wycinka i zwróć JSON."
        )
        body = {
            "model": self._model,
            "stream": False,
            "think": False,
            "keep_alive": "15m",
            "format": "json",
            "options": {"temperature": 0.0, "repeat_penalty": 1.05, "num_predict": 128},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt, "images": [image_b64]},
            ],
        }
        content = await self._post_chat(body)
        return parse_vlm_line_payload(content)

    async def recognize_page_lines(
        self,
        page_rgb: Any,
        lines: list[GroupedLine],
        *,
        draft_hints: list[tuple[str, float]] | None = None,
    ) -> list[RecognizedLine]:
        """Transcribe detected lines in numbered strip batches for exact 1:1 alignment."""
        if not lines:
            return []

        results: list[RecognizedLine] = []
        for start in range(0, len(lines), MAX_STRIP_BATCH_LINES):
            batch_lines = lines[start : start + MAX_STRIP_BATCH_LINES]
            batch_hints = (
                draft_hints[start : start + MAX_STRIP_BATCH_LINES]
                if draft_hints is not None
                else None
            )
            start_num = start + 1
            end_num = start + len(batch_lines)
            sheet_rgb = await asyncio.to_thread(
                _build_numbered_strip_sheet,
                page_rgb,
                batch_lines,
                start_index=start_num,
            )
            image_b64 = _encode_crop_base64(sheet_rgb, max_edge=MAX_PAGE_CROP_EDGE)
            if batch_hints and any(text for text, _score in batch_hints):
                hint_block = "\n".join(
                    f"[{start_num + i}] {text}" if text else f"[{start_num + i}]"
                    for i, (text, _score) in enumerate(batch_hints)
                )
                user_prompt = (
                    f"Popraw odczyt OCR na podstawie obrazu dla wierszy "
                    f"[{start_num}]..[{end_num}]. "
                    f"Zachowaj format [k] <tekst polski>:\n{hint_block}"
                )
            else:
                user_prompt = (
                    f"Przepisz dokładnie ponumerowane wiersze [{start_num}]..[{end_num}] "
                    "w języku polskim. Zachowaj format [k] <tekst>."
                )

            body = {
                "model": self._model,
                "stream": False,
                "think": False,
                "keep_alive": "15m",
                "options": {
                    "temperature": 0.0,
                    "repeat_penalty": 1.05,
                    "num_predict": 384,
                    "num_ctx": 2048,
                },
                "messages": [
                    {"role": "system", "content": STRIP_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt, "images": [image_b64]},
                ],
            }
            content = await self._post_chat(body)
            results.extend(
                parse_numbered_vlm_payload(
                    content,
                    expected_lines=len(batch_lines),
                    start_index=start_num,
                    fallback_drafts=batch_hints,
                )
            )

        # Fast text-only Pass 2: proofread full document context to fix OCR typos like "JLE" -> "ILE"
        if len(results) >= 2 and any(r.text.strip() for r in results):
            results = await self._proofread_lines_context(results)

        return results

    async def _proofread_lines_context(
        self,
        lines: list[RecognizedLine],
    ) -> list[RecognizedLine]:
        """Run a fast (~1s) text-only Polish proofreading pass over all lines together."""
        numbered_input = "\n".join(
            f"[{i + 1}] {line.text}" for i, line in enumerate(lines)
        )
        body = {
            "model": self._model,
            "stream": False,
            "think": False,
            "keep_alive": "15m",
            "options": {
                "temperature": 0.0,
                "repeat_penalty": 1.05,
                "num_predict": max(256, len(numbered_input) + 96),
                "num_ctx": 2048,
            },
            "messages": [
                {"role": "system", "content": PROOFREAD_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Popraw oczywiste błędy OCR w poniższych {len(lines)} wierszach, "
                        f"zachowując dokładnie numerację [1]..[{len(lines)}]:\n{numbered_input}"
                    ),
                },
            ],
        }
        try:
            content = await self._post_chat(body)
        except Exception:
            return lines

        if not content.strip():
            return lines

        fallbacks = [
            (
                line.text,
                sum(t.confidence for t in line.tokens) / len(line.tokens)
                if line.tokens
                else 0.72,
            )
            for line in lines
        ]
        corrected = parse_numbered_vlm_payload(
            content,
            expected_lines=len(lines),
            start_index=1,
            fallback_drafts=fallbacks,
        )
        merged: list[RecognizedLine] = []
        for orig, fixed in zip(lines, corrected, strict=False):
            # Guard against hallucinations: keep original if line length exploded or emptied
            orig_tokens = orig.text.split()
            fixed_tokens = fixed.text.split()
            if (
                not fixed_tokens
                or (orig_tokens and len(fixed_tokens) > len(orig_tokens) + 2)
                or len(fixed.text) > max(40, int(len(orig.text) * 1.6))
            ):
                merged.append(orig)
                continue

            # Words agreed on by Pass 1 & Pass 2 get high confidence (0.91);
            # words corrected by Pass 2 or still garbled stay flagged (<0.80) for quick Alt+N check.
            orig_lower_set = {w.casefold() for w in orig_tokens}
            scored_tokens = [
                RecognizedToken(
                    text=piece,
                    confidence=_score_token_confidence(
                        piece,
                        base_conf=0.91,
                        changed_by_proofread=piece.casefold() not in orig_lower_set,
                    ),
                )
                for piece in fixed_tokens
            ]
            merged.append(
                RecognizedLine(
                    text=" ".join(t.text for t in scored_tokens),
                    tokens=scored_tokens,
                )
            )
        return merged
