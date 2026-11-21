"""Authenticate internal writes and enforce path-scoped body and media-type limits."""

import asyncio
import hmac

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from pyworker.config import Settings

MAX_BODY_BYTES = 8192
OCR_TASK_PATH = "/v1/tasks/ocr"
UDIP_LIMITS = {"/v1/tasks/udip/pii": 1_560_032, "/v1/tasks/udip/ocr": 14 * 1024 * 1024}


class TaskBoundary:
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings

    def _route_policy(self, path: str) -> tuple[bytes, int, int]:
        if path == OCR_TASK_PATH:
            return (
                b"application/octet-stream",
                self.settings.ocr_max_bytes,
                self.settings.ocr_timeout,
            )
        return (b"application/json", UDIP_LIMITS.get(path, MAX_BODY_BYTES), self.settings.task_timeout)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        expected = f"Bearer {self.settings.token}".encode("ascii")
        if not hmac.compare_digest(headers.get(b"authorization", b""), expected):
            await JSONResponse({"error": "unauthorized"}, status_code=401)(scope, receive, send)
            return
        expected_content_type, max_bytes, body_timeout = self._route_policy(scope.get("path", ""))
        content_type = headers.get(b"content-type", b"").split(b";")[0].strip().lower()
        if content_type != expected_content_type:
            await JSONResponse({"error": "unsupported_content_type"}, status_code=415)(
                scope, receive, send
            )
            return
        declared_length = headers.get(b"content-length")
        if declared_length is not None:
            try:
                if int(declared_length) > max_bytes:
                    await JSONResponse({"error": "body_too_large"}, status_code=413)(
                        scope, receive, send
                    )
                    return
            except ValueError:
                await JSONResponse({"error": "invalid_request"}, status_code=400)(
                    scope, receive, send
                )
                return
        body = bytearray()
        try:
            async with asyncio.timeout(body_timeout):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    if len(body) + len(chunk) > max_bytes:
                        await JSONResponse({"error": "body_too_large"}, status_code=413)(
                            scope, receive, send
                        )
                        return
                    body.extend(chunk)
                    if not message.get("more_body", False):
                        break
        except TimeoutError:
            await JSONResponse({"error": "request_timeout"}, status_code=408)(scope, receive, send)
            return
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
