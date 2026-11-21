"""Single-process runner; DEV watches source only, never environments or caches."""

import copy
import logging
import os
import sys
import threading
import time

import uvicorn

from pyworker.config import Settings


def _wait_for_parent_shutdown() -> None:
    """Wait for a 'shutdown' line or EOF on stdin without deadlocking Windows DLL loads."""
    if sys.platform == "win32":
        import ctypes
        import msvcrt

        try:
            handle = msvcrt.get_osfhandle(sys.stdin.fileno())
            kernel32 = ctypes.windll.kernel32
            avail = ctypes.c_ulong(0)
            buf = b""
            while True:
                ok = kernel32.PeekNamedPipe(
                    ctypes.c_void_p(handle), None, 0, None, ctypes.byref(avail), None
                )
                if not ok:
                    return
                if avail.value > 0:
                    chunk = sys.stdin.buffer.read(min(avail.value, 4096))
                    if not chunk:
                        return
                    buf += chunk
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        if line.strip() == b"shutdown":
                            return
                else:
                    time.sleep(0.05)
        except OSError:
            pass

    for line in sys.stdin:
        if line.strip() == "shutdown":
            return


def main() -> None:
    settings = Settings.from_environment()
    logging.basicConfig(
        level=settings.log_level.upper(), format="%(levelname)s %(name)s %(message)s"
    )
    log_config = copy.deepcopy(uvicorn.config.LOGGING_CONFIG)
    log_config["loggers"]["pyworker"] = {
        "handlers": ["default"],
        "level": settings.log_level.upper(),
        "propagate": False,
    }
    config = uvicorn.Config(
        "pyworker.main:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        reload=False,
        workers=1,
        access_log=False,
        server_header=False,
        proxy_headers=False,
        # Psycopg async connections require SelectorEventLoop on Windows.
        loop="asyncio:SelectorEventLoop",
        log_level=settings.log_level,
        log_config=log_config,
        limit_concurrency=32,
        timeout_keep_alive=5,
        timeout_graceful_shutdown=settings.task_timeout + 2,
    )
    server = uvicorn.Server(config)
    if os.environ.get("PYWORKER_PARENT_CONTROL") == "stdin":
        # Windows TerminateProcess cannot drain ASGI work. The owning launcher
        # requests normal Uvicorn shutdown over its private stdin pipe instead.
        def parent_control() -> None:
            _wait_for_parent_shutdown()
            server.should_exit = True

        threading.Thread(target=parent_control, daemon=True).start()
    server.run()


if __name__ == "__main__":
    main()
