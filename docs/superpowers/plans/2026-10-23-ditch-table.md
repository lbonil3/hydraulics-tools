# Ditch Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a separate spreadsheet-style **Ditch Table** tool at `/ditch-table/` that evaluates roadside ditch segments every ~100 ft (Add Row + Goal Seek for flow depth given design Q), linked from the home page, matching the approved design spec.

**Architecture:** New static pages under `ditch-table/` load shared Manning/geometry from existing `ditch/calc.js` (`window.DT`). Pure helpers in `model.js` own station math, grade, row chaining, and Goal Seek wrappers. `table.js` owns the editable grid, localStorage, and pass/fail styling. No HEC-15 lining picker in v1 — fixed `n` per row via `{type:'fixed', n}`.

**Tech Stack:** Vanilla HTML/CSS/JS (same as Culvert / Ditch / Drainage Studio), Node for unit tests (`node ditch-table/test.js`), GitHub Pages deploy from `main`.

**Spec:** `docs/superpowers/specs/2026-10-23-ditch-table-design.md`

## Global Constraints

- TxDOT criteria first when a value exists; otherwise FHWA and **label** it (Luis standing rule).
- Freeboard pass threshold = **0.5 ft** (HEC-15 §2.3.4 permanent); label that TxDOT HDM Ch. 7 gives no number.
- iPhone layouts required (horizontal scroll OK for the wide grid; ≥44px tap targets).
- Full flow capacity = Manning Q at **full ditch depth** (not depth minus freeboard).
- Top of ditch / WSEL use **downstream** (To) FL elev.
- Do not change Ditch Studio single-section UX beyond sharing `calc.js` unchanged (or additive exports only).
- Never invent TxDOT numeric criteria; cite sources in UI footnotes.
- Commit as Luis Bonilla / `lbonil3@users.noreply.github.com`; wait for Pages build success before the next push when deploying.

## File map

| Path | Responsibility |
|------|----------------|
| `ditch-table/model.js` | Station parse/format, grade from elevs, top width, row factory, chain Add Row, computeRow, goalSeekRow |
| `ditch-table/test.js` | Node unit tests for model.js |
| `ditch-table/table.js` | Grid UI, toolbar, localStorage, Goal Seek buttons, coloring |
| `ditch-table/index.html` | Shell, toolbar, table host, Home link, citations |
| `ditch-table/style.css` | Desktop table + input/calc cell colors |
| `ditch-table/mobile.css` | iPhone scroll / tap targets |
| `index.html` | Add home card for Ditch Table |
| `ditch/calc.js` | **Reuse only** (no required edits) |

---

### Task 1: Station / grade / geometry helpers + tests

**Files:**
- Create: `ditch-table/model.js`
- Create: `ditch-table/test.js`
- Reuse: `ditch/calc.js` (load via `require('../ditch/calc.js')` in tests)

**Interfaces:**
- Consumes: `DT.geom`, `DT.qAt`, `DT.normalDepth`, `DT.GAM` from `ditch/calc.js`
- Produces:
  - `parseStation(str) -> number|null` (feet along alignment; `"1123+00"` → `112300`)
  - `formatStation(ft) -> string` (`112300` → `"1123+00"`)
  - `gradeFromElevs(flFrom, flTo, length) -> number|null` (ft/ft = (flFrom−flTo)/length; null if length≤0)
  - `topWidth(B, Z1, Z2, Dd) -> number` (= B + (Z1+Z2)*Dd)
  - `shapeFromRow(row) -> {shape,B,Z1,Z2,S,Dd}` for DT (`shape:'trap'` if B>0 else `'v'`)
  - `emptyRow(prev?) -> row object` (see fields below)
  - `computeRow(row) -> row` (fills computed fields; does not Goal Seek)
  - `goalSeekRow(row) -> row` (sets `flowDepth` via normal depth)

**Row fields (canonical):**

```js
// inputs
{ id, staFrom, staTo, offFrom, offTo, flFrom, flTo, length,
  Z1, B, Z2, grade, gradeOverride, Dd, n, Q, comment,
  // computed (null if incomplete)
  topW, flowDepth, area, P, R, V, velHead, Qfull, shear, topElevDS, WSEL, freeboard,
  err, passFb, passCap }
```

