"""STAAD Pro model reader — uses the official openstaad library.

Replaces the broken win32com VARIANT-by-ref approach. The official
openstaad package (pip install openstaad) uses comtypes and handles
all VARIANT complexity, returning clean Python tuples/lists.

Reference: docs/13-bridge.md. The 11-point sampling per member per combo
is non-negotiable — without it the beam engine cannot locate bend
points correctly. See docs/05-beam-engine.md § bend points.

On non-Windows dev set MOCK_MODE=1 in .env — read_model() returns
synthetic data instead of talking to STAAD.
"""
from __future__ import annotations

import hashlib
import logging
import math
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from payload import (
    CombinationFactor,
    SyncCombination,
    SyncDeflection,
    SyncDiagramPoint,
    SyncDisplacement,
    SyncEndForce,
    SyncEnvelope,
    SyncLoadCase,
    SyncMaterial,
    SyncMember,
    SyncNode,
    SyncPayload,
    SyncReaction,
    SyncReleaseSpec,
    SyncSection,
)

N_SAMPLES = 11  # x_ratio = 0.0, 0.1, ..., 1.0


# ---------------------------------------------------------------------------
# Unit conversion tables (official library returns values in MODEL units)
# ---------------------------------------------------------------------------

# Length unit string → millimetres
LEN_TO_MM = {
    "Inch": 25.4,
    "Feet": 304.8,
    "CentiMeter": 10.0,
    "Meter": 1000.0,
    "MilliMeter": 1.0,
    "DeciMeter": 100.0,
    "KiloMeter": 1_000_000.0,
}

# Length unit string → metres
LEN_TO_M = {
    "Inch": 0.0254,
    "Feet": 0.3048,
    "CentiMeter": 0.01,
    "Meter": 1.0,
    "MilliMeter": 0.001,
    "DeciMeter": 0.1,
    "KiloMeter": 1000.0,
}

# Force unit string → kilonewtons
FORCE_TO_KN = {
    "Kilopound": 4.44822,
    "Pound": 0.00444822,
    "Kilogram": 0.00980665,
    "Metric Ton": 9.80665,
    "Newton": 0.001,
    "KiloNewton": 1.0,
    "MegaNewton": 1000.0,
    "DecaNewton": 0.01,
}

# Canonical short label for the unit_system payload field.
_LEN_LABEL = {
    "Inch": "in", "Feet": "ft", "CentiMeter": "cm", "Meter": "m",
    "MilliMeter": "mm", "DeciMeter": "dm", "KiloMeter": "km",
}
_FORCE_LABEL = {
    "Kilopound": "klb", "Pound": "lb", "Kilogram": "kg", "Metric Ton": "mton",
    "Newton": "N", "KiloNewton": "kN", "MegaNewton": "MN", "DecaNewton": "daN",
}


class StaadError(RuntimeError):
    pass


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
# openstaad import — wrapped so non-Windows dev (mock mode) doesn't crash
# ---------------------------------------------------------------------------

def _import_openstaad():
    """Import the openstaad library, raising StaadError with a clear
    message if it (or comtypes) isn't available."""
    try:
        from openstaad import Geometry, Load, Output, Properties, Root  # type: ignore
    except Exception as e:  # ImportError, or comtypes init failure on non-Windows
        raise StaadError(
            "The 'openstaad' library is unavailable. Install it with "
            "`pip install openstaad comtypes` on a Windows host running "
            "STAAD Pro, or set MOCK_MODE=1 for non-Windows dev. "
            f"Underlying error: {e}"
        ) from e
    return Geometry, Load, Output, Properties, Root


def _import_openstaad_tools():
    """Import the comtypes VARIANT helpers from openstaad.tools.

    Returns (make_safe_array_double, make_safe_array_long, make_variant_vt_ref,
    automation). Any of the safe-array helpers may be None if the installed
    openstaad version names them differently — callers must handle that.
    """
    from openstaad.tools import make_safe_array_double  # type: ignore
    try:
        from openstaad.tools import make_safe_array_long  # type: ignore
    except Exception:
        make_safe_array_long = None
    from openstaad.tools import make_variant_vt_ref  # type: ignore
    from comtypes import automation  # type: ignore
    return make_safe_array_double, make_safe_array_long, make_variant_vt_ref, automation


# ---------------------------------------------------------------------------
# COM passthrough helpers (for methods the official lib doesn't wrap)
# ---------------------------------------------------------------------------

def _com_obj(wrapper):
    """Return the underlying comtypes COM object behind an openstaad wrapper.

    openstaad wrappers store the COM pointer as `._<name>` (e.g. Output → `._output`,
    Geometry → `._geometry`, Root → `._root`). Crucially the sub-object wrappers
    ALSO store `._root` (the top-level OpenSTAAD object), so we must check the
    *specific* sub-object name FIRST — otherwise an Output() wrapper would yield
    the root COM object and result-method calls would silently return zeros.

    Read it out of the instance __dict__ directly — these wrappers define
    __getattr__ that forwards unknown attributes to the COM object, which raises
    a COMError (not AttributeError) for names the COM object doesn't recognise.
    """
    d = getattr(wrapper, "__dict__", None)
    if isinstance(d, dict):
        for attr in ("_output", "_geometry", "_load", "_property",
                     "_support", "_design", "_command", "_view",
                     "_root", "_com", "comObject", "_obj"):
            obj = d.get(attr)
            if obj is not None:
                return obj
    return wrapper


def _root_passthrough(root, name: str):
    """Get a sub-object (Support, Property, Geometry, ...) off the Root COM
    object directly — for things the wrappers don't expose."""
    com = _com_obj(root)
    try:
        return getattr(com, name)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Unit detection
# ---------------------------------------------------------------------------

class _Units:
    """Holds the model's length/force units and derived conversion factors."""

    def __init__(self, length_unit: str, force_unit: str) -> None:
        self.length_unit = length_unit
        self.force_unit = force_unit
        self.len_to_mm = LEN_TO_MM.get(length_unit, 1000.0)        # → mm
        self.len_to_m = LEN_TO_M.get(length_unit, 1.0)             # → m
        self.force_to_kn = FORCE_TO_KN.get(force_unit, 1.0)        # → kN
        self.moment_to_knm = self.force_to_kn * self.len_to_m      # → kN·m

    @property
    def label(self) -> str:
        f = _FORCE_LABEL.get(self.force_unit, self.force_unit)
        l = _LEN_LABEL.get(self.length_unit, self.length_unit)
        return f"{f}-{l}"


_LEN_CODE_TO_UNIT = {
    0: "Inch", 1: "Feet", 2: "Feet", 3: "CentiMeter",
    4: "Meter", 5: "MilliMeter", 6: "DeciMeter", 7: "KiloMeter",
}
_FORCE_CODE_TO_UNIT = {
    0: "Kilopound", 1: "Pound", 2: "Kilogram", 3: "Metric Ton",
    4: "Newton", 5: "KiloNewton", 6: "MegaNewton", 7: "DecaNewton",
}


