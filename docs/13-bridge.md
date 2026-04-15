# 13 — Python Bridge Spec

Separate Python project (Windows-only). STAAD Pro is a Windows-only application.

## Location
`staad-bridge/` directory, separate from the Next.js app.

## Stack
- Python 3.11+
- FastAPI + uvicorn
- `win32com.client` for STAAD automation
- `httpx` for posting to Next.js
- `hashlib` for SHA-256

## Run
```bash
cd staad-bridge
uvicorn main:app --host 127.0.0.1 --port 8765
```
Binds to localhost only — never exposed to network.

## What it does
```
Loop every 30 seconds:
  1. Open active STAAD model via win32com
  2. Compute SHA-256 of .std file bytes
  3. Compare with last known hash
  4. If unchanged → skip
  5. If changed:
     a. Read nodes, members, sections, materials, load cases, combinations
     b. For each member × each combo: sample M(x), V(x) at x_ratio = 0.0, 0.1, ..., 1.0 (11 points)
     c. Compute envelope per member across all combos
     d. Read support reactions per node per combo
     e. POST SyncPayload to http://localhost:3000/api/bridge/sync
        Header: X-Bridge-Secret: {BRIDGE_SECRET}
```

## SyncPayload shape
```json
{
  "project_id": "uuid",
  "file_name": "BLDG-01.std",
  "file_hash": "sha256hex",
  "nodes": [{ "node_id": 1, "x_mm": 0, "y_mm": 0, "z_mm": 0, "support_type": "fixed" }],
  "members": [{ "member_id": 104, "start_node_id": 21, "end_node_id": 22, "section_name": "300X600", "length_mm": 3500, "member_type": "beam" }],
  "sections": [{ "section_name": "300X600", "section_type": "rectangular", "b_mm": 300, "h_mm": 600 }],
  "load_cases": [{ "case_number": 1, "title": "DEAD LOAD", "load_type": "dead" }],
  "combinations": [{ "combo_number": 101, "title": "1.4D", "factors": [{ "case_number": 1, "load_type": "dead", "factor": 1.4 }], "source": "imported" }],
  "diagram_points": [{ "member_id": 104, "combo_number": 101, "x_ratio": 0.0, "x_mm": 0, "Mz_kNm": -128.4, "Vy_kN": 185.2, "N_kN": 0 }],
  "envelope": [{ "member_id": 104, "Mpos_max_kNm": 558.7, "Mpos_combo": 102, "Mneg_max_kNm": 312.7, "Mneg_combo": 104, "Vu_max_kN": 302.1, "Vu_combo": 102 }],
  "reactions": [{ "node_id": 21, "combo_number": 101, "Rx_kN": 0, "Ry_kN": 420.8, "Rz_kN": 0, "Mx_kNm": 0, "My_kNm": 0, "Mz_kNm": 0 }]
}
```

## Critical: 11-point sampling is non-negotiable
`staad_diagram_points` with 11 points per member per combo is what enables accurate bend point calculation.
Without it the beam engine cannot determine where along the span the moment drops below φMn(perimeter only).
Do not reduce to just start/mid/end points — the curve shape matters.

## STAAD win32com pattern
```python
import win32com.client
staad = win32com.client.Dispatch("STAAD.Application")
staad.OpenSTAADFile(file_path)
output = staad.Output
# Get beam forces at distance x along member:
forces = output.GetMemberEndForces(member_id, combo_number, x_ratio)
# Mz = forces[4], Vy = forces[1]
```
