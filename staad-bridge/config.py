"""Configuration for the StructAI Python bridge.

All config is pulled from environment variables. A `.env` file is loaded
automatically if present (see `python-dotenv` in requirements.txt).

Required:
  BRIDGE_SECRET   — must match the value set on the Next.js side.
  PROJECT_ID      — the UUID of the StructAI project this bridge syncs for.

Optional:
  APP_URL         — URL of the Next.js app (default http://localhost:3000).
  POLL_INTERVAL   — seconds between automatic polls (default 30).
  STAAD_FILE_PATH — absolute path to the .std file to watch. If unset the
                    bridge uses STAAD's active document (most common case).
  MOCK_MODE       — '1' to generate synthetic data instead of talking to
                    STAAD. Useful on non-Windows dev machines.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # python-dotenv is optional but recommended
    pass


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Missing required env var {name}. See staad-bridge/.env.example."
        )
    return value


@dataclass(frozen=True)
class Config:
    bridge_secret: str
    project_id: str
    app_url: str
    poll_interval_s: int
    staad_file_path: Optional[Path]
    mock_mode: bool


def load_config() -> Config:
    path_raw = os.environ.get("STAAD_FILE_PATH")
    return Config(
        bridge_secret=_required("BRIDGE_SECRET"),
        project_id=_required("PROJECT_ID"),
        app_url=os.environ.get("APP_URL", "http://localhost:3000").rstrip("/"),
        poll_interval_s=int(os.environ.get("POLL_INTERVAL", "30")),
        staad_file_path=Path(path_raw) if path_raw else None,
        mock_mode=os.environ.get("MOCK_MODE", "").lower() in ("1", "true", "yes"),
    )
