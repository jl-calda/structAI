"""HTTP client for the Next.js app. Uses httpx with a short timeout and
returns the parsed response envelope."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx

from payload import SyncPayload

TIMEOUT_S = 10.0


@dataclass
class SyncResult:
    ok: bool
    status_code: int
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


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

    if r.status_code >= 400 or not body.get("ok"):
        return SyncResult(
            ok=False,
            status_code=r.status_code,
            error=body.get("error") or f"HTTP {r.status_code}",
        )
    return SyncResult(ok=True, status_code=r.status_code, data=body.get("data"))