- [ ] **Step 1: Write failing tests**

Create `ditch-table/test.js`:

```js
const assert = require('assert');
const M = require('./model.js');
const DT = require('../ditch/calc.js');

assert.strictEqual(M.parseStation('1123+00'), 112300);
assert.strictEqual(M.formatStation(112300), '1123+00');
assert.strictEqual(M.parseStation('1123+50'), 112350);
assert.ok(Math.abs(M.gradeFromElevs(17.07, 15.80, 100) - 0.0127) < 1e-9);
assert.strictEqual(M.topWidth(2.5, 6, 5, 1), 2.5 + 11);
assert.strictEqual(M.topWidth(0, 6, 5, 2), 22);

const row = M.emptyRow();
row.B = 2.5; row.Z1 = 6; row.Z2 = 5; row.flFrom = 17.07; row.flTo = 15.80;
row.length = 100; row.Dd = 2; row.n = 0.035; row.Q = 20;
const g = M.goalSeekRow(M.computeRow(row));
assert.ok(g.flowDepth > 0 && g.flowDepth < g.Dd);
assert.ok(Math.abs(DT.qAt(M.shapeFromRow(g), {type:'fixed', n:g.n}, g.flowDepth) - 20) < 0.05);
assert.ok(g.Qfull > g.Q);
assert.ok(Math.abs(g.freeboard - (g.flTo + g.Dd - (g.flTo + g.flowDepth))) < 1e-9);

const over = M.goalSeekRow(M.computeRow(Object.assign(M.emptyRow(), {
  B: 2.5, Z1: 6, Z2: 5, flFrom: 17, flTo: 16.9, length: 100, Dd: 1, n: 0.035, Q: 500
})));
assert.strictEqual(over.flowDepth, null);
assert.ok(over.err);

console.log('ok');
```

- [ ] **Step 2: Run tests — expect fail**

Run: `node ditch-table/test.js`  
Expected: `Cannot find module './model.js'` (or missing exports)

- [ ] **Step 3: Implement `model.js`**

