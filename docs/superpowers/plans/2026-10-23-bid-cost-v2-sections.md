# Bid Cost v2 — Sections / Visuals / Spec Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `/bid-cost/` so all bid codes are browsable in Spec Item accordions, each row shows a Houston vs Statewide mini price bar, and each Item header links to the 2024 Spec PDF.

**Architecture:** Keep static `prices.json` and Houston-first `resolvePrice`. Add pure helpers in `lookup.js` for Item grouping, Spec URL, and bar widths. Replace the flat table UI in `app.js` / `index.html` with an accordion list; CSS for bars and headers in `style.css` / `mobile.css`.

**Tech Stack:** Vanilla JS (IIFE + CommonJS for tests), HTML/CSS, Node `assert` tests (`node bid-cost/test.js`), GitHub Pages.

## Global Constraints

- iPhone-first; match Drainage Studio header / home-btn patterns.
- TxDOT criteria first; cite Spec Book 2024 for Spec links.
- Commits as Luis Bonilla (`user.name` / `user.email` already used on this repo).
- Do not push to `main` / Pages until final verify task unless user asks mid-SDD.
- No live Open Data fetch; no Tableau scrape; no cost rollups into other tools.
- Spec PDF pattern: `https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/s{NNN}.pdf` (no leading zeros beyond the Item digits as they appear, e.g. Item 100 → `s100.pdf`, Item 464 → `s464.pdf`).
- Empty search shows **all** catalog rows that have a resolvable price (not Houston-only filter); Houston still wins via `resolvePrice`.
- YAGNI: no Item title map required for v2 (headers = `Item NNN` only); no historical charts.

## File map

| File | Role |
|------|------|
| `bid-cost/lookup.js` | Add `itemFromBidCode`, `groupByItem`, `specPdfUrl`, `barPercents` |
| `bid-cost/test.js` | Extend unit tests for new helpers |
| `bid-cost/index.html` | Accordion container; update Sources cite |
| `bid-cost/app.js` | Accordion render, search expand behavior, Spec links |
| `bid-cost/style.css` | Accordion + bar styles |
| `bid-cost/mobile.css` | Touch targets for headers / Spec |
| `docs/superpowers/specs/2026-10-23-bid-cost-v2-sections-design.md` | Spec (already committed) |

---

### Task 1: Item / Spec / bar helpers + tests

**Files:**
- Modify: `bid-cost/lookup.js`
- Modify: `bid-cost/test.js`

**Interfaces:**
- Consumes: existing `resolvePrice`, `filterRows`, `formatMoney`
- Produces:
  - `itemFromBidCode(bidCode: string): string | null` — first 3 digit run at start of code (`464-6001` → `"464"`; `"x"` → `null`)
  - `groupByItem(rows: object[]): { item: string, rows: object[] }[]` — sorted by numeric Item; skips rows with null Item
  - `specPdfUrl(item: string): string` — `https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/s{item}.pdf`
  - `barPercents(houstonAvg: number|null, statewideAvg: number|null): { houston: number, statewide: number }` — each 0–100 vs max of the two positive numbers; missing side = 0

- [ ] **Step 1: Write the failing tests**

Append to `bid-cost/test.js`:

```javascript
assert.strictEqual(L.itemFromBidCode('464-6001'), '464');
assert.strictEqual(L.itemFromBidCode('100-6001'), '100');
assert.strictEqual(L.itemFromBidCode('bad'), null);

const grouped = L.groupByItem([
  { bid_code: '465-6001' },
  { bid_code: '464-6001' },
  { bid_code: '464-6002' },
  { bid_code: 'nope' }
]);
assert.strictEqual(grouped.length, 2);
assert.strictEqual(grouped[0].item, '464');
assert.strictEqual(grouped[0].rows.length, 2);
assert.strictEqual(grouped[1].item, '465');

assert.strictEqual(
  L.specPdfUrl('464'),
  'https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/s464.pdf'
);

const b1 = L.barPercents(100, 50);
assert.strictEqual(b1.houston, 100);
assert.strictEqual(b1.statewide, 50);
const b2 = L.barPercents(null, 80);
assert.strictEqual(b2.houston, 0);
assert.strictEqual(b2.statewide, 100);
const b3 = L.barPercents(null, null);
assert.strictEqual(b3.houston, 0);
assert.strictEqual(b3.statewide, 0);
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node bid-cost/test.js`  
Expected: throw / TypeError (helpers missing)

