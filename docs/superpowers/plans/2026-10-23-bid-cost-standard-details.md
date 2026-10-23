# Bid Cost — Standard Detail PDF links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per–bid-code **Detail** link on Bid Cost rows when a Houston (preferred) or statewide standard-detail PDF is mapped in a static JSON file.

**Architecture:** Extend `lookup.js` with `resolveDetail` + `loadDetailMap` helpers. Ship `bid-cost/detail-map.json` built by `build-detail-map.js` from Houston District 2024 PDF URLs + keyword/Item rules (and optional statewide URLs). Wire a Detail column into the accordion row renderer in `app.js`.

**Tech Stack:** Vanilla JS (IIFE + CommonJS tests), Node build script, HTML/CSS, GitHub Pages.

## Global Constraints

- Houston District PDF first; statewide Design Division fallback when Houston URL missing.
- Detail link on **bid-code row** only when mapped; Item header Spec link unchanged.
- No live scrape in the browser; map is static.
- Unmapped / map-load failure → empty Detail cell; prices still work.
- iPhone tap targets; Drainage Studio patterns; commits as Luis Bonilla; do not push until final verify unless asked.
- YAGNI: one URL per code (not multi-link); no DGN; no other districts in the Houston slot.
- “Reasonably map” = codes matched by Item/description rules to known Houston 2024 sheets (and statewide when we have a URL); not 100% of catalog.

## File map

| File | Role |
|------|------|
| `bid-cost/lookup.js` | Add `resolveDetail(map, bidCode)` |
| `bid-cost/test.js` | Tests for resolveDetail |
| `bid-cost/detail-map.json` | Shipped map `{ meta, by_code }` |
| `bid-cost/build-detail-map.js` | Build/refresh map from HOU index + rules + prices.json codes |
| `bid-cost/app.js` | Load map; Detail column in row HTML |
| `bid-cost/style.css` / `mobile.css` | Detail link tap styles |
| `bid-cost/index.html` | Sources cite for standards |

---

### Task 1: `resolveDetail` helper + tests

**Files:**
- Modify: `bid-cost/lookup.js`
- Modify: `bid-cost/test.js`

**Interfaces:**
- Consumes: none new
- Produces: `resolveDetail(map, bidCode) → { url: string, source: 'Houston'|'Statewide', label: string } | null`
  - `map` is `{ by_code: { [code]: { houston_url?, statewide_url?, label? } } }` or null/undefined
  - Prefer non-empty `houston_url`, else non-empty `statewide_url`, else null
  - `label` defaults to `'Detail'` when missing

- [ ] **Step 1: Write failing tests**

Append to `bid-cost/test.js`:

```javascript
const detailMap = {
  by_code: {
    '465-6001': {
      houston_url: 'https://example.com/hil.pdf',
      statewide_url: 'https://example.com/sw.pdf',
      label: 'HIL-C-25'
    },
    '464-6001': {
      houston_url: null,
      statewide_url: 'https://example.com/pipe.pdf',
      label: 'SCP'
    },
    '999-6001': {
      houston_url: '',
      statewide_url: null
    }
  }
};

const d1 = L.resolveDetail(detailMap, '465-6001');
assert.strictEqual(d1.source, 'Houston');
assert.strictEqual(d1.url, 'https://example.com/hil.pdf');
assert.strictEqual(d1.label, 'HIL-C-25');

const d2 = L.resolveDetail(detailMap, '464-6001');
assert.strictEqual(d2.source, 'Statewide');
assert.strictEqual(d2.url, 'https://example.com/pipe.pdf');

assert.strictEqual(L.resolveDetail(detailMap, '999-6001'), null);
assert.strictEqual(L.resolveDetail(detailMap, 'no-such'), null);
assert.strictEqual(L.resolveDetail(null, '465-6001'), null);
assert.strictEqual(L.resolveDetail(detailMap, '465-6001').label.length > 0, true);
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node bid-cost/test.js`  
Expected: TypeError / resolveDetail missing

- [ ] **Step 3: Implement in `lookup.js`**

