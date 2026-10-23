# Ditch Table Load Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Load example** toolbar button that replaces the Ditch Table with a fixed 5-station sample after confirm when the table is not empty.

**Architecture:** `exampleRows()` in `ditch-table/model.js` returns five fresh input rows (stations 0+00→5+00). `table.js` wires the button, empty-check, confirm, recompute, save. No new files, no localStorage key bump.

**Tech Stack:** Vanilla JS (IIFE + CommonJS for Node tests), existing `DitchTableModel` / `DT` Manning helpers, GitHub Pages static site.

## Global Constraints

- iPhone-friendly: toolbar controls ≥44px tap targets (existing `.toolbtn` / button styles).
- TxDOT then FHWA: freeboard still HEC-15 0.5 ft (unchanged).
- Author commits as Luis Bonilla `<lbonil3@users.noreply.github.com>`.
- Do not push unless the controller asks; leave commits on `main` for one Pages publish.

## File map

| File | Responsibility |
|------|----------------|
| `ditch-table/model.js` | `exampleRows()`, `isTableEmpty(rows)`, export both |
| `ditch-table/test.js` | Assert example length, stations, compute/goalSeek |
| `ditch-table/index.html` | Button `#loadExample` |
| `ditch-table/table.js` | Click handler: confirm → load → recompute → save |

---

### Task 1: `exampleRows` + empty check + tests

**Files:**
- Modify: `ditch-table/model.js`
- Modify: `ditch-table/test.js`

**Interfaces:**
- Consumes: `emptyRow`, `formatStation`, `computeRow`, `goalSeekRow`
- Produces:
  - `exampleRows(): Row[]` — length 5, fresh `id`s each call, inputs only (no need to precompute)
  - `isTableEmpty(rows: Row[]): boolean` — true iff every row has null/empty Q, flFrom, flTo, and blank comment, and length ≤ 1 **or** all such blank inputs (use: true when `!rows.length` OR every row matches blank inputs AND there is at most one row; simpler rule from spec: empty if no row has Q / FL / comment filled **and** `rows.length <= 1`)

Exact empty rule (implement this):

```js
function isTableEmpty(rows) {
  if (!rows || !rows.length) return true;
  if (rows.length > 1) return false;
  const r = rows[0];
  const blank = (v) => v == null || v === '' || (typeof v === 'string' && !String(v).trim());
  return blank(r.Q) && blank(r.flFrom) && blank(r.flTo) && blank(r.comment);
}
```

- [ ] **Step 1: Write the failing test** (append to `ditch-table/test.js` before `console.log('ok')`)

```js
// Load example factory
assert.strictEqual(typeof M.exampleRows, 'function');
const ex = M.exampleRows();
assert.strictEqual(ex.length, 5);
assert.strictEqual(ex[0].staFrom, '0+00');
assert.strictEqual(ex[0].staTo, '1+00');
assert.strictEqual(ex[4].staFrom, '4+00');
assert.strictEqual(ex[4].staTo, '5+00');
assert.strictEqual(ex[0].comment, 'Example — replace with your alignment');
assert.ok(ex.every((r) => r.Z1 === 3 && r.B === 2 && r.Z2 === 3 && r.Dd === 2 && r.n === 0.035));
assert.ok(ex.every((r) => r.length === 100 && r.Q === 20 && r.offFrom === 'LT'));
assert.ok(Math.abs(ex[0].flFrom - 100) < 1e-9);
assert.ok(Math.abs(ex[0].flTo - 99.5) < 1e-9);
assert.ok(Math.abs(ex[4].flFrom - 98) < 1e-9);
assert.ok(Math.abs(ex[4].flTo - 97.5) < 1e-9);
const ids = new Set(ex.map((r) => r.id));
assert.strictEqual(ids.size, 5);
const ex2 = M.exampleRows();
assert.notStrictEqual(ex[0].id, ex2[0].id);
for (const r of ex) {
  const c = M.computeRow(r);
  assert.ok(c.Qfull > c.Q, 'Qfull should exceed design Q');
  assert.ok(!c.err || !/Grade/i.test(c.err));
  const g = M.goalSeekRow(c);
  assert.ok(g.flowDepth > 0 && g.flowDepth < g.Dd);
  assert.strictEqual(g.passCap, true);
}
assert.strictEqual(M.isTableEmpty([]), true);
assert.strictEqual(M.isTableEmpty([M.emptyRow()]), true);
assert.strictEqual(M.isTableEmpty([Object.assign(M.emptyRow(), { Q: 5 })]), false);
assert.strictEqual(M.isTableEmpty(ex), false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ditch-table/test.js`  
Expected: FAIL (e.g. `typeof M.exampleRows` is not `'function'`)