```js
(function (root) {
  const DT = root.DT || (typeof require !== 'undefined' ? require('../ditch/calc.js') : null);
  const G = 32.2;

  function parseStation(str) {
    if (str == null || str === '') return null;
    const s = String(str).trim();
    const m = s.match(/^(\d+)\+(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function formatStation(ft) {
    if (ft == null || !Number.isFinite(ft)) return '';
    const x = Math.round(ft);
    const major = Math.floor(x / 100);
    const minor = ((x % 100) + 100) % 100;
    return major + '+' + String(minor).padStart(2, '0');
  }
  function gradeFromElevs(flFrom, flTo, length) {
    if (!(length > 0) || flFrom == null || flTo == null) return null;
    return (flFrom - flTo) / length;
  }
  function topWidth(B, Z1, Z2, Dd) {
    return (B || 0) + ((Z1 || 0) + (Z2 || 0)) * (Dd || 0);
  }
  function shapeFromRow(row) {
    const B = Number(row.B) || 0;
    const S = row.gradeOverride && row.grade != null
      ? Number(row.grade)
      : gradeFromElevs(row.flFrom, row.flTo, row.length);
    return {
      shape: B > 0 ? 'trap' : 'v',
      B, Z1: Number(row.Z1) || 0, Z2: Number(row.Z2) || 0,
      S: S || 0, Dd: Number(row.Dd) || 0
    };
  }
  function emptyRow(prev) {
    const id = 'r' + Math.random().toString(36).slice(2, 9);
    if (!prev) {
      return {
        id, staFrom: '0+00', staTo: '1+00', offFrom: '', offTo: '',
        flFrom: null, flTo: null, length: 100,
        Z1: 3, B: 2, Z2: 3, grade: null, gradeOverride: false, Dd: 2, n: 0.035, Q: null, comment: '',
        topW: null, flowDepth: null, area: null, P: null, R: null, V: null, velHead: null,
        Qfull: null, shear: null, topElevDS: null, WSEL: null, freeboard: null,
        err: null, passFb: null, passCap: null
      };
    }
    const fromFt = parseStation(prev.staTo) ?? ((parseStation(prev.staFrom) || 0) + (prev.length || 100));
    const len = 100;
    const dFL = (prev.flFrom != null && prev.flTo != null) ? (prev.flFrom - prev.flTo) : null;
    return Object.assign(emptyRow(), {
      id, staFrom: formatStation(fromFt), staTo: formatStation(fromFt + len),
      offFrom: prev.offFrom, offTo: prev.offTo,
      flFrom: prev.flTo, flTo: dFL != null && prev.flTo != null ? prev.flTo - dFL : null,
      length: len, Z1: prev.Z1, B: prev.B, Z2: prev.Z2, Dd: prev.Dd, n: prev.n, comment: prev.comment
    });
  }
  function computeRow(row) {
    const out = Object.assign({}, row, { err: null });
    if (!out.gradeOverride) {
      out.grade = gradeFromElevs(out.flFrom, out.flTo, out.length);
    }
    out.topW = (out.Dd != null) ? topWidth(out.B, out.Z1, out.Z2, out.Dd) : null;
    if (!(out.length > 0) || !(out.n > 0) || !(out.grade > 0) || out.Dd == null) {
      out.err = out.err || (out.grade != null && out.grade <= 0 ? 'Grade must be > 0' : null);
      return clearComputed(out);
    }
    const s = shapeFromRow(out);
    const L = { type: 'fixed', n: Number(out.n) };
    try {
      const gFull = DT.geom(s, out.Dd);
      out.Qfull = DT.qAt(s, L, out.Dd);
      out.topElevDS = out.flTo != null ? out.flTo + out.Dd : null;
      if (out.flowDepth != null && out.flowDepth > 0 && out.Q != null) {
        const g = DT.geom(s, out.flowDepth);
        out.area = g.A; out.P = g.P; out.R = g.A / g.P;
        out.V = out.Q / g.A; out.velHead = (out.V * out.V) / (2 * G);
        out.shear = DT.GAM * out.R * s.S;
        out.WSEL = out.flTo != null ? out.flTo + out.flowDepth : null;
        out.freeboard = (out.topElevDS != null && out.WSEL != null) ? out.topElevDS - out.WSEL : null;
        out.passFb = out.freeboard != null ? out.freeboard >= 0.5 - 1e-9 : null;
        out.passCap = out.Qfull != null && out.Q != null ? out.Qfull >= out.Q - 1e-9 : null;
      } else {
        return clearHydraulicsKeepFull(out);
      }
    } catch (e) {
      out.err = e.message; return clearComputed(out);
    }
    return out;
  }
  function clearHydraulicsKeepFull(out) {
    return Object.assign(out, {
      area: null, P: null, R: null, V: null, velHead: null, shear: null,
      WSEL: null, freeboard: null, passFb: null, passCap: out.Qfull != null && out.Q != null ? out.Qfull >= out.Q - 1e-9 : null
    });
  }
  function clearComputed(out) {
    return Object.assign(out, {
      topW: out.topW, Qfull: null, flowDepth: null, area: null, P: null, R: null, V: null, velHead: null,
      shear: null, topElevDS: null, WSEL: null, freeboard: null, passFb: null, passCap: null
    });
  }
  function goalSeekRow(row) {
    const base = computeRow(Object.assign({}, row, { flowDepth: null }));
    if (base.err && !base.grade) return Object.assign(base, { flowDepth: null, err: base.err || 'Incomplete inputs' });
    if (!(base.Q > 0)) return Object.assign(base, { flowDepth: null, err: 'Enter design Q' });
    const s = shapeFromRow(base);
    const L = { type: 'fixed', n: Number(base.n) };
    const Qfull = DT.qAt(s, L, base.Dd);
    if (!(Qfull >= base.Q)) {
      return computeRow(Object.assign(base, { flowDepth: null, Qfull, err: 'Design Q exceeds full-depth capacity' }));
    }
    const r = DT.normalDepth(s, L, base.Q);
    if (r.over || !Number.isFinite(r.d)) {
      return computeRow(Object.assign(base, { flowDepth: null, err: 'Goal Seek did not converge' }));
    }
    return computeRow(Object.assign(base, { flowDepth: r.d, err: null }));
  }

  const API = { parseStation, formatStation, gradeFromElevs, topWidth, shapeFromRow, emptyRow, computeRow, goalSeekRow };
  if (typeof module !== 'undefined') module.exports = API;
  else root.DitchTableModel = API;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests — expect pass**

Run: `node ditch-table/test.js`  
Expected: `ok` and exit 0

- [ ] **Step 5: Commit**

```bash
git add ditch-table/model.js ditch-table/test.js
git commit -m "feat(ditch-table): station/grade helpers and Goal Seek model"
```

---

### Task 2: Spreadsheet UI shell + Add Row chaining

**Files:**
- Create: `ditch-table/index.html`
- Create: `ditch-table/style.css`
- Create: `ditch-table/mobile.css`
- Create: `ditch-table/table.js`
- Modify: none yet for home (Task 3)

**Interfaces:**
- Consumes: `DitchTableModel` from `model.js`, `DT` from `../ditch/calc.js`
- Produces: interactive table; `localStorage` key `ditch-table-v1`

- [ ] **Step 1: Write a tiny DOM smoke test (optional Node-free)** — skip automated DOM test; manual checklist in Step 4.

- [ ] **Step 2: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#1f4e79">
  <title>Ditch Table – station-by-station ditch design</title>
  <link rel="stylesheet" href="style.css">
  <link rel="stylesheet" href="mobile.css">
  <link rel="stylesheet" href="../home-btn.css">
</head>
<body>
<header>
  <a class="homebtn" href="../" aria-label="Back to Hydraulics Tools home">← Home</a>
  <h1>Ditch Table</h1>
  <span>Evaluate ditch sections along the alignment (default 100 ft). Goal Seek finds flow depth for design Q (Manning). Freeboard check uses HEC-15 0.5 ft (TxDOT HDM Ch. 7 gives no number).</span>
</header>
<div class="toolbar">
  <button type="button" id="addRow">Add Row</button>
  <button type="button" id="goalSeekAll">Goal Seek</button>
  <button type="button" id="clearAll" class="danger">Clear table</button>
  <label class="storm">Design storm label <input id="stormLabel" value="5-YR" maxlength="12"></label>
</div>
<div class="wrap"><table id="grid"></table></div>
<p class="cite">Hydraulics: Manning equation. Shear τ = γRS. Freeboard criterion: FHWA HEC-15 §2.3.4 (0.5 ft permanent lining) — labeled because TxDOT HDM Ch. 7 Sec. 3 does not publish a freeboard value. Verify with your judgment.</p>
<script src="../ditch/calc.js"></script>
<script src="model.js"></script>
<script src="table.js"></script>
</body>
</html>
```

