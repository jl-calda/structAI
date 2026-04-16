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
    "StaadPro.OpenSTAAD",        # V22 CONNECT — confirmed working
    "OpenSTAAD.Application",     # older versions
    "STAADOpenUI.BOpenSTAAD",    # legacy
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


def _com_int(obj, name: str) -> int:
    """Return an integer from a COM member that might be a method OR a
    property depending on STAAD version.

    V20/V21: `Geometry.GetNodeCount()`  (method)
    V22 CONNECT Edition: `Geometry.GetNodeCount`  (property) — seen in the
    wild; some V22 builds still work as a method. Handling both means the
    reader survives across versions without per-version branching.
    """
    attr = getattr(obj, name)
    # Try invoking as a method first; fall back to treating it as a value.
    try:
        result = attr()
    except TypeError:
        result = attr
    except Exception as e:
        raise StaadError(f"{name}: {e}") from e
    try:
        return int(result)
    except (TypeError, ValueError) as e:
        raise StaadError(f"{name} returned non-integer ({result!r}): {e}") from e


def _com_float_or_call(obj, name: str, *args) -> float:
    """Call a COM method that returns a float, handling property-vs-method."""
    try:
        result = getattr(obj, name)(*args)
    except TypeError:
        result = getattr(obj, name)
    if result is None:
        return 0.0
    return float(result)


def _safe_str(obj, name: str, *args) -> str:
    """Call a COM method that returns a string; returns '' on failure."""
    try:
        result = getattr(obj, name)(*args)
        return str(result) if result else ""
    except Exception:
        return ""


def _make_variant_double():
    """Create a VARIANT by-ref double (VT_R8) for COM output params.

    Pattern from the official OpenSTAAD Python library:
      safe_array → VARIANT(VT_BYREF | VT_R8) → pass to COM → read [0].
    """
    import win32com.client  # type: ignore
    import pythoncom  # type: ignore
    sa = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, [0.0])
    return win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_R8, sa)


def _make_variant_long():
    """Create a VARIANT by-ref long (VT_I4) for COM output params."""
    import win32com.client  # type: ignore
    import pythoncom  # type: ignore
    sa = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_I4, [0])
    return win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, sa)


def _make_variant_double_array(n: int):
    """By-ref VARIANT holding an n-element double array for COM output
    params like `pdForces` in GetIntermediateMemberForcesAtDistance."""
    import win32com.client  # type: ignore
    import pythoncom  # type: ignore
    sa = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, [0.0] * n)
    return win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_R8, sa)


def _make_variant_long_array(n: int):
    """By-ref VARIANT holding an n-element long array for output params
    like `lCases` in GetPrimaryLoadCaseNumbers."""
    import win32com.client  # type: ignore
    import pythoncom  # type: ignore
    sa = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_I4, [0] * n)
    return win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, sa)


def _variant_to_list(v) -> list:
    """Extract a list from a by-ref VARIANT output. V22 returns VARIANT
    objects with `.value`; older builds return raw tuples."""
    if hasattr(v, "value"):
        val = v.value
    else:
        val = v
    if val is None:
        return []
    try:
        return list(val)
    except TypeError:
        return [val]


def _flag_geometry_methods(geometry) -> None:
    """Call _FlagAsMethod on all geometry methods we use.

    Names must match the OpenSTAAD COM API exactly. See
    docs/openstaad/OSAPP/class_o_s_geometry_u_i.html.
    """
    methods = [
        "GetNodeCount",
        "GetMemberCount",
        "GetNodeCoordinates",
        "GetMemberIncidence",
        "GetBeamLength",
        "GetNodeList",
        "GetBeamList",
    ]
    for name in methods:
        try:
            geometry._FlagAsMethod(name)
        except Exception:
            pass  # method doesn't exist on this COM version — skip


def _flag_support_methods(support_obj) -> None:
    methods = ["GetSupportType", "GetSupportCount", "GetSupportNodes"]
    for name in methods:
        try:
            support_obj._FlagAsMethod(name)
        except Exception:
            pass


def _flag_property_methods(property_obj) -> None:
    # GetBeamSectionWidth/GetBeamSectionDepth are not in OpenSTAAD — flag
    # only methods that actually exist. Section dims come from the
    # property-values call (best-effort; optional in the payload).
    methods = ["GetBeamSectionName", "GetSectionPropertyValues"]
    for name in methods:
        try:
            property_obj._FlagAsMethod(name)
        except Exception:
            pass


