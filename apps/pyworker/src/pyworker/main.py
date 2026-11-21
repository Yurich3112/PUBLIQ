"""ASGI application with lifecycle health, bounded concurrency and safe errors."""

import asyncio
import logging
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from pyworker.config import Settings
from pyworker.contracts import CheckRequest, CheckResponse
from pyworker.tasks.diagnostic import run_check
from pyworker.transport import TaskBoundary

logger = logging.getLogger("pyworker")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = Settings.from_environment() if settings is None else settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.slots = asyncio.Semaphore(settings.concurrency)
        app.state.ready = True
        logger.info("event=worker_ready")
        try:
            yield
        finally:
            app.state.ready = False
            logger.info("event=worker_stopped")

    app = FastAPI(
        title="Modulon Python worker",
        version="1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.ready = False
    app.add_middleware(TaskBoundary, settings=settings)

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        request_id = str(uuid4())
        request.state.request_id = request_id
        try:
            response = await call_next(request)
        except Exception:
            logger.error("event=request_failed request_id=%s", request_id)
            response = JSONResponse(
                {"error": "internal_error", "request_id": request_id}, status_code=500
            )
        response.headers["X-Request-ID"] = request_id
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, _error: RequestValidationError):
        return JSONResponse({"error": "invalid_request"}, status_code=422)

    @app.get("/health/live")
    async def live():
        return {"status": "ok", "service": "pyworker", "check": "liveness"}

    @app.get("/health")
    @app.get("/health/ready")
    async def ready():
        is_ready = app.state.ready
        return JSONResponse(
            {"status": "ok" if is_ready else "error", "service": "pyworker", "check": "readiness"},
            status_code=200 if is_ready else 503,
        )

    @app.post("/v1/tasks/check", response_model=CheckResponse)
    async def check(task: CheckRequest, request: Request):
        if not app.state.ready:
            return JSONResponse({"error": "not_ready"}, status_code=503)
        slots = app.state.slots
        if slots.locked():
            return JSONResponse({"error": "busy"}, status_code=503)
        async with slots:
            started = perf_counter()
            try:
                async with asyncio.timeout(settings.task_timeout):
                    result = await run_check(task)
            except TimeoutError:
                logger.warning(
                    "event=task_timeout request_id=%s job_id=%s attempt=%s",
                    request.state.request_id,
                    task.job_id,
                    task.attempt,
                )
                return JSONResponse({"error": "task_timeout"}, status_code=504)
            except Exception as error:
                # Exception text/tracebacks can carry SQL, credentials or task inputs.
                logger.error(
                    "event=task_failed request_id=%s job_id=%s attempt=%s error_type=%s",
                    request.state.request_id,
                    task.job_id,
                    task.attempt,
                    type(error).__name__,
                )
                return JSONResponse(
                    {"error": "internal_error", "request_id": request.state.request_id},
                    status_code=500,
                )
            logger.info(
                "event=task_completed request_id=%s job_id=%s attempt=%s duration_ms=%d",
                request.state.request_id,
                task.job_id,
                task.attempt,
                round((perf_counter() - started) * 1000),
            )
            return result

    return app