```javascript
function resolveDetail(map, bidCode) {
  if (!map || !map.by_code) return null;
  const entry = map.by_code[String(bidCode || '')];
  if (!entry) return null;
  const hou = entry.houston_url && String(entry.houston_url).trim();
  const sw = entry.statewide_url && String(entry.statewide_url).trim();
  const label = (entry.label && String(entry.label).trim()) || 'Detail';
  if (hou) return { url: hou, source: 'Houston', label: label };
  if (sw) return { url: sw, source: 'Statewide', label: label };
  return null;
}
```

Export on `api`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `node bid-cost/test.js` → `ok`

- [ ] **Step 5: Commit**

```bash
git add bid-cost/lookup.js bid-cost/test.js
git commit -m "feat(bid-cost): resolveDetail Houston-first helper"
```

---

### Task 2: Build `detail-map.json` (Houston-first rules)

**Files:**
- Create: `bid-cost/build-detail-map.js`
- Create: `bid-cost/detail-map.json` (generated)

**Interfaces:**
- Consumes: `prices.json` rows (`bid_code`, `description`); Houston specs page PDF list
- Produces: `detail-map.json` with `meta` + `by_code` entries for codes matched by rules below

**Houston 2024 PDF base** (absolute URLs as on district page):

| Label | URL |
|-------|-----|
| HIL-C-25 | `https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/HIL-C-25%20(HOU).pdf` |
| HIL-A-25 | `https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/HIL-A-25%20(HOU).pdf` |
| HIL-AD_AAD-25 | `https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/HIL-AD_AAD-25%20(HOU).pdf` |
| MH-A_B-25 | `https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/MH-A_B-25%20(HOU).pdf` |
| JB-25 | `https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/JB-25%20(HOU).pdf` |
| TDD-25 | `https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/TDD-25%20(HOU).pdf` |
| FD-25 | `https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/FD-25%20(HOU).pdf` |
| OD-25 | `https://ftp.dot.state.tx.us/pub/txdot-info/hou/specinfo/2024/pdf/OD-25%20(HOU).pdf` |

**Matching rules** (apply in order; first match wins; Item = first 3 digits of `bid_code`; `desc` = uppercase description):

1. Item `465` + `INLET` in desc → HIL-C-25 (houston)
2. Item `465` + (`MANH` or `MANHOLE`) in desc → MH-A_B-25
3. Item `465` + (`JB` or `JUNCTION`) in desc → JB-25
4. Item `465` else → JB-25 (generic junction/inlet family fallback for remaining 465)
5. Desc contains `TRENCH DRAIN` or Item codes clearly trench → TDD-25 when desc matches `TRENCH`
6. Desc contains `FLUME` → FD-25
7. Desc contains `OUTFALL` → OD-25
8. Item `466` (headwalls) → leave unmapped unless a clear HOU headwall PDF exists in the scrape; do not invent
9. Items `462`/`464`/`460`/`467` (pipe/box/SET): set **statewide_url** only when a verified Design Division PDF URL is known; otherwise skip in v1 rather than guess. Optional stretch: if build can confirm a statewide SCP/SCC/SET PDF on ftp.txdot.gov with HEAD 200, attach it as statewide for that Item’s codes.

Also: optionally scrape `https://www.dot.state.tx.us/hou/specinfo/specs.htm` to verify the Houston URLs above still exist (log warnings if HEAD ≠ 200); hardcode the table above as the source of truth for v1 so the build works offline if scrape fails.

- [ ] **Step 1: Write `build-detail-map.js`**

Node script that:
1. Reads `./prices.json`
2. Applies rules → builds `by_code`
3. Writes `./detail-map.json` with `meta.accessed` = today’s ISO date, `meta.houston_index` = HOU specs URL, `meta.note` = rule summary
4. Prints counts: mapped Houston / statewide / total codes

Include the eight Houston URLs as constants. Prefer description keywords over blanket Item maps where listed.

- [ ] **Step 2: Run build**

```bash
node bid-cost/build-detail-map.js
```

Expected: writes `detail-map.json`; mapped count > 0 (at least many `465-*` inlet/manhole codes).