def _flag_load_methods(load_obj) -> None:
    # OpenSTAAD exposes plural ...Numbers methods that fill a by-ref array;
    # there is no singular per-index accessor.
    methods = [
        "GetPrimaryLoadCaseCount", "GetPrimaryLoadCaseNumbers",
        "GetLoadCaseTitle", "GetLoadCombinationCaseCount",
        "GetLoadCombinationCaseNumbers",
    ]
    for name in methods:
        try:
            load_obj._FlagAsMethod(name)
        except Exception:
            pass


def _flag_output_methods(output_obj) -> None:
    # Per-section forces come from GetIntermediateMemberForcesAtDistance;
    # GetMemberEndForcesAtDistance is not an OpenSTAAD method.
    methods = [
        "GetIntermediateMemberForcesAtDistance", "GetSupportReactions",
        "GetMemberEndForces",
    ]
    for name in methods:
        try:
            output_obj._FlagAsMethod(name)
        except Exception:
            pass


def _get_node_coords(geometry, node_id: int) -> tuple:
    """Read (x_mm, y_mm, z_mm) for a node using the VARIANT by-ref
    pattern from the official OpenSTAAD Python library.

    Coordinates come back in the STAAD unit system (typically metres
    for metric models); we convert to mm.
    """
    import logging
    log = logging.getLogger("staad-bridge")

    try:
        x = _make_variant_double()
        y = _make_variant_double()
        z = _make_variant_double()
        geometry.GetNodeCoordinates(node_id, x, y, z)
        # V22 returns VARIANT objects — extract .value or index [0].
        def _val(v):
            if hasattr(v, 'value'):
                return float(v.value)
            try:
                return float(v[0])
            except (TypeError, IndexError):
                return float(v)
        return _val(x) * 1000, _val(y) * 1000, _val(z) * 1000
    except Exception as e:
        log.warning("GetNodeCoordinates(%d) failed: %s", node_id, e)
    return 0.0, 0.0, 0.0


def _get_member_incidences(geometry, member_id: int) -> tuple:
    """Read (start_node_id, end_node_id) for a member via
    Geometry.GetMemberIncidence (singular — no plural form exists in the
    OpenSTAAD COM API)."""
    def _ival(v):
        if hasattr(v, 'value'):
            return int(v.value)
        try:
            return int(v[0])
        except (TypeError, IndexError):
            return int(v)

    try:
        s = _make_variant_long()
        e = _make_variant_long()
        geometry.GetMemberIncidence(member_id, s, e)
        return _ival(s), _ival(e)
    except Exception:
        return 0, 0


