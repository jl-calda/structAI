# OpenSTAAD COM API — Reference Summary

Bentley's OpenSTAAD reference (Doxygen, version 22.00.00.15) lives under
`OSAPP/`. Open `OSAPP/index.html` in a browser for the full reference.
This README summarizes the slice we use from `staad-bridge/`.

## Connecting (Python via win32com)

```python
import pythoncom
import win32com.client

pythoncom.CoInitialize()                              # required per-thread
staad = win32com.client.GetActiveObject("StaadPro.OpenSTAAD")
geometry = staad.Geometry
support  = staad.Support
property_= staad.Property
load     = staad.Load
output   = staad.Output
```

- **ProgID:** `StaadPro.OpenSTAAD` (V22 CONNECT). Older builds:
  `OpenSTAAD.Application`, `STAADOpenUI.BOpenSTAAD`.
- `GetActiveObject(...)` attaches to a STAAD instance the user already has
  open. `Dispatch(...)` will silently launch a second instance when the
  running one isn't in the ROT — prefer attach + fallback.
- The model file must already be open. Calling `OpenSTAADFile(...)` while
  STAAD is showing the file disrupts V22's COM state and may prompt the
  user about unsaved changes.

## The VARIANT by-ref pattern

Almost every output value in OpenSTAAD comes back through a `VARIANT FAR &`
output parameter, not the function's return value (the return is usually a
status `VARIANT` with `True`/`False` or a count). The caller allocates the
storage; STAAD writes into it.

```python
# Single double output (e.g. one node coord)
sa  = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, [0.0])
var = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_R8, sa)
geometry.GetNodeCoordinates(node_id, var_x, var_y, var_z)
x = var_x.value          # read after the call

# 6-element double array (e.g. forces or reactions)
sa = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, [0.0]*6)
pdForces = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_R8, sa)
output.GetIntermediateMemberForcesAtDistance(mid, dist_m, lc, pdForces)
fx, fy, fz, mx, my, mz = list(pdForces.value)
```

Helpers in `staad-bridge/staad_reader.py`:

- `_make_variant_double()`         — single double output
- `_make_variant_long()`           — single long output
- `_make_variant_double_array(n)`  — n-element double output
- `_make_variant_long_array(n)`    — n-element long output
- `_variant_to_list(v)`            — extract `.value` as a Python list

### `_FlagAsMethod`

win32com sometimes sees STAAD methods as properties (calling them returns
the method object instead of invoking it). Tag them up front:

```python
for name in ("GetNodeCount", "GetMemberCount", "GetMemberIncidence", ...):
    try: geometry._FlagAsMethod(name)
    except Exception: pass   # absent on this build — skip
```

## Sub-objects and key methods

Each row lists the C++ signature from the docs and any caller-side notes.
All `VARIANT FAR &` output params are by-ref unless marked `[in]`.

### `staad.Geometry` (OSGeometryUI)

| Method | Signature | Notes |
|---|---|---|
| `GetNodeCount` | `VARIANT GetNodeCount()` | Total node count. |
| `GetMemberCount` | `VARIANT GetMemberCount()` | Total beam count. |
| `GetNodeCoordinates` | `void GetNodeCoordinates(nNodeNo, &x, &y, &z)` | Coords in current length unit (typically m). |
| `GetMemberIncidence` | `VARIANT GetMemberIncidence(nBeamNo, &nodeA, &nodeB)` | Singular only — no `GetMemberIncidences`. |
| `GetBeamLength` | `VARIANT GetBeamLength(nBeamNo)` | In current length unit. No `GetMemberLength`. |
| `GetNodeList` / `GetBeamList` | array fillers | Used to enumerate IDs. |

### `staad.Support` (OSSupportUI)

| Method | Signature | Notes |
|---|---|---|
| `GetSupportCount` | `VARIANT GetSupportCount()` |  |
| `GetSupportNodes` | `VARIANT GetSupportNodes(&nodeArray)` | By-ref long array. |
| `GetSupportType` | `VARIANT GetSupportType(&node)` | **Returns int code — see table below.** Lives on Support, NOT Geometry. |
| `GetSupportInformation` | `VARIANT GetSupportInformation(node, &releaseSpec, &springSpec)` | Releases per DOF. |

