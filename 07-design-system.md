# 07 — Design System

## CSS Variables
```css
--amber:    #D4820F;   /* beams · tension steel · primary action */
--amber-l:  #FEF3E0;
--blue:     #1755A0;   /* columns · stirrups · load combos */
--blue-l:   #E8F0FC;
--teal:     #157A6A;   /* compression steel As' · slabs */
--teal-l:   #E0F2EE;
--red:      #A02020;   /* fail · negative moment · shear fill */
--red-l:    #FDE8E8;
--green:    #256830;   /* pass · footings */
--green-l:  #E4F2E6;
--bg:       #EDEBE5;   /* page background */
--surface:  #FFFFFF;
--surf2:    #F6F4EF;   /* card headers */
--surf3:    #F0EDE8;   /* table headers, step card headers */
--border:   #DDD8CE;
--text:     #1A1816;
--text2:    #6A6560;
--mono:     'IBM Plex Mono', monospace;  /* ALL numbers, values, IDs, hashes */
--sans:     'IBM Plex Sans', system-ui; /* labels, prose */
```

**Font rule:** every number, unit value, member ID, hash, and engineering quantity uses `--mono`.

## Tags (shared component)
```
9px bold · rounded-sm
.ta → amber-l bg + amber text  (beams, pending, doubly reinforced)
.tb → blue-l bg + blue text    (columns, info, combos)
.tg → green-l bg + green text  (pass, synced, complete)
.tr → red-l bg + red text      (fail, mismatch)
.tp → purple-l bg + purple text (reports, AI)
```

## Cards
```
.card: white bg · 0.5px border · border-radius 6px · overflow hidden
.ch:   surf2 bg · 0.5px bottom border · 8px 13px padding · flex row
.cb:   12px 13px padding
```

## Tables
```
thead: surf3 bg · 9.5px bold uppercase gray · 0.5px bottom border
tbody rows: 5px 9px padding · 0.5px bottom border (last child: none)
Governing row: amber-tinted bg
Fail row: red-tinted bg
All numeric cells: font-family mono
```

## Step Cards (calculation breakdown)
```
header: surf3 bg · blue number badge + title text
body: mono font · rows of [label min-width:170px] [value]
  value colors: blue = intermediate · green bold = pass · red bold = fail/trigger
```

## SVG color rules (non-negotiable)
All engineering SVGs must use exactly these colors:
```
Perimeter bars (4 corners):  fill #D4820F  stroke #8B5000  (amber)
Additional tension bars:      fill #B06008  stroke #8B5000  (dark amber)
Compression bars As':         fill #157A6A  stroke #0A4A3A  (teal)
Stirrups / ties:              stroke #1755A0  (blue, no fill)
Stirrup hook line:            stroke #1755A0

Concrete fill:    #E8E4DC
Concrete outline: #4A4038  stroke-width 2.5

Centroid dashed lines:  amber (#D4820F) for bottom steel
                        teal (#157A6A) for top steel

M+ fill:  #FEF3E0  stroke #D4820F
M- fill:  #E8F0FC  stroke #1755A0
+V fill:  #FDE8E8  stroke #A02020
-V fill:  #E8F0FC  stroke #1755A0
Baseline: #C8C4BE  dashed

Support triangles: fill #4A4038

Dimension lines: #9A9490  stroke-width 0.7
                 tick marks at both ends
```

SVG typography:
- All numbers, dimensions, values: `font-family="IBM Plex Mono"`
- Minimum 7px for dimension labels, 9px for value labels
- All text on SVG backgrounds must pass contrast (avoid light gray on light fills)

## App Shell
```
Sidebar: 184px · bg #111318 · border-right 1px #1E2128
Top nav: 40px · bg #0C0E14 · border-bottom 1px #1A1C22
Content: bg #EDEBE5 · padding 16px · scrollable
Page tabs: bg #0F1118 · border-bottom 1px #1E2028 · overflow-x auto
```

Sidebar bottom: static text showing engineer name + code standard. No login/logout button.