def _raw_unit_code(root_com, method_name: str, log) -> Optional[int]:
    """Read a unit code via raw COM with a proper c_long by-ref parameter."""
    import ctypes
    try:
        from comtypes import automation  # type: ignore
        unit_buf = ctypes.c_long(-1)
        var = automation.VARIANT()
        var._.c_void_p = ctypes.addressof(unit_buf)
        var.vt = automation.VT_I4 | automation.VT_BYREF
        ret = getattr(root_com, method_name)(var)
        log.info("raw %s: ret=%r, byref=%d", method_name, ret, unit_buf.value)
        code = unit_buf.value
        if code >= 0:
            return code
        if isinstance(ret, int) and ret >= 0:
            return ret
    except Exception as e:
        log.warning("raw %s failed: %s", method_name, e)
    return None


def _detect_units(root, log) -> _Units:
    """Read the model's input units. Uses three strategies:
    1. Raw COM with proper c_long by-ref (most reliable)
    2. Official wrapper (may have mapping bugs)
    3. Defaults to Meter / KiloNewton
    """
    length_unit = "Meter"
    force_unit = "KiloNewton"

    root_com = _com_obj(root)

    # Strategy 1: raw COM by-ref (bypasses the openstaad wrapper's mapping bug
    # where code 2 maps to 'Feet' instead of 'CentiMeter').
    raw_len = _raw_unit_code(root_com, "GetInputUnitForLength", log)
    raw_force = _raw_unit_code(root_com, "GetInputUnitForForce", log)

    if raw_len is not None and raw_len in _LEN_CODE_TO_UNIT:
        length_unit = _LEN_CODE_TO_UNIT[raw_len]
        log.info("length unit from raw COM code %d → %s", raw_len, length_unit)
    else:
        try:
            v = root.GetInputUnitForLength()
            if v:
                length_unit = str(v).strip()
                log.info("length unit from wrapper: %s", length_unit)
        except Exception as e:
            log.warning("GetInputUnitForLength failed: %s — assuming Meter", e)

    if raw_force is not None and raw_force in _FORCE_CODE_TO_UNIT:
        force_unit = _FORCE_CODE_TO_UNIT[raw_force]
        log.info("force unit from raw COM code %d → %s", raw_force, force_unit)
    else:
        try:
            v = root.GetInputUnitForForce()
            if v:
                force_unit = str(v).strip()
                log.info("force unit from wrapper: %s", force_unit)
        except Exception as e:
            log.warning("GetInputUnitForForce failed: %s — assuming KiloNewton", e)

    # Normalise aliases.
    length_unit = {"MM": "MilliMeter", "CM": "CentiMeter", "M": "Meter",
                   "MetricTon": "Metric Ton"}.get(length_unit, length_unit)
    if length_unit not in LEN_TO_MM:
        log.warning("unknown length unit %r — falling back to Meter", length_unit)
        length_unit = "Meter"
    force_unit = {"MetricTon": "Metric Ton", "Ton": "Metric Ton"}.get(force_unit, force_unit)
    if force_unit not in FORCE_TO_KN:
        log.warning("unknown force unit %r — falling back to KiloNewton", force_unit)
        force_unit = "KiloNewton"

    units = _Units(length_unit, force_unit)
    log.info(
        "model units: length=%s (×%.6g mm) force=%s (×%.6g kN) moment ×%.6g kNm",
        length_unit, units.len_to_mm, force_unit, units.force_to_kn, units.moment_to_knm,
    )
    return units


def _validate_units_heuristic(nodes, units, log) -> _Units:
    """After reading node coordinates, validate units against expected
    structural dimensions. If coordinates suggest a different unit, override."""
    if not nodes:
        return units
    max_coord = max(
        max(abs(n.x_mm), abs(n.y_mm), abs(n.z_mm)) for n in nodes
    )
    if max_coord <= 0:
        return units

    raw_max = max_coord / units.len_to_mm

    if units.length_unit == "Meter" and raw_max > 50:
        for candidate_unit, candidate_mm in LEN_TO_MM.items():
            candidate_max_m = raw_max * candidate_mm / 1000.0
            if 0.5 < candidate_max_m < 200:
                log.warning(
                    "unit heuristic: detected %s gives raw_max=%.2f → %.0fmm, "
                    "but %s gives %.1fm — switching to %s",
                    units.length_unit, raw_max, max_coord,
                    candidate_unit, candidate_max_m, candidate_unit,
                )
                return _Units(candidate_unit, units.force_unit)

    return units


# ---------------------------------------------------------------------------
# Active-file resolution
# ---------------------------------------------------------------------------

def resolve_active_staad_file() -> Path:
    """Ask the running STAAD instance which .std file is currently open."""
    _g, _l, _o, _p, Root = _import_openstaad()
    try:
        root = Root()
    except Exception as e:
        raise StaadError(
            "Could not connect to a running STAAD instance via openstaad. "
            "Open your model in STAAD Pro first. "
            f"Underlying error: {e}"
        ) from e
    try:
        p = root.GetSTAADFile(bFullPath=True)
    except Exception as e:
        raise StaadError(f"Root.GetSTAADFile failed: {e}") from e
    if not p:
        raise StaadError(
            "Could not determine the active STAAD file. "
            "Set STAAD_FILE_PATH in .env."
        )
    return Path(str(p))


# ---------------------------------------------------------------------------
# Envelope accumulator
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


# ---------------------------------------------------------------------------
# Small typed helpers
# ---------------------------------------------------------------------------

def _as_int_tuple(v) -> Tuple[int, ...]:
    """Coerce whatever the lib returned (tuple/list/int/None) into a tuple of ints."""
    if v is None:
        return ()
    if isinstance(v, (int, float)):
        return (int(v),)
    try:
        out = []
        for x in v:
            try:
                out.append(int(x))
            except (TypeError, ValueError):
                continue
        return tuple(out)
    except TypeError:
        return ()


def _as_float(v, default: float = 0.0) -> float:
    try:
        if v is None:
            return default
        if isinstance(v, (list, tuple)):
            return float(v[0]) if v else default
        return float(v)
    except (TypeError, ValueError):
        return default


def _as_float_list(v, n: int) -> List[float]:
    """Coerce into an n-element float list, padding/truncating as needed."""
    out: List[float] = []
    if v is not None:
        try:
            for x in v:
                try:
                    out.append(float(x))
                except (TypeError, ValueError):
                    out.append(0.0)
        except TypeError:
            pass
    if len(out) < n:
        out += [0.0] * (n - len(out))
    return out[:n]


# ---------------------------------------------------------------------------
# Comtypes passthrough wrappers for the unwrapped methods
# ---------------------------------------------------------------------------