**Support type codes** (return of `GetSupportType`):

| Code | Meaning | Code | Meaning |
|---|---|---|---|
| 0 | No support | 7 | Footing foundation |
| 1 | **Pinned** | 8 | Elastic mat |
| 2 | **Fixed** | 9 | Plate mat |
| 3 | Fixed with releases (FixedBut) | 10 | MultiLinear spring |
| 4 | Enforced | 11 | Generated pinned |
| 5 | Enforced with releases | 12 | Generated fixed |
| 6 | Inclined | 13 | Generated fixed with releases |
|   |   | -1 | General error |

### `staad.Property` (OSPropertyUI)

| Method | Signature | Notes |
|---|---|---|
| `GetBeamSectionName` | `VARIANT GetBeamSectionName(nBeamNo)` | Returns the section label. |
| `GetSectionPropertyValues` / `GetSectionPropertyValuesEx` | by-ref array | Use to read AX/IX/IY/IZ etc. by section ref no. |
| `GetMaterialProperty` / `GetIsotropicMaterialProperties` | per material | E, ν, density, α. |
| `GetBetaAngle` | `VARIANT GetBetaAngle(nBeamNo)` | Member rotation about local x. |

> ⚠ `GetBeamSectionWidth` and `GetBeamSectionDepth` **do not exist**. To
> get b/h you must resolve the section's reference number then call
> `GetSectionPropertyValuesEx`, or parse the section name string.

### `staad.Load` (OSLoadUI)

| Method | Signature | Notes |
|---|---|---|
| `GetPrimaryLoadCaseCount` | `VARIANT GetPrimaryLoadCaseCount()` |  |
| `GetPrimaryLoadCaseNumbers` | `VARIANT GetPrimaryLoadCaseNumbers(&lCases)` | **Plural only.** Fills a by-ref long array of size `count` in one call — there is no per-index accessor. |
| `GetLoadCaseTitle` | `VARIANT GetLoadCaseTitle(nLC)` | Works for primary cases AND combinations. |
| `GetLoadCombinationCaseCount` | `VARIANT GetLoadCombinationCaseCount()` |  |
| `GetLoadCombinationCaseNumbers` | `VARIANT GetLoadCombinationCaseNumbers(&lCases)` | Plural, by-ref array. |
| `GetLoadAndFactorForCombination` | per combo | Pairs (case, factor). |

### `staad.Output` (OSOutputUI) — analysis results

Available only after STAAD has run an analysis on the open model.

