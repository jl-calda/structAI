# StructAI Python bridge

Polls a running STAAD Pro model on Windows, hashes the `.std` file, and
POSTs a `SyncPayload` to the StructAI Next.js app whenever the file
changes. Also exposes endpoints the app calls back into:

- `GET  /status`            — health check
- `POST /resync`             — force an immediate read
- `POST /push-combinations`  — receive app-generated combos (logged for
  now; COM write-back to STAAD is a later commit)

Binds to `127.0.0.1:8765`. Never expose to the network.

See [`docs/13-bridge.md`](../docs/13-bridge.md) for the full contract
and [`docs/12-conventions.md`](../docs/12-conventions.md) for the
`X-Bridge-Secret` protocol.

## Requirements

- Python 3.11+
- On Windows: STAAD Pro with a model open, plus `pywin32`.
- On macOS / Linux: run in **mock mode** (`MOCK_MODE=1`) to exercise
  the sync endpoint without STAAD. Generates a synthetic 3-storey
  portal frame with dead + live load cases and two combos.

## Setup

```bash
cd staad-bridge

python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env — at minimum set BRIDGE_SECRET and PROJECT_ID.
```

## Run

```bash
uvicorn main:app --host 127.0.0.1 --port 8765 --reload
```

On startup the bridge does one sync immediately and then every
`POLL_INTERVAL` seconds (default 30). When it detects a new file hash
it reads nodes / members / sections / load cases / combinations /
diagram_points (11 samples per member per combo) / envelope /
reactions and POSTs the whole bundle to `APP_URL/api/bridge/sync`.

## Mock mode

On a non-Windows dev box — or when you don't want STAAD running — set
`MOCK_MODE=1` in `.env`. The bridge then uses `staad_reader._read_mock_model`
to generate a fixed 3-storey × 1-bay frame so you can click through
the StructAI UI end-to-end. The mock sync runs **once at startup**;
hit `POST /resync` to trigger another (with a different file_hash).

## Env reference

| Var               | Required | Notes                                                  |
|-------------------|----------|--------------------------------------------------------|
| `BRIDGE_SECRET`   | yes      | Must match the value on the Next.js side              |
| `PROJECT_ID`      | yes      | StructAI project UUID this bridge instance syncs       |
| `APP_URL`         | no       | Defaults to `http://localhost:3000`                    |
| `POLL_INTERVAL`   | no       | Seconds between auto-polls, default `30`               |
| `STAAD_FILE_PATH` | no       | Absolute path to the `.std` file; blank = active doc   |
| `MOCK_MODE`       | no       | `1` to generate synthetic data instead of hitting STAAD |

## STAAD COM notes

The real reader uses `StaadPro.OpenSTAAD` (the automation entry that
ships with STAAD Pro). Force signatures follow the OpenSTAAD docs
(Fx=0, Fy=1, Fz=2, Mx=3, My=4, Mz=5). The 11-point x-ratio sample is
non-negotiable — the beam engine relies on the full M(x)/V(x) curve
shape to place bend points (see
[`docs/05-beam-engine.md`](../docs/05-beam-engine.md)).

## Security

- Binds to `127.0.0.1` only. The Next.js `proxy.ts` gate only lets
  requests with `X-Bridge-Secret` through on `/api/bridge/*`, and
  cross-checks the caller IP is also localhost.
- Never commit the real `.env` — it's gitignored via the repo's root
  `.gitignore`.
