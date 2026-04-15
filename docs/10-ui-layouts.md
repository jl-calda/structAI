# 10 — UI Page Layouts

Agreed layouts — build exactly these structures.

---

## Dashboard `/dashboard`
```
[App name + date + active code standard]
[4 stat cards: Active Projects | Completed | Members Designed | Reports]

[Section: "Projects"]
[3-column grid of project cards]
  Each card:
    Project ID (mono bold 13px) + status tag
    Client/location (small gray)
    2×2 grid: Beams N/N ✓  Columns N/N  Slabs N/N  Footings N/N
    Progress bar
    Footer: % complete | last sync date
[+ New Project card at end of grid]

[Section: "Recent Activity"]
[Table: Time | Project | Action | Element | Status tag]
```

---

## Project Overview `/projects/[id]`
```
[STAAD sync banner — full width]

[4 stat cards with colored top border]
  amber=beams, blue=columns, teal=slabs, green=footings
  Each: large count number | pass/fail/pending breakdown | progress bar | "N of M members" caption

[2-column row]
  Left: STAAD Frame SVG
    Columns = vertical thick lines, Beams = horizontal lines
    Selected/active members in amber
    Floor labels (1F, 2F, 3F) on left
    Member ID badges on highlighted beams
  Right (2 cards stacked):
    Issues card: list of fail/unverified with reason and member label
    Quick actions card: Re-run failed · Assign unassigned · Generate report
```

---

## Setup `/projects/[id]/setup`
Two tabs (toggle within the page, no separate routes):

**Tab 1 — STAAD Import:**
```
[File drop zone showing current .std file name + size]
[6-cell info grid: Hash | Status | Members | Sections | Nodes | Last Sync]
[Re-sync button — full width, green tint]
```

**Tab 2 — Load Combinations:**
```
[2-column layout]
Left: Basic load inputs
  Code template select (NSCP 2015 / ACI 318-19 / EC2 / AS / CSA)
  Inputs: DL · SDL · LL · Lr · WL · Seismic Zone
  [Generate Combinations button]
Right: Envelope summary
  3 stat boxes: Design M+ | Design M- | Design Vu
  Each shows governing combo number

[Combinations table below — full width]
  Columns: No. | Equation | M+ max | M- max | Vu max | Governs | Status
  Governing M+ row: amber highlight
  Governing M- row: blue highlight
```

---

## Members `/projects/[id]/members`
```
[Filter: All(N) | Beams(N) | Columns(N)]  [Search input]  [right: "X designed · Y unassigned"]

[Full-width table]
  Member ID | Type tag | Section | Length | Group | Assigned Design | Status | Action
  Row states:
    Normal white
    Fail: red-tinted bg
    Unverified: amber-tinted bg
    Unassigned: "Assign" amber btn
    Assigned: "Open" secondary btn
```

---

## Beam Design `/projects/[id]/beams/[id]`
```
[Header: B-12 (mono 20px bold) | tags | members·span·section | φMn result tag right]

[Row 1: 2-column force diagrams]
  Left: Moment envelope SVG
    M+ fill amber above baseline, M- fill blue at ends
    IP markers, annotated max values + combo numbers
    Span dimension line at bottom
  Right: Shear envelope SVG
    +V fill red (left), -V fill blue (right)
    Values annotated

[Row 2: 3-column design section]
  Col 1 (fixed ~210px): Cross-Section SVG
    Concrete rect (b×h), stirrup rect inside
    4 amber corner bars, additional dark amber bars, teal compression bars
    Centroid dashed lines, d and d' labels, b and h dimensions

  Col 2 (~195px): Rebar Controls
    PERIMETER box (amber tint, locked 🔒):
      Count spinner (grayed, min 4) + dia dropdown
    ADDITIONAL TENSION box:
      L1 row: count + dia
      L2 row: count + dia
    COMPRESSION As' box (teal tint):
      Count + dia
    Result bar: "As = X mm² ≥ req = Y mm² ✓" (green/red)

  Col 3 (flex): Elevation SVG
    Beam outline + support triangles
    Stirrup lines (dense near supports, sparse midspan)
    2 amber perimeter lines top (full span)
    2 amber perimeter lines bottom (full span)
    1 teal compression line top (full span)
    Additional bars: amber diagonals bending down at supports (45°)
    Red tick marks at bend points
    Bend length dimension lines above: "lb = X mm"
    Bar labels on right
    Span dimension below
    Bend point note below SVG

[Row 3: Calculation Breakdown]
  2-column grid of 8 step cards:
    1: Section & Material Props
    2: Steel Centroids
    3: φMn,max Singly
    4: Doubly Reinforced Check → red "YES → DR" or green "singly ok"
    5: Required Steel
    6: Provided Steel → green result bar
    7: Shear Design → green result bar
    8: Bend Points & Dev Length

[Row 4: 2-column]
  Left: Stirrup Zones
    Visual zone bar: [dense] [midspan] [dense]
    Zone table: zone | region | spacing | length | count | φVn | Vu | ✓
  Right: All Checks
    5 rows: pos flexure | neg flexure | shear | development | ductility
    Each: label | "X ≥ Y unit" | ✓ or ✗
```