class _Passthrough:
    """Raw comtypes helpers for output queries the official wrapper doesn't
    expose, plus min/max-based fallbacks built on the wrapper methods that
    *do* work (GetMemberEndForces, GetMinMaxBendingMoment, ...)."""

    def __init__(self, output_wrapper, root_com, log) -> None:
        self._log = log
        self._wrapper = output_wrapper          # official Output() — for GetMinMax* & GetMemberEndForces
        d = getattr(output_wrapper, "__dict__", {}) or {}
        self._output_com = d.get("_output")     # the Output sub-object COM
        self._root_com = root_com or d.get("_root")
        # Candidate COM objects to try result methods on (Output sub-object first).
        self._candidates = [c for c in (self._output_com, self._root_com) if c is not None]
        if not self._candidates:
            self._candidates = [_com_obj(output_wrapper)]
        self._com = self._candidates[0]
        self._ok = False
        self.saw_lock_error = False
        # Remember which COM object served each method (so we don't re-probe).
        self._method_obj: Dict[str, object] = {}
        try:
            (self._make_dbl_arr, self._make_long_arr,
             self._make_ref, self._automation) = _import_openstaad_tools()
            self._ok = True
        except Exception as e:
            log.warning("openstaad.tools unavailable — passthrough methods disabled: %s", e)

    # -- low-level helpers ------------------------------------------------

    def _note_error(self, e) -> None:
        if "locked" in str(e).lower():
            self.saw_lock_error = True

    def _arr6(self):
        safe = self._make_dbl_arr(6)
        pd = self._make_ref(safe, self._automation.VT_ARRAY | self._automation.VT_R8)
        return safe, pd

    def _read6(self, pd) -> List[float]:
        try:
            raw = pd.value
            if raw is not None:
                if isinstance(raw, (list, tuple)):
                    if len(raw) == 1 and isinstance(raw[0], (list, tuple)):
                        return _as_float_list(raw[0], 6)
                    return _as_float_list(raw, 6)
                return _as_float_list(raw, 6)
        except Exception:
            pass
        try:
            return _as_float_list(pd[0], 6)
        except Exception:
            return [0.0] * 6

    def _read_scalar(self, pd) -> float:
        try:
            raw = pd.value
            if isinstance(raw, (int, float)):
                return float(raw)
            if isinstance(raw, (list, tuple)):
                flat = raw[0] if raw else 0.0
                if isinstance(flat, (list, tuple)):
                    flat = flat[0] if flat else 0.0
                return float(flat)
        except Exception:
            pass
        try:
            v = pd[0]
            return float(v) if not isinstance(v, (list, tuple)) else float(v[0])
        except Exception:
            return 0.0

    def _invoke(self, method: str, *args, attempts: int = 3):
        """Call `method` on whichever candidate COM object has it.

        Returns (result, error). Caches the working object per method name.
        Retries briefly on transient 'Memory is locked' errors.
        """
        import time
        cached = self._method_obj.get(method)
        objs = [cached] if cached is not None else self._candidates
        last = None
        for obj in objs:
            try:
                fn = getattr(obj, method)
            except Exception as e:           # comtypes raises COMError 'Unknown name'
                last = e
                continue
            for i in range(attempts):
                try:
                    res = fn(*args)
                    self._method_obj[method] = obj
                    return res, None
                except Exception as e:
                    last = e
                    self._note_error(e)
                    if "locked" in str(e).lower() and i < attempts - 1:
                        time.sleep(0.05 * (i + 1))
                        continue
                    break
        return None, last

    # -- intermediate member forces (6 doubles) ---------------------------

    def intermediate_member_forces(self, beam: int, dist_model: float, lc: int) -> Optional[List[float]]:
        if not self._ok:
            return None
        safe, pd = self._arr6()
        _, err = self._invoke("GetIntermediateMemberForcesAtDistance",
                              int(beam), float(dist_model), int(lc), pd)
        if err is not None:
            self._log.debug("GetIntermediateMemberForcesAtDistance(beam=%d, d=%.4f, lc=%d): %s",
                            beam, dist_model, lc, err)
            return None
        return self._read6(pd)

    # -- member end forces ------------------------------------------------

    def member_end_forces(self, beam: int, start: bool, lc: int) -> Optional[List[float]]:
        # Prefer the official wrapper — proven to return real values.
        try:
            v = self._wrapper.GetMemberEndForces(int(beam), bool(start), int(lc), 0)
            if v is not None:
                fl = _as_float_list(v, 6)
                if any(abs(x) > 1e-12 for x in fl):
                    return fl
                # zero — keep, but also fall through to raw COM in case wrapper degraded
                wrapper_zero = fl
            else:
                wrapper_zero = None
        except Exception as e:
            self._note_error(e)
            wrapper_zero = None
        if not self._ok:
            return wrapper_zero
        safe, pd = self._arr6()
        end = 0 if start else 1
        _, err = self._invoke("GetMemberEndForces", int(beam), int(end), int(lc), pd, 0)
        if err is not None:
            return wrapper_zero
        return self._read6(pd)

    # -- support reactions ------------------------------------------------

    def support_reactions(self, node: int, lc: int) -> Optional[List[float]]:
        # Try wrapper first.
        try:
            v = self._wrapper.GetSupportReactions(int(node), int(lc))
            if v is not None:
                fl = _as_float_list(v, 6)
                if any(abs(x) > 1e-12 for x in fl):
                    return fl
                wrapper_zero = fl
            else:
                wrapper_zero = None
        except Exception as e:
            self._note_error(e)
            wrapper_zero = None
        if not self._ok:
            return wrapper_zero
        safe, pd = self._arr6()
        _, err = self._invoke("GetSupportReactions", int(node), int(lc), pd)
        if err is not None:
            return wrapper_zero
        return self._read6(pd)

    # -- node displacements ----------------------------------------------

    def node_displacements(self, node: int, lc: int) -> Optional[List[float]]:
        if not self._ok:
            return None
        safe, pd = self._arr6()
        _, err = self._invoke("GetNodeDisplacements", int(node), int(lc), pd)
        if err is not None:
            self._log.debug("GetNodeDisplacements(node=%d, lc=%d): %s", node, lc, err)
            return None
        return self._read6(pd)

    # -- intermediate deflection -----------------------------------------

    def intermediate_deflection(self, beam: int, dist_model: float, lc: int) -> Optional[Tuple[float, float]]:
        if not self._ok:
            return None
        sy = self._make_dbl_arr(1)
        sz = self._make_dbl_arr(1)
        py = self._make_ref(sy, self._automation.VT_ARRAY | self._automation.VT_R8)
        pz = self._make_ref(sz, self._automation.VT_ARRAY | self._automation.VT_R8)
        _, err = self._invoke("GetIntermediateDeflectionAtDistance",
                              int(beam), float(dist_model), int(lc), py, pz)
        if err is not None:
            self._log.debug("GetIntermediateDeflectionAtDistance(beam=%d, d=%.4f, lc=%d): %s",
                            beam, dist_model, lc, err)
            return None
        return self._read_scalar(py), self._read_scalar(pz)

    # -- min/max along member (value + position from start) --------------

    def min_max(self, beam: int, lc: int) -> Optional[dict]:
        """Returns {'mz': (vmin, pmin, vmax, pmax), 'my': ..., 'vy': ..., 'vz': ..., 'n': ...}
        where positions are distances from the start node in model length units.
        Uses the official wrapper's GetMinMax* methods."""
        out = {}

        def _grab(fn, *args):
            try:
                r = fn(*args)
                if r is None:
                    return None
                t = tuple(_as_float(x) for x in (r if hasattr(r, "__iter__") else (r,)))
                return t if len(t) >= 4 else None
            except Exception as e:
                self._note_error(e)
                return None

        for key, fn, args in (
            ("mz", getattr(self._wrapper, "GetMinMaxBendingMoment", None), (int(beam), "Z", int(lc))),
            ("my", getattr(self._wrapper, "GetMinMaxBendingMoment", None), (int(beam), "Y", int(lc))),
            ("vy", getattr(self._wrapper, "GetMinMaxShearForce", None), (int(beam), "Y", int(lc))),
            ("vz", getattr(self._wrapper, "GetMinMaxShearForce", None), (int(beam), "Z", int(lc))),
            ("n", getattr(self._wrapper, "GetMinMaxAxialForce", None), (int(beam), int(lc))),
        ):
            if fn is None:
                continue
            r = _grab(fn, *args)
            if r is not None:
                out[key] = r
        return out or None


