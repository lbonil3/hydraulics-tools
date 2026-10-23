# Ditch Table Helpers + Sketches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Copy section, Fill FL from grade, Chain Q/n, plus live SVG cross-section and profile sketches on the Ditch Table.

**Architecture:** Pure row transforms in `model.js`; `table.js` owns selection, toolbar, chain-on-edit, and calls `DitchTableViz`; `viz.js` draws SVG only from row data. No chart library.

**Tech Stack:** Vanilla JS (IIFE + CommonJS tests), SVG, existing `DitchTableModel` / localStorage `ditch-table-v1`.

## Global Constraints

- iPhone-friendly: toolbar controls ≥44px on touch (`mobile.css`).
- Color family `#1f4e79`; Chain default **off**.
- Copy fields only: Z1, B, Z2, Dd, n, offFrom, offTo.
- Author commits as Luis Bonilla `<lbonil3@users.noreply.github.com>`; do not push (controller publishes).

## File map

| File | Role |
|------|------|
| `ditch-table/model.js` | `copySectionDown`, `fillFlFromGrade`, `applyChainQn` |
| `ditch-table/test.js` | Tests for those three |
| `ditch-table/viz.js` | **Create** — section + profile SVG |
| `ditch-table/table.js` | Selection, toolbar, chain, viz refresh |
| `ditch-table/index.html` | Buttons, Chain toggle, `#viz` cards, script tag |
| `ditch-table/style.css` / `mobile.css` | Layout, selection, cards |

---

### Task 1: Model helpers + tests

**Files:**
- Modify: `ditch-table/model.js`
- Modify: `ditch-table/test.js`

**Interfaces:**
- Consumes: `emptyRow`, `gradeFromElevs`, `computeRow` (tests only)
- Produces:
  - `copySectionDown(rows, fromIndex) → Row[]` (new array; shallow-copied rows)
  - `fillFlFromGrade(rows) → { rows: Row[], changed: boolean }`
  - `applyChainQn(rows, fromIndex, key, value) → Row[]` where `key` is `'Q'` or `'n'`

- [ ] **Step 1: Append failing tests** before `console.log('ok')` in `ditch-table/test.js`:

```js
// --- helpers: copy / fill FL / chain ---
const baseA = Object.assign(M.emptyRow(), {
  id: 'a', staFrom: '0+00', staTo: '1+00', Z1: 4, B: 3, Z2: 4, Dd: 2.5, n: 0.04,
  offFrom: 'LT', offTo: 'LT', Q: 10, flFrom: 100, flTo: 99.5, length: 100
});
const baseB = Object.assign(M.emptyRow(), {
  id: 'b', staFrom: '1+00', staTo: '2+00', Z1: 2, B: 1, Z2: 2, Dd: 1, n: 0.03,
  offFrom: '', offTo: '', Q: 5, flFrom: 99.5, flTo: 99, length: 100
});
const copied = M.copySectionDown([baseA, baseB], 0);
assert.strictEqual(copied[1].Z1, 4);
assert.strictEqual(copied[1].B, 3);
assert.strictEqual(copied[1].Z2, 4);
assert.strictEqual(copied[1].Dd, 2.5);
assert.strictEqual(copied[1].n, 0.04);
assert.strictEqual(copied[1].offFrom, 'LT');
assert.strictEqual(copied[1].staFrom, '1+00');
assert.strictEqual(copied[1].Q, 5);
assert.strictEqual(copied[0].Z1, 4);

const chain = M.applyChainQn([
  Object.assign(M.emptyRow(), { id: '1', Q: 10, n: 0.035 }),
  Object.assign(M.emptyRow(), { id: '2', Q: 5, n: 0.03 }),
  Object.assign(M.emptyRow(), { id: '3', Q: 5, n: 0.03 })
], 0, 'Q', 12);
assert.strictEqual(chain[0].Q, 12);
assert.strictEqual(chain[1].Q, 12);
assert.strictEqual(chain[2].Q, 12);
assert.strictEqual(chain[1].n, 0.03);

const flRows = [
  Object.assign(M.emptyRow(), {
    id: 'f0', staFrom: '0+00', staTo: '1+00', flFrom: 100, flTo: null,
    length: 100, gradeOverride: true, grade: 0.005, Z1: 3, B: 2, Z2: 3, Dd: 2, n: 0.035
  }),
  Object.assign(M.emptyRow(), {
    id: 'f1', staFrom: '1+00', staTo: '2+00', flFrom: null, flTo: null,
    length: 100, gradeOverride: true, grade: 0.005, Z1: 3, B: 2, Z2: 3, Dd: 2, n: 0.035
  })
];
const filled = M.fillFlFromGrade(flRows);
assert.ok(filled.changed);
assert.ok(Math.abs(filled.rows[0].flTo - 99.5) < 1e-9);
assert.ok(Math.abs(filled.rows[1].flFrom - 99.5) < 1e-9);
assert.ok(Math.abs(filled.rows[1].flTo - 99) < 1e-9);
```

