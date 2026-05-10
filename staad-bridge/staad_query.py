"""Live OpenSTAAD query functions.

These read directly from the running STAAD instance without going through
the full sync cycle. Used by the /query/* bridge endpoints for on-demand
member discovery and force extraction.

All COM work runs in the same single-thread executor as the sync loop,
so the COM apartment model stays correct.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, List, Optional

from staad_reader import StaadError, _connect_to_staad, _open_staad, _com_int, _unwrap, _unwrap_float

N_SAMPLES = 11


def _flag_methods(obj, names):
    for name in names:
        try:
            obj._FlagAsMethod(name)
        except Exception:
            pass


def query_members(
    file_path: Optional[Path],
    member_ids: List[int],
) -> List[Dict[str, Any]]:
    """Return geometry for given member IDs (or all if empty)."""
    try:
        import pythoncom
        pythoncom.CoInitialize()
    except ImportError:
        pass

    try:
        staad = _open_staad(file_path)
        geo = staad.Geometry
        prop = staad.Property

        _flag_methods(geo, [
            "GetMemberCount", "GetBeamLength", "GetMemberIncidence",
            "GetNodeCoordinates", "GetBeamList",
        ])
        _flag_methods(prop, ["GetBeamSectionName", "GetBetaAngle"])

        n_members = _com_int(geo, "GetMemberCount")

        if not member_ids:
            member_ids = list(range(1, n_members + 1))

        results = []
        for mid in member_ids:
            if mid < 1 or mid > n_members:
                continue
            try:
                import win32com.client
                import pythoncom as pc

                length = _unwrap_float(geo.GetBeamLength(mid))

                sa_a = win32com.client.VARIANT(pc.VT_ARRAY | pc.VT_I4, [0])
                sa_b = win32com.client.VARIANT(pc.VT_ARRAY | pc.VT_I4, [0])
                var_a = win32com.client.VARIANT(pc.VT_BYREF | pc.VT_I4, sa_a)
                var_b = win32com.client.VARIANT(pc.VT_BYREF | pc.VT_I4, sa_b)
                geo.GetMemberIncidence(mid, var_a, var_b)
                node_a = int(_unwrap(var_a))
                node_b = int(_unwrap(var_b))

                section_name = str(prop.GetBeamSectionName(mid) or "")

                coords_a = _get_node_coords(geo, node_a)
                coords_b = _get_node_coords(geo, node_b)

                dy = abs(coords_b[1] - coords_a[1])
                dx = abs(coords_b[0] - coords_a[0])
                dz = abs(coords_b[2] - coords_a[2])
                horiz = math.sqrt(dx * dx + dz * dz)

                if dy > horiz * 2:
                    member_type = "COLUMN"
                else:
                    member_type = "BEAM"

                results.append({
                    "member_id": mid,
                    "section_name": section_name,
                    "length_mm": round(length * 1000, 1),
                    "member_type": member_type,
                    "node_a": node_a,
                    "node_b": node_b,
                    "coords_a": coords_a,
                    "coords_b": coords_b,
                })
            except Exception as e:
                results.append({
                    "member_id": mid,
                    "error": str(e),
                })
        return results
    finally:
        try:
            import pythoncom
            pythoncom.CoUninitialize()
        except (ImportError, Exception):
            pass


def query_search_members(
    file_path: Optional[Path],
    section_name: Optional[str] = None,
    member_type: Optional[str] = None,
    floor_y_min: Optional[float] = None,
    floor_y_max: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Search for members matching criteria from the live STAAD model."""
    all_members = query_members(file_path, [])

    results = []
    for m in all_members:
        if "error" in m:
            continue

        if section_name:
            if section_name.upper() not in m["section_name"].upper():
                continue

        if member_type:
            if member_type.upper() != m["member_type"].upper():
                continue

        if floor_y_min is not None or floor_y_max is not None:
            mid_y = (m["coords_a"][1] + m["coords_b"][1]) / 2
            if floor_y_min is not None and mid_y < floor_y_min:
                continue
            if floor_y_max is not None and mid_y > floor_y_max:
                continue

        results.append(m)

    return results