def _read_real_model(project_id: str, file_path: Path) -> SyncPayload:
    import logging
    log = logging.getLogger("staad-bridge")

    # Single COM connection — don't call OpenSTAADFile; the model is
    # already open in STAAD. Creating multiple connections or re-opening
    # the file disrupts V22 CONNECT's COM state.
    staad, progid = _connect_to_staad()
    log.info("connected via %s", progid)

    try:
        geometry = staad.Geometry
        property_ = staad.Property
        load = staad.Load
        output = staad.Output
        support = staad.Support  # GetSupportType lives here, not on Geometry
    except Exception as e:
        raise StaadError(
            f"Could not access Geometry/Property/Load/Output/Support on the "
            f"STAAD COM object. Underlying error: {e}. If you're on STAAD "
            f"CONNECT V22, check that a model is currently open in STAAD."
        ) from e

    # Tell win32com which attributes are callable methods, not properties.
    _flag_geometry_methods(geometry)
    _flag_support_methods(support)
    _flag_property_methods(property_)
    _flag_load_methods(load)
    _flag_output_methods(output)

    # Nodes
    try:
        n_nodes = _com_int(geometry, "GetNodeCount")
    except StaadError:
        raise
    except Exception as e:
        raise StaadError(
            f"Geometry.GetNodeCount failed: {e}. "
            f"Likely a STAAD COM-version mismatch — open an issue with "
            f"the STAAD version (Help → About) and the full traceback."
        ) from e
    log.info("staad read: %d nodes", n_nodes)

    nodes: List[SyncNode] = []
    for i in range(1, n_nodes + 1):
        x_mm, y_mm, z_mm = _get_node_coords(geometry, i)
        nodes.append(
            SyncNode(
                node_id=i,
                x_mm=x_mm,
                y_mm=y_mm,
                z_mm=z_mm,
                support_type=_support_type_for_node(support, i),
            )
        )

    # Build a node-coordinate lookup for length computation fallback.
    node_coords = {n.node_id: (n.x_mm, n.y_mm, n.z_mm) for n in nodes}

    # Members
    n_members = _com_int(geometry, "GetMemberCount")
    log.info("staad read: %d members", n_members)
    members: List[SyncMember] = []
    for i in range(1, n_members + 1):
        start_id, end_id = _get_member_incidences(geometry, i)

        # GetBeamLength is the only length accessor in OpenSTAAD's Geometry
        # class; fall back to Euclidean distance between start/end nodes.
        length_mm = 0.0
        try:
            val = _com_float_or_call(geometry, "GetBeamLength", i)
            if val > 0:
                length_mm = val * 1000  # metres → mm
        except Exception:
            pass
        if length_mm <= 0:
            a = node_coords.get(start_id, (0, 0, 0))
            b = node_coords.get(end_id, (0, 0, 0))
            length_mm = ((b[0]-a[0])**2 + (b[1]-a[1])**2 + (b[2]-a[2])**2) ** 0.5
            log.info("member %d length from node coords: %.0f mm", i, length_mm)

        section_name = _safe_str(property_, "GetBeamSectionName", i) or f"SECTION-{i}"
        members.append(
            SyncMember(
                member_id=i,
                start_node_id=start_id,
                end_node_id=end_id,
                section_name=section_name,
                length_mm=length_mm,
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

    # Load cases — GetPrimaryLoadCaseNumbers fills a by-ref array of case
    # numbers in one call; there is no per-index accessor.
    n_cases = _com_int(load, "GetPrimaryLoadCaseCount")
    log.info("staad read: %d primary load cases", n_cases)
    load_cases: List[SyncLoadCase] = []
    if n_cases > 0:
        case_array = _make_variant_long_array(n_cases)
        try:
            load.GetPrimaryLoadCaseNumbers(case_array)
        except Exception as e:
            raise StaadError(f"GetPrimaryLoadCaseNumbers: {e}") from e
        for num in _variant_to_list(case_array):
            num = int(num)
            title = load.GetLoadCaseTitle(num) or f"CASE {num}"
            load_cases.append(
                SyncLoadCase(
                    case_number=num,
                    title=str(title),
                    load_type=_infer_load_type(str(title)),
                )
            )

    # Combinations — same pattern: one plural array-filling call.
    n_combos = _com_int(load, "GetLoadCombinationCaseCount")
    log.info("staad read: %d combinations", n_combos)
    combos: List[SyncCombination] = []
    combo_numbers: List[int] = []
    if n_combos > 0:
        combo_array = _make_variant_long_array(n_combos)
        try:
            load.GetLoadCombinationCaseNumbers(combo_array)
        except Exception as e:
            raise StaadError(f"GetLoadCombinationCaseNumbers: {e}") from e
        for combo_num in _variant_to_list(combo_array):
            combo_num = int(combo_num)
            combo_numbers.append(combo_num)
            title = load.GetLoadCaseTitle(combo_num) or f"COMBO {combo_num}"
            # STAAD exposes the factors via a separate call; we skip parsing
            # and record an empty factors list — the app regenerates its own
            # combos when the user hits "Generate" in the UI.
            combos.append(
                SyncCombination(
                    combo_number=combo_num,
                    title=str(title),
                    factors=[],
                    source="imported",
                )
            )

    # Diagram points — the critical bit.
    # For each member, for each combo, sample M(x) and V(x) at 11 x_ratios.
    # Uses OSOutputUI.GetIntermediateMemberForcesAtDistance with a by-ref
    # 6-element double array for [Fx, Fy, Fz, Mx, My, Mz] in local axes.
    # Reuses length_mm computed above — GetMemberLength is not part of the
    # OpenSTAAD COM API.
    length_m_by_member = {m.member_id: m.length_mm / 1000.0 for m in members}
    diagram_points: List[SyncDiagramPoint] = []
    envelope_map: dict[int, _EnvelopeAcc] = {m.member_id: _EnvelopeAcc() for m in members}
    for mid in range(1, n_members + 1):
        length_m = length_m_by_member.get(mid, 0.0)
        for combo in combo_numbers:
            for s in range(N_SAMPLES):
                x_ratio = s / (N_SAMPLES - 1)
                x_mm = length_m * 1000 * x_ratio
                pd_forces = _make_variant_double_array(6)
                try:
                    output.GetIntermediateMemberForcesAtDistance(
                        mid, x_ratio * length_m, combo, pd_forces,
                    )
                except Exception as e:
                    raise StaadError(
                        f"GetIntermediateMemberForcesAtDistance(mid={mid}, "
                        f"d={x_ratio * length_m:.3f}, lc={combo}): {e}"
                    ) from e
                # pdForces layout per OpenSTAAD docs (local axes):
                # [0]=Fx, [1]=Fy, [2]=Fz, [3]=Mx, [4]=My, [5]=Mz
                forces = _variant_to_list(pd_forces)
                if len(forces) < 6:
                    forces = list(forces) + [0.0] * (6 - len(forces))
                fx, fy, fz, _mx, my, mz = forces[0:6]
                diagram_points.append(SyncDiagramPoint(
                    member_id=mid,
                    combo_number=combo,
                    x_ratio=x_ratio,
                    x_mm=x_mm,
                    mz_knm=float(mz),
                    vy_kn=float(fy),
                    n_kn=float(fx),
                    my_knm=float(my),
                    vz_kn=float(fz),
                ))
                envelope_map[mid].update(
                    combo=combo,
                    mz_knm=float(mz),
                    vy_kn=float(fy),
                    n_kn=float(fx),
                    my_knm=float(my),
                )

    envelope = [acc.to_row(mid) for mid, acc in envelope_map.items()]

    # Reactions — GetSupportReactions(nNodeNo, nLC, pdReactions) uses the
    # same by-ref 6-element output-array pattern as the forces call.
    reactions: List[SyncReaction] = []
    support_nodes = [n.node_id for n in nodes if n.support_type is not None]
    for node in support_nodes:
        for combo in combo_numbers:
            pd_reactions = _make_variant_double_array(6)
            try:
                output.GetSupportReactions(node, combo, pd_reactions)
            except Exception as e:
                log.warning(
                    "GetSupportReactions(node=%d, lc=%d): %s", node, combo, e,
                )
                continue
            r = _variant_to_list(pd_reactions)
            if len(r) < 6:
                r = list(r) + [0.0] * (6 - len(r))
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
      1. mock = True  → synthetic 3-storey frame.
      2. Otherwise    → attach to the running STAAD instance and read.
                        file_path is used only for the SyncPayload.file_name
                        field; we do NOT call OpenSTAADFile — the model is
                        already loaded in STAAD.
    """
    if mock:
        return _read_mock_model(project_id)
    # Don't call resolve_active_staad_file() here — it creates a second
    # COM connection that interferes with _read_real_model's connection
    # on V22 CONNECT. _read_real_model uses a single _connect_to_staad().
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
        # Minor-axis (My) peaks for the biaxial column path.
        self.mpos_minor = 0.0
        self.mpos_combo_minor: Optional[int] = None
        self.mneg_minor = 0.0
        self.mneg_combo_minor: Optional[int] = None

    def update(
        self,
        *,
        combo: int,
        mz_knm: float,
        vy_kn: float,
        n_kn: float,
        my_knm: float = 0.0,
    ) -> None:
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
        if my_knm > self.mpos_minor:
            self.mpos_minor, self.mpos_combo_minor = my_knm, combo
        my_neg_mag = -my_knm if my_knm < 0 else 0
        if my_neg_mag > self.mneg_minor:
            self.mneg_minor, self.mneg_combo_minor = my_neg_mag, combo

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
            mpos_max_minor_knm=self.mpos_minor,
            mpos_combo_minor=self.mpos_combo_minor,
            mneg_max_minor_knm=self.mneg_minor,
            mneg_combo_minor=self.mneg_combo_minor,
        )


def _support_type_for_node(support, node_id: int) -> Optional[str]:
    """Best-effort read of support type from OSSupportUI.GetSupportType.

    Per OpenSTAAD docs this method lives on the Support COM object, NOT on
    Geometry. Returns None for unsupported nodes (docs: "returns 0 if node
    is not a support node")."""
    try:
        code = support.GetSupportType(node_id)
    except Exception:
        return None
    if code is None:
        return None
    try:
        code_int = int(code)
    except (TypeError, ValueError):
        return None
    if code_int == 1:
        return "fixed"
    if code_int == 2:
        return "pinned"
    return None


def _section_dims(property_, section_name: str) -> dict:
    """Section b/h/area are optional in the payload. OpenSTAAD has no
    per-name width/depth accessor; GetSectionPropertyValues could be used
    but requires resolving the section reference number first. Left as a
    best-effort stub — the app side treats these as optional."""
    return {"b_mm": None, "h_mm": None, "area_mm2": None}


def _infer_member_type(geometry, member_id: int) -> str:
    """Call the member a beam if it's more horizontal than vertical, else column.

    Uses the same VARIANT by-ref helpers as the rest of the reader — the
    previous implementation passed plain Python ints to COM by-ref slots
    and always raised, defaulting every member to 'other'.
    """
    try:
        start, end = _get_member_incidences(geometry, member_id)
        if start <= 0 or end <= 0:
            return "other"
        x1, y1, z1 = _get_node_coords(geometry, start)
        x2, y2, z2 = _get_node_coords(geometry, end)
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
