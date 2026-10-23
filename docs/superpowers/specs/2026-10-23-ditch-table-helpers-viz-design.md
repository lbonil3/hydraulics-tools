# Ditch Table — Alignment helpers + sketches (design)

**Date:** 2026-10-23  
**Status:** Approved (approach A)  
**Tool:** `/ditch-table/`

## Goal

Speed up station-by-station ditch entry (copy section, fill flow lines from grade, chain Q/n) and make the page less “spreadsheet-only” with a live cross-section and profile sketch.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Approach | Helpers in toolbar + sketches under/beside table (A) |
| Visuals | Cross-section (selected row) + profile (FL + WSEL) |
| Helpers | All three: Copy section, Fill FL from grade, Chain Q/n |
| Chart library | None — pure SVG in `viz.js` |
| Chain default | Off |

## Helpers

### Row selection

- Tapping any cell in a row sets `selectedRowId` (light row highlight).
- Used by Copy section and the cross-section sketch.
- Default: first row if none selected.

### Copy section

- Toolbar button **Copy section**.
- From the selected row, copy into **all rows below**: `Z1`, `B`, `Z2`, `Dd`, `n`, `offFrom`, `offTo`.
- Do **not** copy stations, FL elevs, length, Q, grade override, comment, or computed fields.
- Recompute affected rows; save; re-render.

### Fill FL from grade

- Toolbar button **Fill FL from grade**.
- Walk rows top → bottom:
  - Resolve grade: if `gradeOverride` and finite grade > 0, use it; else `gradeFromElevs` if both FL set; else skip row with no change.
  - If `flFrom` is null but previous row has `flTo`, set `flFrom = prev.flTo`.
  - If grade and `flFrom` and length > 0: set `flTo = flFrom − grade × length`.
- One confirm if any row already has both FL values that would change:  
  `Update existing flow-line elevations from grade?`
- Clear stale `flowDepth` where FL/grade inputs change (existing DEPTH_INVALIDATING behavior).
- Recompute all; save; render.

### Chain Q / n

- Toolbar control: toggle **Chain** (checkbox or pressed button), **off** by default; persist in `localStorage` with table payload (`chainQn: boolean`).
- When **on**, after the user edits `Q` or `n` on row *i*, set the same value on every row with index `> i`, then recompute those rows.
- Turning Chain off does not rewrite existing values.
- Does not chain other fields.

## Sketches

### Layout

- Container `#viz` below the table wrap on narrow screens; on `min-width: 900px`, main area becomes two columns: table left, viz right (sticky).
- Two cards inside viz:
  1. **Cross-section** — title “Section @ {staTo}” (or From–To).
  2. **Profile** — title “Profile (FL + WSEL)”.

### Cross-section (SVG)

- Geometry from selected row: trap if `B > 0`, else V.
- Draw banks with Z1/Z2, bottom B, full depth Dd.
- If `flowDepth` finite: horizontal water line + light blue fill to that depth.
- Labels: B, Z1, Z2, Dd, and yd if present.
- Empty state: “Select a row” / “Enter section dimensions”.

### Profile (SVG)

- X = station (ft) from `staFrom`/`staTo` (use parseStation).
- Polyline of flow line: for each row with both `flFrom`/`flTo`, segment from (staFrom, flFrom) → (staTo, flTo).
- Markers for WSEL at downstream end when `WSEL` finite.
- Simple axes + padding; auto-scale from data extents.
- Empty state when no FL data.

### Style

- Drainage Studio blue `#1f4e79`, card white, soft border; legend text readable on phone.
- Toolbar controls ≥44px on touch (`mobile.css`).

## Code touch points

| File | Change |
|------|--------|
| `ditch-table/model.js` | Pure helpers: `copySectionDown(rows, fromIndex)`, `fillFlFromGrade(rows)`, maybe `applyChainQn(rows, fromIndex, key, value)` |
| `ditch-table/table.js` | Selection, toolbar wiring, chain on edit, call viz redraw |
| `ditch-table/viz.js` | **New** — `renderSection(el, row)`, `renderProfile(el, rows)` |
| `ditch-table/index.html` | Toolbar buttons + Chain; `#viz` markup |
| `ditch-table/style.css` / `mobile.css` | Layout, cards, selection highlight |
| `ditch-table/test.js` | Unit tests for copy / fill FL / chain pure functions |

## Out of scope

- Import Q from Tc Studio / CSV / PDF export
- HEC-15 lining per row
- Sticky first column / column hiding (phone UX #4)
- Animation beyond instant SVG redraw
- Multiple named samples

## Done when

- All three helpers work on phone-sized layout
- Section updates with selection; profile shows FL + WSEL when data exists
- Tests cover model helpers; Pages updated after push
