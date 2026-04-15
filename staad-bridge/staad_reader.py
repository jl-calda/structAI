"""STAAD Pro model reader.

Uses win32com to drive STAAD's COM Automation interface. Windows-only.
On non-Windows dev machines set MOCK_MODE=1 in .env — `read_model()`
will then return synthetic data instead of talking to STAAD.

Reference: docs/13-bridge.md. The 11-point sampling per member per combo
is non-negotiable — without it the beam engine cannot locate bend
points correctly. See docs/05-beam-engine.md § bend points.
"""
from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import List, Optional, Tuple

from payload import (
    CombinationFactor,
    SyncCombination,
    SyncDiagramPoint,
    SyncEnvelope,
    SyncLoadCase,
    SyncMaterial,
    SyncMember,
    SyncNode,
    SyncPayload,
    SyncReaction,
    SyncSection,
)

N_SAMPLES = 11  # x_ratio = 0.0, 0.1, ..., 1.0


# ---------------------------------------------------------------------------
# File hashing
# ---------------------------------------------------------------------------

def file_sha256(path: Path) -> str:
    """SHA-256 of a .std file's raw bytes."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# COM reader (Windows)
# ---------------------------------------------------------------------------

class StaadError(RuntimeError):
    pass


# STAAD Pro's COM ProgID has changed between versions. We try a few known
# ones in order. When a user reports "Invalid class string" paste the error
# in and add the new value here.
_CANDIDATE_PROGIDS = (
    "OpenSTAAD.Application",
    "StaadPro.OpenSTAAD",
    "STAADOpenUI.BOpenSTAAD",
)

# Methods a running STAAD instance might expose for "what's the current
# input file path". Tried in order; first non-empty wins.
_FILENAME_METHODS = ("GetSTAADFile", "GetFileName", "GetInputFile")
_FILENAME_ATTRS = ("FileName", "Name", "InputFile")


def _connect_to_staad():
    """Attach to a running STAAD instance first; fall back to Dispatch.

    GetActiveObject reuses the STAAD the user already has open (which is
    what we want — we're reading their model, not launching a fresh one).
    Dispatch would silently start a second instance on machines where the
    running STAAD doesn't register itself in the ROT.

    Returns `(staad_com_object, progid_used)`.
    """
    try:
        import pythoncom  # type: ignore
        import win32com.client  # type: ignore
    except ImportError as e:
        raise StaadError(
            "win32com/pythoncom are unavailable. On non-Windows hosts use MOCK_MODE=1."
        ) from e

    # COM has to be initialised on the thread that makes the call. uvicorn
    # runs the poll_loop on an asyncio worker which isn't pre-initialised,
    # so do it here. Safe to call repeatedly.
    pythoncom.CoInitialize()

    last_err: Optional[Exception] = None
    # 1. Attach to a running instance.
    for progid in _CANDIDATE_PROGIDS:
        try:
            return win32com.client.GetActiveObject(progid), progid
        except Exception as e:
            last_err = e
    # 2. Fall back to Dispatch — may launch STAAD if COM is registered.
    for progid in _CANDIDATE_PROGIDS:
        try:
            return win32com.client.Dispatch(progid), progid
        except Exception as e:
            last_err = e

    raise StaadError(
        "Could not connect to STAAD via COM. Tried ProgIDs: "
        + ", ".join(_CANDIDATE_PROGIDS)
        + f". Last error: {last_err}"
    )


def resolve_active_staad_file() -> Path:
    """Ask the running STAAD instance which .std file is currently open."""
    staad, progid = _connect_to_staad()
    for method in _FILENAME_METHODS:
        try:
            value = getattr(staad, method)()
            if value:
                return Path(str(value))
        except Exception:
            continue
    for attr in _FILENAME_ATTRS:
        try:
            value = getattr(staad, attr)
            if value:
                return Path(str(value))
        except Exception:
            continue
    raise StaadError(
        f"Connected to STAAD via {progid} but could not determine the "
        "current file. Set STAAD_FILE_PATH in .env to bypass this."
    )


def _open_staad(file_path: Optional[Path]):
    """Return a STAAD COM object ready to read. When `file_path` is given
    and differs from the currently-open model we open it; otherwise we
    reuse the already-loaded model.
    """
    staad, _progid = _connect_to_staad()
    if file_path is not None:
        try:
            # Only call OpenSTAADFile if the file isn't already loaded —
            # re-opening forces STAAD to prompt about unsaved changes.
            current = None
            for method in _FILENAME_METHODS:
                try:
                    current = getattr(staad, method)()
                    if current:
                        break
                except Exception:
                    continue
            if not current or str(current).lower() != str(file_path).lower():
                staad.OpenSTAADFile(str(file_path))
        except Exception as e:
            raise StaadError(f"OpenSTAADFile({file_path}): {e}") from e
    return staad


def _read_real_model(project_id: str, file_path: Path) -> SyncPayload:
    staad = _open_staad(file_path)

    geometry = staad.Geometry
    property_ = staad.Property
    load = staad.Load
    output = staad.Output

    # Nodes
    n_nodes = geometry.GetNodeCount()
    nodes: List[SyncNode] = []
    for i in range(1, n_nodes + 1):
        x = y = z = 0.0
        x, y, z = geometry.GetNodeCoordinates(i, x, y, z)
        # x/y/z come back in the STAAD unit system. We assume metres → mm.
        nodes.append(
            SyncNode(
                node_id=i,
                x_mm=float(x) * 1000,
                y_mm=float(y) * 1000,
                z_mm=float(z) * 1000,
                support_type=_support_type_for_node(geometry, i),
            )
        )

    # Members
    n_members = geometry.GetMemberCount()
    members: List[SyncMember] = []
    for i in range(1, n_members + 1):
        start = end = 0
        start, end = geometry.GetMemberIncidences(i, start, end)
        length_m = geometry.GetMemberLength(i)
        section_name = property_.GetBeamSectionName(i) or f"SECTION-{i}"
        members.append(
            SyncMember(
                member_id=i,
                start_node_id=int(start),
                end_node_id=int(end),
                section_name=section_name,
                length_mm=float(length_m) * 1000,
                beta_angle_deg=0.0,
                member_type=_infer_member_type(geometry, i),
            )
        )

    # Sections (deduped by name)
    sections_by_name = {}
    for m in members:
        if m.section_name in sections_by_name:
            continue
        dims = _section_dims(property_, m.section_name)
        sections_by_name[m.section_name] = SyncSection(
            section_name=m.section_name,
            section_type="rectangular",
            **dims,
        )
    sections = list(sections_by_name.values())

    # Materials — STAAD doesn't expose named materials cleanly via COM in
    # every version, so we seed a single entry per unique material name.
    # In practice most concrete models use one material; the app side
    # does not rely on this being exhaustive.
    materials: List[SyncMaterial] = [
        SyncMaterial(
            name="CONCRETE",
            e_mpa=24_860,   # 28 MPa concrete, typical
            density_kn_m3=24.0,
            fc_mpa=28.0,
            fy_mpa=420.0,
        )
    ]

    # Load cases
    n_cases = load.GetPrimaryLoadCaseCount()
    load_cases: List[SyncLoadCase] = []
    for i in range(1, n_cases + 1):
        num = load.GetPrimaryLoadCaseNumber(i)
        title = load.GetLoadCaseTitle(num) or f"CASE {num}"
        load_cases.append(
            SyncLoadCase(
                case_number=int(num),
                title=str(title),
                load_type=_infer_load_type(title),
            )
        )

    # Combinations
    n_combos = load.GetLoadCombinationCaseCount()
    combos: List[SyncCombination] = []
    combo_numbers: List[int] = []
    for i in range(1, n_combos + 1):
        combo_num = load.GetLoadCombinationCaseNumber(i)
        combo_numbers.append(int(combo_num))
        title = load.GetLoadCaseTitle(combo_num) or f"COMBO {combo_num}"
        # STAAD exposes the factors via a separate call; we skip parsing
        # and record an empty factors list — the app regenerates its own
        # combos when the user hits "Generate" in the UI.
        combos.append(
            SyncCombination(
                combo_number=int(combo_num),
                title=str(title),
                factors=[],
                source="imported",
            )
        )

    # Diagram points — the critical bit.
    # For each member, for each combo, sample M(x) and V(x) at 11 x_ratios.
    diagram_points: List[SyncDiagramPoint] = []
    envelope_map: dict[int, _EnvelopeAcc] = {m.member_id: _EnvelopeAcc() for m in members}
    for mid in range(1, n_members + 1):
        length_m = geometry.GetMemberLength(mid)
        for combo in combo_numbers:
            for s in range(N_SAMPLES):
                x_ratio = s / (N_SAMPLES - 1)
                x_mm = float(length_m) * 1000 * x_ratio
                forces = output.GetMemberEndForcesAtDistance(
                    mid, combo, x_ratio * length_m, True,
                )
                # forces layout per STAAD OpenSTAAD docs:
                # [0]=Fx, [1]=Fy, [2]=Fz, [3]=Mx, [4]=My, [5]=Mz
                fx, fy, _fz, _mx, _my, mz = forces[0:6]
                diagram_points.append(SyncDiagramPoint(
                    member_id=mid,
                    combo_number=combo,
                    x_ratio=x_ratio,
                    x_mm=x_mm,
                    mz_knm=float(mz),
                    vy_kn=float(fy),
                    n_kn=float(fx),
                ))
                envelope_map[mid].update(
                    combo=combo,
                    mz_knm=float(mz),
                    vy_kn=float(fy),
                    n_kn=float(fx),
                )

    envelope = [acc.to_row(mid) for mid, acc in envelope_map.items()]

    # Reactions
    reactions: List[SyncReaction] = []
    support_nodes = [n.node_id for n in nodes if n.support_type is not None]
    for node in support_nodes:
        for combo in combo_numbers:
            rx = ry = rz = mx = my = mz = 0.0
            r = output.GetSupportReactions(node, combo)
            if r and len(r) >= 6:
                rx, ry, rz, mx, my, mz = r[0:6]
            reactions.append(SyncReaction(
                node_id=int(node),
                combo_number=int(combo),
                rx_kn=float(rx),
                ry_kn=float(ry),
                rz_kn=float(rz),
                mx_knm=float(mx),
                my_knm=float(my),
                mz_knm=float(mz),
            ))

    return SyncPayload(
        project_id=project_id,
        file_name=file_path.name,
        file_hash=file_sha256(file_path),
        nodes=nodes,
        members=members,
        sections=sections,
        materials=materials,
        load_cases=load_cases,
        combinations=combos,
        diagram_points=diagram_points,
        envelope=envelope,
        reactions=reactions,
    )


# ---------------------------------------------------------------------------
# Mock reader (for non-Windows dev)
# ---------------------------------------------------------------------------

def _read_mock_model(project_id: str) -> SyncPayload:
    """Synthetic 3-storey portal frame with one live load case + self-weight.

    Use this to exercise the sync endpoint + dashboard + beam engine
    end-to-end from a Linux / macOS dev box. Numbers are deliberately
    round so output is easy to eyeball.
    """
    nodes: List[SyncNode] = []
    idx = 1
    for floor in range(4):
        for col in range(2):
            nodes.append(SyncNode(
                node_id=idx,
                x_mm=col * 6000,
                y_mm=floor * 3500,
                z_mm=0,
                support_type="fixed" if floor == 0 else None,
            ))
            idx += 1

    members: List[SyncMember] = []
    # Columns (left/right per floor).
    mid = 1
    for floor in range(3):
        left_start = 1 + 2 * floor
        left_end = left_start + 2
        right_start = left_start + 1
        right_end = right_start + 2
        members.append(SyncMember(
            member_id=mid, start_node_id=left_start, end_node_id=left_end,
            section_name="COL-400x400", length_mm=3500, member_type="column",
        )); mid += 1
        members.append(SyncMember(
            member_id=mid, start_node_id=right_start, end_node_id=right_end,
            section_name="COL-400x400", length_mm=3500, member_type="column",
        )); mid += 1
    # Beams — one per floor level 1..3.
    for floor in range(1, 4):
        left = 1 + 2 * floor
        right = left + 1
        members.append(SyncMember(
            member_id=mid, start_node_id=left, end_node_id=right,
            section_name="BM-300x600", length_mm=6000, member_type="beam",
        )); mid += 1

    sections = [
        SyncSection(section_name="COL-400x400", section_type="rectangular",
                    b_mm=400, h_mm=400, area_mm2=160_000),
        SyncSection(section_name="BM-300x600", section_type="rectangular",
                    b_mm=300, h_mm=600, area_mm2=180_000),
    ]

    materials = [SyncMaterial(
        name="CONCRETE", e_mpa=24860, density_kn_m3=24.0,
        fc_mpa=28.0, fy_mpa=420.0,
    )]

    load_cases = [
        SyncLoadCase(case_number=1, title="DEAD LOAD", load_type="dead"),
        SyncLoadCase(case_number=2, title="LIVE LOAD", load_type="live"),
    ]
    combos = [
        SyncCombination(combo_number=101, title="1.4D",
                        factors=[CombinationFactor(case_number=1, load_type="dead", factor=1.4)]),
        SyncCombination(combo_number=102, title="1.2D + 1.6L",
                        factors=[
                            CombinationFactor(case_number=1, load_type="dead", factor=1.2),
                            CombinationFactor(case_number=2, load_type="live", factor=1.6),
                        ]),
    ]

    # Synthetic diagrams — parabolic M(x), linear V(x) per member.
    diagrams: List[SyncDiagramPoint] = []
    envelope_map: dict[int, _EnvelopeAcc] = {m.member_id: _EnvelopeAcc() for m in members}
    for m in members:
        is_beam = m.member_type == "beam"
        for combo in [101, 102]:
            factor = 1.4 if combo == 101 else 2.5
            peak_mz = (240 if is_beam else 60) * factor
            peak_vy = (220 if is_beam else 45) * factor
            for s in range(N_SAMPLES):
                x_ratio = s / (N_SAMPLES - 1)
                x_mm = m.length_mm * x_ratio
                # parabolic moment peaking at midspan for beams, at top/bot for cols
                if is_beam:
                    mz = peak_mz * 4 * x_ratio * (1 - x_ratio) - peak_mz * 0.6
                else:
                    mz = peak_mz * (1 - 2 * x_ratio)
                vy = peak_vy * (1 - 2 * x_ratio)
                n_kn = -80 * factor if m.member_type == "column" else 0
                diagrams.append(SyncDiagramPoint(
                    member_id=m.member_id, combo_number=combo,
                    x_ratio=x_ratio, x_mm=x_mm,
                    mz_knm=mz, vy_kn=vy, n_kn=n_kn,
                ))
                envelope_map[m.member_id].update(combo=combo, mz_knm=mz, vy_kn=vy, n_kn=n_kn)

    envelope = [acc.to_row(mid) for mid, acc in envelope_map.items()]

    # Support reactions — just the fixed base nodes.
    reactions: List[SyncReaction] = []
    for n in nodes:
        if n.support_type is None:
            continue
        for combo in [101, 102]:
            factor = 1.4 if combo == 101 else 2.5
            reactions.append(SyncReaction(
                node_id=n.node_id, combo_number=combo,
                ry_kn=280 * factor, mz_knm=120 * factor,
            ))

    hash_input = f"mock:{project_id}:{len(members)}:{len(combos)}"
    return SyncPayload(
        project_id=project_id,
        file_name="MOCK-FRAME.std",
        file_hash=hashlib.sha256(hash_input.encode()).hexdigest(),
        nodes=nodes,
        members=members,
        sections=sections,
        materials=materials,
        load_cases=load_cases,
        combinations=combos,
        diagram_points=diagrams,
        envelope=envelope,
        reactions=reactions,
    )


# ---------------------------------------------------------------------------
# Public entry
# ---------------------------------------------------------------------------

def read_model(project_id: str, file_path: Optional[Path], mock: bool) -> SyncPayload:
    """Read the STAAD model → SyncPayload.

    Priority:
      1. mock = True            → synthetic 3-storey frame.
      2. file_path given        → open it via COM (no-op if already loaded),
                                  then read.
      3. file_path is None      → attach to the running STAAD instance and
                                  read whatever it currently has open.
    """
    if mock:
        return _read_mock_model(project_id)
    if file_path is None:
        # Resolve the active doc's path so we can still hash it. The
        # _read_real_model call itself will reuse the same COM connection.
        file_path = resolve_active_staad_file()
    return _read_real_model(project_id, file_path)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _EnvelopeAcc:
    def __init__(self) -> None:
        self.mpos = 0.0
        self.mpos_combo: Optional[int] = None
        self.mneg = 0.0
        self.mneg_combo: Optional[int] = None
        self.vu = 0.0
        self.vu_combo: Optional[int] = None
        self.nu_t = 0.0
        self.nu_c = 0.0

    def update(self, *, combo: int, mz_knm: float, vy_kn: float, n_kn: float) -> None:
        if mz_knm > self.mpos:
            self.mpos, self.mpos_combo = mz_knm, combo
        neg_mag = -mz_knm if mz_knm < 0 else 0
        if neg_mag > self.mneg:
            self.mneg, self.mneg_combo = neg_mag, combo
        v_mag = abs(vy_kn)
        if v_mag > self.vu:
            self.vu, self.vu_combo = v_mag, combo
        if n_kn > self.nu_t:
            self.nu_t = n_kn
        comp_mag = -n_kn if n_kn < 0 else 0
        if comp_mag > self.nu_c:
            self.nu_c = comp_mag

    def to_row(self, mid: int) -> SyncEnvelope:
        return SyncEnvelope(
            member_id=mid,
            mpos_max_knm=self.mpos,
            mpos_combo=self.mpos_combo,
            mneg_max_knm=self.mneg,
            mneg_combo=self.mneg_combo,
            vu_max_kn=self.vu,
            vu_combo=self.vu_combo,
            nu_tension_max_kn=self.nu_t,
            nu_compression_max_kn=self.nu_c,
        )


def _support_type_for_node(geometry, node_id: int) -> Optional[str]:
    """Best-effort read of support type from STAAD geometry COM."""
    try:
        code = geometry.GetSupportType(node_id)
    except Exception:
        return None
    if code is None:
        return None
    code_int = int(code)
    if code_int == 1:
        return "fixed"
    if code_int == 2:
        return "pinned"
    return None


def _section_dims(property_, section_name: str) -> dict:
    """Read b/h/area from STAAD where possible. Everything optional."""
    try:
        b = float(property_.GetBeamSectionWidth(section_name)) * 1000
        h = float(property_.GetBeamSectionDepth(section_name)) * 1000
        return {"b_mm": b, "h_mm": h, "area_mm2": b * h}
    except Exception:
        return {"b_mm": None, "h_mm": None, "area_mm2": None}


def _infer_member_type(geometry, member_id: int) -> str:
    """Call the member a beam if it's more horizontal than vertical, else column."""
    try:
        start = end = 0
        start, end = geometry.GetMemberIncidences(member_id, start, end)
        x1 = y1 = z1 = x2 = y2 = z2 = 0.0
        x1, y1, z1 = geometry.GetNodeCoordinates(start, x1, y1, z1)
        x2, y2, z2 = geometry.GetNodeCoordinates(end, x2, y2, z2)
        dx = abs(x2 - x1)
        dy = abs(y2 - y1)
        dz = abs(z2 - z1)
        if dy > max(dx, dz):
            return "column"
        return "beam"
    except Exception:
        return "other"


def _infer_load_type(title: str) -> str:
    t = title.upper()
    if any(k in t for k in ("DEAD", "DL", "SELF")):
        return "dead"
    if "ROOF" in t:
        return "roof_live"
    if any(k in t for k in ("LIVE", "LL")):
        return "live"
    if "WIND" in t and ("X" in t or "EW" in t):
        return "wind_x"
    if "WIND" in t:
        return "wind_z"
    if any(k in t for k in ("SEISMIC", "EQ", "EARTH")) and "X" in t:
        return "seismic_x"
    if any(k in t for k in ("SEISMIC", "EQ", "EARTH")):
        return "seismic_z"
    return "other"


# Silence unused-import complaint from the mock-only build.
_ = math
_ = Tuple