# ---------------------------------------------------------------------------
# Real reader (Windows + STAAD running)
# ---------------------------------------------------------------------------

def _read_real_model(project_id: str, file_path: Optional[Path]) -> SyncPayload:
    log = logging.getLogger("staad-bridge")

    Geometry, Load, Output, Properties, Root = _import_openstaad()

    try:
        root = Root()
    except Exception as e:
        raise StaadError(
            "Could not connect to a running STAAD instance via openstaad. "
            "Open your model in STAAD Pro first. "
            f"Underlying error: {e}"
        ) from e

    try:
        geo = Geometry()
        output = Output()
        load = Load()
        prop = Properties()
    except Exception as e:
        raise StaadError(
            "Connected to STAAD but could not create Geometry/Output/Load/Properties "
            f"objects. Underlying error: {e}"
        ) from e

    # Resolve the file path (for SyncPayload.file_name + file_hash).
    if file_path is None:
        try:
            p = root.GetSTAADFile(bFullPath=True)
            if p:
                file_path = Path(str(p))
        except Exception as e:
            log.warning("GetSTAADFile failed: %s", e)
    if file_path is None:
        raise StaadError(
            "Could not determine the active STAAD file. Set STAAD_FILE_PATH in .env."
        )
    file_path = Path(file_path)

    units = _detect_units(root, log)

    # Support COM object (for support type) — try Root passthrough.
    support_com = _root_passthrough(root, "Support")
    if support_com is not None:
        try:
            support_com._FlagAsMethod("GetSupportType")
        except Exception:
            pass

    # Property COM object (for releases / beta angle) — try Root passthrough.
    prop_com = _root_passthrough(root, "Property")
    if prop_com is not None:
        for name in ("GetMemberReleaseSpec", "GetBetaAngle"):
            try:
                prop_com._FlagAsMethod(name)
            except Exception:
                pass

    passthrough = _Passthrough(output, _com_obj(root), log)

    # --- Read node & member ID lists early (needed for unit heuristic) ---
    try:
        node_ids = list(_as_int_tuple(geo.GetNodeList()))
    except Exception as e:
        log.warning("GetNodeList failed (%s) — falling back to 1..GetNodeCount", e)
        node_ids = []
    if not node_ids:
        try:
            n_nodes = int(geo.GetNodeCount())
        except Exception as e:
            raise StaadError(f"Geometry.GetNodeCount failed: {e}") from e
        node_ids = list(range(1, n_nodes + 1))
    log.info("staad read: %d nodes", len(node_ids))

    try:
        beam_ids = list(_as_int_tuple(geo.GetBeamList()))
    except Exception as e:
        log.warning("GetBeamList failed (%s) — falling back to 1..GetMemberCount", e)
        beam_ids = []
    if not beam_ids:
        try:
            n_members = int(geo.GetMemberCount())
        except Exception as e:
            raise StaadError(f"Geometry.GetMemberCount failed: {e}") from e
        beam_ids = list(range(1, n_members + 1))
    log.info("staad read: %d members", len(beam_ids))

    # Read raw coordinates in model units first, then convert.
    raw_node_coords: Dict[int, Tuple[float, float, float]] = {}
    node_support: Dict[int, Optional[str]] = {}
    for nid in node_ids:
        rx = ry = rz = 0.0
        try:
            c = geo.GetNodeCoordinates(int(nid))
            if c is not None and hasattr(c, "__len__") and len(c) >= 3:
                rx = _as_float(c[0])
                ry = _as_float(c[1])
                rz = _as_float(c[2])
        except Exception as e:
            log.warning("GetNodeCoordinates(%d): %s", nid, e)
        raw_node_coords[int(nid)] = (rx, ry, rz)
        node_support[int(nid)] = _support_type_for_node(support_com, int(nid))

    if raw_node_coords:
        first_nid = node_ids[0]
        rc = raw_node_coords[int(first_nid)]
        log.info("node %d raw coords (model units): x=%.4f y=%.4f z=%.4f", first_nid, rc[0], rc[1], rc[2])

    # --- Heuristic unit validation ---
    # The COM API sometimes returns the wrong unit code. Use section
    # dimensions (most constrained: structural sections are typically
    # 150-1500mm) to pick the correct length unit.
    probe_dims: List[float] = []
    for bid in beam_ids[:5]:
        try:
            sn = _safe_section_name(prop, prop_com, int(bid))
            if sn:
                nums = re.findall(r"[\d.]+", sn)
                for n in nums:
                    v = float(n)
                    if 1 < v < 10000:
                        probe_dims.append(v)
        except Exception:
            pass

    if not probe_dims:
        # No section dims; try from member incidences once available
        pass

    max_raw = max(
        (max(abs(rx), abs(ry), abs(rz)) for rx, ry, rz in raw_node_coords.values()),
        default=0.0,
    )
    log.info("max raw coord: %.4f, probe section dims: %s", max_raw, probe_dims[:6])

    if probe_dims:
        # Score each candidate: section dims should map to 100-2000mm range
        best_unit = units.length_unit
        best_score = -1
        for candidate, c_mm in LEN_TO_MM.items():
            dims_mm = [d * c_mm for d in probe_dims]
            in_range = sum(1 for d in dims_mm if 100 <= d <= 2000)
            score = in_range / len(dims_mm)
            if score > best_score:
                best_score = score
                best_unit = candidate
        if best_unit != units.length_unit and best_score > 0.5:
            sample_mm = [round(d * LEN_TO_MM[best_unit]) for d in probe_dims[:4]]
            log.warning(
                "unit override: section dims %s → %s mm with '%s' (score=%.0f%%) — switching from '%s'",
                probe_dims[:4], sample_mm, best_unit, best_score * 100, units.length_unit,
            )
            units = _Units(best_unit, units.force_unit)
    elif max_raw > 0:
        # Fallback: use coordinate magnitudes
        max_m = max_raw * units.len_to_m
        if max_m > 200 or max_m < 0.5:
            for candidate in ["Inch", "Feet", "MilliMeter", "CentiMeter", "Meter"]:
                cand_m = max_raw * LEN_TO_M[candidate]
                if 1.0 < cand_m < 200:
                    log.warning(
                        "unit override (coord heuristic): '%s' → %.1fm, '%s' → %.1fm — switching",
                        units.length_unit, max_m, candidate, cand_m,
                    )
                    units = _Units(candidate, units.force_unit)
                    break

    nodes: List[SyncNode] = []
    node_coords: Dict[int, Tuple[float, float, float]] = {}
    for nid in node_ids:
        rx, ry, rz = raw_node_coords[int(nid)]
        x_mm = rx * units.len_to_mm
        y_mm = ry * units.len_to_mm
        z_mm = rz * units.len_to_mm
        st = node_support[int(nid)]
        node_coords[int(nid)] = (x_mm, y_mm, z_mm)
        nodes.append(SyncNode(node_id=int(nid), x_mm=x_mm, y_mm=y_mm, z_mm=z_mm,
                              support_type=st))

    # --- Members -------------------------------------------------------
    members: List[SyncMember] = []
    for bid in beam_ids:
        bid = int(bid)
        # Incidences
        start_id = end_id = 0
        try:
            inc = geo.GetMemberIncidence(bid)
            if inc is not None and hasattr(inc, "__len__") and len(inc) >= 2:
                start_id = int(_as_float(inc[0]))
                end_id = int(_as_float(inc[1]))
        except Exception as e:
            log.warning("GetMemberIncidence(%d): %s", bid, e)

        # Length
        length_mm = 0.0
        try:
            L = geo.GetBeamLength(bid)
            length_mm = _as_float(L) * units.len_to_mm
        except Exception as e:
            log.debug("GetBeamLength(%d): %s", bid, e)
        if length_mm <= 0:
            a = node_coords.get(start_id, (0.0, 0.0, 0.0))
            b = node_coords.get(end_id, (0.0, 0.0, 0.0))
            length_mm = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2) ** 0.5
            if length_mm > 0:
                log.info("member %d length from node coords: %.0f mm", bid, length_mm)

        # Section name
        section_name = _safe_section_name(prop, prop_com, bid) or f"SECTION-{bid}"

        # Member type from geometry
        a = node_coords.get(start_id, (0.0, 0.0, 0.0))
        b = node_coords.get(end_id, (0.0, 0.0, 0.0))
        dx = abs(b[0] - a[0])
        dy = abs(b[1] - a[1])
        dz = abs(b[2] - a[2])
        member_type = "column" if (dy > max(dx, dz) and dy > 0) else "beam"

        # Beta angle
        beta = 0.0
        if prop_com is not None:
            try:
                beta = _as_float(prop_com.GetBetaAngle(bid))
            except Exception:
                beta = 0.0

        # Member end releases
        rel_start = _read_member_release(prop_com, bid, 0, log)
        rel_end = _read_member_release(prop_com, bid, 1, log)

        members.append(SyncMember(
            member_id=bid,
            start_node_id=start_id,
            end_node_id=end_id,
            section_name=section_name,
            length_mm=length_mm,
            beta_angle_deg=beta,
            member_type=member_type,
            release_start=rel_start,
            release_end=rel_end,
        ))

    # --- Sections (deduped by name) -----------------------------------
    sections_by_name: Dict[str, SyncSection] = {}
    for m in members:
        if m.section_name in sections_by_name:
            continue
        dims = _section_dims(m.section_name, units)
        sections_by_name[m.section_name] = SyncSection(
            section_name=m.section_name,
            section_type="rectangular",
            **dims,
        )
    sections = list(sections_by_name.values())

    # --- Materials -----------------------------------------------------
    # STAAD doesn't expose named concrete materials cleanly via COM in
    # every version; seed a single representative entry. The app does not
    # rely on this being exhaustive.
    materials: List[SyncMaterial] = [
        SyncMaterial(
            name="CONCRETE",
            e_mpa=24_860,
            density_kn_m3=24.0,
            fc_mpa=28.0,
            fy_mpa=420.0,
        )
    ]

    # --- Load cases ----------------------------------------------------
    # In STAAD, REPEAT LOAD cases (PERFORM ANALYSIS + CHANGE) are technically
    # primary load cases. We split: case numbers ≥ 100 are reclassified as
    # combinations (NSCP/ACI numbering: 1-99 = primary, 100+ = ultimate
    # combos, 200+ = ASD combos).
    primary_numbers: List[int] = []
    try:
        primary_numbers = [int(x) for x in _as_int_tuple(load.GetPrimaryLoadCaseNumbers()) if int(x) > 0]
    except Exception as e:
        log.warning("GetPrimaryLoadCaseNumbers failed: %s", e)
        try:
            n_cases = int(load.GetPrimaryLoadCaseCount())
            primary_numbers = list(range(1, n_cases + 1))
        except Exception as e2:
            log.warning("GetPrimaryLoadCaseCount also failed: %s", e2)
            primary_numbers = []
    log.info("staad read: %d primary load cases (incl REPEAT LOAD combos): %s",
             len(primary_numbers), primary_numbers)

    load_cases: List[SyncLoadCase] = []
    repeat_load_combos: List[SyncCombination] = []
    combo_numbers: List[int] = []

    for num in primary_numbers:
        title = _safe_load_title(load, num) or f"CASE {num}"
        load_type = _staad_load_type(load, num, title)
        if num >= 100:
            repeat_load_combos.append(SyncCombination(
                combo_number=num,
                title=title,
                factors=[],
                source="imported",
            ))
            combo_numbers.append(num)
        else:
            load_cases.append(SyncLoadCase(
                case_number=num,
                title=title,
                load_type=load_type,
            ))

    # --- True LOAD COMBINATION commands -------------------------------
    true_combo_numbers: List[int] = []
    try:
        true_combo_numbers = [int(x) for x in _as_int_tuple(load.GetLoadCombinationCaseNumbers()) if int(x) > 0]
    except Exception as e:
        log.warning("GetLoadCombinationCaseNumbers failed: %s", e)
    log.info("staad read: %d true LOAD COMBINATION cases: %s",
             len(true_combo_numbers), true_combo_numbers)

    combos: List[SyncCombination] = list(repeat_load_combos)
    for cnum in true_combo_numbers:
        cnum = int(cnum)
        title = _safe_load_title(load, cnum) or f"COMBO {cnum}"
        # The app regenerates its own combos when the user hits "Generate" —
        # record an empty factors list.
        combos.append(SyncCombination(
            combo_number=cnum,
            title=title,
            factors=[],
            source="imported",
        ))
        combo_numbers.append(cnum)

    log.info("split: %d primary cases, %d REPEAT LOAD combos, %d LOAD COMBINATIONs",
             len(load_cases), len(repeat_load_combos), len(true_combo_numbers))
    log.info("combo_numbers (%d entries): %s", len(combo_numbers),
             combo_numbers[:20] if len(combo_numbers) <= 20 else f"{combo_numbers[:10]}...{combo_numbers[-5:]}")

    # If no combos found, also try reading forces for primary load cases.
    all_lc_numbers = combo_numbers if combo_numbers else [lc.case_number for lc in load_cases]
    if not combo_numbers:
        log.warning("no combo_numbers found — using %d primary load cases for force queries", len(all_lc_numbers))

    # ALSO include primary load cases for force queries (some STAAD versions
    # only return results for primary cases via COM, not combinations).
    primary_lc_numbers = [lc.case_number for lc in load_cases]

    member_ids = [m.member_id for m in members]
    member_length_mm = {m.member_id: m.length_mm for m in members}

    # --- Probe: figure out which force APIs are usable ---------------
    force_lc_numbers = all_lc_numbers       # default: combo numbers
    intermediate_ok = False                 # GetIntermediateMemberForcesAtDistance works?

    if member_ids:
        probe_mid = member_ids[0]
        probe_len_model = (member_length_mm.get(probe_mid, 0.0) / units.len_to_mm
                           if units.len_to_mm else 0.0)
        # End-force probe: combo LC, then primary LC #1.
        nonzero = False
        for label, lcs in (("combo", all_lc_numbers), ("primary", primary_lc_numbers)):
            if nonzero or not lcs:
                continue
            plc = lcs[0]
            ef = passthrough.member_end_forces(probe_mid, True, plc)
            ok = ef is not None and any(abs(v) > 1e-12 for v in ef)
            log.info("PROBE end forces %s lc=%d → %s (nonzero=%s)", label, plc, ef, ok)
            if ok:
                nonzero = True
                if label == "primary":
                    log.warning("forces present for PRIMARY cases — using primary LCs for force queries")
                    force_lc_numbers = primary_lc_numbers
        if not nonzero:
            log.warning("end-force probe returned zero — STAAD may have no analysis results, "
                        "or is in a state where COM result reads fail (try Analyze→Run Analysis)")

        # Intermediate-forces probe.
        if probe_len_model > 0 and force_lc_numbers:
            plc = force_lc_numbers[0]
            fi = passthrough.intermediate_member_forces(probe_mid, probe_len_model * 0.5, plc)
            served = passthrough._method_obj.get("GetIntermediateMemberForcesAtDistance")
            log.info("PROBE intermediate@0.5 lc=%d → %s (served=%s)", plc, fi, served is not None)
            intermediate_ok = fi is not None

        # min/max probe.
        if force_lc_numbers:
            mm = passthrough.min_max(probe_mid, force_lc_numbers[0])
            log.info("PROBE min/max → %s", mm)

    log.info("force strategy: lc_numbers=%d, intermediate=%s",
             len(force_lc_numbers), intermediate_ok)

    def _get_end_forces(mid, is_start, lc):
        f = passthrough.member_end_forces(mid, is_start, lc)
        return f if f is not None else [0.0] * 6

    # --- Diagram points (M/V/N along each member, per combo) ----------
    diagram_points: List[SyncDiagramPoint] = []
    envelope_map: Dict[int, _EnvelopeAcc] = {m.member_id: _EnvelopeAcc() for m in members}
    # 6-vector index: 0=N(Fx) 1=Vy(Fy) 2=Vz(Fz) 3=Mx 4=My 5=Mz
    _COMP_IDX = {"n": 0, "vy": 1, "vz": 2, "my": 4, "mz": 5}
    n_full = n_fallback = 0

    def _emit(mid, combo, xr, xmm, f):
        f = (list(f) + [0.0] * 6)[:6]
        n_kn = f[0] * units.force_to_kn
        vy_kn = f[1] * units.force_to_kn
        vz_kn = f[2] * units.force_to_kn
        mz_knm = f[5] * units.moment_to_knm
        my_knm = f[4] * units.moment_to_knm
        diagram_points.append(SyncDiagramPoint(
            member_id=mid, combo_number=combo, x_ratio=xr, x_mm=xmm,
            mz_knm=mz_knm, vy_kn=vy_kn, n_kn=n_kn, my_knm=my_knm, vz_kn=vz_kn))
        envelope_map[mid].update(combo=combo, mz_knm=mz_knm, vy_kn=vy_kn, n_kn=n_kn, my_knm=my_knm)

    for mid in member_ids:
        len_mm = member_length_mm.get(mid, 0.0)
        len_model = len_mm / units.len_to_mm if units.len_to_mm else 0.0
        for combo in force_lc_numbers:
            f0 = _get_end_forces(mid, True, combo)
            f1 = _get_end_forces(mid, False, combo)
            ends_nonzero = any(abs(v) > 1e-9 for v in f0) or any(abs(v) > 1e-9 for v in f1)

            interior = None
            if intermediate_ok and len_model > 0:
                interior = []
                for s in range(1, N_SAMPLES - 1):
                    dist = len_model * (s / (N_SAMPLES - 1))
                    fi = passthrough.intermediate_member_forces(mid, dist, combo)
                    if fi is None:
                        interior = None
                        break
                    interior.append(fi)
            interior_nonzero = interior is not None and any(
                any(abs(v) > 1e-9 for v in fi) for fi in interior)

            if interior is not None and (interior_nonzero or not ends_nonzero):
                n_full += 1
                _emit(mid, combo, 0.0, 0.0, f0)
                for s in range(1, N_SAMPLES - 1):
                    xr = s / (N_SAMPLES - 1)
                    _emit(mid, combo, xr, len_mm * xr, interior[s - 1])
                _emit(mid, combo, 1.0, len_mm, f1)
            else:
                # Fallback: endpoints + min/max critical points; interpolate
                # the other components linearly between the two ends.
                n_fallback += 1
                crit: Dict[float, Dict[int, float]] = {0.0: {}, 1.0: {}}
                mm = passthrough.min_max(mid, combo) or {}
                for key, idx in _COMP_IDX.items():
                    t = mm.get(key)
                    if not t or len_model <= 0:
                        continue
                    vmin, pmin, vmax, pmax = t[0], t[1], t[2], t[3]
                    for val, pos in ((vmin, pmin), (vmax, pmax)):
                        xr = round(max(0.0, min(1.0, pos / len_model)), 3)
                        crit.setdefault(xr, {})[idx] = val
                for xr in sorted(crit):
                    f = [f0[i] + (f1[i] - f0[i]) * xr for i in range(6)]
                    for idx, val in crit[xr].items():
                        f[idx] = val
                    _emit(mid, combo, xr, len_mm * xr, f)

    log.info("diagram_points: %d total (%d full-curve, %d min/max-fallback member-combos)",
             len(diagram_points), n_full, n_fallback)
    envelope = [acc.to_row(mid) for mid, acc in envelope_map.items()]

    # --- Reactions -----------------------------------------------------
    reactions: List[SyncReaction] = []
    support_nodes = [n.node_id for n in nodes if n.support_type is not None]
    for node in support_nodes:
        for combo in force_lc_numbers:
            rl = passthrough.support_reactions(int(node), int(combo))
            if rl is None:
                continue
            reactions.append(SyncReaction(
                node_id=int(node),
                combo_number=int(combo),
                rx_kn=rl[0] * units.force_to_kn,
                ry_kn=rl[1] * units.force_to_kn,
                rz_kn=rl[2] * units.force_to_kn,
                mx_knm=rl[3] * units.moment_to_knm,
                my_knm=rl[4] * units.moment_to_knm,
                mz_knm=rl[5] * units.moment_to_knm,
            ))
    log.info("reactions: %d", len(reactions))

    # --- Displacements -------------------------------------------------
    displacements: List[SyncDisplacement] = []
    for node in [n.node_id for n in nodes]:
        for combo in force_lc_numbers:
            d = passthrough.node_displacements(int(node), int(combo))
            if d is None:
                continue
            displacements.append(SyncDisplacement(
                node_id=int(node),
                combo_number=int(combo),
                dx_mm=d[0] * units.len_to_mm,
                dy_mm=d[1] * units.len_to_mm,
                dz_mm=d[2] * units.len_to_mm,
                rx_rad=d[3],
                ry_rad=d[4],
                rz_rad=d[5],
            ))
    log.info("displacements: %d", len(displacements))

    # --- End forces ----------------------------------------------------
    end_forces: List[SyncEndForce] = []
    for mid in member_ids:
        for combo in force_lc_numbers:
            for end_idx, is_start in ((0, True), (1, False)):
                fl = _get_end_forces(int(mid), is_start, int(combo))
                if fl is None:
                    continue
                end_forces.append(SyncEndForce(
                    member_id=int(mid),
                    end_index=int(end_idx),
                    combo_number=int(combo),
                    fx_kn=fl[0] * units.force_to_kn,
                    fy_kn=fl[1] * units.force_to_kn,
                    fz_kn=fl[2] * units.force_to_kn,
                    mx_knm=fl[3] * units.moment_to_knm,
                    my_knm=fl[4] * units.moment_to_knm,
                    mz_knm=fl[5] * units.moment_to_knm,
                ))
    log.info("end_forces: %d", len(end_forces))

    # --- Deflections (midspan only) -----------------------------------
    deflections: List[SyncDeflection] = []
    for m in members:
        len_model = m.length_mm / units.len_to_mm if units.len_to_mm else 0.0
        mid_dist = 0.5 * len_model
        for combo in force_lc_numbers:
            res = passthrough.intermediate_deflection(int(m.member_id), mid_dist, int(combo))
            if res is None:
                continue
            dy, dz = res
            deflections.append(SyncDeflection(
                member_id=int(m.member_id),
                combo_number=int(combo),
                x_ratio=0.5,
                dy_mm=dy * units.len_to_mm,
                dz_mm=dz * units.len_to_mm,
            ))
    log.info("deflections: %d", len(deflections))

    total_results = len(reactions) + len(displacements) + len(end_forces) + len(deflections)
    if passthrough.saw_lock_error or total_results == 0:
        log.warning(
            "=" * 70 + "\n"
            "  NO ANALYSIS RESULTS could be read from STAAD ('Memory is locked').\n"
            "  Geometry/load cases synced fine, but forces/reactions/displacements\n"
            "  are all zero. This happens when STAAD's results database is locked\n"
            "  by the GUI. FIX: in STAAD Pro, switch to 'Analytical Modeling' mode\n"
            "  (or close the Post-Processing result tables), then sync again.\n"
            + "=" * 70
        )

    return SyncPayload(
        project_id=project_id,
        file_name=file_path.name,
        file_hash=file_sha256(file_path),
        unit_system=units.label,
        nodes=nodes,
        members=members,
        sections=sections,
        materials=materials,
        load_cases=load_cases,
        combinations=combos,
        diagram_points=diagram_points,
        envelope=envelope,
        reactions=reactions,
        displacements=displacements,
        end_forces=end_forces,
        deflections=deflections,
    )


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def _member_end_forces(output, beam: int, start: bool, lc: int) -> Optional[List[float]]:
    """output.GetMemberEndForces(beam, start, lc, local=0) → [Fx,Fy,Fz,Mx,My,Mz]."""
    try:
        v = output.GetMemberEndForces(int(beam), bool(start), int(lc), 0)
    except TypeError:
        # Some lib versions use positional-only / different signature.
        try:
            v = output.GetMemberEndForces(int(beam), bool(start), int(lc))
        except Exception:
            return None
    except Exception:
        return None
    if v is None:
        return None
    return _as_float_list(v, 6)