- [ ] **Step 3: Implement helpers in `lookup.js`**

```javascript
function itemFromBidCode(bidCode) {
  const m = String(bidCode || '').match(/^(\d{3})/);
  return m ? m[1] : null;
}

function groupByItem(rows) {
  const map = Object.create(null);
  (rows || []).forEach(function (r) {
    const item = itemFromBidCode(r.bid_code);
    if (!item) return;
    if (!map[item]) map[item] = [];
    map[item].push(r);
  });
  return Object.keys(map)
    .sort(function (a, b) { return Number(a) - Number(b); })
    .map(function (item) { return { item: item, rows: map[item] }; });
}

function specPdfUrl(item) {
  return 'https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/s' +
    String(item) + '.pdf';
}

function barPercents(houstonAvg, statewideAvg) {
  const h = houstonAvg == null || Number.isNaN(Number(houstonAvg)) ? null : Number(houstonAvg);
  const s = statewideAvg == null || Number.isNaN(Number(statewideAvg)) ? null : Number(statewideAvg);
  const max = Math.max(h == null ? 0 : h, s == null ? 0 : s);
  if (max <= 0) return { houston: 0, statewide: 0 };
  return {
    houston: h == null ? 0 : Math.round((h / max) * 100),
    statewide: s == null ? 0 : Math.round((s / max) * 100)
  };
}
```

Export them on `api` / `module.exports` alongside existing functions.

- [ ] **Step 4: Run tests — expect PASS**

Run: `node bid-cost/test.js`  
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add bid-cost/lookup.js bid-cost/test.js
git commit -m "feat(bid-cost): Item group, Spec URL, and bar helpers"
```

---

### Task 2: Accordion markup + CSS

**Files:**
- Modify: `bid-cost/index.html`
- Modify: `bid-cost/style.css`
- Modify: `bid-cost/mobile.css`

**Interfaces:**
- Consumes: none (markup only)
- Produces: `#sections` container for accordion; CSS classes `.item-section`, `.item-header`, `.item-body`, `.price-bars`, `.bar.houston`, `.bar.statewide`, `.spec-link`

- [ ] **Step 1: Update `index.html`**

Replace the table wrap with:

```html
<div class="wrap" id="sections" aria-live="polite"></div>
```

Keep search / count / disclaimer. Extend Sources cite:

```html
<p class="cite" id="sources">
  Sources: Texas Open Data Bid Tabulations (dataset de7b-7dna), low bidder rank = 1.
  Spec links: TxDOT 2024 Standard Specifications item PDFs (ftp.txdot.gov).
  Planning-level only; ESBD / EBS remain official.
</p>
```

- [ ] **Step 2: Add accordion + bar CSS**

In `style.css` add (append; keep existing table rules unused or remove if unused):

```css
.item-section {
  border: 1px solid #c5d4e3;
  border-radius: 8px;
  margin-bottom: 0.5rem;
  background: #fff;
  overflow: hidden;
}
.item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.65rem 0.75rem;
  background: #eef4fa;
  border: 0;
  text-align: left;
  font: inherit;
  cursor: pointer;
  min-height: 44px;
}
.item-header .item-id { font-weight: 700; color: #1f4e79; }
.item-header .item-count { color: #555; font-size: 0.9em; margin-left: auto; }
.spec-link {
  flex-shrink: 0;
  color: #1f4e79;
  font-weight: 600;
  text-decoration: underline;
  padding: 0.35rem 0.5rem;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.item-body { display: none; overflow-x: auto; }
.item-section.open .item-body { display: block; }
.item-body table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.item-body th, .item-body td { padding: 0.4rem 0.5rem; border-top: 1px solid #e3eaf2; vertical-align: middle; }
.price-bars { width: 88px; }
.price-bars .bar {
  display: block;
  height: 8px;
  border-radius: 4px;
  margin: 2px 0;
  max-width: 100%;
}
.price-bars .bar.houston { background: #1f4e79; }
.price-bars .bar.statewide { background: #8aa4bf; }
```