- [ ] **Step 2: Run** `node ditch-table/test.js` — expect FAIL (missing functions).

- [ ] **Step 3: Implement** in `ditch-table/model.js` before `const API`:

```js
  function copySectionDown(rows, fromIndex) {
    if (!rows || !rows.length) return [];
    const i = Math.max(0, Math.min(fromIndex | 0, rows.length - 1));
    const src = rows[i];
    return rows.map(function (r, idx) {
      if (idx <= i) return Object.assign({}, r);
      return Object.assign({}, r, {
        Z1: src.Z1, B: src.B, Z2: src.Z2, Dd: src.Dd, n: src.n,
        offFrom: src.offFrom, offTo: src.offTo,
        flowDepth: null
      });
    });
  }

  function fillFlFromGrade(rows) {
    if (!rows || !rows.length) return { rows: [], changed: false };
    let changed = false;
    const out = rows.map(function (r) { return Object.assign({}, r); });
    for (let i = 0; i < out.length; i++) {
      const r = out[i];
      let g = null;
      if (r.gradeOverride && r.grade != null && Number(r.grade) > 0) {
        g = Number(r.grade);
      } else if (r.flFrom != null && r.flTo != null && r.length > 0) {
        g = gradeFromElevs(r.flFrom, r.flTo, r.length);
      } else if (!r.gradeOverride && r.grade != null && Number(r.grade) > 0) {
        g = Number(r.grade);
      }
      if (r.flFrom == null && i > 0 && out[i - 1].flTo != null) {
        r.flFrom = out[i - 1].flTo;
        changed = true;
      }
      if (g != null && g > 0 && r.flFrom != null && r.length > 0) {
        const nextTo = r.flFrom - g * r.length;
        if (r.flTo == null || Math.abs(Number(r.flTo) - nextTo) > 1e-9) {
          r.flTo = nextTo;
          changed = true;
        }
        if (!r.gradeOverride) r.grade = g;
        r.flowDepth = null;
      }
      out[i] = r;
    }
    return { rows: out, changed: changed };
  }

  function applyChainQn(rows, fromIndex, key, value) {
    if (key !== 'Q' && key !== 'n') return rows.map(function (r) { return Object.assign({}, r); });
    const i = Math.max(0, fromIndex | 0);
    return rows.map(function (r, idx) {
      const copy = Object.assign({}, r);
      if (idx >= i) {
        copy[key] = value;
        if (key === 'Q' || key === 'n') copy.flowDepth = null;
      }
      return copy;
    });
  }
```

Export: add `copySectionDown, fillFlFromGrade, applyChainQn` to `API`.

- [ ] **Step 4: Run** `node ditch-table/test.js` — expect `ok`.

- [ ] **Step 5: Commit**

```bash
git add ditch-table/model.js ditch-table/test.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(ditch-table): copy section, fill FL, chain Q/n helpers"
```

---

### Task 2: Toolbar, selection, chain wiring

**Files:**
- Modify: `ditch-table/index.html`
- Modify: `ditch-table/table.js`
- Modify: `ditch-table/style.css`, `ditch-table/mobile.css` (selection + chain control)