# ---------------------------------------------------------------------------
# Property / support helpers
# ---------------------------------------------------------------------------

def _safe_section_name(prop_wrapper, prop_com, beam: int) -> Optional[str]:
    """Best-effort read of a member's section name."""
    # Try the wrapper first.
    for obj in (prop_wrapper, prop_com):
        if obj is None:
            continue
        for meth in ("GetBeamSectionName", "GetBeamProperty", "GetSectionName"):
            try:
                fn = getattr(obj, meth, None)
                if fn is None:
                    continue
                v = fn(int(beam))
                if v:
                    s = str(v).strip()
                    if s:
                        return s
            except Exception:
                continue
    return None


def _read_member_release(prop_com, beam: int, end: int, log) -> Optional[SyncReleaseSpec]:
    """Read member end release spec via Property.GetMemberReleaseSpec.

    end: 0 = start (i), 1 = end (j).
    Returns SyncReleaseSpec where True = released (free). None if unavailable.
    """
    if prop_com is None:
        return None
    try:
        v = prop_com.GetMemberReleaseSpec(int(beam), int(end))
        if v is None:
            return None
        vals = _as_float_list(v, 6)
        return SyncReleaseSpec(
            fx=bool(vals[0]), fy=bool(vals[1]), fz=bool(vals[2]),
            mx=bool(vals[3]), my=bool(vals[4]), mz=bool(vals[5]),
        )
    except Exception:
        return None