- [ ] **Step 3: Implement `table.js` (grid + Add Row + localStorage)**

Render columns matching the Excel groups: From/To station, offsets, FL elevs, length, Z1, B, Z2, grade (%), Dd, topW, n, flowDepth, A, P, R, V, velHead, Q, Qfull, comment, shear, topElevDS, WSEL, freeboard. Input cells class `in`; calc cells class `out`; `out ok` / `out bad` for pass/fail.

On Add Row: `rows.push(DitchTableModel.emptyRow(rows[rows.length-1]))`, then `computeRow` each, save, render.

On input change: update field; if grade edited set `gradeOverride=true`; if FL/length edited and not override, recompute grade; call `computeRow` (keep existing `flowDepth` until Goal Seek); save.

Delete button per row.

- [ ] **Step 4: Style + mobile**

`style.css`: sticky header row, orange/tan `.in`, green `.out.ok`, red `.out.bad`, horizontal scroll `.wrap { overflow-x: auto }`.  
`mobile.css`: buttons min-height 44px; font-size ≥16px on inputs to avoid iOS zoom.

Manual check: open `ditch-table/index.html` via local static server or Pages preview; Add Row twice; confirm stations chain `0+00→1+00` then `1+00→2+00`.

- [ ] **Step 5: Commit**

