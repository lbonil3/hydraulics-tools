# Bid Cost v2 — sections, visuals, Spec links (design)

**Date:** 2026-10-23  
**Status:** Approved (approach A)  
**Tool:** `/bid-cost/` (extends v1)  
**Parent:** `2026-10-23-bid-cost-design.md`

## Goal

Expand Bid Cost so Luis can browse **all bid codes grouped by Spec Book Item**, see a **small price visual per code**, and open the **TxDOT 2024 Spec PDF** for that Item — still Houston-first with labeled statewide fallback, still phone-friendly.

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Approach | Accordion by Spec Item (A), not flat sticky table (B) or Item picker (C) |
| Section | Spec Book **Item** = first 3 digits of `bid_code` (e.g. `464-6001` → Item 464) |
| Visual | Per-row mini bar: Houston avg vs Statewide avg (same row). No time-series (data has none) |
| Spec link | Per Item header → 2024 Standard Spec PDF on TxDOT FTP |
| Search | Kept; filters codes across Items; matching Items auto-expand or show only matching rows |
| Catalog | Show **all** codes already in `prices.json` (~12.5k), not a drainage-only subset |
| Item titles | Optional short title when known (e.g. Item 464 Reinforced Concrete Pipe); omit if unknown |
| Spec 404 | If PDF HEAD fails at build or known-missing, hide Spec link (do not 404 the user) |

## Layout

- Keep v1 shell: home button, disclaimer, meta line, search box, count.
- Replace flat paginated table with **Item accordion**:
  - Collapsed by default (except when search has matches).
  - Header row: `Item NNN` · optional title · code count · **Spec** link (opens PDF in new tab).
  - Expanded body: same columns as v1 (Bid code | Description | Unit | Avg | n | Source) plus a **visual** column.
- Visual column: CSS bar pair (Houston filled, Statewide outline or second bar), scaled to max of the two values on that row; tooltip or small labels with `$`. If only one source exists, single bar + same Source chip as today.
- iPhone: headers tappable full-width; Spec is a separate link so expand does not steal the tap; sticky search stays.

## Spec URLs

- Pattern: `https://ftp.txdot.gov/pub/txdot-info/cmd/cserve/specs/2024/standard/s{NNN}.pdf`  
  Example: Item 464 → `s464.pdf`.
- Optional: also cite full Spec Book PDF in Sources footer (already have Bid Tabulations cite).
- Build-time or static map: prefer linking only Items that exist in the 2024 standard folder; unknown → no Spec link on that header.

## Data

- Reuse existing `prices.json` shape (`bid_code`, `description`, `unit`, `houston_avg`, `houston_n`, `statewide_avg`, `statewide_n`).
- Grouping is client-side from `bid_code` prefix — no new extract required for v2.
- Optional small `item-titles.json` (Item → short name) if easy; otherwise headers show `Item NNN` only.
- No change to Houston-first / statewide fallback rules from v1.

## Behavior

1. Empty search: accordion of all Items that have ≥1 row in catalog; all collapsed.
2. Typing search: filter rows; show only Items with ≥1 match; expand those Items (or keep expanded until clear).
3. Tap Item header: toggle expand/collapse.
4. Tap Spec: navigate to PDF (external); does not toggle accordion.
5. Count line: `N codes` / `M items` (filtered).

## Out of scope (v2)

- Live Open Data / Tableau
- Cost rollup into Storm / Culvert / Ditch
- Historical price charts or bid-letting scatter
- User-edited prices
- Scraping Spec Book for Item titles (hand map or skip)
- Changing default district or avg method

## Testing

- Unit: `itemFromBidCode("464-6001") === "464"`; group rows by Item; filter preserves grouping.
- Visual: row with both avgs renders two-scale bar; Houston-only / statewide-only single bar.
- Spec URL builder for padded Item numbers (`100` → `s100.pdf`).
- Existing lookup fallback tests unchanged.

## Success

- On phone, Luis can jump to Item 464/465/467, open Spec, and compare Houston vs Statewide at a glance per code.
- All codes from current JSON remain reachable via search or accordion.
