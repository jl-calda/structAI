"""StructAI Python bridge — FastAPI entry point.

Binds to 127.0.0.1 only. Exposes:
  GET  /status              — health check the app polls.
  POST /resync              — force an immediate read + post.
  POST /push-combinations   — receive app-generated combos to inject
                              back into STAAD.

Background task: every POLL_INTERVAL seconds, hash the .std file and
post a fresh SyncPayload if the hash changed. See docs/13-bridge.md.

IMPORTANT: Python must be 64-bit to match STAAD V22 CONNECT's COM
registration. 32-bit Python silently returns 0 for everything.

COM threading: all COM calls run in a dedicated thread via
run_in_executor so pythoncom.CoInitialize() works correctly.
Asyncio's event loop thread doesn't play well with COM apartments.
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException

from config import Config, load_config
from payload import PushCombinationsBody, ResyncBody
from staad_reader import (
    StaadError,
    file_sha256,
    read_model,
    resolve_active_staad_file,
)
from sync_client import post_sync

logger = logging.getLogger("staad-bridge")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# Single-thread executor so COM stays in one apartment-initialized thread.
_com_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="com")


class BridgeState:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.last_hash: Optional[str] = None
        self.last_error: Optional[str] = None
        self.resolved_file_path: Optional[str] = None

    def current_hash(self) -> Optional[str]:
        if self.cfg.mock_mode:
            return self.last_hash

        source_path = self.cfg.staad_file_path
        if source_path is None:
            try:
                source_path = resolve_active_staad_file()
            except StaadError as e:
                self.last_error = str(e)
                return None

        if not source_path.exists():
            self.last_error = f"file does not exist: {source_path}"
            return None

        self.resolved_file_path = str(source_path)
        return file_sha256(source_path)


STATE: Optional[BridgeState] = None


def _sync_blocking(state: BridgeState) -> None:
    """Run the full sync cycle in a dedicated thread with COM initialized.

    COM (win32com) requires pythoncom.CoInitialize() on the thread that
    makes the calls. Asyncio's event loop thread doesn't reliably support
    this. Running all COM work in a single-thread executor ensures the
    apartment model is correct and the COM proxy objects stay valid.
    """
    try:
        import pythoncom
        pythoncom.CoInitialize()
    except ImportError:
        pass  # non-Windows / mock mode — no COM needed

    try:
        cfg = state.cfg
        if cfg.mock_mode and state.last_hash is not None:
            return

        current = state.current_hash()
        if current is None and not cfg.mock_mode:
            logger.warning("poll skipped: %s", state.last_error or "unknown")
            return
        if current == state.last_hash:
            return

        source_path = cfg.staad_file_path
        if source_path is None and state.resolved_file_path:
            source_path = Path(state.resolved_file_path)

        payload = read_model(cfg.project_id, source_path, cfg.mock_mode)
        result = post_sync(cfg.app_url, cfg.bridge_secret, payload)
        if result.ok:
            state.last_hash = payload.file_hash
            state.last_error = None
            logger.info(
                "sync ok: file=%s hash=%s counts=%s",
                payload.file_name,
                payload.file_hash[:8],
                result.data.get("counts") if result.data else "?",
            )
        else:
            state.last_error = result.error
            logger.error("sync failed: %s", result.error)
    except Exception as e:
        state.last_error = str(e)
        logger.exception("sync error")
    finally:
        try:
            import pythoncom
            pythoncom.CoUninitialize()
        except (ImportError, Exception):
            pass


async def poll_loop(state: BridgeState) -> None:
    """Every POLL_INTERVAL seconds: run sync in the COM thread."""
    loop = asyncio.get_event_loop()
    while True:
        await loop.run_in_executor(_com_executor, _sync_blocking, state)
        await asyncio.sleep(state.cfg.poll_interval_s)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    cfg = load_config()
    global STATE
    STATE = BridgeState(cfg)
    logger.info(
        "starting bridge · project=%s mock=%s app=%s",
        cfg.project_id, cfg.mock_mode, cfg.app_url,
    )
    task = asyncio.create_task(poll_loop(STATE))
    try:
        yield
    finally:
        task.cancel()
        _com_executor.shutdown(wait=False)


app = FastAPI(title="StructAI Bridge", lifespan=lifespan)


def _state() -> BridgeState:
    if STATE is None:
        raise HTTPException(status_code=503, detail="bridge not ready")
    return STATE


@app.get("/status")
def status():
    s = _state()
    return {
        "ok": True,
        "project_id": s.cfg.project_id,
        "mock_mode": s.cfg.mock_mode,
        "configured_file_path": (
            str(s.cfg.staad_file_path) if s.cfg.staad_file_path else None
        ),
        "resolved_file_path": s.resolved_file_path,
        "last_hash": s.last_hash,
        "last_error": s.last_error,
    }


@app.post("/resync")
async def resync(body: ResyncBody):
    s = _state()
    if body.project_id != s.cfg.project_id:
        raise HTTPException(
            status_code=400,
            detail=f"project_id mismatch: bridge is bound to {s.cfg.project_id}",
        )
    s.last_hash = None
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(_com_executor, _sync_blocking, s)
    if s.last_error:
        raise HTTPException(status_code=500, detail=s.last_error)
    return {"ok": True, "hash": s.last_hash}


@app.post("/push-combinations")
def push_combinations(body: PushCombinationsBody):
    """Receive combos generated by the app.

    Phase 1 scope: log them. Writing them back into the STAAD model
    requires the OpenSTAAD Load + SetLoadCombinationFactor COM calls
    which are version-sensitive; that's a later commit.
    """
    s = _state()
    if body.project_id != s.cfg.project_id:
        raise HTTPException(
            status_code=400,
            detail=f"project_id mismatch: bridge is bound to {s.cfg.project_id}",
        )
    logger.info(
        "push-combinations: received %d combos for project %s",
        len(body.combinations), body.project_id,
    )
    return {"ok": True, "received": len(body.combinations)}
