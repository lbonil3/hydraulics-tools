# Bid Cost — TxDOT unit price lookup (design)

**Date:** 2026-10-23  
**Status:** Approved (approach A)  
**Tool:** `/bid-cost/`

## Goal

Give Luis a phone-friendly TxDOT bid-code unit price lookup inside Drainage Studio: search by code or description, browse a Houston-first table, and fall back to statewide averages when Houston has no data — clearly labeled. Planning-level only; not an official bid.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Approach | Static JSON + search/table page (A), not live Open Data or Tableau wrapper |
| Placement | Standalone tool on home; **no** Storm/Culvert/Ditch cost columns in v1 |
| Default prices | Houston District averages |
| Missing Houston | Fall back to statewide average with Source = Statewide |
| Find UX | Search box on top **and** results table below |
| Avg shown | Simple (unweighted) average of low-bidder unit prices |
| Weighted / median | Out of v1 UI (may remain in source JSON for later) |
| Data refresh | Manual: re-run extract/build script and commit; not automatic |

## Home page

- New card **Bid Cost** (class `tool-bid-cost`), path `bid-cost/index.html`.
- Place **after Storm Sewer** (design tools first; cost lookup next).
- Chip cites TxDOT Bid Tabulations / Average Low Bid style data (Houston District).
- Update `scripts/check-home.js` card order and links.

## Layout

- iPhone-friendly shell matching Storm / Ditch Table (home button, mobile CSS).
- Sticky disclaimer: planning-level averages from TxDOT Bid Tabulations (low bidder, ~24 months); ESBD / EBS remain official for bidding.
- Show data date range on page (letting span used to build the JSON).
- **Search:** single box; filters as you type on bid code **or** description (case-insensitive).
- **Table columns:** Bid code | Description | Unit | Avg unit price | n | Source (Houston \| Statewide).
- Empty search: show Houston catalog (virtualize or paginate if needed so ~3k rows stay smooth on phone).
- No row editing; read-only lookup.

## Data

### Source

- Texas Open Data [Bid Tabulations](https://data.texas.gov/dataset/Bid-Tabulations/de7b-7dna) (`de7b-7dna`).
- Filter: `bid_rank_sequence_number == "1"` (low bidder only).
- Aggregates from Houston + statewide Bid Tabulations extracts (CSVs / build script inputs), regenerated equivalently when refreshing.
- TxDOT Bid Item Averages Tableau dashboard is the interactive official UI replacement for old ALBUP PDFs; **v1 does not scrape Tableau**.

### Shipped file

- Bundle under `bid-cost/` (e.g. `prices.json`) built from Houston + statewide extracts.
- Enough fields to render the table and apply fallback:
  - `bid_code`, `description`, `unit`
  - Houston: `avg_unit_price`, `n_observations` (when present)
  - Statewide: `avg_unit_price`, `n_observations` (for fallback and/or side storage)
- Metadata: `accessed`, `let_date_min`, `let_date_max`, source URL.
- Compact enough for GitHub Pages / phone (prefer Houston-complete rows + statewide-only extras needed for fallback, or one merged catalog with nullable Houston fields).

### Lookup / fallback

1. Prefer Houston avg when `n_observations` (Houston) > 0.
2. Else if statewide avg exists → show statewide, Source = Statewide.
3. Else → no price (omit or show "—").

Unit tests cover these three paths.

### Refresh

- Keep / document a small build script (from existing `build_prices.py` or a site-local sibling) that regenerates `prices.json` from Open Data or from CSVs.
- Not run on page load; Luis (or agent) re-runs when prices should update.

## Out of scope (v1)

- Live Open Data fetch or Tableau scrape in the browser
- Cost rollup columns inside Storm Sewer, Culvert, or Ditch Table
- User-edited overrides or custom unit prices
- Weighted-average / median columns in the UI
- Full 2024 UsfE HTML master scrape beyond codes observed in Bid Tabulations

## Testing & publish

- Unit tests for search filter and Houston → statewide → none fallback.
- Manual phone check: search, scroll table, home card, disclaimer readable.
- Push to `main` and wait for GitHub Pages success before telling Luis it is live.

## Success criteria

- Home card opens `/bid-cost/` on phone.
- Search finds common drainage items (e.g. 464 RCP, 465 manhole, 462 box) with Houston or labeled statewide prices.
- Disclaimer and data date range visible.
- No Storm cost integration required for v1 done.
