# Ditch Table — Load example (design)

**Date:** 2026-10-23  
**Status:** Approved (approach A)  
**Tool:** `/ditch-table/`

## Goal

Let Luis tap **Load example** and get a filled 5-station ditch table so he can try Goal Seek, pass/fail colors, and scrolling without typing numbers first.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| How it appears | Toolbar button only (not auto-seed on first visit) |
| If table has data | Replace after confirm |
| Size | 5 stations (~500 ft, 100 ft each) |
| Approach | Sample rows baked into table code (no separate JSON) |

## UI

- New toolbar button **Load example**, next to **Clear table** (same button styling; ≥44px on touch).
- On click:
  1. If the table is not “empty” (more than one blank-ish row, or any row with Q / FL / comment filled), show:  
     `Replace your table with the 5-station example?`  
     Cancel → no change.
  2. If empty (or user confirms), replace `rows` with the example, set storm label to `5-YR (example)`, `recomputeAll()`, `render()`, `save()`.
- **Clear table** stays as today: confirm → one blank `emptyRow()`.

## Example data (fixed)

Five consecutive 100 ft segments, stations `0+00` → `5+00`.

Shared section (all rows unless noted):

- Offsets: leave blank or a simple LT label (e.g. `LT`)
- Trapezoid: Z1 = 3, B = 2 ft, Z2 = 3, Dd = 2 ft, n = 0.035
- Grade from flow-line elevs (no grade override): start FL ≈ 100.00 at 0+00, drop ~0.5 ft per 100 ft (S ≈ 0.005)
- Design Q: same modest Q on each row (e.g. 15–25 cfs) so capacity/freeboard checks are meaningful and Goal Seek can find depth
- Comment on first row only: `Example — replace with your alignment`

Exact numbers are set at implementation so `computeRow` succeeds (finite depth, Qfull, freeboard) for every row after load.

## Code touch points

- `ditch-table/model.js` — export `exampleRows()` (or `EXAMPLE_ROWS` factory) returning 5 raw input rows (ids fresh each call).
- `ditch-table/table.js` — wire button; empty-check helper; load path.
- `ditch-table/index.html` — button markup.
- `ditch-table/test.js` — assert `exampleRows().length === 5` and each `computeRow` has no fatal `err` (or only expected incomplete if Q omitted — prefer Q filled so results show).

No home page or studio changes. No localStorage key bump (button is opt-in).

## Out of scope

- Multiple named samples
- Auto-load on first visit
- Import from Excel / Rational storm
- Changing Clear to load the example

## Done when

- Button visible on phone-friendly toolbar
- Confirm when replacing non-empty table
- Five stations load, recompute, and persist
- Tests cover example factory; Pages updated after push