def _support_type_for_node(support_com, node_id: int) -> Optional[str]:
    """Read support type from Support.GetSupportType.

    Int codes: 1=pinned, 2=fixed, 3=fixed-with-releases,
    11=generated-pinned, 12=generated-fixed, 13=?. Returns None if the
    method isn't available or the node isn't a support.
    """
    if support_com is None:
        return None
    try:
        code = support_com.GetSupportType(int(node_id))
    except Exception:
        return None
    if code is None:
        return None
    try:
        c = int(code)
    except (TypeError, ValueError):
        return None
    if c == 0:
        return None
    if c == 1:
        return "pinned"
    if c in (2, 3):
        return "fixed"
    if c == 11:
        return "pinned"
    if c in (12, 13):
        return "fixed"
    return None


# ---------------------------------------------------------------------------
# Section dimension parsing
# ---------------------------------------------------------------------------

def _section_dims(section_name: str, units: _Units) -> dict:
    """Extract b/h from a STAAD prismatic section name and compute area.

    Patterns:
      "PRIS YD 0.45 ZD 0.20"   → rectangular, numbers in MODEL length units
      "PRIS YD 0.30"            → circular (no ZD)
      "RECT 17.72X7.87"         → h×b in MODEL length units
      "W10X49" / "ISMB300"      → table section — not parsed

    Numbers in the name are interpreted in the model's length unit and
    converted to mm. As a heuristic for ambiguous cases: if the model unit
    is metric metres and a number is < 10 it's metres; if the model unit is
    inches and a number is > 10 it's inches — but in both cases we just
    multiply by the unit's mm factor, which gives the right answer.
    """
    name = (section_name or "").upper().strip()
    f_mm = units.len_to_mm  # model-length → mm

    # Pattern 1: PRIS YD <h> ZD <w>
    m = re.search(r"YD\s+([\d.]+)\s+ZD\s+([\d.]+)", name)
    if m:
        h_mm = round(float(m.group(1)) * f_mm, 1)
        b_mm = round(float(m.group(2)) * f_mm, 1)
        return {"b_mm": b_mm, "h_mm": h_mm, "area_mm2": round(b_mm * h_mm, 0)}

    # Pattern 2: PRIS YD <d> (circular — no ZD)
    m = re.search(r"YD\s+([\d.]+)(?:\s|$)", name)
    if m and "ZD" not in name:
        d_mm = round(float(m.group(1)) * f_mm, 1)
        return {"b_mm": d_mm, "h_mm": d_mm, "area_mm2": round(math.pi * d_mm * d_mm / 4, 0)}

    # Pattern 3: RECT HxW
    m = re.match(r"RECT\s+([\d.]+)[Xx]([\d.]+)", name)
    if m:
        h_mm = round(float(m.group(1)) * f_mm, 1)
        b_mm = round(float(m.group(2)) * f_mm, 1)
        return {"b_mm": b_mm, "h_mm": h_mm, "area_mm2": round(b_mm * h_mm, 0)}

    return {"b_mm": None, "h_mm": None, "area_mm2": None}