- [ ] **Step 3: Spot-check**

```bash
node -e "const m=require('./bid-cost/detail-map.json'); console.log(Object.keys(m.by_code).length); console.log(m.by_code['465-6001']);"
```

Expected: `465-6001` has `houston_url` for HIL-C-25.

- [ ] **Step 4: Commit**

```bash
git add bid-cost/build-detail-map.js bid-cost/detail-map.json
git commit -m "feat(bid-cost): Houston-first standard detail-map.json"
```

---

### Task 3: UI Detail column + Sources

**Files:**
- Modify: `bid-cost/app.js`
- Modify: `bid-cost/style.css`
- Modify: `bid-cost/mobile.css` (if needed)
- Modify: `bid-cost/index.html` (Sources cite)

**Interfaces:**
- Consumes: `BidCostLookup.resolveDetail`, loaded `detailMap`
- Produces: Detail column in accordion tables

- [ ] **Step 1: Load map in `app.js`**

Hold `let detailMap = null`. After or parallel with `prices.json` fetch:

```javascript
fetch('./detail-map.json')
  .then(function (res) { return res.ok ? res.json() : null; })
  .then(function (data) { detailMap = data; onSearch(); })
  .catch(function () { detailMap = null; });
```

Re-call `onSearch` when both loads complete (use a small `maybeRender` that waits for prices; map can arrive late and refresh).

- [ ] **Step 2: Extend `rowHtml`**

After Source cell, add Detail cell:

```javascript
const d = L.resolveDetail(detailMap, r.bid_code);
const detailCell = d
  ? '<a class="detail-link" href="' + escapeHtml(d.url) +
    '" target="_blank" rel="noopener noreferrer" title="' +
    escapeHtml(d.source + ' · ' + d.label) + '">' + escapeHtml(d.label) + '</a>'
  : '';
// ... append '<td class="detail-cell">' + detailCell + '</td>'
```

Update thead to include `<th>Detail</th>` after Source (keep H/SW after Detail or keep H/SW last — prefer: … Source | Detail | H/SW).

- [ ] **Step 3: CSS**

```css
.detail-link {
  color: #1f4e79;
  font-weight: 600;
  text-decoration: underline;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0.25rem 0.35rem;
}
.detail-cell { white-space: nowrap; }
```

- [ ] **Step 4: Sources cite in `index.html`**

Append: `Standard Detail links: Houston District standards (prefer), else Design Division statewide sheets when mapped.`

- [ ] **Step 5: Re-run unit tests**

`node bid-cost/test.js` → `ok`

- [ ] **Step 6: Commit**

```bash
git add bid-cost/app.js bid-cost/style.css bid-cost/mobile.css bid-cost/index.html
git commit -m "feat(bid-cost): Detail column with Houston-first standard PDFs"
```

---

### Task 4: Final verify + publish

**Files:** none unless fixes

- [ ] **Step 1: Verify**

```bash
node bid-cost/test.js
node --check bid-cost/app.js
node --check bid-cost/build-detail-map.js
test -f bid-cost/detail-map.json
```

- [ ] **Step 2: Spec checklist**

Row Detail when mapped; Houston preferred; Spec header unchanged; soft-fail without map; Sources cite.

- [ ] **Step 3: Push `main` and wait for Pages**

```bash
git push origin main
# watch pages-build-deployment for this SHA
```

Live: `https://lbonil3.github.io/hydraulics-tools/bid-cost/`

- [ ] **Step 4: Report** to Luis — URL, example mapped code (e.g. `465-6001` → HIL-C-25), commit SHA.

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| resolveDetail Houston/statewide/null | 1 |
| Static detail-map.json | 2 |
| Build/refresh path | 2 |
| Per-row Detail link | 3 |
| Spec header unchanged | 3 |
| Soft-fail map load | 3 |
| Sources cite | 3 |
| Publish | 4 |

## Self-review notes

- No TBD placeholders; signatures consistent (`resolveDetail(map, bidCode)`).
- Multi-link per row deferred (YAGNI).
- Statewide pipe/SET URLs only when verified — prefer fewer correct links over guessed ones.