- [ ] **Step 3: Write minimal implementation** in `ditch-table/model.js`

Add before `const API = {`:

```js
  function isTableEmpty(rows) {
    if (!rows || !rows.length) return true;
    if (rows.length > 1) return false;
    const r = rows[0];
    function blank(v) {
      return v == null || v === '' || (typeof v === 'string' && !String(v).trim());
    }
    return blank(r.Q) && blank(r.flFrom) && blank(r.flTo) && blank(r.comment);
  }

  /** Five-station demo ditch (0+00→5+00). Fresh ids each call. */
  function exampleRows() {
    const out = [];
    let fl = 100;
    for (let i = 0; i < 5; i++) {
      const flFrom = fl;
      const flTo = fl - 0.5;
      const row = Object.assign(emptyRow(), {
        staFrom: formatStation(i * 100),
        staTo: formatStation((i + 1) * 100),
        offFrom: 'LT',
        offTo: 'LT',
        flFrom: flFrom,
        flTo: flTo,
        length: 100,
        Z1: 3, B: 2, Z2: 3, Dd: 2, n: 0.035,
        grade: null,
        gradeOverride: false,
        Q: 20,
        comment: i === 0 ? 'Example — replace with your alignment' : '',
        flowDepth: null
      });
      out.push(row);
      fl = flTo;
    }
    return out;
  }
```

Export them:

```js
  const API = {
    parseStation, formatStation, gradeFromElevs, topWidth, shapeFromRow,
    emptyRow, computeRow, goalSeekRow, applyGradeInput, DEPTH_INVALIDATING,
    exampleRows, isTableEmpty
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ditch-table/test.js`  
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add ditch-table/model.js ditch-table/test.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(ditch-table): exampleRows factory + isTableEmpty"
```

---

### Task 2: Toolbar button + load handler

**Files:**
- Modify: `ditch-table/index.html` (toolbar)
- Modify: `ditch-table/table.js`

**Interfaces:**
- Consumes: `M.exampleRows`, `M.isTableEmpty`, `M.computeRow` / `recomputeAll`, `save`, `render`
- Produces: UI behavior only

- [ ] **Step 1: Add button markup** in `ditch-table/index.html` toolbar, immediately before Clear:

```html
  <button type="button" id="loadExample">Load example</button>
  <button type="button" id="clearAll" class="danger">Clear table</button>
```

- [ ] **Step 2: Wire handler** in `ditch-table/table.js`

Add function:

```js
  function loadExample() {
    if (!M.isTableEmpty(rows)) {
      if (!confirm('Replace your table with the 5-station example?')) return;
    }
    stormEl.value = '5-YR (example)';
    rows = M.exampleRows().map(function (r) { return M.computeRow(r); });
    save();
    render();
  }
```

Register:

```js
  document.getElementById('loadExample').addEventListener('click', loadExample);
```

(place next to the `clearAll` listener)

- [ ] **Step 3: Smoke-check in Node** (DOM not required for model; optional quick assert button id exists)

Run:

```bash
node -e "const fs=require('fs'); const h=fs.readFileSync('ditch-table/index.html','utf8'); if(!/id=\"loadExample\"/.test(h)) process.exit(1); const t=fs.readFileSync('ditch-table/table.js','utf8'); if(!/loadExample/.test(t)||!/isTableEmpty/.test(t)) process.exit(1); console.log('ok');"
node ditch-table/test.js
```

Expected: `ok` twice

- [ ] **Step 4: Commit**

```bash
git add ditch-table/index.html ditch-table/table.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(ditch-table): Load example toolbar button"
```

---

### Task 3: Plan/spec already committed; controller publishes

**Files:** none for implementer beyond ensuring tests green.

- [ ] **Step 1: Re-run** `node ditch-table/test.js` → `ok`
- [ ] **Step 2: Report** commit SHAs and that push is left to the controller (wait for Pages after push).

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Load example button | Task 2 |
| Confirm when not empty | Task 2 (`isTableEmpty` + confirm) |
| 5 stations 0+00→5+00 | Task 1 |
| Trapezoid Z/B/n/Q/FL | Task 1 |
| Storm `5-YR (example)` | Task 2 |
| Clear unchanged | no change |
| Tests | Task 1 |
| No home/studio changes | honored |

No placeholders remaining.