**Interfaces:**
- Consumes: `M.copySectionDown`, `M.fillFlFromGrade`, `M.applyChainQn`, `M.computeRow`
- Produces: `selectedRowId`, `chainQn` boolean persisted in localStorage payload

- [ ] **Step 1: Toolbar + layout shell in `index.html`**

After Goal Seek button, before Single section, insert:

```html
  <button type="button" id="copySection">Copy section</button>
  <button type="button" id="fillFl">Fill FL from grade</button>
  <button type="button" id="chainQn" class="toggle" aria-pressed="false" title="When on, Q or n edits copy down the table">Chain Q/n: Off</button>
```

After `.wrap` table div, before cite:

```html
<div id="viz" class="viz">
  <div class="viz-card">
    <h2 id="sectionTitle">Cross-section</h2>
    <div id="sectionSvg" class="viz-svg"></div>
  </div>
  <div class="viz-card">
    <h2>Profile (FL + WSEL)</h2>
    <div id="profileSvg" class="viz-svg"></div>
  </div>
</div>
```

Add script before `table.js`:

```html
<script src="viz.js"></script>
```

(viz.js stub can be empty IIFE until Task 3 — create minimal file exporting `window.DitchTableViz = { renderSection: function(){}, renderProfile: function(){} }` so table.js does not throw.)

- [ ] **Step 2: Wire `table.js`**

Add state:

```js
  let selectedRowId = null;
  let chainQn = false;
```

In `load()`, also restore `chainQn` from payload; in `save()`, include `chainQn`.

Update `render()` to add class `selected` on the selected row’s `<tr>`, and after building table call:

```js
    refreshViz();
```

```js
  function selectedIndex() {
    if (!rows.length) return 0;
    const i = rows.findIndex(function (r) { return r.id === selectedRowId; });
    return i < 0 ? 0 : i;
  }

  function refreshViz() {
    const V = window.DitchTableViz;
    if (!V) return;
    const idx = selectedIndex();
    selectedRowId = rows[idx] ? rows[idx].id : null;
    const sec = document.getElementById('sectionSvg');
    const prof = document.getElementById('profileSvg');
    const title = document.getElementById('sectionTitle');
    if (title && rows[idx]) {
      title.textContent = 'Cross-section @ ' + (rows[idx].staFrom || '') + '–' + (rows[idx].staTo || '');
    }
    if (sec) V.renderSection(sec, rows[idx] || null);
    if (prof) V.renderProfile(prof, rows);
  }

  function updateChainButton() {
    const btn = document.getElementById('chainQn');
    if (!btn) return;
    btn.setAttribute('aria-pressed', chainQn ? 'true' : 'false');
    btn.textContent = chainQn ? 'Chain Q/n: On' : 'Chain Q/n: Off';
    btn.classList.toggle('on', chainQn);
  }

  function onCopySection() {
    const i = selectedIndex();
    rows = M.copySectionDown(rows, i).map(function (r) { return M.computeRow(r); });
    save(); render();
  }

  function onFillFl() {
    const probe = M.fillFlFromGrade(rows);
    if (!probe.changed) return;
    const wouldOverwrite = rows.some(function (r, idx) {
      const n = probe.rows[idx];
      return r.flFrom != null && r.flTo != null &&
        (Math.abs(Number(r.flFrom) - Number(n.flFrom)) > 1e-9 ||
         Math.abs(Number(r.flTo) - Number(n.flTo)) > 1e-9);
    });
    if (wouldOverwrite && !confirm('Update existing flow-line elevations from grade?')) return;
    rows = probe.rows.map(function (r) { return M.computeRow(r); });
    save(); render();
  }

  function onToggleChain() {
    chainQn = !chainQn;
    updateChainButton();
    save();
  }
```

In `onInputChange`, after applying the edit to `row` and before `computeRow`, if `chainQn && (key === 'Q' || key === 'n')`:

```js
    const numVal = key === 'Q' || key === 'n' ? row[key] : null;
    if (chainQn && (key === 'Q' || key === 'n')) {
      rows = M.applyChainQn(rows, i, key, numVal);
      rows = rows.map(function (r) { return M.computeRow(r); });
      save(); render();
      return;
    }
```