# ---------------------------------------------------------------------------
# Load type classification
# ---------------------------------------------------------------------------

def _safe_load_title(load, lc: int) -> str:
    try:
        v = load.GetLoadCaseTitle(int(lc))
        return str(v).strip() if v else ""
    except Exception:
        return ""


def _staad_load_type(load, lc: int, title: str) -> str:
    """Map STAAD's load type to our LoadType enum.

    Tries load.GetLoadType(lc) (returns strings like "Dead", "Live",
    "Seismic-H", "Wind", "None") first; falls back to title heuristics.
    """
    raw = None
    try:
        v = load.GetLoadType(int(lc))
        if v:
            raw = str(v).strip()
    except Exception:
        raw = None

    if raw:
        r = raw.upper()
        if "DEAD" in r:
            return "dead"
        if "ROOF" in r and "LIVE" in r:
            return "roof_live"
        if "LIVE" in r:
            return "live"
        if "WIND" in r:
            # Direction not encoded in the type string — default to wind_x.
            return _wind_dir_from_title(title)
        if "SEISMIC" in r or "EARTHQUAKE" in r:
            return _seismic_dir_from_title(title)
        # "None" / "Snow" / "Temperature" etc → fall through to title heuristic
    return _infer_load_type(title)


def _wind_dir_from_title(title: str) -> str:
    t = (title or "").upper()
    if "Z" in t or "NS" in t:
        return "wind_z"
    return "wind_x"


