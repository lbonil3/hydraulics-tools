# Storm Sewer — Network table + HGL profile (design)

**Date:** 2026-10-23  
**Status:** Approved (approach A)  
**Tool:** `/storm/`

## Goal

Give Luis a phone-friendly storm sewer network checker and sizer for TxDOT roadside work: branched laterals into mains, design Q at nodes with auto-sum on pipes, HGL from a known outfall water surface working upstream, HEC-22 structure losses, Suggest size per pipe, and a live HGL profile sketch.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Approach | Network tables + HGL profile (A), not single-path wizard or map canvas |
| Topology | Branched network (laterals into mains) |
| Job | Analyze entered sizes **and** Suggest size helper on each pipe |
| Pipe shapes | Full set listed for storm sewers in TxDOT HDM (circular, box, and any other HDM-listed conduit shapes we can compute with existing geometry helpers; cite HDM; fall back to HEC-22 / HDS geometry when HDM gives no formula) |
| HGL start | User sets outfall water-surface elevation; compute **upstream** |
| Junction losses | HEC-22 (bend, junction, access-hole) from structure geometry |
| Design Q | Entered at **nodes**; each pipe Q = sum of all upstream node inflows |
| Handoff from Drainage / Tc | **Out of v1** (manual node Q only) |
| Chart library | None — SVG profile in `viz.js` |
| Criteria order | TxDOT HDM first; FHWA (HEC-22 / HDS) when TxDOT gives no value, clearly labeled |

## Home page

- New card **Storm Sewer** after **Drainage Studio** (flow: Tc → inlets → pipes → ditch / culvert).
- Path: `storm/index.html`, class `tool-storm`.
- Update `scripts/check-home.js` card order and links.
- Chip cites TxDOT HDM storm sewer / HEC-22 as appropriate.

## Data model

Persist `localStorage` key `storm-network-v1`:

```text
{
  version: 1,
  outfallTw: number | null,   // water-surface elev at outfall (ft)
  nodes: Node[],
  pipes: Pipe[],
  options?: { ... }
}
```

### Node

| Field | Meaning |
|--------|---------|
| `id` | Stable id |
| `name` | Label (e.g. MH-1, IN-3, OF) |
| `kind` | `outfall` \| `manhole` \| `junction` \| `inlet` |
| `rim` | Rim / ground elev (ft) |
| `invert` | Structure invert elev (ft) — used with pipe IE for drops |
| `Qin` | Local inflow (cfs); 0 if none |
| HEC-22 geometry extras as needed | e.g. access-hole diameter, angles — defaults when blank |

Exactly one node should be `kind: outfall` (or the downstream-most node with no outgoing pipe). Validation flags missing/duplicate outfall.

### Pipe

| Field | Meaning |
|--------|---------|
| `id` | Stable id |
| `fromId` / `toId` | Upstream → downstream node ids (flow toward outfall) |
| `shape` | HDM-listed shape key (circular, box, …) |
| size fields | Circular: diameter; box: span × rise; others per shape |
| `n` | Manning n |
| `length` | ft |
| `ieUp` / `ieDn` | Invert elev at up/down ends (ft); slope from these + length |
| computed | `Q`, full-flow capacity, velocity, hf, HGL at ends, flags |

No cycles. One outgoing pipe per node toward the outfall (tree into the outfall). Multiple incoming laterals allowed.

## Hydraulics

### Flow accumulation

1. Build adjacency from `fromId` → `toId`.
2. Topological order from leaves toward outfall.
3. Pipe Q = sum of `Qin` at all nodes that drain through that pipe (including the pipe’s upstream node).

### Conveyance

- Manning full-flow and part-full as needed for velocity / capacity checks.
- Reuse geometry from `culvert/calc.js` (circular, box, shared section helpers) where possible; keep storm calc free of page UI.
- Standard commercial size steps for Suggest size (common RCP / box increments; document the table in code comments + Sources card).

### Friction loss

- hf along each pipe from Manning (or equivalent) for the pipe Q and section; cite TxDOT HDM / HEC-22 as applicable.

### Structure losses (HEC-22)

At each non-outfall structure, compute access-hole / junction / bend losses from HEC-22 using available geometry. When a geometric input is missing, use documented HEC-22 defaults and state them in the Sources / step card. TxDOT HDM citations when HDM adopts or points to HEC-22.

### HGL walk

1. At outfall: HGL = `outfallTw` (user). If null, show empty state — do not invent TW.
2. Walk upstream pipe by pipe:  
   HGL_up = HGL_down + hf + structure_loss_at_upstream_node (per HEC-22 energy balance as implemented).
3. Flag surcharge when HGL > rim (and apply any TxDOT freeboard / allowable surcharge rule when HDM states one; otherwise HEC-22 / engineering check labeled as such).

### Suggest size

- Per pipe (or toolbar “Suggest sizes” for all failing pipes): try next larger standard size in the shape’s size list until:
  - Q ≤ full-flow capacity (or HDM allowable full-flow criterion), and
  - HGL at upstream node ≤ rim (minus freeboard if HDM specifies).
- Does not change layout (nodes / connectivity), only size (and n default for material if we tie material→n).
- Re-run accumulation + HGL after each change.

## UI

### Layout

- Header: ← Home, title **Storm Sewer**, short TxDOT/HEC-22 blurb.
- Toolbar (≥44px touch): Add node, Add pipe, Load example, Suggest sizes (and Delete on selected row).
- **Nodes** table, then **Pipes** table (ditch-table style inputs).
- Results strip: network Q at outfall, worst surcharge, pass/fail counts.
- `#viz` HGL profile under tables; on wide screens table left / viz right sticky (same breakpoint idea as ditch-table helpers).

### Profile sketch

- X = distance along a user-selected path from outfall to a selected upstream node (default: longest path or path through selected pipe).
- Lines: ground/rim, pipe crown (and invert), HGL.
- Empty states when TW or connectivity incomplete.
- Color family `#1f4e79`.

### Example

- Load example: small branched network (2–3 laterals + main + outfall) with finite TW so HGL and Suggest size are demoable; confirm replace if tables non-empty (same pattern as ditch-table).

## Files (v1)

| File | Role |
|------|------|
| `storm/calc.js` | Accumulate, conveyance, losses, HGL, suggestSize |
| `storm/test.js` | Node tests for accumulate, losses, HGL branched example |
| `storm/table.js` or `app.js` | Tables, persistence, toolbar, refreshViz |
| `storm/viz.js` | HGL profile SVG |
| `storm/index.html`, `style.css`, `mobile.css`, `mobile.js` | Shell + iPhone layout |
| `index.html` + `scripts/check-home.js` | Home card |

Optional: thin shared extract from culvert geometry later; v1 may `require`/`import` shared helpers without a big refactor.

## Out of v1

- Map / canvas network editor
- Auto handoff from Drainage Studio or Tc Studio
- Pumps, pressure-only solvers beyond surcharge flags
- Full unsteady / dynamic wave
- PDF report (may follow culvert pattern later)

## Testing / success

- `node storm/test.js` → `ok` (branched accumulate, HGL rises upstream with losses, suggest size grows diameter when undersized).
- Manual: Load example on phone-width layout; edit Qin; see pipe Q and profile update; Suggest size clears a deliberate undersize.
- Home check script passes with new card order.

## Sources (to show in UI)

- TxDOT Hydraulic Design Manual — storm sewer / conduit criteria (chapter/section as implemented).
- FHWA HEC-22 (Urban Drainage Design Manual) — structure losses and methods used when HDM defers or lacks a number.
- Geometry / Manning helpers aligned with existing Culvert Studio where reused.
