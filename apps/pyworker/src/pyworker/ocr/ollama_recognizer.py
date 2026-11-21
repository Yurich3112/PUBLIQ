"""Stage 3: Local air-gapped Ollama Qwen2.5-VL-3B line-context handwriting recognizer."""

import asyncio
import base64
import io
import json
from typing import Any

import httpx2

from pyworker.contracts import OcrZone
from pyworker.ocr.interfaces import OcrModelUnavailableError, RecognizedLine, RecognizedToken

MAX_OLLAMA_RESPONSE_BYTES = 262_144
SYSTEM_PROMPT = (
    "Jesteś precyzyjnym silnikiem OCR dla polskich dokumentów urzędowych "
    "(Urząd Miasta Bydgoszczy — wnioski UDIP, pismo ręczne oraz pieczątki kancelaryjne). "
    "Odczytaj dokładnie widoczną linię tekstu po polsku, zachowując polskie znaki "
    "diakrytyczne (ĄĆĘŁŃÓŚŹŻąćęłńóśźż), cyfry i znaki interpunkcyjne. "
    "Nie dopisuj słów, których nie widać na obrazie. "
    'Zwróć wyłącznie poprawny JSON w formacie: {"text": "...", '
    '"tokens": [{"text": "...", "confidence": 0.92}]}.'
)


def _encode_crop_base64(crop_rgb: Any) -> str:
    from PIL import Image

    pil_img = Image.fromarray(crop_rgb, mode="RGB")
    buffer = io.BytesIO()
    pil_img.save(buffer, format="PNG")
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
                # Guard against multi-word entries inside a single token object.
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


class OllamaLineRecognizer:
    """Air-gapped HTTP client calling local Ollama /api/chat for line recognition."""

    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        timeout_seconds: int = 60,
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

    async def recognize_line(
        self,
        crop_rgb: Any,
        *,
        zone: OcrZone,
        expected_words: int,
    ) -> RecognizedLine:
        image_b64 = _encode_crop_base64(crop_rgb)
        user_prompt = (
            f"Strefa: {zone}. Szacowana liczba słów w linii: {max(1, expected_words)}. "
            "Przepisz dokładnie tekst z tego wycinka i zwróć JSON."
        )
        body = {
            "model": self._model,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.0},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt, "images": [image_b64]},
            ],
        }
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
        if not isinstance(content, str):
            return RecognizedLine(text="", tokens=[])
        return parse_vlm_line_payload(content)