---

## Column Design `/projects/[id]/columns/[id]`
```
[Header: C-1 (mono bold) | tags | section info | interaction ratio tag right]

[3-column layout]
  Col 1 (~220px): Cross-Section SVG + Rebar Controls
    SVG: concrete rect, all vertical bars as amber circles on perimeter, tie rectangle blue
    Controls:
      Vertical bars: count spinner + dia dropdown
      Tie dia dropdown
      Tie spacing input
    Result bar: "ρ = X% · min 1% ≤ ✓ ≤ max 8%"

  Col 2 (flex): P-M Interaction Diagram SVG
    X = M (kN·m), Y = P (kN)
    Grid lines
    Interaction curve (blue filled area to axes)
    Balanced point: open circle
    Design point: filled amber circle with dashed lines to axes
    Annotation: "Pu=[val] Mu=[val]"

  Col 3 (~220px): Check Results
    GOVERNING FORCES — Pu | Mu | combo
    INTERACTION — ratio | ρ min | ρ max
    SHEAR — φVn ≥ Vu
    TIES — spacing | dia | slenderness
    Each row: label | value | ✓ or ✗
```

---

## Slab Design `/projects/[id]/slabs/[id]`
```
[Header: S-2A | type tag | "NO STAAD LINK" indicator | status]

[2-column layout]
  Left (2 cards stacked ~220px):
    Geometry card: type select · Lx · Ly · thickness · cover
    Loads card: DL self (readonly) · SDL · LL · wu computed display

  Right (2 cards side by side):
    Rebar Plan SVG:
      Rectangle (plan view)
      Short-span bars: amber horizontal lines
      Long-span bars: blue vertical lines (semi-transparent)
      Center label: span dimensions
      Labels: "Ø[dia]@[spacing]" bottom and side
    Checks card:
      FLEXURE SHORT SPAN — Mu,x | φMn,x | ✓
      FLEXURE LONG SPAN  — Mu,y | φMn,y | ✓
      SHEAR & DEFLECTION — one-way | l/d | min steel
```

---

## Footing Design `/projects/[id]/footings/[id]`
```
[Header: F-1 | type tag | column link | dims | status]

[3-column layout]
  Col 1 (~220px): Geometry & Soil inputs
    Lx · Ly · Depth · Cover (75mm default)
    Soil bearing capacity (kPa)
    Soil depth from GL
    Loads panel (from STAAD node, read-only): Pu | Mu

  Col 2: Footing Plan SVG
    Footing outline rect
    Column rect centered (gray fill)
    d/2 punching perimeter (dashed blue rect)
    One-way shear lines (dashed red, at d from column face)
    Bottom bars: amber horizontal lines
    Labels: col dims | punching perimeter | shear critical section

  Col 3 (~220px): Checks (5 sections)
    SOIL PRESSURE — q_net | q ≤ qa ✓
    ONE-WAY SHEAR — Vu at d | φVc ✓
    PUNCHING SHEAR — Vu | φVc ✓
    FLEXURE — Mu at face | φMn ✓
    BEARING — φBn ≥ Pu ✓
```

---

## MTO `/projects/[id]/mto`
```
[4 stat cards: Total weight | Largest dia | Stirrups | Other]
  Non-total cards: weight in kg + % of total + small progress bar

[Full-width rebar schedule table]
  Group header rows per bar size (amber / blue / teal bg)
  Columns: Mark | Ø | Shape tag | Element | Description | L(mm) | No. | Total L(m) | kg/m | Weight(kg)
  Subtotal rows per dia group
  Grand total row: dark #121008 bg · amber text · large mono weight

[Export CSV + Print buttons in card header]
```

---

## Reports `/projects/[id]/reports`
```
[2-column layout]
  Left: Generate Report
    Scope buttons (toggle group): Full | Beams | Columns | Slabs | Footings | MTO
    STAAD status indicator (green/amber/red with text)
    Title input
    Engineer of Record input
    Checkboxes: calc breakdown | drawings | MTO | AI narrative
    [Generate PDF — full width amber button]

  Right: Report History
    Each report card:
      PDF icon + title
      Mono: date · hash · page count
      Tag: In sync (green) or Out of sync (amber)
      Download + Preview buttons
    Out-of-sync reports: reduced opacity icon
```