In `mobile.css` ensure `.item-header` / `.spec-link` stay ≥44px tap targets (already in rules above).

- [ ] **Step 3: Smoke-open `index.html` locally or skip to Task 3** — markup alone shows empty `#sections`.

- [ ] **Step 4: Commit**

```bash
git add bid-cost/index.html bid-cost/style.css bid-cost/mobile.css
git commit -m "feat(bid-cost): accordion shell and price-bar styles"
```

---

### Task 3: Accordion UI + search expand

**Files:**
- Modify: `bid-cost/app.js`

**Interfaces:**
- Consumes: `BidCostLookup.itemFromBidCode`, `groupByItem`, `specPdfUrl`, `barPercents`, `resolvePrice`, `filterRows`, `formatMoney`
- Produces: rendered accordion; count = `N codes · M items`

- [ ] **Step 1: Rewrite `app.js` render path**

Replace flat `tbody` logic with:

```javascript
(function () {
  const L = window.BidCostLookup;
  const sectionsEl = document.getElementById('sections');
  const search = document.getElementById('search');
  const count = document.getElementById('count');
  const metaLine = document.getElementById('metaLine');
  let allRows = [];
  const openItems = Object.create(null); // item -> true when user toggled open

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function rowHtml(r) {
    const x = L.resolvePrice(r);
    if (x.price == null) return '';
    const bars = L.barPercents(r.houston_avg, r.statewide_avg);
    return '<tr>' +
      '<td>' + escapeHtml(r.bid_code) + '</td>' +
      '<td>' + escapeHtml(r.description) + '</td>' +
      '<td>' + escapeHtml(r.unit) + '</td>' +
      '<td>' + L.formatMoney(x.price) + '</td>' +
      '<td>' + (x.n == null ? '—' : String(x.n)) + '</td>' +
      '<td>' + escapeHtml(x.source || '—') + '</td>' +
      '<td class="price-bars" title="Houston vs Statewide">' +
        '<span class="bar houston" style="width:' + bars.houston + '%"></span>' +
        '<span class="bar statewide" style="width:' + bars.statewide + '%"></span>' +
      '</td>' +
      '</tr>';
  }

  function render(filtered) {
    const withPrice = filtered.filter(function (r) {
      return L.resolvePrice(r).price != null;
    });
    const groups = L.groupByItem(withPrice);
    const q = String(search.value || '').trim();
    count.textContent = withPrice.length + ' code' + (withPrice.length === 1 ? '' : 's') +
      ' · ' + groups.length + ' item' + (groups.length === 1 ? '' : 's');

    if (!groups.length) {
      sectionsEl.innerHTML = '<p class="empty">No matches</p>';
      return;
    }

    sectionsEl.innerHTML = groups.map(function (g) {
      const forceOpen = !!q || openItems[g.item];
      const rowsHtml = g.rows.map(rowHtml).join('');
      const spec = L.specPdfUrl(g.item);
      return '<section class="item-section' + (forceOpen ? ' open' : '') + '" data-item="' + escapeHtml(g.item) + '">' +
        '<div class="item-header-row" style="display:flex;align-items:stretch">' +
          '<button type="button" class="item-header" aria-expanded="' + (forceOpen ? 'true' : 'false') + '">' +
            '<span class="item-id">Item ' + escapeHtml(g.item) + '</span>' +
            '<span class="item-count">' + g.rows.length + '</span>' +
          '</button>' +
          '<a class="spec-link" href="' + escapeHtml(spec) + '" target="_blank" rel="noopener noreferrer">Spec</a>' +
        '</div>' +
        '<div class="item-body">' +
          '<table><thead><tr>' +
            '<th>Bid code</th><th>Description</th><th>Unit</th><th>Avg</th><th>n</th><th>Source</th><th>H / SW</th>' +
          '</tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
        '</div>' +
      '</section>';
    }).join('');
  }

  function onSearch() {
    render(L.filterRows(allRows, search.value));
  }

  sectionsEl.addEventListener('click', function (ev) {
    const btn = ev.target.closest('.item-header');
    if (!btn) return;
    const section = btn.closest('.item-section');
    if (!section) return;
    const item = section.getAttribute('data-item');
    const open = !section.classList.contains('open');
    section.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) openItems[item] = true;
    else delete openItems[item];
  });

  fetch('./prices.json')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      allRows = data.rows || [];
      const m = data.meta || {};
      metaLine.textContent =
        'Data accessed ' + (m.accessed || '—') +
        '. Lettings ' + (m.let_date_min || '—') + ' → ' + (m.let_date_max || '—') +
        '. All codes by Spec Item; Houston price first, statewide fallback labeled.';
      onSearch();
    })
    .catch(function (err) {
      metaLine.textContent = 'Could not load prices.json';
      console.error(err);
    });

  search.addEventListener('input', onSearch);
})();
```

