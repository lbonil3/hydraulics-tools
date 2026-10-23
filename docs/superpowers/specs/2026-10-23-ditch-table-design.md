# Ditch Table — Design Spec

**Date:** 2026-10-23  
**Status:** Design approved in chat; awaiting user review of this written spec before implementation plan  
**Repo:** https://github.com/lbonil3/hydraulics-tools  
**Related:** Ditch Studio (`/ditch/`) — single-section capacity & HEC-15 lining checks

## Goal

Build a **separate** web tool that mirrors Luis’s Excel ditch design spreadsheet: evaluate the ditch section every ~100 ft along an alignment, with Add Row and Goal Seek for flow depth given design Q.

## Decisions (from brainstorming)

| Topic | Choice |
|--------|--------|
| Where it lives | Separate tool on the home page (not inside Ditch Studio) |
| Goal Seek | Solve for **flow depth** so Manning capacity = design Q |
| Design flow | v1: enter **Q per row**; later: storm picker + Rational/Tc import |
| Station chaining | Chain by default (From = previous To, length 100 ft); links are **editable / breakable** |
| UI approach | Spreadsheet-style wide table (Approach A) |

## Scope — v1

### New pages / files

- New tool path: `/ditch-table/` (name on home card: **Ditch Table**).
- Home page card linking to it; Home button on the tool (same pattern as other tools).
- Reuse Manning / trapezoid / V geometry math from Ditch Studio (`ditch/calc.js` or a shared module extracted for both tools).
- iPhone-friendly: horizontal scroll for the wide grid; large tap targets; same visual language as Drainage Studio / Ditch Studio.

### Row model (one segment per row)

**Inputs (editable):**

- From station, To station (accept `1123+00` style)
- From offset, To offset (e.g. `15.00' Rt`)
- From FL elev (ft), To FL elev (ft)
- Length (ft) — default 100
- Left side slope (H:1), Bottom width (ft), Right side slope (H:1)
- Grade (ft/ft or %) — **default** from ΔFL / length; user may override
- Ditch depth (ft) — bank depth for freeboard / full capacity
- Manning’s n
- Design flow Q (cfs) — labeled for a global storm name in the UI (e.g. “5-YR”) but storm is not a per-row picker in v1
- Comments (e.g. GRASS, CONC)

**Computed (read-only):**

- Ditch top width (ft) from trapezoid / V geometry at ditch depth
- Flow depth (ft) — from Goal Seek (or blank until sought)
- Cross-sectional area (sf), wetted perimeter (ft), hydraulic radius (ft)
- Velocity (ft/s), velocity head V²/2g (ft)
- Full flow capacity (cfs) at **full ditch depth** (matching spreadsheet “FULL FLOW CAPACITY”)
- Shear stress τ = γ R S (lb/ft²) using channel slope
- Top of ditch elev D/S (ft) = To FL + ditch depth (document if From side is used instead; default **downstream**)
- WSEL D/S (ft) = To FL + flow depth
- Freeboard (ft) = top of ditch elev − WSEL

### Toolbar

- **Add Row** — next From = previous To; length 100 ft; copy geometry, n, and offsets from previous row; To station defaults to From + 100 ft; To FL elev left blank for the user (or copies previous Δ if both previous elevs exist)
- **Delete row**
- **Goal Seek** — all rows missing a converged depth (or all rows)
- Per-row Goal Seek control
- Persist table in `localStorage` so refresh does not wipe work

### Pass / fail display (v1)

- Green when freeboard ≥ **0.5 ft** (HEC-15 permanent lining; labeled: TxDOT HDM Ch. 7 asks for freeboard but gives no number)
- Green when full capacity ≥ design Q
- Shear shown; **no** auto pass/fail on shear until lining type is added later
- Failed checks use amber/red styling (no Excel `#VALUE!` dumps)

### Goal Seek behavior

- Unknown: flow depth `d`
- Constraint: Manning Q(d) = design Q
- Geometry: trapezoidal (or V when bottom width = 0) with left/right side slopes
- If design Q exceeds full-depth capacity, mark row as no solution; leave depth blank
- Invalid inputs (length ≤ 0, n ≤ 0, missing elevs when grade not overridden, etc.): clear error on the row

### Criteria / citations

- TxDOT first where a value exists; else FHWA and label it
- Freeboard requirement: HEC-15 §2.3.4 (0.5 ft permanent) — **labeled**, not claimed as TxDOT
- Hydraulics: Manning equation; shear γRS (HEC-15 / standard open-channel practice)

## Out of scope for v1

- Storm frequency picker per row
- Import Q from Rational / Tc Studio
- Full HEC-15 lining picker / stability pass-fail on each row
- Mixed linings, steep-slope riprap method
- Whole-alignment profile plot
- Excel `.xlsx` import/export
- PDF export (may follow same jsPDF pattern as culvert once table is stable)
- Card-per-station mobile layout (possible later if wide table is awkward on phone)
- Changing Ditch Studio’s single-section UI

## Architecture

```
index.html (home) → card → ditch-table/
  index.html       UI shell + toolbar
  table.js         grid, Add Row chaining, localStorage
  seek.js          Goal Seek / normal-depth solver wrappers
  style + mobile   wide table scroll, input vs calc cell colors
Shared (extract or import):
  ditch/calc.js (or shared/manning-ditch.js) — area, P, R, Q, τ
```

Ditch Studio continues to own HEC-15 lining checks for a **single** section. Ditch Table owns multi-station design bookkeeping.

## Validation / “done”

1. Two or three rows matching Luis’s template (or a documented hand calc) within normal rounding for depth, area, V, capacity, shear, freeboard.
2. Unit tests: station arithmetic, grade from elevs, top width, Goal Seek depth, freeboard, capacity ≥ Q coloring.
3. iPhone: table usable with horizontal scroll; Add Row / Goal Seek reachable.
4. Live on GitHub Pages; Home card works; no regression to existing `/ditch/` tool.

## Open points resolved in this spec

- Tool is separate, not a mode inside Ditch Studio
- Goal Seek target is depth for Q, not geometry
- Chaining is default but editable
- v1 Q is typed per row

## Future (not blocking v1)

- Storm column + Rational import
- HEC-15 / TxDOT lining checks per row
- Optional card layout for phone
- PDF / CSV export