def _seismic_dir_from_title(title: str) -> str:
    t = (title or "").upper()
    if "Z" in t or "NS" in t:
        return "seismic_z"
    return "seismic_x"


def _infer_load_type(title: str) -> str:
    t = (title or "").upper()
    if any(k in t for k in ("DEAD", "DL", "SELF")):
        return "dead"
    if "ROOF" in t:
        return "roof_live"
    if any(k in t for k in ("LIVE", "LL")):
        return "live"
    if "WIND" in t:
        return _wind_dir_from_title(title)
    if any(k in t for k in ("SEISMIC", "EQ", "EARTH")):
        return _seismic_dir_from_title(title)
    return "other"


# ---------------------------------------------------------------------------
# Mock reader (for non-Windows dev) — kept verbatim from the previous file
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
    envelope_map: Dict[int, _EnvelopeAcc] = {m.member_id: _EnvelopeAcc() for m in members}
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
        unit_system="kN-m",
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
      2. Otherwise    → attach to the running STAAD instance via the
                        official openstaad library and read. file_path is
                        used for SyncPayload.file_name / file_hash; if None
                        we ask STAAD which model is open.
    """
    if mock:
        return _read_mock_model(project_id)
    return _read_real_model(project_id, file_path)


# ---------------------------------------------------------------------------
# Legacy win32com helpers — kept for staad_query.py (the /query/* endpoints
# still use the direct win32com path). New code should use the openstaad
# library via _read_real_model() above.
# ---------------------------------------------------------------------------

_CANDIDATE_PROGIDS = (
    "StaadPro.OpenSTAAD",
    "OpenSTAAD.Application",
    "STAADOpenUI.BOpenSTAAD",
)
_FILENAME_METHODS = ("GetSTAADFile", "GetFileName", "GetInputFile")
_FILENAME_ATTRS = ("FileName", "Name", "InputFile")


def _connect_to_staad():
    """Attach to a running STAAD instance via win32com; fall back to Dispatch.

    Returns `(staad_com_object, progid_used)`. Used only by the legacy
    /query/* path in staad_query.py.
    """
    try:
        import pythoncom  # type: ignore
        import win32com.client  # type: ignore
    except ImportError as e:
        raise StaadError(
            "win32com/pythoncom are unavailable. On non-Windows hosts use MOCK_MODE=1."
        ) from e

    pythoncom.CoInitialize()

    last_err: Optional[Exception] = None
    for progid in _CANDIDATE_PROGIDS:
        try:
            return win32com.client.GetActiveObject(progid), progid
        except Exception as e:
            last_err = e
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


def _open_staad(file_path: Optional[Path]):
    """Return a win32com STAAD object ready to read; reuse the open model."""
    staad, _progid = _connect_to_staad()
    if file_path is not None:
        try:
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


def _unwrap(v):
    """Recursively unwrap a COM VARIANT until we get a Python primitive."""
    for _ in range(10):
        if v is None:
            return 0
        if isinstance(v, (int, float, str)):
            return v
        if hasattr(v, "value"):
            v = v.value
            continue
        if hasattr(v, "__getitem__") and hasattr(v, "__len__"):
            if len(v) > 0:
                v = v[0]
                continue
            return 0
        try:
            return float(v)
        except (TypeError, ValueError):
            pass
        try:
            return int(v)
        except (TypeError, ValueError):
            pass
        return 0
    return 0


def _unwrap_float(v) -> float:
    r = _unwrap(v)
    try:
        return float(r)
    except (TypeError, ValueError):
        return 0.0


def _unwrap_int(v) -> int:
    r = _unwrap(v)
    try:
        return int(r)
    except (TypeError, ValueError):
        return 0


def _com_int(obj, name: str) -> int:
    """Return an integer from a COM member that might be a method OR property."""
    attr = getattr(obj, name)
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


def _force_com_units(staad, log) -> None:
    """Force STAAD's COM API to use metres + kN (legacy /query path).

    Unit codes: Force 5=KiloNewton, Length 4=Meter.
    """
    try:
        try:
            staad._FlagAsMethod("SetInputUnitForLength")
            staad._FlagAsMethod("SetInputUnitForForce")
        except Exception:
            pass
        staad.SetInputUnitForLength(4)   # 4 = Meter
        staad.SetInputUnitForForce(5)    # 5 = KiloNewton
        log.info("forced COM units: length=Meter(4) force=KiloNewton(5)")
    except Exception as e:
        log.warning("could not force COM units: %s", e)


# Silence unused-import complaint from the mock-only build.
_ = math
_ = Tuple