Notes:
- Remove Houston-only empty-search filter from v1.
- Spec link is sibling of header button so expand does not steal the tap.
- Searching forces sections open; clearing search restores `openItems` toggles only.

- [ ] **Step 2: Manual check**

Serve or open `bid-cost/index.html` with a local static server if needed (`npx --yes serve bid-cost -p 4173`). Confirm:
- Accordion lists many Items collapsed
- Search `464` expands Item 464 with bars
- Spec opens `s464.pdf` in new tab
- Statewide-only rows still show Source Statewide + bar

- [ ] **Step 3: Re-run unit tests**

Run: `node bid-cost/test.js`  
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add bid-cost/app.js
git commit -m "feat(bid-cost): Spec Item accordion with H/SW bars and Spec links"
```

---

### Task 4: Final verify + publish

**Files:**
- None required unless fixes

- [ ] **Step 1: Full verify**

```bash
node bid-cost/test.js
# optional: node scripts/check-home.js if present — home card unchanged
```

Expected: `ok`

- [ ] **Step 2: Self-review against spec**

Confirm: all codes groupable; Spec URL pattern; bars; search expand; no Houston-only empty filter; Sources cite Spec PDFs.

- [ ] **Step 3: Push `main` and wait for Pages**

```bash
git push origin main
# watch workflow / Pages for this commit
```

Live: `https://lbonil3.github.io/hydraulics-tools/bid-cost/`

- [ ] **Step 4: Report**

Tell Luis: live URL, what changed (accordion by Item, Spec link, H/SW bars), commit SHA.

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Accordion by Spec Item | 2, 3 |
| All codes in catalog | 3 (drop Houston-only empty filter) |
| Houston vs Statewide mini bar | 1 (`barPercents`), 3 |
| Spec PDF per Item | 1 (`specPdfUrl`), 3 |
| Search kept + expand matches | 3 |
| iPhone tap targets | 2 |
| Sources cite Spec | 2 |
| Unit tests helpers | 1 |
| No live fetch / rollups | Global constraints |

## Placeholder / consistency self-review

- No TBD steps; signatures match across tasks (`itemFromBidCode`, `groupByItem`, `specPdfUrl`, `barPercents`).
- Spec 404: v2 hides nothing at runtime (browsers show TxDOT 404); optional HEAD map deferred — Spec says hide if known-missing; YAGNI until we ship a map. Acceptable: link always; user sees TxDOT page if missing.