```bash
git add ditch-table/index.html ditch-table/table.js ditch-table/style.css ditch-table/mobile.css
git commit -m "feat(ditch-table): spreadsheet UI with Add Row and localStorage"
```

---

### Task 3: Goal Seek wiring + home card + validation fixture

**Files:**
- Modify: `ditch-table/table.js` (Goal Seek all / per-row)
- Modify: `index.html` (home card)
- Modify: `ditch-table/test.js` (hand-calc fixture close to template numbers)
- Modify: `ditch-table/index.html` (footnote already present)

**Interfaces:**
- Consumes: `DitchTableModel.goalSeekRow`
- Produces: live Goal Seek; home navigation

- [ ] **Step 1: Extend tests with a closed Manning check**

```js
// Trapezoid B=4, Z=2/2, S=0.01, n=0.013, Q=50 — depth from DT must match goalSeekRow
const r2 = M.goalSeekRow(Object.assign(M.emptyRow(), {
  B: 4, Z1: 2, Z2: 2, flFrom: 10, flTo: 9, length: 100, Dd: 5, n: 0.013, Q: 50
}));
assert.ok(Math.abs(r2.flowDepth - DT.normalDepth(M.shapeFromRow(r2), {type:'fixed', n:0.013}, 50).d) < 1e-6);
assert.strictEqual(r2.passCap, true);
```

Run: `node ditch-table/test.js` — expect pass after Step 2 if already implemented; else add assertion only.

- [ ] **Step 2: Wire Goal Seek buttons in `table.js`**

`#goalSeekAll` maps `goalSeekRow` over all rows. Per-row button calls `goalSeekRow` for that id. Re-render; persist.

- [ ] **Step 3: Add home card**

In `index.html` main, after Ditch Studio card:

```html
<a class="card" href="ditch-table/index.html"><h2>Ditch Table →</h2>Station-by-station roadside ditch design table (default 100 ft segments): geometry, Manning capacity, Goal Seek for flow depth, shear, WSEL and freeboard — spreadsheet-style, like a ditch design computation sheet.</a>
```

- [ ] **Step 4: Manual validation against template spirit**

Enter one row similar to the screenshot: Sta 1123+00→1124+00, FL 17.07→15.80, L=100, Z1=6, B=2.5, Z2=5, Dd=2, n=0.035, Q=20 → Goal Seek. Confirm depth &lt; Dd, freeboard colored, Qfull ≥ 20. Screenshot for Luis optional.

- [ ] **Step 5: Commit + push + wait for Pages**

```bash
git add ditch-table/table.js ditch-table/test.js index.html
git commit -m "feat(ditch-table): Goal Seek, home card, validation checks"
git push origin main
# then: gh run list --workflow=pages.yml (or Actions) and wait for success before any further push
```

Done when: https://lbonil3.github.io/hydraulics-tools/ditch-table/ loads, home card works, tests pass, existing `/ditch/` unchanged.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Separate `/ditch-table/` tool + home card | 2, 3 |
| Columns / inputs / computed fields | 1, 2 |
| Add Row chain + editable | 1 (`emptyRow`), 2 |
| Goal Seek depth for Q | 1, 3 |
| Grade from elevs, override | 1, 2 |
| Full capacity at ditch depth | 1 |
| WSEL/top elev downstream | 1 |
| Freeboard ≥ 0.5 ft labeled HEC-15 | 1, 2 cite |
| Shear shown, no lining P/F | 1 |
| localStorage | 2 |
| iPhone scroll | 2 |
| Unit tests | 1, 3 |
| Out-of-v1 items excluded | — |

## Self-review notes

- No TBD placeholders in task steps.
- `shapeFromRow` / `goalSeekRow` names consistent across tasks.
- Capacity uses `DT.qAt` at `Dd`; Goal Seek uses `DT.normalDepth` with fixed n — matches Ditch Studio Manning path.