| Method | Signature | Notes |
|---|---|---|
| `GetIntermediateMemberForcesAtDistance` | `VARIANT GetIntermediateMemberForcesAtDistance(mid, dDistance, nLC, &pdForces)` | The "M(x), V(x) along the beam" call. **NOT** `GetMemberEndForcesAtDistance` (doesn't exist). 4-arg call; 4th is by-ref `double[6]`. |
| `GetMemberEndForces` | `VARIANT GetMemberEndForces(mid, nEnd, nLC, &pdForces, LocalOrGlobal)` | `nEnd` = 0 (start) / 1 (end). `LocalOrGlobal` = 0 local / 1 global. |
| `GetSupportReactions` | `VARIANT GetSupportReactions(nNodeNo, nLC, &pdReactions)` | Three args. Returns global-axis reactions. |
| `GetNodeDisplacements` | `VARIANT GetNodeDisplacements(nNodeNo, nLC, &pdDisps)` | Global. |
| `GetIntermediateDeflectionAtDistance` | `(mid, dDistance, nLC, &dY, &dZ)` | Per-member deflections. |
| `GetMinMaxBendingMoment` / `GetMinMaxShearForce` / `GetMinMaxAxialForce` | per member, per direction | Returns extrema + positions. |

**Force / reaction layout** is always 6 values:

```
[0]=Fx  [1]=Fy  [2]=Fz  [3]=Mx  [4]=My  [5]=Mz
```

`GetIntermediateMemberForcesAtDistance` and `GetMemberEndForces` (default)
return values in the **member's local** axes. `GetSupportReactions`
returns **global** axes.

### Other useful sub-objects (not currently used)

| Object | Class | Purpose |
|---|---|---|
| `staad.Command` | `OSCommandsUI` | Issue STAAD command-language statements. |
| `staad.Design` | `OSDesignUI` | Steel/concrete design parameters. |
| `staad.View` | `OSViewUI` | Show/hide entities, view manipulation. |
| `staad.Table` | `OSTableUI` | Result tables (frame/view variants). |

## Worked example — read M(x), V(x) along every member, every combo

```python
# 1) connect
pythoncom.CoInitialize()
staad = win32com.client.GetActiveObject("StaadPro.OpenSTAAD")
geo, load_, out = staad.Geometry, staad.Load, staad.Output
for o, names in [
    (geo,   ["GetMemberCount", "GetBeamLength"]),
    (load_, ["GetPrimaryLoadCaseCount", "GetLoadCombinationCaseCount",
             "GetLoadCombinationCaseNumbers"]),
    (out,   ["GetIntermediateMemberForcesAtDistance"]),
]:
    for n in names:
        try: o._FlagAsMethod(n)
        except Exception: pass

# 2) collect combo numbers (plural, one call)
n_combos = int(load_.GetLoadCombinationCaseCount())
sa = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_I4, [0]*n_combos)
combo_array = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, sa)
load_.GetLoadCombinationCaseNumbers(combo_array)
combos = list(combo_array.value)

# 3) sample 11 points per member per combo
n_members = int(geo.GetMemberCount())
for mid in range(1, n_members + 1):
    L = float(geo.GetBeamLength(mid))                # current length unit
    for lc in combos:
        for s in range(11):
            r = s / 10
            sa = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, [0.0]*6)
            pdForces = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_R8, sa)
            out.GetIntermediateMemberForcesAtDistance(mid, r * L, lc, pdForces)
            fx, fy, fz, mx, my, mz = list(pdForces.value)
            # Mz is the major-axis bending moment for a typical beam.
```

## Gotchas

- **Units.** Distances are in the model's *current length unit*, forces in
  the *current force unit*. Convert at the boundary; don't assume metres
  or kN. Use `Output.GetOutputUnitFor*` to query the active units.
- **Local vs global.** `GetIntermediateMemberForcesAtDistance` and
  `GetMemberEndForces` (default) are local-axis; `GetSupportReactions`
  and `GetNodeDisplacements` are global-axis.
- **Plural-only accessors.** `GetPrimaryLoadCaseNumbers` and
  `GetLoadCombinationCaseNumbers` fill an array in one call — there is
  no `GetPrimaryLoadCaseNumber(i)` per-index form.
- **`GetSupportType` returns 0 for non-support nodes**, not an error. Map
  codes per the table above.
- **Ghost methods.** `GetMemberLength`, `GetMemberIncidences` (plural),
  `GetBeamSectionWidth`, `GetBeamSectionDepth`,
  `GetMemberEndForcesAtDistance`, `GetPrimaryLoadCaseNumber` (singular),
  `GetLoadCombinationCaseNumber` (singular) — none of these exist.
- **Threading.** `pythoncom.CoInitialize()` must run on the thread that
  calls COM. Repeat calls are safe.
- **Single connection.** On V22 CONNECT, opening multiple COM
  connections to the same STAAD instance can corrupt its state — share
  one `staad` object across the whole sync.

## How this maps to `staad-bridge/`

| Concern | File |
|---|---|
| COM connect, method flagging, VARIANT helpers | `staad-bridge/staad_reader.py` |
| Payload contract pushed to the Next.js app | `staad-bridge/payload.py` |
| Sync polling loop (file hash → POST) | `staad-bridge/main.py` |
| App-side validator for the same payload | `lib/bridge/payload.ts` |
