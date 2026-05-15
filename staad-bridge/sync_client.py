"""HTTP client for the Next.js app. Uses httpx with a short timeout and
returns the parsed response envelope."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx

from payload import SyncPayload

# Generous timeout: payloads with 10k+ diagram points are large and the
# server has to upsert a lot of rows.
TIMEOUT_S = httpx.Timeout(connect=10.0, read=120.0, write=120.0, pool=10.0)


@dataclass
class SyncResult:
    ok: bool
    status_code: int
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    # When the app rejects the sync with HTTP 409 — either because the
    # project is archived (terminal) or because the open STAAD file
    # doesn't match the project's pinned hash (user must explicitly
    # "Change STAAD" in the UI before we'll be accepted again). The
    # bridge loop should treat both as terminal: keep reporting the
    # status but stop retrying on a tight loop.
    terminal: bool = False


def post_sync(app_url: str, bridge_secret: str, payload: SyncPayload) -> SyncResult:
    url = f"{app_url}/api/bridge/sync"
    try:
        r = httpx.post(
            url,
            json=payload.model_dump(mode="json"),
            headers={"x-bridge-secret": bridge_secret},
            timeout=TIMEOUT_S,
        )
    except httpx.RequestError as e:
        return SyncResult(ok=False, status_code=0, error=f"request failed: {e}")

    try:
        body = r.json()
    except ValueError:
        body = {"ok": False, "error": r.text}

    if r.status_code == 409:
        err = body.get("error") or f"HTTP {r.status_code}"
        return SyncResult(
            ok=False,
            status_code=r.status_code,
            error=err,
            data=body,
            terminal=True,
        )

    if r.status_code >= 400 or not body.get("ok"):
        return SyncResult(
            ok=False,
            status_code=r.status_code,
            error=body.get("error") or f"HTTP {r.status_code}",
        )
    return SyncResult(ok=True, status_code=r.status_code, data=body.get("data"))