def query_member_forces(
    file_path: Optional[Path],
    member_ids: List[int],
    combo_numbers: List[int],
) -> Dict[str, Any]:
    """Extract section forces for given members from the live STAAD model.

    Returns per-member envelope and a combined governing envelope.
    """
    try:
        import pythoncom
        import win32com.client
        pythoncom.CoInitialize()
    except ImportError:
        raise StaadError("win32com unavailable — cannot query live forces")

    try:
        staad = _open_staad(file_path)
        geo = staad.Geometry
        load_ = staad.Load
        out = staad.Output

        _flag_methods(geo, ["GetMemberCount", "GetBeamLength"])
        _flag_methods(load_, [
            "GetPrimaryLoadCaseCount", "GetLoadCombinationCaseCount",
            "GetLoadCombinationCaseNumbers",
        ])
        _flag_methods(out, ["GetIntermediateMemberForcesAtDistance"])

        if not combo_numbers:
            n_combos = _com_int(load_, "GetLoadCombinationCaseCount")
            if n_combos > 0:
                sa = win32com.client.VARIANT(
                    pythoncom.VT_ARRAY | pythoncom.VT_I4, [0] * n_combos
                )
                combo_arr = win32com.client.VARIANT(
                    pythoncom.VT_BYREF | pythoncom.VT_I4, sa
                )
                load_.GetLoadCombinationCaseNumbers(combo_arr)
                combo_numbers = [int(x) for x in list(combo_arr.value)]

        per_member = []
        for mid in member_ids:
            length_m = _unwrap_float(geo.GetBeamLength(mid))

            mpos_max = 0.0
            mneg_max = 0.0
            vu_max = 0.0
            nu_comp = 0.0
            nu_tens = 0.0
            mpos_combo = None
            mneg_combo = None
            vu_combo = None

            for lc in combo_numbers:
                for s in range(N_SAMPLES):
                    ratio = s / 10.0
                    dist = ratio * length_m

                    sa = win32com.client.VARIANT(
                        pythoncom.VT_ARRAY | pythoncom.VT_R8, [0.0] * 6
                    )
                    pd = win32com.client.VARIANT(
                        pythoncom.VT_BYREF | pythoncom.VT_R8, sa
                    )
                    try:
                        out.GetIntermediateMemberForcesAtDistance(mid, dist, lc, pd)
                        forces = [_unwrap_float(x) for x in list(pd.value)]
                    except Exception:
                        forces = [0.0] * 6

                    fx, fy, fz, mx, my, mz = forces

                    if mz > mpos_max:
                        mpos_max = mz
                        mpos_combo = lc
                    if mz < mneg_max:
                        mneg_max = mz
                        mneg_combo = lc
                    if abs(fy) > vu_max:
                        vu_max = abs(fy)
                        vu_combo = lc
                    if fx < 0 and abs(fx) > nu_comp:
                        nu_comp = abs(fx)
                    if fx > 0 and fx > nu_tens:
                        nu_tens = fx

            per_member.append({
                "member_id": mid,
                "length_mm": round(length_m * 1000, 1),
                "mpos_max": round(mpos_max, 2),
                "mneg_max": round(mneg_max, 2),
                "vu_max": round(vu_max, 2),
                "nu_comp": round(nu_comp, 2),
                "nu_tens": round(nu_tens, 2),
                "mpos_combo": mpos_combo,
                "mneg_combo": mneg_combo,
                "vu_combo": vu_combo,
            })

        envelope = {
            "mpos_max": max((m["mpos_max"] for m in per_member), default=0),
            "mneg_max": min((m["mneg_max"] for m in per_member), default=0),
            "vu_max": max((m["vu_max"] for m in per_member), default=0),
            "nu_comp_max": max((m["nu_comp"] for m in per_member), default=0),
            "nu_tens_max": max((m["nu_tens"] for m in per_member), default=0),
        }

        total_span = sum(m["length_mm"] for m in per_member)

        return {
            "per_member": per_member,
            "envelope": envelope,
            "totalSpan": total_span,
            "combos_checked": len(combo_numbers),
        }
    finally:
        try:
            import pythoncom
            pythoncom.CoUninitialize()
        except (ImportError, Exception):
            pass


def query_selected_members(file_path: Optional[Path]) -> List[Dict[str, Any]]:
    """Return members currently highlighted/selected in the STAAD GUI."""
    try:
        import pythoncom
        import win32com.client
        pythoncom.CoInitialize()
    except ImportError:
        raise StaadError("win32com unavailable")

    try:
        staad = _open_staad(file_path)
        geo = staad.Geometry
        view = staad.View

        _flag_methods(geo, ["GetMemberCount", "GetBeamLength", "GetMemberIncidence"])
        _flag_methods(view, ["GetSelectedBeams", "GetSelectedBeamCount", "SelectAllBeams"])

        # Try multiple approaches — OpenSTAAD selection API varies by version
        selected_ids: List[int] = []

        # Approach 1: GetSelectedBeams (V22 CONNECT)
        try:
            count = int(view.GetSelectedBeamCount())
            if count > 0:
                import win32com.client as w32
                import pythoncom as pc
                sa = w32.VARIANT(pc.VT_ARRAY | pc.VT_I4, [0] * count)
                arr = w32.VARIANT(pc.VT_BYREF | pc.VT_I4, sa)
                view.GetSelectedBeams(arr)
                selected_ids = [int(x) for x in list(arr.value) if int(x) > 0]
        except Exception:
            pass

        # Approach 2: iterate and check IsBeamSelected
        if not selected_ids:
            try:
                n_members = _com_int(geo, "GetMemberCount")
                for mid in range(1, n_members + 1):
                    try:
                        sel = view.IsBeamSelected(mid)
                        if sel and int(_unwrap(sel)) != 0:
                            selected_ids.append(mid)
                    except Exception:
                        continue
            except Exception:
                pass

        if not selected_ids:
            return []

        return query_members(file_path, selected_ids)
    finally:
        try:
            import pythoncom
            pythoncom.CoUninitialize()
        except (ImportError, Exception):
            pass


def _get_node_coords(geo, node_id: int) -> list:
    """Get [x, y, z] coordinates for a node in metres."""
    try:
        import win32com.client
        import pythoncom as pc

        def _mkvar():
            sa = win32com.client.VARIANT(pc.VT_ARRAY | pc.VT_R8, [0.0])
            return win32com.client.VARIANT(pc.VT_BYREF | pc.VT_R8, sa)

        vx, vy, vz = _mkvar(), _mkvar(), _mkvar()
        geo.GetNodeCoordinates(node_id, vx, vy, vz)
        return [round(_unwrap_float(vx), 4), round(_unwrap_float(vy), 4), round(_unwrap_float(vz), 4)]
    except Exception:
        return [0, 0, 0]