(Ensure the edited row already has the new Q/n before applyChainQn.)

On grid click (extend existing listener): if click is on a row cell (not del/gs), set `selectedRowId` from `tr` data-id — add `data-row-id` on each `<tr>` in render.

Listeners:

```js
  document.getElementById('copySection').addEventListener('click', onCopySection);
  document.getElementById('fillFl').addEventListener('click', onFillFl);
  document.getElementById('chainQn').addEventListener('click', onToggleChain);
```

Call `updateChainButton()` at end of `init()`.

- [ ] **Step 3: CSS** — selection + toggle + viz shell:

```css
#grid tbody tr.selected{outline:2px solid #1f4e79;outline-offset:-2px;background:#eaf1f8}
.toolbar button.toggle{background:#fff;color:#1f4e79}
.toolbar button.toggle.on{background:#1f4e79;color:#fff}
.viz{display:flex;flex-direction:column;gap:12px;padding:12px 14px;background:#f3f5f8}
.viz-card{background:#fff;border:1px solid #d5dce5;border-radius:10px;padding:10px 12px}
.viz-card h2{margin:0 0 8px;font-size:15px;color:#1f4e79}
.viz-svg{min-height:160px;width:100%}
.viz-svg svg{width:100%;height:auto;display:block}
@media (min-width:900px){
  .layout{display:grid;grid-template-columns:1fr minmax(280px,360px);align-items:start}
  .layout .wrap{grid-column:1}
  .layout .viz{grid-column:2;position:sticky;top:8px;max-height:calc(100vh - 16px);overflow:auto}
}
```

Wrap `.wrap` + `#viz` in `<div class="layout">` in HTML for the wide layout.

In `mobile.css` ensure new toolbar buttons keep `min-height:44px`.

- [ ] **Step 4: Create stub** `ditch-table/viz.js`:

```js
(function (root) {
  function renderSection(el, row) {
    if (!el) return;
    el.innerHTML = row
      ? '<p class="viz-empty">Section sketch loading…</p>'
      : '<p class="viz-empty">Select a row</p>';
  }
  function renderProfile(el, rows) {
    if (!el) return;
    el.innerHTML = '<p class="viz-empty">Profile sketch loading…</p>';
  }
  const API = { renderSection, renderProfile };
  if (typeof module !== 'undefined') module.exports = API;
  else root.DitchTableViz = API;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Smoke**

```bash
node ditch-table/test.js
node -e "require('./ditch-table/viz.js'); const fs=require('fs'); const h=fs.readFileSync('ditch-table/index.html','utf8'); if(!/copySection/.test(h)||!/viz\.js/.test(h)) process.exit(1); console.log('ok');"
```

- [ ] **Step 6: Commit**

```bash
git add ditch-table/index.html ditch-table/table.js ditch-table/style.css ditch-table/mobile.css ditch-table/viz.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(ditch-table): helper toolbar, row selection, viz shell"
```

---

### Task 3: Real SVG cross-section + profile

**Files:**
- Modify: `ditch-table/viz.js` (replace stubs)
- Optional: tiny Node assert that SVG strings contain expected tags (no DOM)

**Interfaces:**
- Consumes: row fields `B,Z1,Z2,Dd,flowDepth,staFrom,staTo,flFrom,flTo,WSEL`; `M.parseStation` via optional pass-in or duplicate minimal parse in viz
- Produces: same `renderSection(el, row)`, `renderProfile(el, rows)`

- [ ] **Step 1: Implement `renderSection`**

```js
  function renderSection(el, row) {
    if (!el) return;
    if (!row || row.Dd == null || !(Number(row.Dd) > 0)) {
      el.innerHTML = '<p class="viz-empty">Enter section dimensions (Dd, Z, B)</p>';
      return;
    }
    const B = Number(row.B) || 0;
    const Z1 = Number(row.Z1) || 0;
    const Z2 = Number(row.Z2) || 0;
    const Dd = Number(row.Dd);
    const yd = row.flowDepth != null && Number(row.flowDepth) > 0 ? Number(row.flowDepth) : null;
    const left = Z1 * Dd;
    const right = Z2 * Dd;
    const topW = B + left + right;
    const pad = 24;
    const W = 320;
    const H = 180;
    const scale = Math.min((W - 2 * pad) / Math.max(topW, 1), (H - 2 * pad) / Math.max(Dd, 1));
    const midX = W / 2;
    const bedY = H - pad;
    const x0 = midX - (topW * scale) / 2;
    const TL = { x: x0, y: bedY - Dd * scale };
    const BL = { x: x0 + left * scale, y: bedY };
    const BR = { x: BL.x + B * scale, y: bedY };
    const TR = { x: BR.x + right * scale, y: bedY - Dd * scale };
    let water = '';
    if (yd != null) {
      const yW = bedY - yd * scale;
      const tAt = function (y) {
        // linear interp left bank TL–BL and right TR–BR at elev y
        const tL = (bedY - y) / (Dd * scale);
        const lx = TL.x + (BL.x - TL.x) * (1 - (y - (bedY - Dd * scale)) / (Dd * scale));
        // simpler: at depth yd from bed, width = B + (Z1+Z2)*yd
        const halfSpan = ((B + (Z1 + Z2) * yd) * scale) / 2;
        const cx = midX;
        // left/right at water using same geometry
        const leftX = midX - (B * scale) / 2 - Z1 * yd * scale;
        const rightX = midX + (B * scale) / 2 + Z2 * yd * scale;
        return { leftX: leftX, rightX: rightX, y: yW };
      };
      const w = tAt(yd);
      water =
        '<polygon fill="#4a9fe0" fill-opacity="0.35" stroke="#2b6ea3" stroke-width="1" points="' +
        w.leftX + ',' + w.y + ' ' + BL.x + ',' + bedY + ' ' + BR.x + ',' + bedY + ' ' + w.rightX + ',' + w.y +
        '"/>';
    }
    const poly =
      '<polygon fill="#eef5ff" stroke="#1f4e79" stroke-width="2" points="' +
      TL.x + ',' + TL.y + ' ' + BL.x + ',' + BL.y + ' ' + BR.x + ',' + BR.y + ' ' + TR.x + ',' + TR.y +
      '"/>';
    const labels =
      '<text x="' + midX + '" y="' + (bedY + 16) + '" text-anchor="middle" font-size="11" fill="#556">B=' + B +
      ' · Z1=' + Z1 + ' · Z2=' + Z2 + ' · Dd=' + Dd +
      (yd != null ? ' · yd=' + yd.toFixed(2) : '') + '</text>';
    el.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ditch cross-section">' +
      poly + water + labels + '</svg>';
  }
```

Fix water left/right to use midX consistently with BL/BR (BL.x = midX - B*scale/2 when centered). Prefer:

```js
    const BL = { x: midX - (B * scale) / 2, y: bedY };
    const BR = { x: midX + (B * scale) / 2, y: bedY };
    const TL = { x: BL.x - left * scale, y: bedY - Dd * scale };
    const TR = { x: BR.x + right * scale, y: bedY - Dd * scale };
```

- [ ] **Step 2: Implement `renderProfile`**

Parse stations: accept optional `parseStation` from `window.DitchTableModel.parseStation` when in browser.

```js
  function parseSta(s) {
    const M = typeof window !== 'undefined' ? window.DitchTableModel : null;
    if (M && M.parseStation) return M.parseStation(s);
    if (s == null || s === '') return null;
    const m = String(s).trim().match(/^(\d+)\+(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function renderProfile(el, rows) {
    if (!el) return;
    rows = rows || [];
    const segs = [];
    const wselPts = [];
    rows.forEach(function (r) {
      const x0 = parseSta(r.staFrom);
      const x1 = parseSta(r.staTo);
      if (x0 == null || x1 == null) return;
      if (r.flFrom != null && r.flTo != null) {
        segs.push({ x0: x0, y0: Number(r.flFrom), x1: x1, y1: Number(r.flTo) });
      }
      if (r.WSEL != null && Number.isFinite(Number(r.WSEL))) {
        wselPts.push({ x: x1, y: Number(r.WSEL) });
      }
    });
    if (!segs.length) {
      el.innerHTML = '<p class="viz-empty">Enter flow-line elevations to see the profile</p>';
      return;
    }
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    segs.forEach(function (s) {
      xmin = Math.min(xmin, s.x0, s.x1);
      xmax = Math.max(xmax, s.x0, s.x1);
      ymin = Math.min(ymin, s.y0, s.y1);
      ymax = Math.max(ymax, s.y0, s.y1);
    });
    wselPts.forEach(function (p) {
      ymin = Math.min(ymin, p.y);
      ymax = Math.max(ymax, p.y);
    });
    if (ymax - ymin < 0.5) { ymax += 0.25; ymin -= 0.25; }
    const W = 320, H = 180, pad = 36;
    const sx = function (x) { return pad + ((x - xmin) / Math.max(xmax - xmin, 1e-6)) * (W - 2 * pad); };
    const sy = function (y) { return H - pad - ((y - ymin) / Math.max(ymax - ymin, 1e-6)) * (H - 2 * pad); };
    let path = '';
    segs.forEach(function (s, i) {
      path += (i === 0 ? 'M' : 'L') + sx(s.x0) + ',' + sy(s.y0) + ' L' + sx(s.x1) + ',' + sy(s.y1) + ' ';
    });
    let dots = wselPts.map(function (p) {
      return '<circle cx="' + sx(p.x) + '" cy="' + sy(p.y) + '" r="3.5" fill="#4a9fe0" stroke="#1f4e79"/>';
    }).join('');
    const legend =
      '<text x="' + pad + '" y="14" font-size="11" fill="#1f4e79">FL</text>' +
      '<line x1="' + (pad + 18) + '" y1="10" x2="' + (pad + 40) + '" y2="10" stroke="#1f4e79" stroke-width="2"/>' +
      '<text x="' + (pad + 50) + '" y="14" font-size="11" fill="#2b6ea3">WSEL</text>' +
      '<circle cx="' + (pad + 92) + '" cy="10" r="3.5" fill="#4a9fe0"/>';
    el.innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ditch profile">' +
      legend +
      '<path d="' + path + '" fill="none" stroke="#1f4e79" stroke-width="2"/>' +
      dots +
      '</svg>';
  }
```

- [ ] **Step 3: Node smoke** (jsdom not required — call render with fake el):

```bash
node -e "
const V=require('./ditch-table/viz.js');
const el={innerHTML:''};
V.renderSection(el,{B:2,Z1:3,Z2:3,Dd:2,flowDepth:1.2});
if(!/svg/i.test(el.innerHTML)) process.exit(1);
V.renderProfile(el,[
  {staFrom:'0+00',staTo:'1+00',flFrom:100,flTo:99.5,WSEL:100.7},
  {staFrom:'1+00',staTo:'2+00',flFrom:99.5,flTo:99,WSEL:null}
]);
if(!/svg/i.test(el.innerHTML)) process.exit(1);
console.log('ok');
"
node ditch-table/test.js
```

- [ ] **Step 4: Commit**

```bash
git add ditch-table/viz.js
git -c user.name="Luis Bonilla" -c user.email="lbonil3@users.noreply.github.com" commit -m "feat(ditch-table): SVG cross-section and profile sketches"
```

---

### Task 4: Controller publish checklist

- [ ] Re-run `node ditch-table/test.js` → `ok`
- [ ] Report SHAs; controller pushes `main` and waits for Pages

## Spec coverage

| Spec item | Task |
|-----------|------|
| Copy section | 1 + 2 |
| Fill FL from grade + confirm | 1 + 2 |
| Chain Q/n toggle + persist | 2 |
| Row selection highlight | 2 |
| Cross-section SVG | 3 |
| Profile FL + WSEL | 3 |
| Layout phone/desktop | 2 |
| Tests | 1 (+ 3 smoke) |

No placeholders remaining. Fix water-geometry comments in Task 3 to use the centered BL/BR formulas (shown after the first draft block).
